import { useEffect, useState } from 'react';
import {
  CRITERIOS_SCORE, ROTULO_CRITERIO, type AuditLog, type ConfiguracaoPlataforma, type ParametrosPrevisao, type PropostaCalibracao,
  type TriploMeses,
} from '@radar/core';
import { Carregando, Cartao, Erro } from '../componentes/base';
import { api, useApi } from '../lib/api';
import { dataHoraBR } from '../lib/formatos';

const ROTULO_PARAM: Partial<Record<keyof ParametrosPrevisao, string>> = {
  leilaoParaAssinatura: 'Leilão → assinatura da concessão',
  planejamentoParaOutorga: 'Inclusão em plano → outorga',
  editalParaLeilao: 'Edital → leilão',
  outorgaParaRfqLT: 'Outorga → RFQ de LT',
  outorgaParaRfqSE: 'Outorga → RFQ de SE',
  outorgaParaLI: 'Outorga → Licença de Instalação',
  anuncioParaFID: 'Anúncio → decisão de investimento',
  fidParaRfq: 'FID/contratação principal → RFQ',
  acessoParaRfq: 'Parecer de acesso → RFQ',
  preQualificacaoParaRfq: 'Pré-qualificação → RFQ',
  rfqParaContrato: 'RFQ → contrato de execução',
  contratoParaMobilizacao: 'Contrato → mobilização',
  liParaMobilizacao: 'LI → mobilização',
  liParaRfq: 'LI sem RFQ → RFQ (teto)',
  mobilizacaoParaObras: 'Mobilização → obras',
  comissionamento: 'Comissionamento',
  ajusteEnergizacaoDivulgada: 'Ajuste sobre energização divulgada',
  ajusteDataDivulgada: 'Ajuste sobre outras datas divulgadas',
};

