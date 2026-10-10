import type { Fonte, RegistroNormalizado } from '@radar/core';

/** Item não estruturado (notícia, diário oficial, release) para triagem humana/IA. */
export interface SinalColetado {
  titulo: string;
  url?: string;
  dataPublicacao?: string;
  resumo?: string;
  /** Termos que motivaram a captura. */
  termos: string[];
  fonteId: string;
  chaveExterna: string;
}

export interface ResultadoAdaptador {
  registros: RegistroNormalizado[];
  sinais: SinalColetado[];
  avisos: string[];
  /** Linhas/itens lidos da fonte (antes de filtros). */
  lidos: number;
}

export interface ContextoAdaptador {
  fetch: typeof fetch;
  /** Coletar itens publicados a partir desta data (quando a fonte suportar). */
  desde?: string;
  hoje: string;
  env: Record<string, string | undefined>;
  /** Limite de itens por execução (proteção de volume). */
  limite?: number;
}

export interface Adaptador {
  id: string;
  descricao: string;
  /** Verifica configuração mínima; retorna lista de pendências. */
  validarConfiguracao(fonte: Fonte, env: Record<string, string | undefined>): string[];
  coletar(fonte: Fonte, ctx: ContextoAdaptador): Promise<ResultadoAdaptador>;
}

export class AdaptadorNaoConfigurado extends Error {
  constructor(public pendencias: string[]) {
    super(`Adaptador não configurado: ${pendencias.join('; ')}`);
  }
}

/** fetch com timeout e verificação de status (erro explícito, sem retry silencioso). */
export async function buscar(f: typeof fetch, url: string, opcoes: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opcoes.timeoutMs ?? 30_000);
  try {
    const r = await f(url, { ...opcoes, signal: ctrl.signal, headers: { 'User-Agent': 'RadarLTSE/0.1 (+inteligencia comercial)', ...(opcoes.headers ?? {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ao acessar ${url}`);
    return r;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error(`Tempo esgotado ao acessar ${url}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}
