import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROTULO_EVENTO, type EtapaDef, type EventoMudanca, type PainelExecutivo } from '@radar/core';
import { AvisoDemo, Carregando, Cartao, Erro, Kpi, SeloConfianca, SeloDemo, SeloNecessidade, SeloPrioridade } from '../componentes/base';
import { BarrasHorizontais, LinhaTempo } from '../componentes/graficos';
import { useApi } from '../lib/api';
import { useFiltros, FILTROS_PADRAO, type Filtros } from '../lib/filtros';
import { brl, dataBR, faixaBRL, mesBR, num } from '../lib/formatos';
import type { Resumo } from '../lib/tipos';

interface RespostaPainel {
  painel: PainelExecutivo;
  top: Resumo[];
  evolucao: { serie: { mes: string; total: number; central: number; porEtapa: Record<string, number> }[]; observacao: string };
  riscos: { eventos: (EventoMudanca & { empreendimento?: string })[]; janelasVencidas: string[]; cronogramaApertado: string[] };
  pipelines: { mercado: { quantidade: number; central: number }; qualificado: { quantidade: number; valor: number }; resultados: { ganhas: number; perdidas: number; declinadas: number }; naoAvaliadas: number };
  etapas: EtapaDef[];
}

export function PaginaExecutivo() {
  const { dados, erro, recarregar } = useApi<RespostaPainel>('/painel');
  const { dados: lista } = useApi<Resumo[]>('/empreendimentos');
  const [dist, setDist] = useState<'quantidade' | 'central'>('quantidade');
  const { setFiltros } = useFiltros();
  const navegar = useNavigate();
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;
  const { painel, top, evolucao, riscos, pipelines } = dados;
  const nomes = new Map((lista ?? []).map((v) => [v.id, v.nome]));
  const irRadar = (f: Partial<Filtros>) => {
    setFiltros({ ...FILTROS_PADRAO, ...f });
    navegar('/radar');
  };

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Visão executiva</h1>
          <p>Onde estarão as próximas contratações de obras de LT e SE ≥ 138 kV, quando devem surgir, quem contratará e o potencial de serviços. Datas e valores são estimativas com metodologia explícita, salvo quando indicados como realizados ou divulgados.</p>
        </div>
        <div className="sub">Atualizado em {dataBR(painel.geradoEm)}</div>
      </div>
      <AvisoDemo quantidade={painel.totais.demo} />

      <div className="grade g5">
        <Kpi rotulo="Empreendimentos mapeados" valor={num(painel.totais.ativos)} complemento={`${painel.totais.mapeados} no total · ${painel.totais.suspensos} suspensos/adiados · ${painel.totais.foraDoEscopo} < 138 kV`} />
        <Kpi rotulo="Cotação em andamento" valor={num(painel.emCotacao)} complemento={<a href="#" onClick={(e) => { e.preventDefault(); irRadar({ janela: 'cotacao' }); }}>ver no radar →</a>} />
        <Kpi rotulo="Janelas a verificar" valor={num(painel.verificar)} complemento="janela estimada passou sem evidência de contratação" titulo="Possível contratação não identificada ou atraso" />
        <Kpi rotulo="Pipeline comercial qualificado" valor={brl(pipelines.qualificado.valor)} complemento={`${pipelines.qualificado.quantidade} oportunidades qualificadas pela empresa`} />
        <Kpi rotulo="Prioridade alta" valor={num(painel.prioridade.alta)} complemento={`${painel.prioridade.media} média · ${painel.prioridade.baixa} baixa`} />
      </div>

      <div className="grade g2">
        <Cartao titulo="Potencial de mercado endereçável" sub="Serviços de construção/montagem ainda não contratados — não é CAPEX total">
          <div className="heroi">{brl(painel.mercado.central)}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Faixa {faixaBRL(painel.mercado.faixa)} · {painel.mercado.estimaveis} empreendimentos estimáveis · {painel.mercado.naoEstimaveis} não estimáveis
          </div>
          {painel.mercado.premissaIlustrativa && (
            <div className="aviso atencao" style={{ marginTop: 10 }}>
              Parâmetros de mercado ilustrativos em uso — substitua pela base de custos da empresa em Configurações.
            </div>
          )}
          <details style={{ marginTop: 12 }}>
            <summary>Metodologia</summary>
            <ul className="pequeno" style={{ paddingLeft: 18 }}>
              {painel.mercado.metodologia.map((m) => <li key={m}>{m}</li>)}
            </ul>
            <table className="tabela" style={{ marginTop: 8 }}>
              <thead><tr><th>Método</th><th className="num">Empreend.</th><th className="num">Central</th></tr></thead>
              <tbody>
                {painel.mercado.porMetodo.map((m) => (
                  <tr key={m.metodo}><td>{m.rotulo}</td><td className="num">{m.quantidade}</td><td className="num">{brl(m.central)}</td></tr>
                ))}
              </tbody>
            </table>
            <Link to="/metodologia" className="pequeno">Metodologia completa →</Link>
          </details>
        </Cartao>
        <Cartao titulo="Oportunidades previstas por horizonte" sub="RFQ/RFP estimada no cenário base (inclui cotações em andamento)">
          <div className="grade g2">
            {painel.horizontes.map((h) => (
              <button key={h.meses} className="cartao kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => irRadar({ janela: String(h.meses) as Filtros['janela'] })}>
                <span className="rotulo">Próximos {h.meses} meses</span>
                <span className="valor">{h.quantidade}</span>
                <span className="complemento">{brl(h.central)} <span className="muted">({faixaBRL(h.faixa)})</span></span>
              </button>
            ))}
          </div>
        </Cartao>
      </div>

      <div className="grade g2">
        <Cartao titulo="Pipeline por estágio de maturidade" sub="Empreendimentos ativos por etapa atual (esteira configurável)">
          <BarrasHorizontais
            dados={painel.pipelinePorEtapa.map((e) => ({ rotulo: `${e.ordem}. ${e.nome}`, valor: e.quantidade, detalhe: `Potencial central ${brl(e.central)}` }))}
            rotuloValor="empreendimentos"
          />
        </Cartao>
        <Cartao
          titulo="Distribuição"
          sub={dist === 'quantidade' ? 'Quantidade de empreendimentos ativos' : 'Potencial central (R$)'}
          acoes={
            <select className="entrada" style={{ width: 'auto' }} value={dist} onChange={(e) => setDist(e.target.value as typeof dist)}>
              <option value="quantidade">Quantidade</option>
              <option value="central">Potencial (R$)</option>
            </select>
          }
        >
          {(['setor', 'regiao', 'tensao'] as const).map((k) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <h3 className="sub" style={{ marginBottom: 2 }}>{{ setor: 'Por setor', regiao: 'Por região', tensao: 'Por nível de tensão' }[k]}</h3>
              <BarrasHorizontais
                dados={painel.distribuicao[k].map((d) => ({ rotulo: d.rotulo, valor: dist === 'quantidade' ? d.quantidade : d.central }))}
                formatar={dist === 'quantidade' ? undefined : (v) => brl(v)}
                rotuloValor={dist === 'quantidade' ? 'empreendimentos' : 'potencial central'}
              />
            </div>
          ))}
        </Cartao>
      </div>

      <Cartao titulo="Projetos de maior prioridade" sub="Índice de priorização configurável (ordenação; não é probabilidade)" acoes={<Link className="botao" to="/radar">Abrir radar</Link>}>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Prioridade</th><th>Empreendimento</th><th>Cliente</th><th>UF</th><th className="num">kV</th><th>Necessidade</th><th>RFQ (base)</th><th className="num">Potencial</th><th>Confiança</th></tr>
            </thead>
            <tbody>
              {top.map((v) => (
                <tr key={v.id}>
                  <td><SeloPrioridade faixa={v.score.faixa} indice={v.score.indice} /></td>
                  <td className="nome"><Link to={`/empreendimentos/${v.id}`}>{v.nome}</Link> {v.demo && <SeloDemo />}</td>
                  <td>{v.contratante ?? <span className="muted">não identificado</span>}</td>
                  <td>{v.ufs.join('/')}</td>
                  <td className="num">{v.tensaoMaxKv ?? '—'}</td>
                  <td><SeloNecessidade classe={v.previsao.necessidade.classe} /></td>
                  <td className="tab-num">{dataBR(v.previsao.base.rfq?.data)}</td>
                  <td className="num">{brl(v.mercado.central)}</td>
                  <td><SeloConfianca nivel={v.previsao.confianca} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>

      <div className="grade g2">
        <Cartao titulo="Evolução do pipeline" sub={evolucao.observacao}>
          <LinhaTempo
            dados={evolucao.serie.map((p) => ({ rotulo: mesBR(`${p.mes}-01`), valor: p.total, detalhe: `Potencial central atual ${brl(p.central)}` }))}
            rotuloValor="empreendimentos ativos"
          />
        </Cartao>
        <Cartao titulo="Principais riscos, atrasos e mudanças de cronograma" sub="Últimos 120 dias">
          <div className="lista">
            {riscos.eventos.length === 0 && <div className="vazio">Nenhum evento de risco recente.</div>}
            {riscos.eventos.slice(0, 8).map((e) => (
              <div className="item" key={e.id}>
                <span className="selo">{ROTULO_EVENTO[e.tipo]}</span>
                <div>
                  <Link to={`/empreendimentos/${e.empreendimentoId}`}>{nomes.get(e.empreendimentoId) ?? e.titulo}</Link>
                  <div className="meta">{e.descricao} · {dataBR(e.em.slice(0, 10))}</div>
                </div>
              </div>
            ))}
            {riscos.janelasVencidas.length > 0 && (
              <div className="item">
                <span className="selo">! Janela vencida</span>
                <div>{riscos.janelasVencidas.length} empreendimento(s) com janela estimada vencida sem evidência — <a href="#" onClick={(e) => { e.preventDefault(); irRadar({ janela: 'verificar' }); }}>verificar</a></div>
              </div>
            )}
            {riscos.cronogramaApertado.length > 0 && (
              <div className="item">
                <span className="selo">Cronograma apertado</span>
                <div>
                  {riscos.cronogramaApertado.slice(0, 6).map((id) => <div key={id}><Link to={`/empreendimentos/${id}`}>{nomes.get(id) ?? id}</Link></div>)}
                  {riscos.cronogramaApertado.length > 6 && <div className="meta">e mais {riscos.cronogramaApertado.length - 6} empreendimento(s) com a RFQ limitada pelo prazo de energização</div>}
                </div>
              </div>
            )}
          </div>
        </Cartao>
      </div>

      <Cartao titulo="Pipeline de mercado × pipeline comercial" sub="Mercado = tudo que foi identificado; comercial = o que a empresa qualificou e está trabalhando">
        <div className="grade g4">
          <Kpi rotulo="Mercado identificado (ativo, ≥ 138 kV)" valor={num(pipelines.mercado.quantidade)} complemento={brl(pipelines.mercado.central)} />
          <Kpi rotulo="Qualificado pela empresa" valor={num(pipelines.qualificado.quantidade)} complemento={brl(pipelines.qualificado.valor)} />
          <Kpi rotulo="Ainda não avaliados" valor={num(pipelines.naoAvaliadas)} complemento={<Link to="/comercial">triar na gestão comercial →</Link>} />
          <Kpi rotulo="Resultados registrados" valor={`${pipelines.resultados.ganhas} / ${pipelines.resultados.perdidas}`} complemento={`ganhas / perdidas · ${pipelines.resultados.declinadas} declinadas`} />
        </div>
      </Cartao>
    </>
  );
}
