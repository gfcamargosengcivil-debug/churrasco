import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip } from 'react-leaflet';
import { ROTULO_NECESSIDADE, ROTULO_SETOR, type Cluster, type Corredor } from '@radar/core';
import { AvisoDemo, Carregando, Cartao, Erro } from '../componentes/base';
import { BarraFiltros } from '../componentes/filtros';
import { useApi } from '../lib/api';
import { aplicarFiltros, useFiltros } from '../lib/filtros';
import { brl, dataBR } from '../lib/formatos';
import type { Resumo } from '../lib/tipos';

interface RespostaMapa {
  geojson: {
    features: {
      geometry: { type: 'Point'; coordinates: [number, number] } | { type: 'LineString'; coordinates: [number, number][] };
      properties: { empreendimentoId: string; nome: string; camada: 'subestacao' | 'linha' | 'empreendimento'; precisao?: string; naturezaTracado?: string; tensaoKv?: number; subestacao?: string; trecho?: string };
    }[];
  };
  clusters: Cluster[];
  corredores: Corredor[];
  empreendimentos: Resumo[];
  raioClusterKm: number;
  aviso: string;
}

/** Cor ordinal pela proximidade da janela de contratação (mais escuro = mais próximo no tema claro). */
function corJanela(v: Resumo): { cor: string; rotulo: string } {
  const n = v.previsao.necessidade;
  if (n.classe === 'imediata' || n.classe === 'verificar') return { cor: 'var(--ord-1)', rotulo: '≤ 3 meses / cotação / verificar' };
  if (n.classe === 'curto_prazo') return { cor: 'var(--ord-2)', rotulo: '3–12 meses' };
  if (n.classe === 'medio_prazo') return { cor: 'var(--ord-3)', rotulo: '12–24 meses' };
  if (n.classe === 'longo_prazo') return { cor: 'var(--ord-4)', rotulo: '> 24 meses' };
  return { cor: 'var(--neutro-serie)', rotulo: 'contratada / indefinida / suspensa' };
}
const LEGENDA_JANELA = [
  { cor: 'var(--ord-1)', rotulo: 'Janela ≤ 3 meses, cotação ou verificar' },
  { cor: 'var(--ord-2)', rotulo: '3–12 meses' },
  { cor: 'var(--ord-3)', rotulo: '12–24 meses' },
  { cor: 'var(--ord-4)', rotulo: '> 24 meses' },
  { cor: 'var(--neutro-serie)', rotulo: 'Contratada, indefinida ou suspensa' },
];

