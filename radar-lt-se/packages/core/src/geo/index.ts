import { normalizarNomeEmpreendimento } from '../normalizacao/index.js';
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
 * Agrupamento por densidade (DBSCAN simplificado, distância geodésica).
 * Itens com localização de baixa precisão (UF) não participam.
 */
export function agruparPorProximidade(itens: ItemCluster[], raioKm: number, minItens = 2): Cluster[] {
  const validos = itens.filter((i) => i.ponto.precisao !== 'uf');
  const visitado = new Set<string>();
  const atribuido = new Set<string>();
  const clusters: Cluster[] = [];
  const vizinhos = (it: ItemCluster) => validos.filter((o) => distanciaKm(it.ponto, o.ponto) <= raioKm);

  for (const it of validos) {
    if (visitado.has(it.id)) continue;
    visitado.add(it.id);
    const viz = vizinhos(it);
    if (viz.length < minItens) continue;
    const membros = new Map<string, ItemCluster>([[it.id, it]]);
    atribuido.add(it.id);
    const fila = [...viz];
    while (fila.length) {
      const q = fila.shift()!;
      if (!atribuido.has(q.id)) {
        membros.set(q.id, q);
        atribuido.add(q.id);
      }
      if (visitado.has(q.id)) continue;
      visitado.add(q.id);
      const vq = vizinhos(q);
      if (vq.length >= minItens) fila.push(...vq.filter((x) => !membros.has(x.id)));
    }
    const lista = [...membros.values()];
    const centro = {
      lat: lista.reduce((s, x) => s + x.ponto.lat, 0) / lista.length,
      lon: lista.reduce((s, x) => s + x.ponto.lon, 0) / lista.length,
    };
    clusters.push({
      id: `cluster-${clusters.length + 1}`,
      centro,
      raioKm: Math.max(...lista.map((x) => distanciaKm(centro, x.ponto)), 10),
      itens: lista.map((x) => x.id),
      pesoTotal: lista.reduce((s, x) => s + (x.peso ?? 0), 0),
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
 * Corredores elétricos: componentes conexos do grafo formado por trechos de LT
 * (arestas) ligando subestações (nós identificados pelo nome normalizado das extremidades).
 */
export function identificarCorredores(projetos: Empreendimento[]): Corredor[] {
  const pai = new Map<string, string>();
  const achar = (x: string): string => {
    if (!pai.has(x)) pai.set(x, x);
    const p = pai.get(x)!;
    if (p === x) return x;
    const r = achar(p);
    pai.set(x, r);
    return r;
  };
  const unir = (a: string, b: string) => pai.set(achar(a), achar(b));
  const arestas: { a: string; b: string; proj: string; km: number; kv: number }[] = [];
  const rotulo = new Map<string, string>();
  for (const p of projetos) {
    for (const t of p.trechosLT) {
      if (!t.origem || !t.destino) continue;
      const a = normalizarNomeEmpreendimento(t.origem).replace(/^se\s+/, '');
      const b = normalizarNomeEmpreendimento(t.destino).replace(/^se\s+/, '');
      if (!rotulo.has(a)) rotulo.set(a, t.origem.trim());
      if (!rotulo.has(b)) rotulo.set(b, t.destino.trim());
      unir(a, b);
      arestas.push({ a, b, proj: p.id, km: t.extensaoKm ?? 0, kv: t.tensaoKv });
    }
  }
  const grupos = new Map<string, typeof arestas>();
  for (const ar of arestas) {
    const r = achar(ar.a);
    grupos.set(r, [...(grupos.get(r) ?? []), ar]);
  }
  return [...grupos.values()]
    .filter((g) => g.length >= 2)
    .map((g, i) => ({
      id: `corredor-${i + 1}`,
      subestacoes: [...new Set(g.flatMap((x) => [x.a, x.b]))].map((k) => rotulo.get(k) ?? k),
      empreendimentoIds: [...new Set(g.map((x) => x.proj))],
      trechos: g.length,
      extensaoKm: Math.round(g.reduce((s, x) => s + x.km, 0)),
      tensaoMaxKv: Math.max(...g.map((x) => x.kv)),
    }))
    .sort((a, b) => b.extensaoKm - a.extensaoKm);
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
