import { identidadeDoTrecho, normalizarExtremidade } from '../qualidade/identidadeLT.js';
import { pontoRepresentativo, tensaoMaxKv } from '../projetos/derivados.js';
import type { Empreendimento, Ponto } from '../tipos.js';

export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface ItemCluster {
  id: string;
  ponto: Ponto;
  peso?: number;
}

export interface Cluster {
  id: string;
  centro: { lat: number; lon: number };
  raioKm: number;
  itens: string[];
  pesoTotal: number;
}

/**
 * Agrupamento por proximidade com raio máximo (sem encadeamento): a partir dos pontos de maior
 * densidade, cada grupo reúne os itens ainda livres a até `raioKm` da semente. Assim um grupo nunca
 * se estende além do raio (o encadeamento de vizinhos uniria regiões inteiras em bases reais).
 * Itens com localização de baixa precisão (UF) não participam.
 */
export function agruparPorProximidade(itens: ItemCluster[], raioKm: number, minItens = 2): Cluster[] {
  const validos = itens.filter((i) => i.ponto.precisao !== 'uf');
  const densidade = new Map(validos.map((it) => [it.id, validos.filter((o) => distanciaKm(it.ponto, o.ponto) <= raioKm).length]));
  const ordem = [...validos].sort((a, b) => densidade.get(b.id)! - densidade.get(a.id)! || (b.peso ?? 0) - (a.peso ?? 0));
  const atribuido = new Set<string>();
  const clusters: Cluster[] = [];
  for (const semente of ordem) {
    if (atribuido.has(semente.id)) continue;
    const membros = validos.filter((o) => !atribuido.has(o.id) && distanciaKm(semente.ponto, o.ponto) <= raioKm);
    if (membros.length < minItens) continue;
    for (const m of membros) atribuido.add(m.id);
    const centro = {
      lat: membros.reduce((s, x) => s + x.ponto.lat, 0) / membros.length,
      lon: membros.reduce((s, x) => s + x.ponto.lon, 0) / membros.length,
    };
    clusters.push({
      id: `cluster-${clusters.length + 1}`,
      centro,
      raioKm: Math.max(...membros.map((x) => distanciaKm(centro, x.ponto)), 10),
      itens: membros.map((x) => x.id),
      pesoTotal: membros.reduce((s, x) => s + (x.peso ?? 0), 0),
    });
  }
  return clusters.sort((a, b) => b.itens.length - a.itens.length || b.pesoTotal - a.pesoTotal);
}

export interface Corredor {
  id: string;
  subestacoes: string[];
  empreendimentoIds: string[];
  trechos: number;
  extensaoKm: number;
  tensaoMaxKv: number;
}

/**
 * Polos de expansão: subestações onde chegam duas ou mais LTs de empreendimentos ativos
 * (extremidades registradas pela fonte ou lidas do nome do trecho). Cada polo lista as SEs
 * ligadas a ele. Componentes conexos inteiros não são usados porque, numa base nacional, a malha
 * conectada vira um único grupo sem utilidade comercial.
 */
export function identificarCorredores(projetos: Empreendimento[], limite = 60): Corredor[] {
  const polos = new Map<string, { rotulo: string; vizinhos: Map<string, string>; projetos: Set<string>; trechos: Set<string>; km: number; kv: number }>();
  const rotular = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  for (const p of projetos) {
    if (p.statusGeral !== 'ativo') continue;
    for (const t of p.trechosLT) {
      const [id] = identidadeDoTrecho(t);
      if (!id) continue;
      const nomes: Record<string, string> = t.origem && t.destino
        ? { [normalizarExtremidade(t.origem)]: t.origem.trim(), [normalizarExtremidade(t.destino)]: t.destino.trim() }
        : { [id.a]: rotular(id.a), [id.b]: rotular(id.b) };
      for (const [k, outro] of [[id.a, id.b], [id.b, id.a]] as const) {
        const polo = polos.get(k) ?? { rotulo: nomes[k] ?? rotular(k), vizinhos: new Map(), projetos: new Set(), trechos: new Set(), km: 0, kv: 0 };
        const chaveTrecho = `${p.id}|${t.id}`;
        if (!polo.trechos.has(chaveTrecho)) {
          polo.trechos.add(chaveTrecho);
          polo.km += t.extensaoKm ?? 0;
          polo.kv = Math.max(polo.kv, t.tensaoKv);
        }
        polo.vizinhos.set(outro, nomes[outro] ?? rotular(outro));
        polo.projetos.add(p.id);
        polos.set(k, polo);
      }
    }
  }
  return [...polos.values()]
    .filter((x) => x.trechos.size >= 2)
    .sort((a, b) => b.trechos.size - a.trechos.size || b.km - a.km)
    .slice(0, limite)
    .map((x, i) => ({
      id: `polo-${i + 1}`,
      subestacoes: [x.rotulo, ...[...x.vizinhos.values()].filter((v) => v !== x.rotulo)],
      empreendimentoIds: [...x.projetos],
      trechos: x.trechos.size,
      extensaoKm: Math.round(x.km),
      tensaoMaxKv: x.kv,
    }));
}

type Feature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] } | { type: 'LineString'; coordinates: [number, number][] };
  properties: Record<string, unknown>;
};

/** Gera GeoJSON somente com geometrias registradas (pontos de SE, traçados, ponto do empreendimento). */
export function paraGeoJSON(projetos: Empreendimento[]): { type: 'FeatureCollection'; features: Feature[] } {
  const features: Feature[] = [];
  for (const p of projetos) {
    const comum = { empreendimentoId: p.id, nome: p.nomeOficial, setor: p.setorOrigem, tensaoMaxKv: tensaoMaxKv(p), demo: p.demo };
    for (const se of p.subestacoes) {
      if (!se.ponto) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [se.ponto.lon, se.ponto.lat] },
        properties: { ...comum, camada: 'subestacao', subestacao: se.nome, natureza: se.natureza, precisao: se.ponto.precisao },
      });
    }
    for (const t of p.trechosLT) {
      if (!t.tracado) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: t.tracado.coordenadas },
        properties: { ...comum, camada: 'linha', trecho: t.nome, tensaoKv: t.tensaoKv, naturezaTracado: t.tracado.natureza },
      });
    }
    const pt = pontoRepresentativo(p);
    if (pt && !p.subestacoes.some((s) => s.ponto)) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pt.lon, pt.lat] },
        properties: { ...comum, camada: 'empreendimento', precisao: pt.precisao },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
