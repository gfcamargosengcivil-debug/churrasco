/**
 * Adaptadores de sinais não estruturados: RSS/Atom, Querido Diário e DOU (INLABS, preparado).
 * Sinais não criam empreendimentos automaticamente: entram na caixa de triagem.
 */
import { XMLParser } from 'fast-xml-parser';
import { hashCurto, normalizarData, normalizarTexto, somarDias, type Fonte } from '@radar/core';
import { AdaptadorNaoConfigurado, buscar, type Adaptador, type ContextoAdaptador, type ResultadoAdaptador, type SinalColetado } from './tipos.js';

const limparHtml = (s: unknown) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

function termosEncontrados(texto: string, termos: string[]): string[] {
  const t = normalizarTexto(texto);
  return termos.filter((x) => t.includes(normalizarTexto(x)));
}

/** Converte um documento RSS 2.0 ou Atom em itens. */
export function analisarFeed(xml: string): { titulo: string; url?: string; data?: string; resumo?: string }[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: true });
  const doc = parser.parse(xml) as Record<string, any>;
  const comoLista = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
  if (doc.rss?.channel) {
    return comoLista(doc.rss.channel.item).map((it: any) => ({
      titulo: limparHtml(it.title),
      url: typeof it.link === 'string' ? it.link : undefined,
      data: normalizarData(it.pubDate ? new Date(it.pubDate) : undefined)?.data,
      resumo: limparHtml(it.description).slice(0, 600),
    }));
  }
  if (doc.feed) {
    return comoLista(doc.feed.entry).map((it: any) => {
      const links = comoLista(it.link);
      const href = links.find((l: any) => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href'];
      const quando = it.updated ?? it.published;
      return {
        titulo: limparHtml(typeof it.title === 'object' ? it.title['#text'] : it.title),
        url: href,
        data: quando ? normalizarData(new Date(quando))?.data : undefined,
        resumo: limparHtml(typeof it.summary === 'object' ? it.summary['#text'] : it.summary ?? it.content).slice(0, 600),
      };
    });
  }
  throw new Error('Documento não é RSS 2.0 nem Atom');
}

interface ConfigRss {
  feeds?: string[];
  filtroPalavras?: string[];
}

export const adaptadorRss: Adaptador = {
  id: 'rss',
  descricao: 'Feeds RSS/Atom com filtro por palavras-chave',
  validarConfiguracao(fonte) {
    const c = fonte.config as ConfigRss;
    return c.feeds?.length ? [] : ['cadastrar ao menos uma URL de feed (respeitando os termos de uso do veículo)'];
  },
  async coletar(fonte: Fonte, ctx: ContextoAdaptador): Promise<ResultadoAdaptador> {
    const pend = this.validarConfiguracao(fonte, ctx.env);
    if (pend.length) throw new AdaptadorNaoConfigurado(pend);
    const c = fonte.config as ConfigRss;
    const sinais: SinalColetado[] = [];
    const avisos: string[] = [];
    let lidos = 0;
    for (const url of c.feeds!) {
      try {
        const r = await buscar(ctx.fetch, url);
        const itens = analisarFeed(await r.text());
        lidos += itens.length;
        for (const it of itens) {
          if (ctx.desde && it.data && it.data < ctx.desde) continue;
          const termos = c.filtroPalavras?.length ? termosEncontrados(`${it.titulo} ${it.resumo ?? ''}`, c.filtroPalavras) : [];
          if (c.filtroPalavras?.length && !termos.length) continue;
          sinais.push({ titulo: it.titulo, url: it.url, dataPublicacao: it.data, resumo: it.resumo, termos, fonteId: fonte.id, chaveExterna: hashCurto(it.url ?? it.titulo) });
        }
      } catch (e) {
        avisos.push(`${url}: ${(e as Error).message}`);
      }
    }
    return { registros: [], sinais, avisos, lidos };
  },
};

interface ConfigQueridoDiario {
  baseUrl?: string;
  termos?: string[];
  diasRetroativos?: number;
  territorios?: string[];
}

export const adaptadorQueridoDiario: Adaptador = {
  id: 'querido_diario',
  descricao: 'Busca textual em diários oficiais municipais (API pública Querido Diário)',
  validarConfiguracao(fonte) {
    const c = fonte.config as ConfigQueridoDiario;
    const p: string[] = [];
    if (!c.baseUrl) p.push('informar baseUrl');
    if (!c.termos?.length) p.push('informar termos de busca');
    return p;
  },
  async coletar(fonte, ctx): Promise<ResultadoAdaptador> {
    const pend = this.validarConfiguracao(fonte, ctx.env);
    if (pend.length) throw new AdaptadorNaoConfigurado(pend);
    const c = fonte.config as ConfigQueridoDiario;
    const desde = ctx.desde ?? somarDias(ctx.hoje, -(c.diasRetroativos ?? 14));
    const sinais: SinalColetado[] = [];
    const avisos: string[] = [];
    let lidos = 0;
    for (const termo of c.termos!) {
      const params = new URLSearchParams({ querystring: `"${termo}"`, published_since: desde, size: '50', excerpt_size: '400', number_of_excerpts: '2' });
      for (const t of c.territorios ?? []) params.append('territory_ids', t);
      try {
        const r = await buscar(ctx.fetch, `${c.baseUrl!.replace(/\/$/, '')}/gazettes?${params}`);
        const corpo = (await r.json()) as { gazettes?: { territory_name?: string; state_code?: string; date?: string; url?: string; excerpts?: string[] }[] };
        for (const g of corpo.gazettes ?? []) {
          lidos++;
          sinais.push({
            titulo: `Diário oficial de ${g.territory_name ?? '?'}${g.state_code ? `/${g.state_code}` : ''} — ${g.date ?? ''}`,
            url: g.url,
            dataPublicacao: g.date,
            resumo: limparHtml((g.excerpts ?? []).join(' … ')).slice(0, 800),
            termos: [termo],
            fonteId: fonte.id,
            chaveExterna: hashCurto(`${g.url}|${termo}`),
          });
        }
      } catch (e) {
        avisos.push(`"${termo}": ${(e as Error).message}`);
      }
    }
    return { registros: [], sinais, avisos, lidos };
  },
};

export const adaptadorInlabs: Adaptador = {
  id: 'inlabs',
  descricao: 'DOU via INLABS (preparado — não implementado)',
  validarConfiguracao(_fonte, env) {
    const p: string[] = [];
    if (!env.INLABS_EMAIL || !env.INLABS_SENHA) p.push('definir INLABS_EMAIL e INLABS_SENHA no servidor');
    p.push('download/parsing do XML do DOU ainda não implementado nem validado — usar importação de documento enquanto isso');
    return p;
  },
  async coletar(fonte, ctx) {
    throw new AdaptadorNaoConfigurado(this.validarConfiguracao(fonte, ctx.env));
  },
};
