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

/**
 * Regra par-ímpar sobre todos os anéis da feição: independe da ordem/orientação dos anéis (o serviço
 * pode devolver ilhas e buracos em qualquer ordem num mesmo Polygon).
 */
function dentroDaFeicao(p: Coord, aneis: Coord[][]): boolean {
  let dentro = false;
  for (const anel of aneis) if (dentroDoAnel(p, anel)) dentro = !dentro;
  return dentro;
}

export interface PoligonoUf {
  uf: UF;
  poligonos: Coord[][][];
}

export function ufDoPonto(p: Coord, ufs: PoligonoUf[]): UF | undefined {
  return ufs.find((u) => u.poligonos.some((pol) => dentroDaFeicao(p, pol)))?.uf;
}

/** Converte a camada de UFs da EPE em polígonos; identifica a sigla em qualquer atributo com 2 letras válidas. */
export function poligonosUf(feicoes: FeicaoEpe[]): PoligonoUf[] {
  const out: PoligonoUf[] = [];
  for (const f of feicoes) {
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    // Sigla por campo nomeado (sigla/uf); só na falta dele, o primeiro valor de 2 letras válido.
    const entradas = Object.entries(f.properties);
    const nomeado = entradas.find(([k, v]) => /^(sigla|sg_?uf|uf|sigla_?uf|estado_?sigla)$/i.test(k) && (UFS as readonly string[]).includes(String(v ?? '').trim().toUpperCase()));
    const valor = nomeado?.[1] ?? entradas.map(([, v]) => v).find((v) => (UFS as readonly string[]).includes(String(v ?? '').trim().toUpperCase()));
    if (!valor) continue;
    const sigla = String(valor).trim().toUpperCase() as UF;
    // MultiPolygon: cada polígono avaliado à parte; Polygon: todos os anéis juntos (par-ímpar).
    out.push({ uf: sigla, poligonos: g.type === 'Polygon' ? [g.coordinates] : g.coordinates });
  }
  return out;
}

// --- Conversão de feições --------------------------------------------------------------------------

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** Comprimento geodésico aproximado (km) de uma polilinha [lon, lat]. */
export function comprimentoKm(coords: Coord[]): number {
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const r = Math.PI / 180;
    const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
    km += 2 * 6371 * Math.asin(Math.sqrt(a));
  }
  return km;
}

/**
 * Valida a extensão informada pela EPE contra o comprimento do traçado: parte das feições traz o
 * valor em metros. Só converte quando metros→km fica compatível com a geometria; valores
 * incompatíveis são descartados (com aviso), nunca ajustados livremente.
 */
export function extensaoValidada(informada: number | undefined, geometricaKm: number): { km?: number; nota?: string } {
  if (!informada || informada <= 0) return {};
  if (geometricaKm > 0.5) {
    if (informada <= geometricaKm * 4) return { km: informada };
    const emKm = informada / 1000;
    if (emKm >= geometricaKm * 0.7 && emKm <= geometricaKm * 3) return { km: emKm, nota: `extensão da fonte (${informada}) interpretada como metros: ${emKm.toFixed(2)} km, compatível com o traçado (${geometricaKm.toFixed(1)} km)` };
    return { nota: `extensão da fonte (${informada}) incompatível com o traçado (${geometricaKm.toFixed(1)} km): desconsiderada` };
  }
  return informada > 3000 ? { nota: `extensão da fonte (${informada}) implausível sem traçado: desconsiderada` } : { km: informada };
}

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

/**
 * O plano informa só o ano de entrada em operação: registrado como estimativa de precisão anual
 * (meio do ano), nunca como data divulgada — evita precisão artificial no cálculo das janelas.
 */
