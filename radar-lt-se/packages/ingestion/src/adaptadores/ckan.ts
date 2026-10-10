/**
 * Adaptador genérico CKAN (datastore_search) — usado pelos portais de dados abertos
 * da ANEEL e do ONS. O conjunto (resource_id) e o mapeamento de colunas são configurados
 * por fonte; as linhas passam pelo mesmo mapeamento da importação de planilhas.
 */
import type { Fonte } from '@radar/core';
import { mapearLinhas, type Linha, type MapeamentoColunas } from '../planilha.js';
import { AdaptadorNaoConfigurado, buscar, type Adaptador, type ContextoAdaptador, type ResultadoAdaptador } from './tipos.js';

interface ConfigCkan {
  baseUrl?: string;
  resourceId?: string;
  mapeamento?: MapeamentoColunas;
  filtros?: Record<string, string>;
  setorPadrao?: string;
  tipoPadrao?: string;
  tamanhoPagina?: number;
  /** Título padrão da evidência (o portal não tem documento por linha). */
  tituloEvidencia?: string;
}

export const adaptadorCkan: Adaptador = {
  id: 'ckan',
  descricao: 'CKAN datastore_search (paginado)',
  validarConfiguracao(fonte) {
    const c = fonte.config as ConfigCkan;
    const p: string[] = [];
    if (!c.baseUrl) p.push('informar baseUrl');
    if (!c.resourceId) p.push('informar resourceId do conjunto de dados');
    return p;
  },
  async coletar(fonte: Fonte, ctx: ContextoAdaptador): Promise<ResultadoAdaptador> {
    const c = fonte.config as ConfigCkan;
    const pend = this.validarConfiguracao(fonte, ctx.env);
    if (pend.length) throw new AdaptadorNaoConfigurado(pend);
    const tamanho = c.tamanhoPagina ?? 500;
    const limite = ctx.limite ?? 20_000;
    const linhas: Linha[] = [];
    let offset = 0;
    let total = Infinity;
    const base = c.baseUrl!.replace(/\/$/, '');
    while (offset < total && linhas.length < limite) {
      const params = new URLSearchParams({ resource_id: c.resourceId!, limit: String(tamanho), offset: String(offset) });
      if (c.filtros) params.set('filters', JSON.stringify(c.filtros));
      const r = await buscar(ctx.fetch, `${base}/api/3/action/datastore_search?${params}`);
      const corpo = (await r.json()) as { success: boolean; result?: { records: Linha[]; total?: number }; error?: unknown };
      if (!corpo.success || !corpo.result) throw new Error(`CKAN retornou erro: ${JSON.stringify(corpo.error ?? {})}`);
      linhas.push(...corpo.result.records);
      total = corpo.result.total ?? linhas.length;
      if (!corpo.result.records.length) break;
      offset += corpo.result.records.length;
    }
    const cabecalhos = [...new Set(linhas.flatMap((l) => Object.keys(l)))].filter((h) => h !== '_id');
    const titulo = c.tituloEvidencia ?? `${fonte.nome} — conjunto ${c.resourceId}`;
    const urlConjunto = `${base}/dataset/?res_id=${c.resourceId}`;
    const linhasComFonte = linhas.map((l) => ({ ...l, __fonte_titulo: titulo, __fonte_url: urlConjunto }));
    const { registros, erros, ignoradas } = mapearLinhas(linhasComFonte, [...cabecalhos, '__fonte_titulo', '__fonte_url'], {
      fonteId: fonte.id,
      mapeamento: { ...c.mapeamento, fonte_titulo: ['__fonte_titulo'], fonte_url: ['__fonte_url'] },
      hoje: ctx.hoje,
      setorPadrao: c.setorPadrao,
      tipoPadrao: c.tipoPadrao,
      primeiraLinha: 1,
    });
    for (const r of registros) {
      r.evidencia.tipoDocumento = 'planilha';
      r.evidencia.dataColeta = ctx.hoje;
    }
    const avisos = erros.slice(0, 50).map((e) => `registro ${e.linha}: ${e.mensagem}`);
    if (erros.length > 50) avisos.push(`… e mais ${erros.length - 50} ocorrências`);
    if (ignoradas.length) avisos.push(`Colunas não mapeadas: ${ignoradas.slice(0, 20).join(', ')}`);
    return { registros, sinais: [], avisos, lidos: linhas.length };
  },
};
