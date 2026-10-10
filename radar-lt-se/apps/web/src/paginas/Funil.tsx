import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROTULO_FASE_CONTRATACAO, type EstagioFunil } from '@radar/core';
import { AvisoDemo, Carregando, Cartao, Erro, SeloDemo, SeloFase, SeloNecessidade, SeloPrioridade } from '../componentes/base';
import { BarraFiltros } from '../componentes/filtros';
import { useApi } from '../lib/api';
import { aplicarFiltros, useFiltros } from '../lib/filtros';
import { brl, dataBR, faixaBRL } from '../lib/formatos';
import type { Resumo } from '../lib/tipos';

interface RespostaFunil {
  estagios: EstagioFunil[];
  empreendedorDefinidoSemContratacao: string[];
  empreendimentos: Resumo[];
}

const RAMPA = ['var(--ord-4)', 'var(--ord-3)', 'var(--ord-2)', 'var(--ord-1)', 'var(--neutro-serie)'];

export function PaginaFunil() {
  const { dados, erro, recarregar } = useApi<RespostaFunil>('/funil');
  const { filtros } = useFiltros();
  const [estagio, setEstagio] = useState<string>();
  const filtrados = useMemo(() => aplicarFiltros(dados?.empreendimentos ?? [], filtros), [dados, filtros]);
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;
  const ids = new Set(filtrados.map((v) => v.id));
  const porId = new Map(filtrados.map((v) => [v.id, v]));
  const estagios = dados.estagios.map((e) => {
    const vs = e.ids.filter((i) => ids.has(i)).map((i) => porId.get(i)!);
    const datas = vs.map((v) => v.dataDemandaBase).filter((d): d is string => !!d).sort();
    return { ...e, vs, quantidade: vs.length, central: vs.reduce((s, v) => s + (v.mercado.central ?? 0), 0), primeiraData: datas[0], ultimaData: datas.at(-1) };
  });
  const max = Math.max(1, ...estagios.map((e) => e.quantidade));
  const destaque = dados.empreendedorDefinidoSemContratacao.filter((i) => ids.has(i)).map((i) => porId.get(i)!);
  const lista = estagio ? estagios.find((e) => e.id === estagio)?.vs ?? [] : [];

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Funil de contratação</h1>
          <p>Empreendimentos por fase efetiva de contratação das obras (pacotes de construção/montagem de LT e SE), com quantidade, potencial endereçável e período das janelas previstas.</p>
        </div>
      </div>
      <AvisoDemo quantidade={filtrados.filter((v) => v.demo).length} />
      <BarraFiltros lista={dados.empreendimentos} compacta />
      <Cartao titulo="Fases de contratação" sub="Clique em uma fase para listar os empreendimentos">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {estagios.map((e, i) => (
            <button key={e.id} onClick={() => setEstagio(e.id === estagio ? undefined : e.id)} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: 'minmax(160px, 260px) 1fr minmax(220px, 300px)', gap: 12, alignItems: 'center' }} aria-pressed={e.id === estagio}>
              <div><strong>{e.rotulo}</strong><div className="sub">{e.fases.map((f) => ROTULO_FASE_CONTRATACAO[f]).join(', ')}</div></div>
              <div style={{ background: 'var(--superficie-2)', borderRadius: 4 }}>
                <div style={{ width: `${(e.quantidade / max) * 100}%`, minWidth: e.quantidade ? 24 : 0, height: 22, background: RAMPA[i], borderRadius: '0 4px 4px 0', outline: e.id === estagio ? '2px solid var(--texto)' : undefined }} />
              </div>
              <div className="pequeno"><strong className="tab-num">{e.quantidade}</strong> · {brl(e.central)}{e.primeiraData && <span className="muted"> · janelas {dataBR(e.primeiraData)} – {dataBR(e.ultimaData)}</span>}</div>
            </button>
          ))}
        </div>
      </Cartao>
      {estagio && (
        <Cartao titulo={`Empreendimentos — ${estagios.find((e) => e.id === estagio)?.rotulo}`}>
          <TabelaCurta lista={lista} />
        </Cartao>
      )}
      <Cartao titulo="Empreendedor definido, contratação de obra não identificada" sub="Outorga/decisão de investimento realizada e contratante conhecido, sem processo de contratação de construção identificado — foco de prospecção">
        <TabelaCurta lista={destaque} />
      </Cartao>
    </>
  );
}

function TabelaCurta({ lista }: { lista: Resumo[] }) {
  if (!lista.length) return <div className="vazio">Nenhum empreendimento.</div>;
  return (
    <div className="tabela-wrap">
      <table className="tabela">
        <thead><tr><th>Prioridade</th><th>Empreendimento</th><th>Contratante</th><th>Fase</th><th>Necessidade</th><th>RFQ (base)</th><th className="num">Potencial</th></tr></thead>
        <tbody>
          {[...lista].sort((a, b) => b.score.indice - a.score.indice).map((v) => (
            <tr key={v.id}>
              <td><SeloPrioridade faixa={v.score.faixa} indice={v.score.indice} /></td>
              <td className="nome"><Link to={`/empreendimentos/${v.id}`}>{v.nome}</Link> {v.demo && <SeloDemo />}</td>
              <td>{v.contratante ?? '—'}</td>
              <td><SeloFase fase={v.fase.geral} /></td>
              <td><SeloNecessidade classe={v.previsao.necessidade.classe} /></td>
              <td>{dataBR(v.previsao.base.rfq?.data)}</td>
              <td className="num" title={faixaBRL(v.mercado.faixa)}>{brl(v.mercado.central)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
