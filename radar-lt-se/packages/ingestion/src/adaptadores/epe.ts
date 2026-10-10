/**
 * Conector do WebMap da EPE (ArcGIS REST, MapServer SMA/WMS_Webmap_EPE), validado contra o serviço
 * real: camadas "Linhas de Transmissão - Expansão Planejada" (10) e "Subestações - Expansão
 * Planejada" (9). A UF é obtida pela geometria, cruzando com a camada oficial de Unidades da
 * Federação do mesmo serviço (23).
 *
 * As geometrias de planejamento são indicativas: traçados entram como "aproximado_digitalizado" e
 * pontos de SE com precisão "aproximada" — nunca como traçado executivo ou localização exata.
 * O ano previsto de entrada em operação (precisão anual) é registrado como 31/12 do ano, rotulado.
 */
import { normalizarNumero, normalizarTexto, UFS, type Fonte, type RegistroNormalizado, type UF } from '@radar/core';
import { buscar, type Adaptador, type ContextoAdaptador, type ResultadoAdaptador } from './tipos.js';

interface ConfigEpe {
  servicoUrl?: string;
  camadaLT?: number;
  camadaSE?: number;
  camadaUF?: number;
}

type Coord = [number, number];
type Geometria =
  | { type: 'Point'; coordinates: Coord }
  | { type: 'LineString'; coordinates: Coord[] }
  | { type: 'MultiLineString'; coordinates: Coord[][] }
  | { type: 'Polygon'; coordinates: Coord[][] }
  | { type: 'MultiPolygon'; coordinates: Coord[][][] };
export interface FeicaoEpe {
  geometry: Geometria | null;
  properties: Record<string, unknown>;
}

const SERVICO_PADRAO = 'https://gisepeprd2.epe.gov.br/arcgis/rest/services/SMA/WMS_Webmap_EPE/MapServer';

async function consultar(f: typeof fetch, urlCamada: string, campos = '*', simplificar?: number): Promise<FeicaoEpe[]> {
  const todas: FeicaoEpe[] = [];
  for (let offset = 0; ; ) {
    const q = new URLSearchParams({ where: '1=1', outFields: campos, f: 'geojson', outSR: '4326', resultOffset: String(offset), resultRecordCount: '1000' });
    if (simplificar) q.set('maxAllowableOffset', String(simplificar));
    const r = await buscar(f, `${urlCamada}/query?${q}`, { timeoutMs: 120_000 });
    const fc = (await r.json()) as { features?: FeicaoEpe[]; error?: { message?: string }; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } };
    if (fc.error) throw new Error(`EPE ArcGIS: ${fc.error.message ?? 'erro'} (${urlCamada})`);
    const feats = fc.features ?? [];
    todas.push(...feats);
    if (!feats.length || !(fc.exceededTransferLimit ?? fc.properties?.exceededTransferLimit)) break;
    offset += feats.length;
  }
  return todas;
}

// --- Ponto em polígono (UF pela geometria) ---------------------------------------------------------

