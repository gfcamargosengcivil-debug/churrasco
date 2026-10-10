import { REGIAO_DA_UF, UFS, type Regiao, type UF } from '../constantes.js';
import { dataValida } from '../util/datas.js';

/** Minúsculas, sem acentos, espaços colapsados. */
export function normalizarTexto(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[“”"'`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const SUBSTITUICOES_NOME: [RegExp, string][] = [
  [/\blinhas? de transmissao\b/g, 'lt'],
  [/\bsubestac(ao|oes)\b/g, 'se'],
  [/\bs\/e\b/g, 'se'],
  [/\bl\.t\.?\b/g, 'lt'],
  [/\bcircuito (simples|duplo)\b/g, ''],
  [/\b(c\d|cd|cs)\b/g, ''],
  [/\b(\d{2,3})\s*kv\b/g, '$1kv'],
  [/[–—−]/g, '-'],
];

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'para', 'com', 'na', 'no', 'ltda', 'sa', 's/a',
  'empreendimento', 'projeto', 'obra', 'obras', 'implantacao', 'construcao', 'nova', 'novo', 'lote',
]);

/** Normaliza o nome de um empreendimento para comparação (dedup). */
export function normalizarNomeEmpreendimento(nome: string): string {
  let n = normalizarTexto(nome);
  for (const [re, sub] of SUBSTITUICOES_NOME) n = n.replace(re, sub);
  return n.replace(/[^a-z0-9\- ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Tokens significativos de um nome (sem stopwords). */
export function tokensNome(nome: string): string[] {
  return normalizarNomeEmpreendimento(nome)
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Extrai as extremidades de um nome de LT no padrão "LT 500 kV A – B" (ordem irrelevante).
 * Retorna `null` se o padrão não for reconhecido.
 */
export function extremidadesLT(nome: string): [string, string] | null {
  const n = normalizarNomeEmpreendimento(nome)
    .replace(/^lt\s*/, '')
    .replace(/^\d{2,3}kv\s*/, '')
    .replace(/\b\d{2,3}kv\b/g, '')
    .trim();
  // Separadores explícitos ("–", "/") têm precedência sobre a preposição " a " (ex.: "LT X a Y").
  const separador = /\s+-\s+|\s*\/\s*/.test(n) ? /\s+-\s+|\s*\/\s*/ : /\s+a\s+/;
  const partes = n.split(separador).map((p) => p.trim()).filter(Boolean);
  if (partes.length !== 2) return null;
  const limpar = (p: string) => p.replace(/^se\s+/, '').trim();
  const [a, b] = [limpar(partes[0]), limpar(partes[1])].sort();
  return [a, b];
}

/** Similaridade de Dice entre conjuntos de tokens (0..1). */
export function similaridadeTokens(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

/** Similaridade de Dice por bigramas de caracteres (robusta a pequenas grafias diferentes). */
export function similaridadeBigramas(a: string, b: string): number {
  const bigramas = (s: string) => {
    const t = normalizarTexto(s).replace(/\s+/g, ' ');
    const m = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) {
      const bg = t.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const ma = bigramas(a);
  const mb = bigramas(b);
  let inter = 0;
  let total = 0;
  for (const [k, v] of ma) {
    inter += Math.min(v, mb.get(k) ?? 0);
    total += v;
  }
  for (const v of mb.values()) total += v;
  return total ? (2 * inter) / total : 0;
}

/** Similaridade combinada entre dois nomes de empreendimento (0..1). */
export function similaridadeNomes(a: string, b: string): number {
  const ea = extremidadesLT(a);
  const eb = extremidadesLT(b);
  if (ea && eb) {
    const sim = (similaridadeBigramas(ea[0], eb[0]) + similaridadeBigramas(ea[1], eb[1])) / 2;
    if (sim > 0.8) return Math.max(sim, similaridadeTokens(tokensNome(a), tokensNome(b)));
  }
  return Math.max(similaridadeTokens(tokensNome(a), tokensNome(b)), similaridadeBigramas(
    normalizarNomeEmpreendimento(a), normalizarNomeEmpreendimento(b),
  ) * 0.9);
}

/** Normaliza nome de organização para comparação. */
export function normalizarNomeOrganizacao(nome: string): string {
  return normalizarTexto(nome)
    .replace(/\b(s\.?\s?a\.?|ltda\.?|eireli|me|epp|cia\.?|companhia|participacoes|holding)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizarCNPJ(cnpj: string | null | undefined): string | undefined {
  const d = (cnpj ?? '').replace(/\D/g, '');
  return d.length === 14 ? d : undefined;
}

export function cnpjValido(cnpj: string): boolean {
  const d = normalizarCNPJ(cnpj);
  if (!d || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base: string, pesos: number[]) => {
    const s = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

export function normalizarUF(uf: string | null | undefined): UF | undefined {
  const u = (uf ?? '').trim().toUpperCase();
  return (UFS as readonly string[]).includes(u) ? (u as UF) : undefined;
}

export function regiaoDaUF(uf: UF): Regiao {
  return REGIAO_DA_UF[uf];
}

export function regioesDasUFs(ufs: readonly UF[]): Regiao[] {
  return [...new Set(ufs.map(regiaoDaUF))];
}

/**
 * Converte número em formato brasileiro ("1.234,56") ou internacional ("1234.56").
 * Retorna `undefined` se não for número.
 */
export function normalizarNumero(valor: unknown): number | undefined {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined;
  if (typeof valor !== 'string') return undefined;
  let s = valor.trim().replace(/\s/g, '');
  if (!s) return undefined;
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (temVirgula) {
    s = s.replace(',', '.');
  } else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const MULTIPLICADORES: [RegExp, number][] = [
  [/\b(trilh(ao|oes)|tri)\b/, 1e12],
  [/\b(bilh(ao|oes)|bi)\b/, 1e9],
  [/\b(milh(ao|oes)|mi|mm)\b/, 1e6],
  [/\b(mil)\b/, 1e3],
];

/** "R$ 1,2 bilhão" → 1_200_000_000. */
export function normalizarValorMonetario(valor: unknown): number | undefined {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor >= 0 ? valor : undefined;
  if (typeof valor !== 'string') return undefined;
  const t = normalizarTexto(valor).replace(/r\$/g, '').trim();
  const m = t.match(/-?[\d.,]+/);
  if (!m) return undefined;
  const base = normalizarNumero(m[0]);
  if (base === undefined) return undefined;
  const resto = t.slice((m.index ?? 0) + m[0].length);
  for (const [re, mult] of MULTIPLICADORES) if (re.test(resto)) return base * mult;
  return base;
}

/** Extrai níveis de tensão em kV de um texto ("LT 500 kV", "230/138 kV", "±800 kV"). */
export function extrairTensoesKv(texto: string | number | null | undefined): number[] {
  if (typeof texto === 'number') return texto > 0 ? [texto] : [];
  const t = normalizarTexto(texto ?? '');
  const res = new Set<number>();
  // Aceita combinações "230/138 kV", "230/13,8 kV", "230-13,8 kV" e "500/230/13,8 kV".
  const re = /(?:±|\+-|\+\/-)?\s*(\d{2,4}(?:[.,]\d+)?)((?:\s*[\/-]\s*\d{1,4}(?:[.,]\d+)?)*)\s*kv(?:cc|ca)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const valores = [m[1], ...(m[2] ? m[2].split(/[\/-]/).map((x) => x.trim()).filter(Boolean) : [])];
    for (const v of valores) {
      const n = normalizarNumero(v);
      // Maior tensão do SIN: ±800 kVCC; acima disso é código de equipamento ("KODM 1153-15 / 13,8KV").
      if (n && n >= 1 && n <= 800) res.add(n);
    }
  }
  return [...res].sort((a, b) => b - a);
}

const MESES: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5,
  jun: 6, junho: 6, jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10,
  nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

export interface DataNormalizada {
  data: string;
  /** `dia` quando a data completa foi informada; `mes`/`ano` quando foi completada com o 1º dia. */
  precisao: 'dia' | 'mes' | 'ano';
}

/**
 * Normaliza datas em formatos comuns de documentos brasileiros:
 * "15/03/2026", "2026-03-15", "mar/2026", "março de 2026", "1T2027", "2027", número serial do Excel.
 */
export function normalizarData(valor: unknown): DataNormalizada | undefined {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return { data: valor.toISOString().slice(0, 10), precisao: 'dia' };
  }
  if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
    // Serial do Excel (base 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86_400_000);
    return { data: d.toISOString().slice(0, 10), precisao: 'dia' };
  }
  if (typeof valor !== 'string') return undefined;
  const t = normalizarTexto(valor);
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m && dataValida(`${m[1]}-${m[2]}-${m[3]}`)) return { data: `${m[1]}-${m[2]}-${m[3]}`, precisao: 'dia' };
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    // Data completa inválida (ex.: 31/02) não deve ser reinterpretada como mês/ano.
    return dataValida(iso) ? { data: iso, precisao: 'dia' } : undefined;
  }
  m = t.match(/\b(\d{1,2})[/.-](\d{4})\b/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) {
    return { data: `${m[2]}-${m[1].padStart(2, '0')}-01`, precisao: 'mes' };
  }
  m = t.match(/\b([a-z]{3,9})\.?\s*(?:\/|de|-)?\s*(\d{4})\b/);
  if (m && MESES[m[1]]) return { data: `${m[2]}-${String(MESES[m[1]]).padStart(2, '0')}-01`, precisao: 'mes' };
  m = t.match(/\b([1-4])\s*(?:o\s*)?t(?:ri(?:mestre)?)?\s*(?:de\s*)?\/?\s*(\d{4})\b/);
  if (m) return { data: `${m[2]}-${String((Number(m[1]) - 1) * 3 + 1).padStart(2, '0')}-01`, precisao: 'mes' };
  m = t.match(/^(\d{4})$/);
  if (m) return { data: `${m[1]}-01-01`, precisao: 'ano' };
  return undefined;
}

/** Normaliza booleanos vindos de planilhas ("sim", "x", "1", "true"). */
export function normalizarBooleano(valor: unknown): boolean | undefined {
  if (typeof valor === 'boolean') return valor;
  const t = normalizarTexto(String(valor ?? ''));
  if (['sim', 's', 'x', '1', 'true', 'verdadeiro', 'yes', 'y'].includes(t)) return true;
  if (['nao', 'n', '0', 'false', 'falso', 'no'].includes(t)) return false;
  return undefined;
}

/** Busca o valor de enum mais parecido a partir de rótulos/sinônimos. */
export function normalizarEnum<T extends string>(
  valor: unknown,
  opcoes: readonly T[],
  sinonimos: Partial<Record<string, T>> = {},
): T | undefined {
  const t = normalizarTexto(String(valor ?? '')).replace(/[\s/-]+/g, '_');
  if (!t) return undefined;
  const direto = opcoes.find((o) => normalizarTexto(o).replace(/[\s/-]+/g, '_') === t);
  if (direto) return direto;
  const chave = Object.keys(sinonimos).find((s) => normalizarTexto(s).replace(/[\s/-]+/g, '_') === t);
  return chave ? sinonimos[chave] : undefined;
}
