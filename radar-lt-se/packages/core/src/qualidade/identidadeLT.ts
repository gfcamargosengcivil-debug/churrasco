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

/** Normaliza o nome de uma extremidade: sem acentos, sem prefixo "SE", sem sufixo de UF e sem pontuação. */
export function normalizarExtremidade(s: string): string {
  let t = normalizarTexto(s)
    .replace(/\b(se|sub|subestacao|ute|uhe|usina)\s+/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const partes = t.split(' ');
  while (partes.length > 1 && UF_MIN.has(partes[partes.length - 1])) partes.pop();
  t = partes.join(' ');
  return t;
}

function circuitosDe(t: string): number[] {
  const out = new Set<number>();
  for (const m of t.matchAll(/\bc\s*-?\s*(\d{1,2})\b/g)) out.add(Number(m[1]));
  return [...out].sort((x, y) => x - y);
}

/** Identidades de LT citadas em um nome/descrição ("LT 500 kV A – B C1", "SECC LT 230 kV A - B, C1, na SE C", "LT A–B–C"). */
export function identidadesDoNome(nome: string): IdentidadeLT[] {
  const bruto = normalizarTexto(nome).replace(/[–—]/g, '-').replace(/±\s*/g, '');
  const out: IdentidadeLT[] = [];
  // Cada ocorrência de "LT ..." até um delimitador forte.
  for (const m of bruto.matchAll(/\b(secc(?:ionamento)?\s+(?:da\s+)?)?lts?['’]?s?\s+((?:\d+(?:[.,]\d+)?\s*kv(?:cc)?\s*)?)([^;|]*?)(?=;|\||\s-\s*(?:lt|se)\b|$)/g)) {
    const secc = !!m[1];
    const kv = extrairTensoesKv(m[2] || m[3])[0];
    const resto = m[3];
    const circuitos = circuitosDe(resto);
    const se = secc ? /\b(?:na|em)\s+(?:se|subestacao)\s+([a-z0-9 ]+?)\s*(?:[,.;(]|$|\s-\s)/.exec(resto)?.[1] : undefined;
    // Trecho das extremidades: até vírgula, parêntese, circuito, "na SE", "com N km", "CS/CD".
    const ext = resto
      .split(/,|\(|\bc\s*-?\s*\d|\bna\s+se\b|\bem\s+se\b|\bcom\s+\d|\b(?:cs|cd)\b|\be\s+(?:se|lt|bipolos?|subesta\w*|instala\w*)\b/)[0]
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

const mesmaExtremidade = (x: string, y: string) => x === y || similaridadeBigramas(x, y) >= 0.9;

export type ComparacaoLT = 'mesma' | 'mesmas_extremidades' | 'circuito_diferente' | 'sem_relacao';

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
