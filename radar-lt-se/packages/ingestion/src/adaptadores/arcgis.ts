/**
 * Adaptador ArcGIS REST (FeatureServer/MapServer query, f=geojson) — preparado para os
 * serviços de LT/SE do WebMap da EPE. Geometrias de linhas viram traçados com a natureza
 * configurada (padrão "aproximado_digitalizado"), nunca "oficial" por suposição.
 */
import { extrairTensoesKv, normalizarNumero, normalizarTexto, type Fonte, type RegistroNormalizado, type Tracado } from '@radar/core';
import { resolverColunas, type MapeamentoColunas } from '../planilha.js';
import { AdaptadorNaoConfigurado, buscar, type Adaptador, type ContextoAdaptador, type ResultadoAdaptador } from './tipos.js';

interface ConfigArcgis {
  servicoUrl?: string;
  camada?: number;
  where?: string;
  mapeamento?: MapeamentoColunas;
  naturezaTracado?: Tracado['natureza'];
  tamanhoPagina?: number;
}

type Geometria = { type: 'Point'; coordinates: [number, number] } | { type: 'LineString'; coordinates: [number, number][] } | { type: 'MultiLineString'; coordinates: [number, number][][] };
interface Feature {
  geometry: Geometria | null;
  properties: Record<string, unknown>;
}

export function featureParaRegistro(f: Feature, fonte: Fonte, cfg: ConfigArcgis, hoje: string, url: string): RegistroNormalizado | { erro: string } {
  const props = f.properties ?? {};
  const cols = resolverColunas(Object.keys(props), cfg.mapeamento);
  const get = (c: string) => (cols[c] ? props[cols[c]] : undefined);
  const nome = String(get('nome') ?? '').trim();
  if (!nome) return { erro: 'feição sem nome' };
  const tensoes = extrairTensoesKv(typeof get('tensao_kv') === 'number' ? (get('tensao_kv') as number) : `${get('tensao_kv') ?? ''} kV`);
  const kvNome = extrairTensoesKv(nome);
  const kv = tensoes[0] ?? kvNome[0];
  const g = f.geometry;
  const base: RegistroNormalizado = {
    fonteId: fonte.id,
    chaveExterna: String(props.OBJECTID ?? props.objectid ?? props.FID ?? nome),
    nome,
    tensoesKv: kv ? [kv] : undefined,
    evidencia: { titulo: `${fonte.nome} — camada ${cfg.camada ?? 0}`, url, tipoDocumento: 'relatorio_planejamento', dataColeta: hoje, trecho: `Feição "${nome}"` },
  };
  if (g?.type === 'LineString' || g?.type === 'MultiLineString') {
    const coords = g.type === 'LineString' ? g.coordinates : g.coordinates.flat();
    const km = normalizarNumero(get('extensao_km'));
    if (!kv) return { erro: `linha "${nome}" sem tensão identificável` };
    return {
      ...base,
      tipo: 'LT',
      extensaoKm: km,
      trechosLT: [
        {
          nome,
          tensaoKv: kv,
          corrente: /\bcc\b|hvdc|±/.test(normalizarTexto(nome)) ? 'CC' : 'CA',
          extensaoKm: km,
          tracado: { coordenadas: coords.map(([x, y]) => [x, y] as [number, number]), natureza: cfg.naturezaTracado ?? 'aproximado_digitalizado', observacao: 'Geometria de serviço ArcGIS de planejamento' },
        },
      ],
    };
  }
  if (g?.type === 'Point') {
    return {
      ...base,
      tipo: 'SE',
      ponto: { lon: g.coordinates[0], lat: g.coordinates[1], precisao: 'subestacao', fonte: fonte.nome },
      subestacoes: kv
        ? [{ nome, natureza: 'nova', tensoesKv: tensoes.length ? tensoes : [kv], ponto: { lon: g.coordinates[0], lat: g.coordinates[1], precisao: 'subestacao', fonte: fonte.nome } }]
        : undefined,
    };
  }
  return base;
}

export const adaptadorArcgis: Adaptador = {
  id: 'arcgis',
  descricao: 'ArcGIS REST query (GeoJSON, paginado)',
  validarConfiguracao(fonte) {
    const c = fonte.config as ConfigArcgis;
    return c.servicoUrl ? [] : ['informar servicoUrl (FeatureServer/MapServer) e camada'];
  },
  async coletar(fonte, ctx: ContextoAdaptador): Promise<ResultadoAdaptador> {
    const pend = this.validarConfiguracao(fonte, ctx.env);
    if (pend.length) throw new AdaptadorNaoConfigurado(pend);
    const c = fonte.config as ConfigArcgis;
    const tamanho = c.tamanhoPagina ?? 1000;
    const urlCamada = `${c.servicoUrl!.replace(/\/$/, '')}/${c.camada ?? 0}`;
    const registros: RegistroNormalizado[] = [];
    const avisos: string[] = [];
    let offset = 0;
    let lidos = 0;
    for (;;) {
      const params = new URLSearchParams({ where: c.where ?? '1=1', outFields: '*', f: 'geojson', outSR: '4326', resultOffset: String(offset), resultRecordCount: String(tamanho) });
      const r = await buscar(ctx.fetch, `${urlCamada}/query?${params}`);
      const fc = (await r.json()) as { features?: Feature[]; error?: { message?: string }; properties?: { exceededTransferLimit?: boolean }; exceededTransferLimit?: boolean };
      if (fc.error) throw new Error(`ArcGIS: ${fc.error.message ?? 'erro'}`);
      const feats = fc.features ?? [];
      lidos += feats.length;
      for (const f of feats) {
        const res = featureParaRegistro(f, fonte, c, ctx.hoje, urlCamada);
        if ('erro' in res) avisos.push(res.erro);
        else registros.push(res);
      }
      const excedeu = fc.exceededTransferLimit ?? fc.properties?.exceededTransferLimit;
      if (!feats.length || !excedeu || lidos >= (ctx.limite ?? 20_000)) break;
      offset += feats.length;
    }
    return { registros, sinais: [], avisos: avisos.slice(0, 100), lidos };
  },
};
