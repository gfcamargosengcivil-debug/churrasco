/**
 * Identidade estrutural de linhas de transmissão: extremidades + tensão + circuito. Duas LTs entre as
 * mesmas subestações, na mesma tensão e com o mesmo circuito são a mesma instalação; circuitos
 * diferentes (C1 × C2) são instalações distintas, mesmo com nomes quase idênticos. Seccionamentos
 * têm identidade própria (LT seccionada + SE de seccionamento).
 */
import { UFS } from '../constantes.js';
import { extrairTensoesKv, normalizarTexto, similaridadeBigramas } from '../normalizacao/index.js';

export interface IdentidadeLT {
  tipo: 'lt' | 'secc';
  kv?: number;
  /** Extremidades normalizadas, em ordem alfabética. */
  a: string;
  b: string;
  circuitos: number[];
  /** SE do seccionamento (somente tipo "secc"). */
  se?: string;
}

const UF_MIN = new Set(UFS.map((u) => u.toLowerCase()));

const ROMANOS: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };

/**
 * Normaliza o nome de uma extremidade: sem acentos, sem prefixo "SE", sem apelido entre parênteses,
 * sem sufixo de UF, sem pontuação e com numeração romana convertida ("Juazeiro II" = "Juazeiro 2").
 */
export function normalizarExtremidade(s: string): string {
  let t = normalizarTexto(s)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(se|sub|subestacao|ute|uhe|usina)\s+/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const partes = t.split(' ');
  while (partes.length > 1 && UF_MIN.has(partes[partes.length - 1])) partes.pop();
  // Algarismos romanos só como último token ou seguidos de outro token numérico (evita "V" de nomes).
  t = partes.map((p, i) => (i > 0 && ROMANOS[p] ? ROMANOS[p] : p)).join(' ');
  return t;
}

function circuitosDe(t: string): number[] {
  const out = new Set<number>();
  for (const m of t.matchAll(/\bc\s*-?\s*(\d{1,2})\b/g)) out.add(Number(m[1]));
  return [...out].sort((x, y) => x - y);
}

/** Identidades de LT citadas em um nome/descrição ("LT 500 kV A – B C1", "SECC LT 230 kV A - B, C1, na SE C", "LT A–B–C"). */
export function identidadesDoNome(nome: string): IdentidadeLT[] {
  const bruto = normalizarTexto(nome)
    .replace(/[–—]/g, '-')
    .replace(/±\s*/g, '')
    .replace(/\([^)]*\)/g, ' ')
    // Separador de itens em listas oficiais: hífen colado ao texto anterior ("..., CS- LT 500 kV ...").
    .replace(/(\S)-\s+(?=(?:lt|se|secc|seccionamento)\b)/g, '$1; ');
  // "SE X e seccionamento(s) da(s) LT(s) A - B": a SE do seccionamento vem antes.
  const seAntes = /\bse\s+(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)*\s*kv\s+)?([a-z0-9 ]+?)\s+e\s+(?:o\s+)?secc/.exec(bruto)?.[1];
  const out: IdentidadeLT[] = [];
  for (const m of bruto.matchAll(/\b(secc(?:ionamentos?)?\s+(?:d[aeo]s?\s+)?)?lts?['’]?s?\s+((?:\d+(?:[.,]\d+)?\s*kv(?:cc)?\s*)?)([^;|]*?)(?=;|\||$)/g)) {
    const secc = !!m[1] || (!!seAntes && /secc/.test(bruto.slice(0, m.index ?? 0)));
    const kv = extrairTensoesKv(m[2] || m[3])[0];
    const resto = m[3];
    const circuitos = circuitosDe(resto);
    const seResto = /\b(?:na|em)\s+(?:se|subestacao)\s+([a-z0-9 ]+?)\s*(?:[,.;(]|$|\s-\s)/.exec(resto)?.[1];
    const se = secc ? seResto ?? seAntes : undefined;
    // Trecho das extremidades: até vírgula, circuito, "na SE", "com N km", "CS/CD", "e SE/LT".
    const ext = resto
      .split(/,|\bc\s*-?\s*\d|\bna\s+se\b|\bem\s+se\b|\bcom\s+\d|\b(?:cs|cd)\b|\be\s+(?:se|lt|bipolos?|subesta\w*|instala\w*)\b/)[0]
      .replace(/\d+(?:[.,]\d+)?\s*kv\b/g, ' ')
      .trim();
    const partes = ext.split(/\s+-\s+|\s*\/\s*|-(?=[a-z])/).map(normalizarExtremidade).filter((p) => p.length >= 3);
    if (partes.length < 2) continue;
    for (let i = 0; i + 1 < partes.length; i++) {
      const [a, b] = [partes[i], partes[i + 1]].sort();
      if (a === b) continue;
      out.push({ tipo: secc ? 'secc' : 'lt', kv, a, b, circuitos, se: se ? normalizarExtremidade(se) : undefined });
    }
  }
  return out;
}

/** Identidade a partir de um trecho com extremidades estruturadas (ex.: SIGET origem/destino). */
export function identidadeDoTrecho(t: { nome: string; tensaoKv?: number; origem?: string; destino?: string }): IdentidadeLT[] {
  if (t.origem && t.destino) {
    const [a, b] = [normalizarExtremidade(t.origem), normalizarExtremidade(t.destino)].sort();
    if (a && b && a !== b) return [{ tipo: 'lt', kv: t.tensaoKv, a, b, circuitos: circuitosDe(normalizarTexto(t.nome)) }];
  }
  return identidadesDoNome(t.nome).map((i) => ({ ...i, kv: i.kv ?? t.tensaoKv }));
}

const numeros = (x: string) => (x.match(/\d+/g) ?? []).join(',');
/** Mesma SE: nomes canônicos iguais; tolerância de grafia só quando a numeração coincide ("Juazeiro 2" ≠ "Juazeiro 3"). */
const mesmaExtremidade = (x: string, y: string) => x === y || (numeros(x) === numeros(y) && similaridadeBigramas(x, y) >= 0.92);

export type ComparacaoLT = 'mesma' | 'mesmas_extremidades' | 'circuito_diferente' | 'sem_relacao';

/** Igualdade exata (inclui o conjunto de circuitos): usada para atribuir valores de um registro a outro. */
export function identidadesIguais(r: IdentidadeLT, p: IdentidadeLT): boolean {
  return compararIdentidades(r, p) === 'mesma' && r.circuitos.join(',') === p.circuitos.join(',');
}

export function compararIdentidades(r: IdentidadeLT, p: IdentidadeLT): ComparacaoLT {
  if (r.tipo !== p.tipo) return 'sem_relacao';
  if (r.kv !== undefined && p.kv !== undefined && r.kv !== p.kv) return 'sem_relacao';
  if (!(mesmaExtremidade(r.a, p.a) && mesmaExtremidade(r.b, p.b))) return 'sem_relacao';
  if (r.tipo === 'secc') {
    if (r.se && p.se && !mesmaExtremidade(r.se, p.se)) return 'sem_relacao';
    // Seccionamento sem a SE identificada em um dos lados: no máximo "mesmas extremidades".
    if (!r.se || !p.se) return 'mesmas_extremidades';
  }
  if (r.circuitos.length && p.circuitos.length) {
    return r.circuitos.some((c) => p.circuitos.includes(c)) ? 'mesma' : 'circuito_diferente';
  }
  return 'mesmas_extremidades';
}