function dentroDoAnel(p: Coord, anel: Coord[]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentroDoPoligono(p: Coord, poligono: Coord[][]): boolean {
  if (!poligono.length || !dentroDoAnel(p, poligono[0])) return false;
  return !poligono.slice(1).some((buraco) => dentroDoAnel(p, buraco));
}

export interface PoligonoUf {
  uf: UF;
  poligonos: Coord[][][];
}

export function ufDoPonto(p: Coord, ufs: PoligonoUf[]): UF | undefined {
  return ufs.find((u) => u.poligonos.some((pol) => dentroDoPoligono(p, pol)))?.uf;
}

/** Converte a camada de UFs da EPE em polígonos; identifica a sigla em qualquer atributo com 2 letras válidas. */
export function poligonosUf(feicoes: FeicaoEpe[]): PoligonoUf[] {
  const out: PoligonoUf[] = [];
  for (const f of feicoes) {
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const sigla = Object.values(f.properties).map((v) => String(v ?? '').trim().toUpperCase()).find((v) => (UFS as readonly string[]).includes(v)) as UF | undefined;
    if (!sigla) continue;
    out.push({ uf: sigla, poligonos: g.type === 'Polygon' ? [g.coordinates] : g.coordinates });
  }
  return out;
}

// --- Conversão de feições --------------------------------------------------------------------------

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
function anoValido(v: unknown): number | undefined {
  const n = Math.round(Number(texto(v)));
  return Number.isFinite(n) && n >= 2000 && n <= 2060 ? n : undefined;
}
function tensoesDe(v: unknown): number[] {
  return texto(v)
    .split(/[\/;,\s]+/)
    .map((x) => normalizarNumero(x))
    .filter((x): x is number => x !== undefined && x >= 1 && x <= 1200)
    .sort((a, b) => b - a);
}
const agenteValido = (v: unknown) => {
  const s = texto(v);
  return s && s !== '-' ? s : undefined;
};

interface ContextoEpe {
  fonte: Fonte;
  hoje: string;
  url: string;
  rotuloCamada: string;
  ufs: PoligonoUf[];
}

function marcosDoAno(ano: number | undefined): RegistroNormalizado['marcos'] {
  if (!ano) return [];
  return [{ tipo: 'energizacao', data: `${ano}-12-31`, natureza: 'previsto_oficial', descricao: `Ano previsto para entrada em operação segundo a EPE: ${ano} (precisão anual; registrado como 31/12/${ano}).` }];
}

/** Agrupa feições de LT com o mesmo nome/ano/tensão (trechos do mesmo seccionamento) em um registro. */
export function registrosLT(feicoes: FeicaoEpe[], ctx: ContextoEpe): { registros: RegistroNormalizado[]; avisos: string[] } {
  const grupos = new Map<string, FeicaoEpe[]>();
  const avisos: string[] = [];
  for (const f of feicoes) {
    const nome = texto(f.properties.Nome);
    if (!nome) {
      avisos.push(`EPE LT OBJECTID ${texto(f.properties.OBJECTID)} sem nome`);
      continue;
    }
    const k = `${normalizarTexto(nome)}|${texto(f.properties.Ano_Planej)}|${texto(f.properties.Tensao)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const registros: RegistroNormalizado[] = [];
  for (const g of grupos.values()) {
    const p = g[0].properties;
    const nome = texto(p.Nome);
    const kv = tensoesDe(p.Tensao)[0];
    if (!kv) {
      avisos.push(`EPE LT "${nome}" sem tensão`);
      continue;
    }
    const ano = anoValido(p.Ano_Planej);
    const trechos: NonNullable<RegistroNormalizado['trechosLT']> = [];
    const ufs = new Set<UF>();
    let km = 0;
    for (const f of g) {
      const geo = f.geometry;
      const linhas = geo?.type === 'LineString' ? [geo.coordinates] : geo?.type === 'MultiLineString' ? geo.coordinates : [];
      const ext = normalizarNumero(texto(f.properties.Extensao));
      if (ext && ext > 0) km += ext;
      for (const coords of linhas) {
        if (coords.length < 2) continue;
        for (const pt of [coords[0], coords[Math.floor(coords.length / 2)], coords[coords.length - 1]]) {
          const uf = ufDoPonto(pt, ctx.ufs);
          if (uf) ufs.add(uf);
        }
        trechos.push({
          nome,
          tensaoKv: kv,
          corrente: /\bcc\b|hvdc|±/.test(normalizarTexto(nome)) || kv === 800 || kv === 600 ? 'CC' : 'CA',
          extensaoKm: ext && ext > 0 && g.length === 1 && linhas.length === 1 ? Math.round(ext * 100) / 100 : undefined,
          tracado: { coordenadas: coords.map(([x, y]) => [x, y] as [number, number]), natureza: 'aproximado_digitalizado', observacao: 'Representação de planejamento do WebMap EPE (indicativa, não é traçado executivo).' },
        });
      }
    }
    const agente = agenteValido(p.Concession);
    registros.push({
      fonteId: ctx.fonte.id,
      chaveExterna: `epe:lt:${normalizarTexto(nome)}:${ano ?? 's-ano'}`,
      nome,
      tipo: 'LT',
      setorOrigem: 'transmissao',
      subsetor: 'transmissao_regulada',
      descricao: `Expansão planejada (EPE/MME) — ${nome}${ano ? `, entrada em operação prevista para ${ano}` : ', ano de operação não informado'}.`,
      organizacoes: agente ? [{ nome: agente, papel: 'concessionaria' }] : undefined,
      ufs: [...ufs],
      tensoesKv: [kv],
      extensaoKm: km > 0 ? Math.round(km * 100) / 100 : undefined,
      trechosLT: trechos.length ? trechos : [{ nome, tensaoKv: kv, corrente: 'CA', extensaoKm: km > 0 ? Math.round(km * 100) / 100 : undefined }],
      marcos: marcosDoAno(ano),
      situacoes: { regulatoria: 'em_planejamento' },
      statusGeral: 'ativo',
      evidencia: {
        titulo: `EPE WebMap — ${ctx.rotuloCamada}: ${nome}`.slice(0, 250),
        url: ctx.url,
        tipoDocumento: 'relatorio_planejamento',
        dataColeta: ctx.hoje,
        trecho: `Nome="${nome}"; Ano_Planej=${texto(p.Ano_Planej) || '∅'}; Tensao=${texto(p.Tensao)}; Extensao=${g.map((f) => texto(f.properties.Extensao)).join(' + ')}; Concession="${texto(p.Concession)}"`,
      },
    });
  }
  return { registros, avisos };
}

export function registroSE(f: FeicaoEpe, ctx: ContextoEpe): RegistroNormalizado | { erro: string } {
  const p = f.properties;
  const nome = texto(p.Nome);
  if (!nome) return { erro: `EPE SE OBJECTID ${texto(p.OBJECTID)} sem nome` };
  const tensoes = tensoesDe(p.Tensao);
  if (!tensoes.length) return { erro: `EPE SE "${nome}" sem tensão` };
  const ano = anoValido(p.Ano_Opera);
  const g = f.geometry;
  const coord = g?.type === 'Point' ? g.coordinates : undefined;
  const ponto = coord ? { lon: coord[0], lat: coord[1], precisao: 'aproximada' as const, fonte: 'EPE WebMap (localização indicativa de planejamento)' } : undefined;
  const uf = coord ? ufDoPonto(coord, ctx.ufs) : undefined;
  const agente = agenteValido(p.Concession);
  return {
    fonteId: ctx.fonte.id,
    chaveExterna: `epe:se:${normalizarTexto(nome)}`,
    nome: /^se\b/i.test(nome) ? nome : `SE ${nome}`,
    tipo: 'SE',
    setorOrigem: 'transmissao',
    subsetor: 'transmissao_regulada',
    descricao: `Subestação da expansão planejada (EPE/MME) — ${nome} ${tensoes.join('/')} kV${ano ? `, entrada em operação prevista para ${ano}` : ', ano de operação não informado'}.`,
    organizacoes: agente ? [{ nome: agente, papel: 'concessionaria' }] : undefined,
    ufs: uf ? [uf] : undefined,
    ponto,
    tensoesKv: tensoes,
    subestacoes: [{ nome: /^se\b/i.test(nome) ? nome : `SE ${nome}`, natureza: 'nova', tensoesKv: tensoes, uf, ponto }],
    marcos: marcosDoAno(ano),
    situacoes: { regulatoria: 'em_planejamento' },
    statusGeral: 'ativo',
    evidencia: {
      titulo: `EPE WebMap — ${ctx.rotuloCamada}: ${nome}`.slice(0, 250),
      url: ctx.url,
      tipoDocumento: 'relatorio_planejamento',
      dataColeta: ctx.hoje,
      trecho: `Nome="${nome}"; Ano_Opera=${texto(p.Ano_Opera) || '∅'}; Tensao=${texto(p.Tensao)}; Concession="${texto(p.Concession)}"`,
    },
  };
}

export const adaptadorEpeWebmap: Adaptador = {
  id: 'epe_webmap',
  descricao: 'EPE WebMap — LT e SE da expansão planejada (ArcGIS REST)',
  validarConfiguracao: () => [],
  async coletar(fonte, ctx: ContextoAdaptador): Promise<ResultadoAdaptador> {
    const c = fonte.config as ConfigEpe;
    const base = (c.servicoUrl || SERVICO_PADRAO).replace(/\/$/, '');
    const [cLT, cSE, cUF] = [c.camadaLT ?? 10, c.camadaSE ?? 9, c.camadaUF ?? 23];
    const [lts, ses, ufsF] = await Promise.all([consultar(ctx.fetch, `${base}/${cLT}`), consultar(ctx.fetch, `${base}/${cSE}`), consultar(ctx.fetch, `${base}/${cUF}`, '*', 0.01)]);
    const ufs = poligonosUf(ufsF);
    const avisos: string[] = [];
    if (ufs.length < 20) avisos.push(`Camada de UFs com ${ufs.length} polígonos reconhecidos: UF de parte das feições pode ficar em branco.`);
    const rl = registrosLT(lts, { fonte, hoje: ctx.hoje, url: `${base}/${cLT}`, rotuloCamada: 'Linhas de Transmissão - Expansão Planejada', ufs });
    avisos.push(...rl.avisos);
    const registros = [...rl.registros];
    for (const f of ses) {
      const r = registroSE(f, { fonte, hoje: ctx.hoje, url: `${base}/${cSE}`, rotuloCamada: 'Subestações - Expansão Planejada', ufs });
      if ('erro' in r) avisos.push(r.erro);
      else registros.push(r);
    }
    avisos.push(`EPE: ${lts.length} feições de LT e ${ses.length} de SE planejadas lidas; ${registros.length} registros.`);
    return { registros, sinais: [], avisos: avisos.slice(0, 200), lidos: lts.length + ses.length };
  },
};
