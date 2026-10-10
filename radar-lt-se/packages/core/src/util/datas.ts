/**
 * Utilitários de data trabalhando com strings ISO `AAAA-MM-DD` (sem fuso),
 * evitando deslocamentos de fuso horário em cálculos de cronograma.
 */

export function hojeISO(agora: Date = new Date()): string {
  return agora.toISOString().slice(0, 10);
}

export function agoraISO(agora: Date = new Date()): string {
  return agora.toISOString();
}

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [a, m, d];
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function formatar(a: number, m: number, d: number): string {
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Soma meses (aceita frações: a parte fracionária é convertida em dias de 30,44). */
export function somarMeses(iso: string, meses: number): string {
  const inteiros = Math.trunc(meses);
  const fracao = meses - inteiros;
  const [a, m, d] = partes(iso);
  const total = a * 12 + (m - 1) + inteiros;
  const na = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, diasNoMes(na, nm));
  const base = formatar(na, nm, nd);
  return fracao === 0 ? base : somarDias(base, Math.round(fracao * 30.44));
}

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = partes(iso);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

export function diferencaDias(de: string, ate: string): number {
  const [a1, m1, d1] = partes(de);
  const [a2, m2, d2] = partes(ate);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function diferencaMeses(de: string, ate: string): number {
  return diferencaDias(de, ate) / 30.44;
}

export function minData(...datas: (string | undefined | null)[]): string | undefined {
  const v = datas.filter((d): d is string => !!d);
  return v.length ? v.reduce((a, b) => (a < b ? a : b)) : undefined;
}

export function maxData(...datas: (string | undefined | null)[]): string | undefined {
  const v = datas.filter((d): d is string => !!d);
  return v.length ? v.reduce((a, b) => (a > b ? a : b)) : undefined;
}

/** Último dia do mês da data informada. */
export function fimDoMes(iso: string): string {
  const [a, m] = partes(iso);
  return formatar(a, m, diasNoMes(a, m));
}

export function inicioDoMes(iso: string): string {
  const [a, m] = partes(iso);
  return formatar(a, m, 1);
}

/** Chave `AAAA-MM`. */
export function mesChave(iso: string): string {
  return iso.slice(0, 7);
}

export function trimestreChave(iso: string): string {
  const [a, m] = partes(iso);
  return `${a}-T${Math.ceil(m / 3)}`;
}

export function formatarDataBR(iso?: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = partes(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function formatarMesBR(iso?: string | null): string {
  if (!iso) return '—';
  const [a, m] = partes(iso);
  return `${MESES_ABREV[m - 1]}/${a}`;
}

export function dataValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = partes(iso);
  return m >= 1 && m <= 12 && d >= 1 && d <= diasNoMes(a, m);
}
