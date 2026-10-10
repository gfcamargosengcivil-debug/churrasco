import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CENARIOS, DESCRICAO_CLASSE_FONTE, ETAPAS_PADRAO, EVENTOS_PREVISAO, ROTULO_EVENTO, ROTULO_EVENTO_PREVISAO, ROTULO_FASE_CONTRATACAO,
  ROTULO_MARCO, ROTULO_METODO_MERCADO, ROTULO_NATUREZA_MARCO, ROTULO_NECESSIDADE, ROTULO_PACOTE, ROTULO_PAPEL,
  ROTULO_SETOR, ROTULO_SITUACAO, ROTULO_SITUACAO_OBRA, ROTULO_SUBSETOR, ROTULO_TIPO, ROTULO_TIPO_DOCUMENTO, ROTULO_TIPO_ORGANIZACAO,
  type Documento, type Empreendimento, type EventoMudanca, type Fonte, type OportunidadeComercial, type Organizacao, type VisaoEmpreendimento,
  type MatchCandidato,
} from '@radar/core';
import {
  Abas, AvisoDemo, Carregando, Cartao, Erro, Kpi, SeloConfianca, SeloDemo, SeloFase, SeloNatureza, SeloNecessidade, SeloPrioridade,
  SeloStatusDado, SeloStatusGeral,
} from '../componentes/base';
import { EditorEmpreendimento } from '../componentes/EditorEmpreendimento';
import { EditorOportunidade } from '../componentes/EditorOportunidade';
import { api, useApi } from '../lib/api';
import { brl, dataBR, dataHoraBR, faixaBRL, num } from '../lib/formatos';

interface Detalhe {
  projeto: Empreendimento;
  visao: VisaoEmpreendimento;
  organizacoes: Organizacao[];
  fontes: Fonte[];
  oportunidade?: OportunidadeComercial;
  eventos: EventoMudanca[];
  documentos: Documento[];
  matchesPendentes: MatchCandidato[];
}

interface Resumo {
  metodo: 'deterministico' | 'llm';
  modelo?: string;
  paragrafos: { texto: string; evidencias: string[] }[];
  acaoRecomendada?: { texto: string; evidencias: string[] };
  ressalvas: string[];
  avisos: string[];
}

type Aba = 'geral' | 'previsao' | 'prioridade' | 'marcos' | 'evidencias' | 'historico' | 'editar';
type Papel = 'admin' | 'analista' | 'comercial' | 'leitor' | undefined;