export function PaginaConfiguracoes({ papel }: { papel?: string }) {
  const { dados, erro, recarregar } = useApi<{ configuracao: ConfiguracaoPlataforma; padrao: ConfiguracaoPlataforma }>('/config');
  const { dados: calib } = useApi<{ prazos: PropostaCalibracao[]; priorizacao: { faixas: { faixa: string; oportunidades: number; ganhas: number; perdidas: number; taxaSucesso?: number }[]; amostraSuficiente: boolean; observacao: string } }>('/calibracao');
  const admin = papel === 'admin';
  const { dados: auditoria } = useApi<AuditLog[]>(admin ? '/auditoria' : null);
  const [c, setC] = useState<ConfiguracaoPlataforma>();
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'info'; texto: string }>();
  useEffect(() => { if (dados) setC(structuredClone(dados.configuracao)); }, [dados]);
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!dados || !c) return <Carregando />;
  const up = (f: (x: ConfiguracaoPlataforma) => void) => setC((a) => { const n = structuredClone(a!); f(n); return n; });
  const salvar = async () => {
    try {
      await api.enviar('PUT', '/config', c);
      setMsg({ tipo: 'info', texto: 'Configuração salva. Previsões e índices foram recalculados.' });
      recarregar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  };
  const demo = async (acao: 'carregar' | 'remover') => {
    if (acao === 'remover' && !confirm('Remover todos os dados demonstrativos fictícios? Dados reais não são afetados.')) return;
    try {
      const r = acao === 'carregar' ? await api.enviar<{ empreendimentos: number }>('POST', '/demo/carregar') : await api.enviar<{ empreendimentos: number }>('DELETE', '/demo');
      setMsg({ tipo: 'info', texto: `${acao === 'carregar' ? 'Carregados' : 'Removidos'} ${r.empreendimentos} empreendimentos demonstrativos.` });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  };
  const triplo = (k: keyof ParametrosPrevisao) => {
    const v = c.previsao[k] as TriploMeses;
    return (
      <tr key={k}>
        <td>{ROTULO_PARAM[k] ?? k}</td>
        {[0, 1, 2].map((i) => (
          <td key={i}><input className="entrada" style={{ width: 70 }} type="number" step="0.5" disabled={!admin} value={v[i]} onChange={(e) => up((x) => { (x.previsao[k] as TriploMeses)[i] = Number(e.target.value); x.previsao.versao = `personalizado-${new Date().toISOString().slice(0, 10)}`; })} /></td>
        ))}
      </tr>
    );
  };
  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Configurações</h1>
          <p>Perfil da empresa, pesos do índice de priorização, premissas de prazo e de mercado. Alterações recalculam previsões e prioridades; somente administradores editam.</p>
        </div>
        {admin && <div className="acoes"><button className="botao primario" onClick={() => void salvar()}>Salvar configurações</button></div>}
      </div>
      {msg && <div className={`aviso ${msg.tipo}`}>{msg.texto}</div>}

      <div className="grade g2">
        <Cartao titulo="Perfil da construtora (portfólio)" sub="Usado na aderência técnica, geografia e capacidade">
          <div className="form-grade">
            <label className="campo"><span>Nome</span><input className="entrada" disabled={!admin} value={c.portfolio.nome} onChange={(e) => up((x) => (x.portfolio.nome = e.target.value))} /></label>
            <label className="campo"><span>Tensões com experiência (kV)</span><input className="entrada" disabled={!admin} value={c.portfolio.tensoesExperienciaKv.join(', ')} onChange={(e) => up((x) => (x.portfolio.tensoesExperienciaKv = e.target.value.split(/[,; ]+/).map(Number).filter((n) => n > 0)))} /></label>
            <label className="campo"><span>UFs de atuação</span><input className="entrada" disabled={!admin} value={c.portfolio.ufsAtuacao.join(', ')} onChange={(e) => up((x) => (x.portfolio.ufsAtuacao = e.target.value.toUpperCase().split(/[,; ]+/).filter(Boolean)))} /></label>
            <label className="campo"><span>UFs prioritárias</span><input className="entrada" disabled={!admin} value={c.portfolio.ufsPrioritarias.join(', ')} onChange={(e) => up((x) => (x.portfolio.ufsPrioritarias = e.target.value.toUpperCase().split(/[,; ]+/).filter(Boolean)))} /></label>
            <label className="campo"><span>Porte mínimo (R$ mi)</span><input className="entrada" type="number" disabled={!admin} value={c.portfolio.porteMinimoBRL / 1e6} onChange={(e) => up((x) => (x.portfolio.porteMinimoBRL = Number(e.target.value) * 1e6))} /></label>
            <label className="campo"><span>Porte máximo (R$ mi)</span><input className="entrada" type="number" disabled={!admin} value={c.portfolio.porteMaximoBRL / 1e6} onChange={(e) => up((x) => (x.portfolio.porteMaximoBRL = Number(e.target.value) * 1e6))} /></label>
            <label className="campo"><span>Capacidade (km de LT/ano)</span><input className="entrada" type="number" disabled={!admin} value={c.portfolio.capacidadeKmAno} onChange={(e) => up((x) => (x.portfolio.capacidadeKmAno = Number(e.target.value)))} /></label>
            <label className="chk"><input type="checkbox" disabled={!admin} checked={c.portfolio.executaCC} onChange={(e) => up((x) => (x.portfolio.executaCC = e.target.checked))} /> Executa HVDC (CC)</label>
          </div>
          <label className="campo" style={{ marginTop: 10 }}><span>Bases operacionais (nome; lat; lon — uma por linha)</span>
            <textarea className="entrada" disabled={!admin} defaultValue={c.portfolio.bases.map((b) => `${b.nome}; ${b.lat}; ${b.lon}`).join('\n')} onBlur={(e) => up((x) => (x.portfolio.bases = e.target.value.split('\n').map((l) => l.split(';').map((s) => s.trim())).filter((p) => p.length === 3 && !Number.isNaN(Number(p[1]))).map(([nome, lat, lon]) => ({ nome, lat: Number(lat), lon: Number(lon) }))))} />
          </label>
        </Cartao>
        <Cartao titulo="Índice de priorização" sub="Pesos relativos (normalizados) e limites das faixas — o índice não é probabilidade">
          <table className="tabela">
            <thead><tr><th>Critério</th><th>Peso</th></tr></thead>
            <tbody>
              {CRITERIOS_SCORE.map((k) => (
                <tr key={k}><td>{ROTULO_CRITERIO[k]}</td><td><input className="entrada" type="number" min={0} style={{ width: 80 }} disabled={!admin} value={c.score.pesos[k]} onChange={(e) => up((x) => { x.score.pesos[k] = Number(e.target.value); x.score.versao = `personalizado-${new Date().toISOString().slice(0, 10)}`; })} /></td></tr>
              ))}
            </tbody>
          </table>
          <div className="linha" style={{ marginTop: 10 }}>
            <label className="campo"><span>Faixa alta a partir de</span><input className="entrada" type="number" disabled={!admin} value={c.score.faixas.alta} onChange={(e) => up((x) => (x.score.faixas.alta = Number(e.target.value)))} /></label>
            <label className="campo"><span>Faixa média a partir de</span><input className="entrada" type="number" disabled={!admin} value={c.score.faixas.media} onChange={(e) => up((x) => (x.score.faixas.media = Number(e.target.value)))} /></label>
          </div>
        </Cartao>
      </div>

      <div className="grade g2">
        <Cartao titulo="Premissas de prazo (meses)" sub="Otimista / base / conservador — premissas iniciais, não estatísticas oficiais">
          <table className="tabela">
            <thead><tr><th>Intervalo</th><th>Otim.</th><th>Base</th><th>Cons.</th></tr></thead>
            <tbody>{(Object.keys(ROTULO_PARAM) as (keyof ParametrosPrevisao)[]).map(triplo)}</tbody>
          </table>
          <div className="sub" style={{ marginTop: 6 }}>Duração de obra de LT e SE: veja Metodologia (editável via API/configuração).</div>
        </Cartao>
        <Cartao titulo="Calibração com resultados observados" sub="Proposta a partir de marcos realizados na base (exclui dados demonstrativos); aplicação manual">
          {!calib ? <Carregando /> : (
            <>
              <table className="tabela">
                <thead><tr><th>Parâmetro</th><th className="num">n</th><th>Atual</th><th>Proposto (P20/P50/P80)</th><th /></tr></thead>
                <tbody>
                  {calib.prazos.map((p) => (
                    <tr key={p.parametro}>
                      <td>{ROTULO_PARAM[p.parametro] ?? p.parametro}</td><td className="num">{p.amostra}</td><td>{p.atual.join(' / ')}</td>
                      <td>{p.proposto ? p.proposto.join(' / ') : <span className="muted pequeno">{p.observacao}</span>}</td>
                      <td>{p.proposto && admin && <button className="botao peq" onClick={() => up((x) => { (x.previsao[p.parametro] as TriploMeses) = [...p.proposto!] as TriploMeses; x.previsao.versao = `calibrado-${new Date().toISOString().slice(0, 10)}`; })}>Usar</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 style={{ margin: '12px 0 6px' }}>Desempenho por faixa de prioridade</h3>
              <table className="tabela">
                <thead><tr><th>Faixa</th><th className="num">Com resultado</th><th className="num">Ganhas</th><th className="num">Perdidas</th><th className="num">Taxa</th></tr></thead>
                <tbody>{calib.priorizacao.faixas.map((f) => <tr key={f.faixa}><td>{f.faixa}</td><td className="num">{f.oportunidades}</td><td className="num">{f.ganhas}</td><td className="num">{f.perdidas}</td><td className="num">{f.taxaSucesso === undefined ? '—' : `${Math.round(f.taxaSucesso * 100)}%`}</td></tr>)}</tbody>
              </table>
              <div className="sub" style={{ marginTop: 6 }}>{calib.priorizacao.observacao}</div>
            </>
          )}
        </Cartao>
      </div>

      <div className="grade g2">
        <Cartao titulo="Premissas de mercado endereçável" sub={c.mercado.premissaIlustrativa ? 'Valores ILUSTRATIVOS — substitua pela base de custos da empresa' : 'Valores personalizados'}>
          <div className="form-grade">
            {(['participacaoServicosLT', 'participacaoServicosSE'] as const).map((k) => (
              <label key={k} className="campo"><span>{k === 'participacaoServicosLT' ? 'Serviços / investimento LT (%)' : 'Serviços / investimento SE (%)'}</span>
                <div className="flex">
                  {[0, 1].map((i) => <input key={i} className="entrada" style={{ width: 70 }} type="number" disabled={!admin} value={Math.round(c.mercado[k][i] * 100)} onChange={(e) => up((x) => { x.mercado[k][i] = Number(e.target.value) / 100; x.mercado.premissaIlustrativa = false; x.mercado.versao = 'personalizado'; })} />)}
                </div>
              </label>
            ))}
          </div>
          <table className="tabela" style={{ marginTop: 10 }}>
            <thead><tr><th>LT — classe</th><th>R$/km mín.</th><th>R$/km máx.</th></tr></thead>
            <tbody>
              {Object.entries(c.mercado.servicosLTporKm).map(([classe, f]) => (
                <tr key={classe}><td>{classe} kV</td>{[0, 1].map((i) => <td key={i}><input className="entrada" type="number" disabled={!admin} value={f[i]} onChange={(e) => up((x) => { x.mercado.servicosLTporKm[classe][i] = Number(e.target.value); x.mercado.premissaIlustrativa = false; x.mercado.versao = 'personalizado'; })} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </Cartao>
        <Cartao titulo="Deduplicação, agrupamento e atualidade">
          <div className="form-grade">
            <label className="campo"><span>Vínculo automático a partir de</span><input className="entrada" type="number" step="0.05" disabled={!admin} value={c.dedup.limiarAutomatico} onChange={(e) => up((x) => (x.dedup.limiarAutomatico = Number(e.target.value)))} /></label>
            <label className="campo"><span>Revisão manual a partir de</span><input className="entrada" type="number" step="0.05" disabled={!admin} value={c.dedup.limiarRevisao} onChange={(e) => up((x) => (x.dedup.limiarRevisao = Number(e.target.value)))} /></label>
            <label className="campo"><span>Distância compatível (km)</span><input className="entrada" type="number" disabled={!admin} value={c.dedup.distanciaMaxKm} onChange={(e) => up((x) => (x.dedup.distanciaMaxKm = Number(e.target.value)))} /></label>
            <label className="campo"><span>Raio de cluster no mapa (km)</span><input className="entrada" type="number" disabled={!admin} value={c.raioClusterKm} onChange={(e) => up((x) => (x.raioClusterKm = Number(e.target.value)))} /></label>
            <label className="campo"><span>Desatualizado após (dias)</span><input className="entrada" type="number" disabled={!admin} value={c.diasDesatualizacao} onChange={(e) => up((x) => (x.diasDesatualizacao = Number(e.target.value)))} /></label>
          </div>
          {admin && (
            <>
              <div className="sep" />
              <h3>Dados demonstrativos fictícios</h3>
              <div className="flex" style={{ marginTop: 8 }}>
                <button className="botao" onClick={() => void demo('carregar')}>Carregar demonstração</button>
                <button className="botao perigo" onClick={() => void demo('remover')}>Remover demonstração</button>
              </div>
            </>
          )}
        </Cartao>
      </div>

      {admin && (
        <Cartao titulo="Auditoria (últimas ações)">
          <div className="tabela-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="tabela">
              <thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Detalhes</th></tr></thead>
              <tbody>{(auditoria ?? []).map((a) => <tr key={a.id}><td>{dataHoraBR(a.em)}</td><td>{a.usuario}</td><td>{a.acao}</td><td>{a.entidade} {a.entidadeId ? <span className="mono muted">{a.entidadeId.slice(0, 18)}</span> : ''}</td><td className="mono pequeno">{JSON.stringify(a.detalhes).slice(0, 160)}</td></tr>)}</tbody>
            </table>
          </div>
        </Cartao>
      )}
    </>
  );
}
