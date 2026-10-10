import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ROTULO_INTERESSE, ROTULO_STATUS_PROSPECCAO, STATUS_PIPELINE_QUALIFICADO, STATUS_PROSPECCAO, type OportunidadeComercial,
  type Organizacao,
} from '@radar/core';
import { Carregando, Cartao, Erro, Kpi, SeloDemo, SeloNecessidade, SeloPrioridade } from '../componentes/base';
import { EditorOportunidade } from '../componentes/EditorOportunidade';
import { useApi } from '../lib/api';
import { brl, dataBR, num } from '../lib/formatos';
import type { Resumo } from '../lib/tipos';

type Op = OportunidadeComercial & { empreendimento?: string; codigo?: string; dataDemandaBase?: string; mercadoCentral?: number; faixaPrioridade?: 'alta' | 'media' | 'baixa'; indice?: number };
interface Pipelines {
  mercado: { quantidade: number; central: number };
  qualificado: { quantidade: number; valor: number; porStatus: { status: string; quantidade: number; valor: number }[] };
  resultados: { ganhas: number; perdidas: number; declinadas: number };
  naoAvaliadas: number;
}

export function PaginaComercial({ papel }: { papel?: string }) {
  const { dados: ops, erro, recarregar } = useApi<Op[]>('/comercial/oportunidades');
  const { dados: pip, recarregar: recPip } = useApi<Pipelines>('/comercial/pipelines');
  const { dados: lista } = useApi<Resumo[]>('/empreendimentos');
  const { dados: orgs } = useApi<Organizacao[]>('/organizacoes');
  const [editando, setEditando] = useState<{ id: string; nome: string; atual?: OportunidadeComercial }>();
  const pode = papel && papel !== 'leitor';
  const naoAvaliados = useMemo(() => {
    const comOp = new Set((ops ?? []).filter((o) => o.interesse !== 'nao_avaliado').map((o) => o.empreendimentoId));
    return (lista ?? []).filter((v) => !comOp.has(v.id) && !v.score.foraDoEscopo && v.statusGeral === 'ativo').sort((a, b) => b.score.indice - a.score.indice);
  }, [ops, lista]);
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!ops || !pip || !lista) return <Carregando />;
  const passos = ops.flatMap((o) => o.proximosPassos.filter((p) => !p.concluido).map((p) => ({ ...p, op: o }))).sort((a, b) => ((a.prazo ?? '9') < (b.prazo ?? '9') ? -1 : 1));
  const salvo = () => { setEditando(undefined); recarregar(); recPip(); };

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Gestão comercial</h1>
          <p>Pipeline comercial efetivamente qualificado pela empresa — separado do pipeline de mercado identificado pela plataforma. Registre interesse, estratégia, contatos, reuniões, próximos passos e a decisão de participar.</p>
        </div>
      </div>
      <div className="grade g4">
        <Kpi rotulo="Pipeline de mercado (identificado)" valor={num(pip.mercado.quantidade)} complemento={`${brl(pip.mercado.central)} de potencial central`} />
        <Kpi rotulo="Pipeline comercial (qualificado)" valor={num(pip.qualificado.quantidade)} complemento={brl(pip.qualificado.valor)} />
        <Kpi rotulo="Não avaliados" valor={num(naoAvaliados.length)} complemento="empreendimentos ativos ainda sem decisão de interesse" />
        <Kpi rotulo="Ganhas / perdidas / declinadas" valor={`${pip.resultados.ganhas} / ${pip.resultados.perdidas} / ${pip.resultados.declinadas}`} />
      </div>

      <Cartao titulo="Pipeline qualificado por status">
        <div className="grade g3">
          {STATUS_PIPELINE_QUALIFICADO.map((s) => {
            const doStatus = ops.filter((o) => o.statusProspeccao === s && o.interesse === 'interessado');
            return (
              <div key={s} className="cartao" style={{ background: 'var(--superficie-2)' }}>
                <div className="flex"><strong>{ROTULO_STATUS_PROSPECCAO[s]}</strong><span className="espaco" /><span className="sub">{doStatus.length} · {brl(doStatus.reduce((acc, o) => acc + (o.valorQualificadoBRL ?? o.mercadoCentral ?? 0), 0))}</span></div>
                {doStatus.map((o) => (
                  <div key={o.id} className="pequeno" style={{ padding: '6px 0', borderBottom: '1px solid var(--borda)' }}>
                    <Link to={`/empreendimentos/${o.empreendimentoId}`}>{o.empreendimento}</Link> {o.demo && <SeloDemo />}
                    <div className="muted">{o.responsavel ?? 'sem responsável'} · demanda {dataBR(o.dataDemandaBase)} · decisão {o.decisao.decisao}</div>
                    {pode && <button className="botao peq" style={{ marginTop: 4 }} onClick={() => setEditando({ id: o.empreendimentoId, nome: o.empreendimento ?? '', atual: o })}>Atualizar</button>}
                  </div>
                ))}
                {!doStatus.length && <div className="muted pequeno">—</div>}
              </div>
            );
          })}
        </div>
      </Cartao>

      <div className="grade g2">
        <Cartao titulo="Próximos passos em aberto">
          {passos.length === 0 && <div className="muted">Nenhum próximo passo registrado.</div>}
          <div className="lista">
            {passos.map((p) => (
              <div className="item" key={p.id}>
                <div className="tab-num" style={{ minWidth: 86 }}>{dataBR(p.prazo)}</div>
                <div>{p.descricao}<div className="meta">{p.responsavel ?? ''} · <Link to={`/empreendimentos/${p.op.empreendimentoId}`}>{p.op.empreendimento}</Link></div></div>
              </div>
            ))}
          </div>
        </Cartao>
        <Cartao titulo="Para triagem: maior prioridade ainda não avaliada" sub="Decida interesse (monitorar, interessado, sem interesse)">
          <div className="lista">
            {naoAvaliados.slice(0, 12).map((v) => (
              <div className="item" key={v.id}>
                <SeloPrioridade faixa={v.score.faixa} indice={v.score.indice} />
                <div style={{ flex: 1 }}>
                  <Link to={`/empreendimentos/${v.id}`}>{v.nome}</Link> {v.demo && <SeloDemo />}
                  <div className="meta">{v.contratante ?? 'contratante não identificado'} · <SeloNecessidade classe={v.previsao.necessidade.classe} /> · {brl(v.mercado.central)}</div>
                </div>
                {pode && <button className="botao peq" onClick={() => setEditando({ id: v.id, nome: v.nome, atual: ops.find((o) => o.empreendimentoId === v.id) })}>Avaliar</button>}
              </div>
            ))}
          </div>
        </Cartao>
      </div>

      <Cartao titulo="Todas as oportunidades registradas">
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Empreendimento</th><th>Interesse</th><th>Status</th><th>Responsável</th><th>Decisão</th><th>Demanda (base)</th><th className="num">Valor</th><th>Últ. interação</th><th /></tr></thead>
            <tbody>
              {[...ops].sort((a, b) => STATUS_PROSPECCAO.indexOf(a.statusProspeccao) - STATUS_PROSPECCAO.indexOf(b.statusProspeccao)).map((o) => (
                <tr key={o.id}>
                  <td className="nome"><Link to={`/empreendimentos/${o.empreendimentoId}`}>{o.empreendimento}</Link> {o.demo && <SeloDemo />}</td>
                  <td>{ROTULO_INTERESSE[o.interesse]}</td>
                  <td>{ROTULO_STATUS_PROSPECCAO[o.statusProspeccao]}{o.resultado?.vencedor ? <div className="pequeno muted">vencedor: {o.resultado.vencedor}</div> : null}</td>
                  <td>{o.responsavel ?? '—'}</td>
                  <td>{o.decisao.decisao}{o.decisao.justificativa ? <div className="pequeno muted">{o.decisao.justificativa}</div> : null}</td>
                  <td>{dataBR(o.dataDemandaBase)}</td>
                  <td className="num">{brl(o.valorQualificadoBRL ?? o.mercadoCentral)}</td>
                  <td className="pequeno">{o.interacoes.at(-1) ? `${dataBR(o.interacoes.at(-1)!.data)} · ${o.interacoes.at(-1)!.tipo}` : '—'}</td>
                  <td>{pode && <button className="botao peq" onClick={() => setEditando({ id: o.empreendimentoId, nome: o.empreendimento ?? '', atual: o })}>Editar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
      {editando && <EditorOportunidade empreendimentoId={editando.id} nome={editando.nome} atual={editando.atual} organizacoes={orgs ?? []} aoFechar={() => setEditando(undefined)} aoSalvar={salvo} />}
    </>
  );
}