export function PaginaFicha({ papel }: { papel: Papel }) {
  const { id } = useParams();
  const { dados, erro, recarregar } = useApi<Detalhe>(`/empreendimentos/${id}`);
  const [aba, setAba] = useState<Aba>('geral');
  const podeEditar = papel === 'admin' || papel === 'analista';
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;
  const { projeto: p, visao: v } = dados;
  const orgs = new Map(dados.organizacoes.map((o) => [o.id, o]));
  const fontes = new Map(dados.fontes.map((f) => [f.id, f]));
  const evid = new Map(p.evidencias.map((e) => [e.id, e]));
  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'geral', rotulo: 'Visão geral' },
    { id: 'previsao', rotulo: 'Previsão e janelas' },
    { id: 'prioridade', rotulo: 'Prioridade e potencial' },
    { id: 'marcos', rotulo: `Marcos (${p.marcos.length})` },
    { id: 'evidencias', rotulo: `Evidências (${p.evidencias.length})` },
    { id: 'historico', rotulo: `Conflitos e histórico${p.conflitos.some((c) => c.status === 'aberto') ? ' ⚠' : ''}` },
    ...(podeEditar ? [{ id: 'editar' as Aba, rotulo: 'Editar' }] : []),
  ];

  return (
    <>
      <div className="cabecalho">
        <div>
          <div className="flex muted pequeno"><Link to="/radar">Radar</Link> / {p.codigo}</div>
          <h1 style={{ marginTop: 4 }}>{p.nomeOficial}</h1>
          <div className="flex" style={{ marginTop: 6 }}>
            {p.demo && <SeloDemo />}
            <SeloPrioridade faixa={v.score.faixa} indice={v.score.indice} />
            <SeloNecessidade classe={v.previsao.necessidadeComercial.classe} />
            <SeloConfianca nivel={v.previsao.confianca.nivel} rotulo="Confiança da previsão" />
            <SeloStatusGeral status={p.statusGeral} />
            <span className="selo">{ROTULO_TIPO[p.tipo]}</span>
            <span className="selo">{ROTULO_SETOR[p.setorOrigem]}{p.subsetor ? ` · ${ROTULO_SUBSETOR[p.subsetor]}` : ''}</span>
          </div>
        </div>
      </div>
      {p.demo && <AvisoDemo quantidade={1} />}
      {v.score.foraDoEscopo && <div className="aviso atencao">{v.score.foraDoEscopo} — fora do escopo de LT/SE ≥ 138 kV.</div>}
      {dados.matchesPendentes.length > 0 && (
        <div className="aviso info">Há {dados.matchesPendentes.length} registro(s) de fontes aguardando revisão de correspondência com este empreendimento. <Link to="/qualidade">Revisar</Link></div>
      )}

      <div className="grade g4">
        <Kpi rotulo="RFQ/RFP (cenário base)" valor={dataBR(v.previsao.cenarios.base.datas.rfq?.data)} complemento={v.previsao.janelas.rfq ? `janela ${dataBR(v.previsao.janelas.rfq.inicio)} – ${dataBR(v.previsao.janelas.rfq.fim)}` : 'sem estimativa'} />
        <Kpi rotulo="Potencial de serviços (não contratado)" valor={v.mercado.metodo === 'nao_estimavel' ? '—' : brl(v.mercado.central)} complemento={`${ROTULO_METODO_MERCADO[v.mercado.metodo]} · ${faixaBRL(v.mercado.faixa)}`} />
        <Kpi rotulo="Próximo marco" valor={v.previsao.proximoMarco ? dataBR(v.previsao.proximoMarco.data) : '—'} complemento={v.previsao.proximoMarco?.descricao ?? 'nenhum marco futuro'} />
        <Kpi rotulo="Conclusão / energização (base)" valor={dataBR(v.previsao.cenarios.base.datas.energizacao?.data)} complemento={v.previsao.cenarios.base.datas.energizacao ? <SeloNatureza natureza={v.previsao.cenarios.base.datas.energizacao.natureza} /> : undefined} />
      </div>

      <ResumoExecutivo id={p.id} evid={evid} />

      <Abas abas={abas} ativa={aba} onChange={setAba} />

      {aba === 'geral' && <AbaGeral p={p} v={v} orgs={orgs} dados={dados} podeEditar={podeEditar} papel={papel} recarregar={recarregar} />}
      {aba === 'previsao' && <AbaPrevisao v={v} evid={evid} />}
      {aba === 'prioridade' && <AbaPrioridade v={v} />}
      {aba === 'marcos' && <AbaMarcos p={p} evid={evid} id={p.id} />}
      {aba === 'evidencias' && <AbaEvidencias p={p} fontes={fontes} documentos={dados.documentos} />}
      {aba === 'historico' && <AbaHistorico p={p} eventos={dados.eventos} evid={evid} podeEditar={podeEditar} recarregar={recarregar} />}
      {aba === 'editar' && podeEditar && <EditorEmpreendimento projeto={p} organizacoes={dados.organizacoes} aoSalvar={() => { recarregar(); setAba('geral'); }} />}
    </>
  );
}

function ResumoExecutivo({ id, evid }: { id: string; evid: Map<string, Empreendimento['evidencias'][number]> }) {
  const [ia, setIa] = useState(false);
  const { dados, carregando } = useApi<Resumo>(`/empreendimentos/${id}/resumo${ia ? '?ia=1' : ''}`);
  const { dados: status } = useApi<{ habilitada: boolean }>('/ia/status');
  return (
    <Cartao
      titulo="Resumo executivo"
      sub={dados ? (dados.metodo === 'llm' ? `Redigido por IA (${dados.modelo}) a partir dos dados estruturados; referências verificadas` : 'Gerado a partir dos dados estruturados (determinístico)') : ''}
      acoes={status?.habilitada && !ia ? <button className="botao peq" onClick={() => setIa(true)}>Redigir com IA</button> : undefined}
    >
      {carregando && !dados ? <Carregando /> : dados && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: carregando ? 0.6 : 1 }}>
          {dados.paragrafos.map((pp, i) => (
            <p key={i}>
              {pp.texto}{' '}
              {[...new Set(pp.evidencias)].map((e) => <sup key={e} title={evid.get(e)?.titulo}>[{e.slice(-4)}]</sup>)}
            </p>
          ))}
          {dados.acaoRecomendada && <p><strong>Ação recomendada:</strong> {dados.acaoRecomendada.texto}</p>}
          {dados.ressalvas.length > 0 && <div className="pequeno muted">Ressalvas: {dados.ressalvas.join(' · ')}</div>}
          {dados.avisos.map((a) => <div key={a} className="pequeno muted">{a}</div>)}
        </div>
      )}
    </Cartao>
  );
}