function marcosDoAno(ano: number | undefined): RegistroNormalizado['marcos'] {
  if (!ano) return [];
  return [{ tipo: 'energizacao', data: `${ano}-07-01`, natureza: 'previsto_estimado', descricao: `Ano previsto para entrada em operação segundo a EPE: ${ano}. Precisão anual — registrado como 01/07/${ano} apenas para cálculo; não é data divulgada.` }];
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
    const notas: string[] = [];
    let km = 0;
    for (const f of g) {
      const geo = f.geometry;
      const linhas = geo?.type === 'LineString' ? [geo.coordinates] : geo?.type === 'MultiLineString' ? geo.coordinates : [];
      const geoKm = linhas.reduce((t, c) => t + comprimentoKm(c), 0);
      const v = extensaoValidada(normalizarNumero(texto(f.properties.Extensao)), geoKm);
      const ext = v.km;
      if (v.nota) notas.push(v.nota);
      if (ext && ext > 0) km += ext;
      for (const coords of linhas) {
        if (coords.length < 2) continue;
        for (const pt of [coords[0], coords[Math.floor(coords.length / 2)], coords[coords.length - 1]]) {
          const uf = ufDoPonto(pt, ctx.ufs);
          if (uf) ufs.add(uf);
        }
        trechos.push({
          // Feições do mesmo grupo (pernas de um seccionamento) recebem nomes distintos para não se fundirem.
          nome: g.length > 1 || linhas.length > 1 ? `${nome} (trecho ${trechos.length + 1})` : nome,
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
      chaveExterna: `epe:lt:${normalizarTexto(nome)}:${kv}`,
      nome,
      tipo: 'LT',
      setorOrigem: 'transmissao',
      subsetor: 'transmissao_regulada',
      descricao: `Expansão planejada (EPE/MME) — ${nome}${ano ? `, entrada em operação prevista para ${ano}` : ', ano de operação não informado'}.${notas.length ? ` Observação: ${notas.join('; ')}.` : ''}`,
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
    const faltantes = UFS.filter((u) => !ufs.some((x) => x.uf === u));
    if (faltantes.length) avisos.push(`Camada de UFs sem polígono reconhecido para: ${faltantes.join(', ')} — a UF dessas regiões não é atribuída pela geometria.`);
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

// --- Localização por subestação homônima -------------------------------------------------------------

export interface EntradaSE {
  nome: string;
  uf?: UF;
  lon: number;
  lat: number;
  base: 'existente' | 'planejada';
}

export const chaveNomeSE = (s: string) =>
  normalizarTexto(s)
    .replace(/^(se|sub|subestacao)\s+/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Índice de subestações do WebMap EPE (base existente e expansão planejada) por nome normalizado,
 * com a UF obtida pela geometria. Usado para localizar obras de fontes sem coordenadas.
 */
export async function carregarIndiceSE(
  f: typeof fetch,
  servico = SERVICO_PADRAO,
  camadas: { existente: number; planejada: number; uf: number } = { existente: 20, planejada: 9, uf: 23 },
): Promise<Map<string, EntradaSE[]>> {
  const base = servico.replace(/\/$/, '');
  const [exist, plan, ufsF] = await Promise.all([
    consultar(f, `${base}/${camadas.existente}`),
    consultar(f, `${base}/${camadas.planejada}`),
    consultar(f, `${base}/${camadas.uf}`, '*', 0.01),
  ]);
  const ufs = poligonosUf(ufsF);
  const indice = new Map<string, EntradaSE[]>();
  for (const [feicoes, tipo] of [[exist, 'existente'], [plan, 'planejada']] as const) {
    for (const ft of feicoes) {
      const g = ft.geometry;
      const nome = texto(ft.properties.Nome ?? ft.properties.NOME ?? ft.properties.nome);
      if (!nome || g?.type !== 'Point') continue;
      const k = chaveNomeSE(nome);
      if (!k) continue;
      indice.set(k, [...(indice.get(k) ?? []), { nome, uf: ufDoPonto(g.coordinates, ufs), lon: g.coordinates[0], lat: g.coordinates[1], base: tipo }]);
    }
  }
  return indice;
}

/**
 * Atribui ponto a registros sem coordenadas a partir das SEs citadas (nome + UF). Só usa
 * correspondências inequívocas: mesmo nome normalizado e UF compatível com o registro; havendo mais
 * de uma SE possível, não localiza. A precisão é "subestacao" (base existente) ou "aproximada"
 * (SE planejada), e a origem fica registrada em `ponto.fonte`.
 */
export function localizarPorSubestacao(registros: RegistroNormalizado[], indice: Map<string, EntradaSE[]>, nomesSE: (r: RegistroNormalizado) => string[]): number {
  let localizados = 0;
  for (const r of registros) {
    if (r.ponto) continue;
    const ufsReg = new Set(r.ufs ?? []);
    for (const nome of nomesSE(r)) {
      const cands = (indice.get(chaveNomeSE(nome)) ?? []).filter((e) => (ufsReg.size ? !!e.uf && ufsReg.has(e.uf) : true));
      const existentes = cands.filter((e) => e.base === 'existente');
      const escolhidos = existentes.length ? existentes : cands;
      if (escolhidos.length !== 1 || (!ufsReg.size && cands.length !== 1)) continue;
      const e = escolhidos[0];
      r.ponto = {
        lon: e.lon,
        lat: e.lat,
        precisao: e.base === 'existente' ? 'subestacao' : 'aproximada',
        fonte: `EPE WebMap — SE ${e.base} "${e.nome}" (correspondência por nome e UF com a SE citada: "${nome}")`,
      };
      if (!r.ufs?.length && e.uf) r.ufs = [e.uf];
      localizados++;
      break;
    }
  }
  return localizados;
}