const TILE = import.meta.env.VITE_TILE_URL ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIB = import.meta.env.VITE_TILE_ATTRIBUTION ?? '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function PaginaMapa() {
  const { dados, erro, recarregar } = useApi<RespostaMapa>('/mapa');
  const { filtros } = useFiltros();
  const [camadas, setCamadas] = useState({ subestacoes: true, linhas: true, empreendimentos: true, clusters: true, demandantes: true });
  const filtrados = useMemo(() => aplicarFiltros(dados?.empreendimentos ?? [], filtros), [dados, filtros]);
  const ids = useMemo(() => new Set(filtrados.map((v) => v.id)), [filtrados]);
  const porId = useMemo(() => new Map((dados?.empreendimentos ?? []).map((v) => [v.id, v])), [dados]);
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;
  const feats = dados.geojson.features.filter((f) => ids.has(f.properties.empreendimentoId));
  const demandante = (v: Resumo) => ['mineracao', 'industria', 'geracao'].includes(v.setor);
  const clusters = dados.clusters.map((c) => ({ ...c, itens: c.itens.filter((i) => ids.has(i)) })).filter((c) => c.itens.length >= 2);
  const semLocal = filtrados.filter((v) => !v.ponto).length;

  const popup = (id: string, extra?: string) => {
    const v = porId.get(id);
    if (!v) return null;
    return (
      <Popup>
        <strong>{v.nome}</strong>
        {extra && <div className="muted">{extra}</div>}
        <div>{v.contratante ?? 'Contratante não identificado'} · {v.ufs.join('/')} · {v.tensaoMaxKv ?? '?'} kV</div>
        <div>{ROTULO_NECESSIDADE[v.previsao.necessidade.classe]} · RFQ base {dataBR(v.previsao.base.rfq?.data)}</div>
        <div>Potencial: {brl(v.mercado.central)} · prioridade {v.score.faixa} ({v.score.indice})</div>
        {v.demo && <div style={{ color: 'var(--demo-texto)' }}>DADOS FICTÍCIOS</div>}
        <Link to={`/empreendimentos/${id}`}>Abrir ficha →</Link>
      </Popup>
    );
  };

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Mapa de oportunidades</h1>
          <p>{dados.aviso}</p>
        </div>
      </div>
      <AvisoDemo quantidade={filtrados.filter((v) => v.demo).length} />
      <BarraFiltros lista={dados.empreendimentos} compacta />
      <div className="flex">
        {(Object.keys(camadas) as (keyof typeof camadas)[]).map((k) => (
          <label key={k} className="chk"><input type="checkbox" checked={camadas[k]} onChange={(e) => setCamadas({ ...camadas, [k]: e.target.checked })} />{{ subestacoes: 'Subestações', linhas: 'Linhas (traçados)', empreendimentos: 'Empreendimentos sem SE georreferenciada', clusters: `Clusters (raio ${dados.raioClusterKm} km)`, demandantes: 'Destacar mineração/indústria/geração' }[k]}</label>
        ))}
        <span className="espaco" />
        <span className="sub">{filtrados.length} empreendimentos filtrados · {semLocal} sem localização registrada (não aparecem no mapa)</span>
      </div>
      <div className="mapa-wrap">
        <MapContainer center={[-14.5, -51]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer url={TILE} attribution={ATRIB} />
          {camadas.clusters && clusters.map((c) => (
            <Circle key={c.id} center={[c.centro.lat, c.centro.lon]} radius={Math.max(c.raioKm, 40) * 1000} pathOptions={{ color: 'var(--serie-1)', weight: 1, fillOpacity: 0.08 }}>
              <Tooltip>{c.itens.length} oportunidades · {brl(c.itens.reduce((s, i) => s + (porId.get(i)?.mercado.central ?? 0), 0))}</Tooltip>
            </Circle>
          ))}
          {camadas.linhas && feats.filter((f) => f.geometry.type === 'LineString').map((f, i) => {
            const v = porId.get(f.properties.empreendimentoId)!;
            const nat = f.properties.naturezaTracado;
            return (
              <Polyline
                key={`l${i}`}
                positions={(f.geometry.coordinates as [number, number][]).map(([lon, lat]) => [lat, lon])}
                pathOptions={{ color: nat === 'esquematico' ? 'var(--texto-3)' : corJanela(v).cor, weight: (f.properties.tensaoKv ?? 230) >= 440 ? 4 : 2.5, dashArray: nat === 'oficial' ? undefined : nat === 'esquematico' ? '2 6' : '8 6', opacity: 0.9 }}
              >
                <Tooltip sticky>{f.properties.trecho} · {nat === 'oficial' ? 'traçado oficial' : nat === 'esquematico' ? 'reta esquemática (não é traçado)' : 'traçado aproximado'}</Tooltip>
                {popup(f.properties.empreendimentoId, f.properties.trecho)}
              </Polyline>
            );
          })}
          {feats.filter((f) => f.geometry.type === 'Point' && (f.properties.camada === 'subestacao' ? camadas.subestacoes : camadas.empreendimentos)).map((f, i) => {
            const v = porId.get(f.properties.empreendimentoId)!;
            const [lon, lat] = f.geometry.coordinates as [number, number];
            const destaque = camadas.demandantes && demandante(v);
            return (
              <CircleMarker
                key={`p${i}`}
                center={[lat, lon]}
                radius={f.properties.camada === 'subestacao' ? 7 : 6}
                pathOptions={{ color: destaque ? 'var(--serie-2)' : 'var(--superficie)', weight: destaque ? 3 : 2, fillColor: corJanela(v).cor, fillOpacity: f.properties.precisao === 'municipio' || f.properties.precisao === 'aproximada' ? 0.65 : 0.95 }}
              >
                <Tooltip>{f.properties.subestacao ?? v.nome} · precisão: {f.properties.precisao}</Tooltip>
                {popup(f.properties.empreendimentoId, f.properties.subestacao ? `${f.properties.subestacao} (${f.properties.precisao})` : `localização: ${f.properties.precisao}`)}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <div className="legenda">
        {LEGENDA_JANELA.map((l) => <span key={l.rotulo} className="chave"><i className="amostra" style={{ background: l.cor }} />{l.rotulo}</span>)}
        <span className="chave"><i className="amostra" style={{ background: 'transparent', border: '3px solid var(--serie-2)' }} />Mineração/indústria/geração</span>
        <span className="chave"><i className="traco" />Traçado oficial</span>
        <span className="chave"><i className="traco" style={{ borderTopStyle: 'dashed' }} />Traçado aproximado</span>
        <span className="chave"><i className="traco" style={{ borderTopStyle: 'dotted', borderTopColor: 'var(--texto-3)' }} />Reta esquemática (não é traçado)</span>
        <span className="chave">Marcador translúcido = localização aproximada (centro do município)</span>
      </div>
      <div className="grade g2">
        <Cartao titulo="Clusters geográficos de oportunidades" sub={`Agrupamento por proximidade (raio ${dados.raioClusterKm} km), somente localizações registradas`}>
          <div className="tabela-rolagem"><table className="tabela">
            <thead><tr><th>Cluster</th><th className="num">Oportunidades</th><th className="num">Potencial central</th><th>Setores</th></tr></thead>
            <tbody>
              {clusters.map((c) => {
                const vs = c.itens.map((i) => porId.get(i)!).filter(Boolean);
                return (
                  <tr key={c.id}>
                    <td>{[...new Set(vs.flatMap((v) => v.ufs))].slice(0, 4).join(', ') || '—'} <span className="muted">({c.centro.lat.toFixed(1)}, {c.centro.lon.toFixed(1)})</span></td>
                    <td className="num">{c.itens.length}</td>
                    <td className="num">{brl(vs.reduce((s, v) => s + (v.mercado.central ?? 0), 0))}</td>
                    <td>{[...new Set(vs.map((v) => ROTULO_SETOR[v.setor]))].join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          {!clusters.length && <div className="vazio">Nenhum cluster com os filtros atuais.</div>}
        </Cartao>
        <Cartao titulo="Polos de expansão" sub="Subestações onde chegam duas ou mais LTs de empreendimentos ativos (SE do polo em primeiro lugar, seguida das SEs ligadas a ela)">
          <div className="tabela-rolagem"><table className="tabela">
            <thead><tr><th>Polo · SEs ligadas</th><th className="num">LTs</th><th className="num">km</th><th className="num">kV máx.</th></tr></thead>
            <tbody>
              {dados.corredores.filter((c) => c.empreendimentoIds.some((i) => ids.has(i))).map((c) => (
                <tr key={c.id}><td className="pequeno"><strong>{c.subestacoes[0]}</strong>{c.subestacoes.length > 1 && <> · {c.subestacoes.slice(1, 9).join(' · ')}{c.subestacoes.length > 9 ? ` · +${c.subestacoes.length - 9}` : ''}</>}</td><td className="num">{c.trechos}</td><td className="num">{c.extensaoKm}</td><td className="num">{c.tensaoMaxKv}</td></tr>
              ))}
            </tbody>
          </table></div>
        </Cartao>
      </div>
    </>
  );
}