function AbaGeral({ p, v, orgs, dados, podeEditar, papel, recarregar }: { p: Empreendimento; v: VisaoEmpreendimento; orgs: Map<string, Organizacao>; dados: Detalhe; podeEditar: boolean; papel: Papel; recarregar: () => void }) {
  const [editarOp, setEditarOp] = useState(false);
  const etapasFluxo = ETAPAS_PADRAO;
  const statusEtapa = new Map(p.etapas.map((e) => [e.etapaId, e]));
  const prov = (campo: string) => p.proveniencia[campo];
  const podeComercial = papel && papel !== 'leitor';
  return (
    <>
      <div className="grade g2">
        <Cartao titulo="Quem contrata e quem participa">
          {p.participantes.length === 0 && <div className="muted">Nenhum participante identificado.</div>}
          <div className="lista">
            {p.participantes.map((x) => {
              const o = orgs.get(x.organizacaoId);
              return (
                <div className="item" key={`${x.organizacaoId}-${x.papel}`}>
                  <span className="selo">{ROTULO_PAPEL[x.papel]}</span>
                  <div>
                    {o ? <Link to={`/clientes/${o.id}`}>{o.nome}</Link> : x.organizacaoId}
                    <div className="meta">{o ? ROTULO_TIPO_ORGANIZACAO[o.tipo] : ''}{x.escopo ? ` · ${x.escopo}` : ''} · {x.evidenciaIds.length} evidência(s)</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="sep" />
          <dl className="dl">
            <dt>Executor/EPC identificado</dt><dd>{v.executorIdentificado ? 'Sim' : 'Não identificado'}</dd>
            <dt>Responsável interno</dt><dd>{p.responsavelInterno ?? '—'}</dd>
          </dl>
        </Cartao>
        <Cartao titulo="Localização">
          <dl className="dl">
            <dt>UF / região</dt><dd>{p.localizacao.ufs.join(', ') || '—'} {v.regioes.length ? `(${v.regioes.join(', ')})` : ''}</dd>
            <dt>Municípios</dt><dd>{v.municipios.join('; ') || '—'}</dd>
            <dt>Coordenada</dt>
            <dd>
              {v.ponto ? `${v.ponto.lat.toFixed(3)}, ${v.ponto.lon.toFixed(3)}` : 'não registrada'}{' '}
              {v.ponto && <span className="selo">precisão: {v.ponto.precisao}</span>}
              {v.ponto?.fonte && <div className="meta">{v.ponto.fonte}</div>}
            </dd>
          </dl>
          <div className="sub" style={{ marginTop: 8 }}>Coordenadas são exibidas apenas quando registradas; centroides de município indicam localização aproximada.</div>
        </Cartao>
      </div>

      <Cartao titulo="Dimensões de situação (independentes)" sub="Maturidade, contratação, obra e necessidade comercial são avaliadas separadamente">
        <div className="grade g4">
          <div><div className="sub">Situação regulatória</div><strong>{ROTULO_SITUACAO[p.situacoes.regulatoria]}</strong> {prov('situacoes.regulatoria') && <SeloStatusDado status={prov('situacoes.regulatoria').status} conflito={prov('situacoes.regulatoria').emConflito} />}</div>
          <div><div className="sub">Situação ambiental</div><strong>{ROTULO_SITUACAO[p.situacoes.ambiental]}</strong></div>
          <div><div className="sub">Situação fundiária</div><strong>{ROTULO_SITUACAO[p.situacoes.fundiaria]}</strong></div>
          <div><div className="sub">Engenharia</div><strong>{ROTULO_SITUACAO[p.situacoes.engenharia]}</strong></div>
          <div><div className="sub">Fase de contratação — LT</div><SeloFase fase={v.fase.LT} /></div>
          <div><div className="sub">Fase de contratação — SE</div><SeloFase fase={v.fase.SE} /></div>
          <div><div className="sub">Situação da obra</div><strong>{ROTULO_SITUACAO_OBRA[p.situacaoObra]}</strong></div>
          <div><div className="sub">Necessidade comercial</div><strong>{ROTULO_NECESSIDADE[v.previsao.necessidadeComercial.classe]}</strong><div className="meta pequeno">{v.previsao.necessidadeComercial.descricao}</div></div>
        </div>
        <div className="sep" />
        <h3 style={{ margin: '8px 0' }}>Maturidade do projeto · fluxo “{p.fluxoId.replace(/_/g, ' ')}”</h3>
        <div className="etapas">
          {etapasFluxo.map((e) => {
            const st = statusEtapa.get(e.id);
            return (
              <div key={e.id} className={`etapa ${st?.status ?? 'nao_iniciada'}`} title={e.descricao}>
                <strong>{e.ordem}. {e.nome}</strong>
                {st?.status === 'concluida' ? '✓ concluída' : st?.status === 'em_andamento' ? '▶ em andamento' : st?.status === 'nao_aplicavel' ? 'não aplicável' : 'não iniciada'}
                {st?.dataInicio && <div className="muted">desde {dataBR(st.dataInicio)}</div>}
              </div>
            );
          })}
        </div>
      </Cartao>

      <div className="grade g2">
        <Cartao titulo="Características técnicas">
          <dl className="dl">
            <dt>Tensão máxima</dt><dd>{v.tensaoMaxKv ? `${v.tensaoMaxKv} kV` : '—'}</dd>
            <dt>Extensão de LT</dt><dd>{v.extensaoKm ? `${num(v.extensaoKm, 1)} km` : '—'} {prov('tecnico.extensaoKm') && <SeloStatusDado status={prov('tecnico.extensaoKm').status} conflito={prov('tecnico.extensaoKm').emConflito} />}</dd>
            <dt>Circuitos</dt><dd>{p.tecnico.circuitos ?? '—'}</dd>
            <dt>Capacidade</dt><dd>{p.tecnico.capacidadeMva ? `${num(p.tecnico.capacidadeMva)} MVA` : '—'}</dd>
            <dt>Potência associada</dt><dd>{p.tecnico.potenciaMw ? `${num(p.tecnico.potenciaMw)} MW` : '—'}</dd>
          </dl>
          {p.trechosLT.length > 0 && (
            <table className="tabela" style={{ marginTop: 10 }}>
              <thead><tr><th>Trecho de LT</th><th className="num">kV</th><th className="num">km</th><th>Traçado</th></tr></thead>
              <tbody>
                {p.trechosLT.map((t) => (
                  <tr key={t.id}>
                    <td>{t.nome}</td><td className="num">{t.tensaoKv}{t.corrente === 'CC' ? ' CC' : ''}</td><td className="num">{num(t.extensaoKm, 1)}</td>
                    <td>{t.tracado ? <span className="selo">{t.tracado.natureza === 'oficial' ? 'oficial' : t.tracado.natureza === 'esquematico' ? 'esquemático (não é traçado)' : 'aproximado'}</span> : <span className="muted">não disponível</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {p.subestacoes.length > 0 && (
            <table className="tabela" style={{ marginTop: 10 }}>
              <thead><tr><th>Subestação</th><th>Natureza</th><th>Tensões</th><th className="num">MVA</th></tr></thead>
              <tbody>
                {p.subestacoes.map((s) => (
                  <tr key={s.id}><td>{s.nome}</td><td>{s.natureza}</td><td>{s.tensoesKv.join('/')} kV</td><td className="num">{num(s.capacidadeMva)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>
        <Cartao titulo="Valores — nunca confundir" sub="CAPEX total ≠ investimento elétrico ≠ oportunidade de serviços">
          <dl className="dl">
            <dt>CAPEX total do empreendimento</dt><dd>{brl(p.financeiro.capexTotal?.valorBRL)} <span className="muted pequeno">(não endereçável)</span></dd>
            <dt>Investimento em LT/SE</dt><dd>{brl(p.financeiro.capexInfraEletrica?.valorBRL)} {p.financeiro.capexInfraEletrica && <span className="selo">{p.financeiro.capexInfraEletrica.natureza}</span>}</dd>
            <dt>Oportunidade de serviços (estimada)</dt><dd><strong>{faixaBRL(v.mercado.faixa)}</strong> <span className="muted pequeno">{ROTULO_METODO_MERCADO[v.mercado.metodo]}</span></dd>
            <dt>RAP anual</dt><dd>{brl(p.financeiro.rapAnual?.valorBRL)}</dd>
            <dt>Fonte de financiamento</dt><dd>{p.financeiro.fonteFinanciamento ?? '—'}</dd>
          </dl>
          <div className="sep" />
          <h3 style={{ margin: '8px 0' }}>Pacotes de serviço</h3>
          {p.pacotes.length === 0 ? <div className="muted">Nenhum pacote identificado.</div> : (
            <table className="tabela">
              <thead><tr><th>Pacote</th><th>Escopo</th><th>Fase</th><th>Contratada</th><th>Data</th></tr></thead>
              <tbody>
                {p.pacotes.map((x) => (
                  <tr key={`${x.pacote}-${x.escopo}`}>
                    <td>{ROTULO_PACOTE[x.pacote]}</td><td>{x.escopo}</td><td>{ROTULO_FASE_CONTRATACAO[x.faseContratacao]}</td>
                    <td>{x.contratadaId ? orgs.get(x.contratadaId)?.nome ?? x.contratadaId : '—'}</td><td>{dataBR(x.dataEvento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>
      </div>

      <Cartao
        titulo="Gestão comercial"
        sub="Pipeline qualificado pela empresa (separado do mercado identificado)"
        acoes={podeComercial ? <button className="botao" onClick={() => setEditarOp(true)}>{dados.oportunidade ? 'Editar oportunidade' : 'Registrar interesse'}</button> : undefined}
      >
        {dados.oportunidade ? (
          <dl className="dl">
            <dt>Interesse / status</dt><dd>{dados.oportunidade.interesse} · {dados.oportunidade.statusProspeccao.replace(/_/g, ' ')}</dd>
            <dt>Responsável</dt><dd>{dados.oportunidade.responsavel ?? '—'}</dd>
            <dt>Estratégia</dt><dd>{dados.oportunidade.estrategia ?? '—'}</dd>
            <dt>Decisão</dt><dd>{dados.oportunidade.decisao.decisao}{dados.oportunidade.decisao.justificativa ? ` — ${dados.oportunidade.decisao.justificativa}` : ''}</dd>
            <dt>Próximos passos</dt><dd>{dados.oportunidade.proximosPassos.filter((x) => !x.concluido).map((x) => <div key={x.id}>• {x.descricao} {x.prazo && <span className="muted">até {dataBR(x.prazo)}</span>}</div>)}</dd>
            <dt>Última interação</dt><dd>{dados.oportunidade.interacoes.at(-1) ? `${dataBR(dados.oportunidade.interacoes.at(-1)!.data)} — ${dados.oportunidade.interacoes.at(-1)!.resumo}` : '—'}</dd>
          </dl>
        ) : <div className="muted">Ainda não avaliado pela área comercial.</div>}
      </Cartao>
      {editarOp && (
        <EditorOportunidade empreendimentoId={p.id} nome={p.nomeOficial} atual={dados.oportunidade} organizacoes={dados.organizacoes} aoFechar={() => setEditarOp(false)} aoSalvar={() => { setEditarOp(false); recarregar(); }} />
      )}
      {podeEditar && p.observacoes && <Cartao titulo="Observações"><p>{p.observacoes}</p></Cartao>}
    </>
  );
}

function AbaPrevisao({ v, evid }: { v: VisaoEmpreendimento; evid: Map<string, Empreendimento['evidencias'][number]> }) {
  const prev = v.previsao;
  return (
    <>
      {prev.avisos.length > 0 && <div className="aviso atencao" style={{ flexDirection: 'column' }}>{prev.avisos.map((a) => <div key={a}>⚠ {a}</div>)}</div>}
      <Cartao titulo="Datas previstas por cenário" sub="Datas calculadas não são compromissos do empreendedor. ✓ realizado · ◆ divulgado · ≈ calculado de marco · ? heurístico">
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Evento</th>{CENARIOS.map((c) => <th key={c}>{c[0].toUpperCase() + c.slice(1)}</th>)}</tr></thead>
            <tbody>
              {EVENTOS_PREVISAO.filter((k) => CENARIOS.some((c) => prev.cenarios[c].datas[k])).map((k) => (
                <tr key={k}>
                  <td><strong>{ROTULO_EVENTO_PREVISAO[k]}</strong></td>
                  {CENARIOS.map((c) => {
                    const d = prev.cenarios[c].datas[k];
                    return (
                      <td key={c} title={d?.calculo}>
                        {d ? (
                          <>
                            <div className="tab-num" style={{ fontWeight: c === 'base' ? 650 : 400 }}>{d.dataDesconhecida ? 'ocorrido (data não registrada)' : dataBR(d.data)}</div>
                            <SeloNatureza natureza={d.natureza} vencida={d.vencida} />
                            <details><summary className="pequeno">cálculo</summary><div className="pequeno">{d.calculo}</div>{d.evidenciaIds.map((e) => <div key={e} className="pequeno muted">↳ {evid.get(e)?.titulo ?? e}</div>)}</details>
                          </>
                        ) : <span className="muted">n/a</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {(['LT', 'SE'] as const).map((e) => prev.cenarios.base.rfqPorEscopo[e] && (
                <tr key={e}>
                  <td className="muted">RFQ/RFP — {e}</td>
                  {CENARIOS.map((c) => {
                    const d = prev.cenarios[c].rfqPorEscopo[e];
                    return <td key={c} title={d?.calculo}>{d ? <><span className="tab-num">{dataBR(d.data)}</span> <SeloNatureza natureza={d.natureza} vencida={d.vencida} /></> : '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
      <div className="grade g3">
        {CENARIOS.map((c) => (
          <Cartao key={c} titulo={`Premissas — cenário ${c}`}>
            <ul className="pequeno" style={{ paddingLeft: 16, margin: 0 }}>{prev.cenarios[c].premissas.map((x) => <li key={x}>{x}</li>)}</ul>
          </Cartao>
        ))}
      </div>
      <Cartao titulo={`Confiança da previsão: ${prev.confianca.nivel.replace('_', ' ')} (${prev.confianca.pontos}/${prev.confianca.maximo} pontos)`} sub="Rubrica documentada — não é probabilidade">
        <table className="tabela">
          <thead><tr><th>Critério</th><th className="num">Pontos</th><th>Justificativa</th></tr></thead>
          <tbody>
            {prev.confianca.componentes.map((c) => <tr key={c.criterio}><td>{c.rotulo}</td><td className="num">{c.pontos}/{c.maximo}</td><td>{c.justificativa}</td></tr>)}
          </tbody>
        </table>
        {prev.confianca.limitadores.map((l) => <div key={l} className="pequeno muted" style={{ marginTop: 6 }}>Limitador: {l}</div>)}
      </Cartao>
    </>
  );
}

function AbaPrioridade({ v }: { v: VisaoEmpreendimento }) {
  return (
    <div className="grade g2">
      <Cartao titulo={`Índice de priorização: ${v.score.indice}/100 (${v.score.faixa})`} sub={v.score.aviso}>
        {v.score.notas.map((n) => (
          <div key={n.criterio} className="nota">
            <div>{n.rotulo} <span className="muted pequeno">peso {n.peso}</span></div>
            <div className="nota-barra" aria-label={`nota ${n.nota} de 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n.nota ? 'cheio' : ''} />)} <span className="pequeno tab-num">&nbsp;{n.nota}</span></div>
            <div className="pequeno">{n.justificativa}</div>
          </div>
        ))}
      </Cartao>
      <Cartao titulo="Potencial de serviços — memória de cálculo" sub={ROTULO_METODO_MERCADO[v.mercado.metodo]}>
        <div className="heroi" style={{ fontSize: 30 }}>{faixaBRL(v.mercado.faixa)}</div>
        {v.mercado.central !== undefined && <div className="muted">valor central (ponto médio): {brl(v.mercado.central)}</div>}
        <h3 style={{ margin: '12px 0 4px' }}>Memória</h3>
        <ul className="pequeno" style={{ paddingLeft: 16 }}>{v.mercado.memoria.map((m) => <li key={m}>{m}</li>)}</ul>
        {v.mercado.premissas.length > 0 && <><h3 style={{ margin: '8px 0 4px' }}>Premissas</h3><ul className="pequeno" style={{ paddingLeft: 16 }}>{v.mercado.premissas.map((m) => <li key={m}>{m}</li>)}</ul></>}
        {v.mercado.avisos.map((a) => <div key={a} className="aviso atencao pequeno" style={{ marginTop: 6 }}>{a}</div>)}
      </Cartao>
    </div>
  );
}

function AbaMarcos({ p, evid, id }: { p: Empreendimento; evid: Map<string, Empreendimento['evidencias'][number]>; id: string }) {
  const { dados: cron } = useApi<{ desde: string; descricao: string[]; revisoesConsideradas: number }>(`/empreendimentos/${id}/cronograma`);
  const marcos = [...p.marcos].sort((a, b) => (a.data < b.data ? -1 : 1));
  return (
    <div className="grade g2">
      <Cartao titulo="Marcos registrados" sub="Realizados, previstos divulgados e estimativas internas — cada um com evidências">
        <div className="lista">
          {marcos.map((m) => (
            <div className="item" key={m.id}>
              <div className="tab-num" style={{ minWidth: 90 }}>{dataBR(m.data)}</div>
              <div>
                <strong>{ROTULO_MARCO[m.tipo]}</strong>{m.escopo !== 'geral' && ` (${m.escopo})`} <span className="selo">{ROTULO_NATUREZA_MARCO[m.natureza]}</span>
                {m.descricao && <div className="meta">{m.descricao}</div>}
                {m.evidenciaIds.map((e) => <div key={e} className="meta">↳ {evid.get(e)?.titulo ?? e}</div>)}
              </div>
            </div>
          ))}
          {!marcos.length && <div className="vazio">Nenhum marco registrado.</div>}
        </div>
      </Cartao>
      <Cartao titulo="Comparação de versões do cronograma" sub={cron ? `Versão vigente em ${dataBR(cron.desde)} × atual (${cron.revisoesConsideradas} revisões)` : ''}>
        {!cron ? <Carregando /> : cron.descricao.length ? <ul style={{ paddingLeft: 16 }}>{cron.descricao.map((d) => <li key={d}>{d}</li>)}</ul> : <div className="muted">Sem mudanças de cronograma no período.</div>}
      </Cartao>
    </div>
  );
}

function AbaEvidencias({ p, fontes, documentos }: { p: Empreendimento; fontes: Map<string, Fonte>; documentos: Documento[] }) {
  const campos = Object.entries(p.proveniencia).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="grade g2">
      <Cartao titulo="Evidências (fonte, documento, datas)">
        <div className="lista">
          {p.evidencias.map((e) => (
            <div className="item" key={e.id}>
              <span className="selo" title={DESCRICAO_CLASSE_FONTE[e.classe ?? fontes.get(e.fonteId)?.classe ?? 'D']}>Classe {e.classe ?? fontes.get(e.fonteId)?.classe ?? 'D'}</span>
              <div style={{ minWidth: 0 }}>
                <div>{e.url ? <a href={e.url} target="_blank" rel="noreferrer noopener">{e.titulo}</a> : e.titulo}</div>
                <div className="meta">
                  {fontes.get(e.fonteId)?.nome ?? e.fonteId} · {ROTULO_TIPO_DOCUMENTO[e.tipoDocumento]} · publicação {dataBR(e.dataPublicacao)} · coleta {dataBR(e.dataColeta)}
                  {e.ultimaConfirmacao && ` · última confirmação ${dataBR(e.ultimaConfirmacao)}`}{e.validoAte && ` · válido até ${dataBR(e.validoAte)}`}{e.pagina && ` · p. ${e.pagina}`}
                </div>
                {e.trecho && <div className="trecho">“{e.trecho}”</div>}
              </div>
            </div>
          ))}
        </div>
      </Cartao>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Cartao titulo="Proveniência por campo" sub="Confirmado (fonte A/B) · estimado · inferido (fonte secundária/IA) · pendente">
          <table className="tabela">
            <thead><tr><th>Campo</th><th>Status</th><th className="num">Evid.</th><th>Atualizado</th></tr></thead>
            <tbody>
              {campos.map(([campo, pv]) => (
                <tr key={campo}><td className="mono">{campo}</td><td><SeloStatusDado status={pv.status} conflito={pv.emConflito} /></td><td className="num">{pv.evidenciaIds.length}</td><td>{dataBR(pv.atualizadoEm)}</td></tr>
              ))}
            </tbody>
          </table>
        </Cartao>
        <Cartao titulo="Documentos vinculados">
          {documentos.length === 0 ? <div className="muted">Nenhum documento vinculado.</div> : documentos.map((d) => (
            <div key={d.id} className="pequeno" style={{ padding: '4px 0' }}>{d.url ? <a href={d.url} target="_blank" rel="noreferrer noopener">{d.titulo}</a> : d.titulo} <span className="muted">· {ROTULO_TIPO_DOCUMENTO[d.tipo]} · {dataBR(d.dataPublicacao)}</span></div>
          ))}
        </Cartao>
      </div>
    </div>
  );
}

function AbaHistorico({ p, eventos, evid, podeEditar, recarregar }: { p: Empreendimento; eventos: EventoMudanca[]; evid: Map<string, Empreendimento['evidencias'][number]>; podeEditar: boolean; recarregar: () => void }) {
  const [resolvendo, setResolvendo] = useState<string>();
  const [valor, setValor] = useState('');
  const [just, setJust] = useState('');
  const [msg, setMsg] = useState<string>();
  const resolver = async (cid: string) => {
    setMsg(undefined);
    try {
      const bruto = valor.trim();
      const v: unknown = bruto !== '' && !Number.isNaN(Number(bruto)) ? Number(bruto) : bruto.startsWith('[') || bruto.startsWith('{') ? JSON.parse(bruto) : bruto;
      await api.enviar('POST', `/empreendimentos/${p.id}/conflitos/${cid}/resolver`, { valor: v, justificativa: just });
      setResolvendo(undefined);
      recarregar();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const historico = [...p.historico].sort((a, b) => (a.em < b.em ? 1 : -1));
  return (
    <>
      <Cartao titulo="Conflitos entre fontes" sub="Divergências nunca são resolvidas em silêncio: o valor adotado segue critério explícito e a decisão final é humana">
        {p.conflitos.length === 0 && <div className="muted">Nenhum conflito registrado.</div>}
        {p.conflitos.map((c) => (
          <div key={c.id} className="cartao" style={{ marginBottom: 10 }}>
            <div className="flex"><strong className="mono">{c.campo}</strong><span className="selo">{c.status}</span><span className="muted pequeno">aberto em {dataBR(c.abertoEm)}</span></div>
            <table className="tabela" style={{ marginTop: 8 }}>
              <thead><tr><th>Valor</th><th>Fonte</th><th>Classe</th><th>Publicação</th></tr></thead>
              <tbody>
                {c.valores.map((x, i) => (
                  <tr key={i}><td className="mono">{JSON.stringify(x.valor)}</td><td>{x.evidenciaId ? evid.get(x.evidenciaId)?.titulo ?? x.fonteId : x.fonteId ?? '—'}</td><td>{x.classe ?? '—'}</td><td>{dataBR(x.dataPublicacao)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="pequeno" style={{ marginTop: 6 }}>Valor adotado: <span className="mono">{JSON.stringify(c.valorAdotado)}</span> — {c.criterioAdocao}</div>
            {c.resolucao && <div className="pequeno">Resolvido por {c.resolucao.por} em {dataBR(c.resolucao.em)}: {c.resolucao.justificativa}</div>}
            {c.status === 'aberto' && podeEditar && (resolvendo === c.id ? (
              <div className="linha" style={{ marginTop: 8 }}>
                <label className="campo"><span>Valor final</span><input className="entrada" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
                <label className="campo" style={{ flex: 1 }}><span>Justificativa</span><input className="entrada" value={just} onChange={(e) => setJust(e.target.value)} /></label>
                <button className="botao primario" onClick={() => void resolver(c.id)}>Confirmar</button>
                <button className="botao" onClick={() => setResolvendo(undefined)}>Cancelar</button>
              </div>
            ) : <button className="botao peq" style={{ marginTop: 8 }} onClick={() => { setResolvendo(c.id); setValor(JSON.stringify(c.valorAdotado)); setJust(''); }}>Resolver</button>)}
          </div>
        ))}
        {msg && <div className="aviso erro">{msg}</div>}
      </Cartao>
      <div className="grade g2">
        <Cartao titulo="Eventos detectados" sub="Mudanças relevantes que alimentam os alertas">
          <div className="lista">
            {eventos.map((e) => (
              <div className="item" key={e.id}><span className="selo">{ROTULO_EVENTO[e.tipo]}</span><div>{e.descricao}<div className="meta">{dataHoraBR(e.em)}</div></div></div>
            ))}
            {!eventos.length && <div className="vazio">Sem eventos.</div>}
          </div>
        </Cartao>
        <Cartao titulo="Histórico de alterações" sub="Somente inclusão (append-only): quem, quando, de/para e evidência">
          <div className="lista">
            {historico.slice(0, 150).map((h) => (
              <div className="item" key={h.id}>
                <div style={{ minWidth: 0 }}>
                  <span className="mono">{h.campo}</span> <span className="selo">{h.origem}</span>
                  <div className="pequeno">{h.de !== undefined && <><span className="mono">{JSON.stringify(h.de)}</span> → </>}<span className="mono">{JSON.stringify(h.para)}</span></div>
                  <div className="meta">{dataHoraBR(h.em)} · {h.por}{h.evidenciaId ? ` · ${evid.get(h.evidenciaId)?.titulo ?? ''}` : ''}{h.observacao ? ` · ${h.observacao}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </Cartao>
      </div>
    </>
  );
}
