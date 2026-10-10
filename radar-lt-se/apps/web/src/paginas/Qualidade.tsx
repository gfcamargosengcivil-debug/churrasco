import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Conflito, IndicadorQualidade, MatchCandidato } from '@radar/core';
import { Carregando, Cartao, Erro, Kpi, SeloDemo } from '../componentes/base';
import { api, useApi } from '../lib/api';
import { dataBR, num } from '../lib/formatos';

interface RespostaQualidade {
  resumo: { empreendimentos: number; completudeMedia: number; desatualizados: number; comConflito: number; semFonteOficial: number; semLocalizacao: number; comProblemasMarcos: number; camposInferidos: number };
  indicadores: (IndicadorQualidade & { nome: string; codigo: string; demo: boolean })[];
  conflitos: (Conflito & { empreendimentoId: string; empreendimento: string })[];
  duplicidades: { a: string; b: string; nomeA?: string; nomeB?: string; pontuacao: number; motivos: string[] }[];
  matchesPendentes: (Omit<MatchCandidato, 'candidatos'> & { candidatos: (MatchCandidato['candidatos'][number] & { nome?: string })[] })[];
}

const LIMITE_DUPLICIDADES = 300;

export function PaginaQualidade({ papel }: { papel?: string }) {
  const { dados, erro, recarregar } = useApi<RespostaQualidade>('/qualidade');
  const [msg, setMsg] = useState<string>();
  const pode = papel === 'admin' || papel === 'analista';
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;
  const decidir = async (m: { id: string }, acao: 'vincular' | 'novo' | 'descartar', empreendimentoId?: string) => {
    try {
      await api.enviar('POST', `/revisao/matches/${m.id}/decidir`, { acao, empreendimentoId });
      setMsg(`Correspondência ${acao === 'vincular' ? 'vinculada' : acao === 'novo' ? 'criada como novo empreendimento' : 'descartada'}.`);
      recarregar();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const r = dados.resumo;
  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Qualidade e revisão de dados</h1>
          <p>Rastreabilidade e qualidade da base: correspondências duvidosas para revisão manual, conflitos entre fontes, possíveis duplicidades e completude dos cadastros.</p>
        </div>
      </div>
      {msg && <div className="aviso info">{msg}</div>}
      <div className="grade g4">
        <Kpi rotulo="Completude média" valor={`${r.completudeMedia}%`} complemento={`${r.empreendimentos} empreendimentos`} />
        <Kpi rotulo="Desatualizados" valor={num(r.desatualizados)} complemento="sem confirmação no prazo configurado" />
        <Kpi rotulo="Com conflito aberto" valor={num(r.comConflito)} complemento={`${r.comProblemasMarcos} com inconsistência de marcos`} />
        <Kpi rotulo="Sem fonte oficial (classe A)" valor={num(r.semFonteOficial)} complemento={`${r.semLocalizacao} sem localização · ${r.camposInferidos} campos inferidos`} />
      </div>

      <Cartao titulo={`Correspondências para revisão manual (${dados.matchesPendentes.length})`} sub="Registros de fontes com correspondência incerta com empreendimentos existentes">
        {dados.matchesPendentes.length === 0 && <div className="muted">Nada pendente.</div>}
        {dados.matchesPendentes.map((m) => (
          <div key={m.id} className="cartao" style={{ marginBottom: 10 }}>
            <div><strong>{m.resumoRegistro}</strong> <span className="muted pequeno">· fonte {m.fonteId} · {dataBR(m.criadoEm.slice(0, 10))}</span></div>
            <table className="tabela" style={{ marginTop: 6 }}>
              <thead><tr><th>Candidato</th><th className="num">Pontuação</th><th>Motivos</th><th /></tr></thead>
              <tbody>
                {m.candidatos.map((c) => (
                  <tr key={c.empreendimentoId}>
                    <td><Link to={`/empreendimentos/${c.empreendimentoId}`}>{c.nome ?? c.empreendimentoId}</Link></td>
                    <td className="num">{Math.round(c.pontuacao * 100)}%</td>
                    <td className="pequeno">{c.motivos.join(' ')}</td>
                    <td>{pode && <button className="botao peq" onClick={() => void decidir(m, 'vincular', c.empreendimentoId)}>É este</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pode && (
              <div className="flex" style={{ marginTop: 8 }}>
                <button className="botao peq" onClick={() => void decidir(m, 'novo')}>Nenhum — criar novo</button>
                <button className="botao peq perigo" onClick={() => void decidir(m, 'descartar')}>Descartar registro</button>
              </div>
            )}
          </div>
        ))}
      </Cartao>

      <div className="grade g2">
        <Cartao titulo={`Conflitos abertos (${dados.conflitos.length})`} sub="Resolva na ficha do empreendimento, aba Conflitos e histórico">
          <div className="lista">
            {dados.conflitos.map((c) => (
              <div className="item" key={c.id}>
                <div>
                  <Link to={`/empreendimentos/${c.empreendimentoId}`}>{c.empreendimento}</Link>
                  <div className="meta"><span className="mono">{c.campo}</span>: {c.valores.map((v) => `${JSON.stringify(v.valor)} (${v.classe ?? '?'})`).join(' × ')} · adotado {JSON.stringify(c.valorAdotado)}</div>
                </div>
              </div>
            ))}
            {!dados.conflitos.length && <div className="vazio">Nenhum conflito aberto.</div>}
          </div>
        </Cartao>
        <Cartao
          titulo={`Possíveis duplicidades (${dados.duplicidades.length})`}
          sub={`Pares de empreendimentos do cadastro com alta similaridade${dados.duplicidades.length > LIMITE_DUPLICIDADES ? ` — exibindo os ${LIMITE_DUPLICIDADES} de maior pontuação de ${dados.duplicidades.length}` : ''}`}
        >
          <div className="lista" style={{ maxHeight: 640, overflowY: 'auto' }}>
            {dados.duplicidades.slice(0, LIMITE_DUPLICIDADES).map((d) => (
              <div className="item" key={`${d.a}-${d.b}`}>
                <span className="selo">{Math.round(d.pontuacao * 100)}%</span>
                <div><Link to={`/empreendimentos/${d.a}`}>{d.nomeA}</Link> × <Link to={`/empreendimentos/${d.b}`}>{d.nomeB}</Link><div className="meta">{d.motivos.join(' ')}</div></div>
              </div>
            ))}
            {!dados.duplicidades.length && <div className="vazio">Nenhuma duplicidade provável.</div>}
          </div>
        </Cartao>
      </div>

      <Cartao titulo="Completude por empreendimento">
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Empreendimento</th><th className="num">Completude</th><th>Faltantes</th><th className="num">Dias s/ confirmação</th><th className="num">Fontes</th><th>Localização</th><th className="num">Conflitos</th></tr></thead>
            <tbody>
              {[...dados.indicadores].sort((a, b) => a.completude - b.completude).map((i) => (
                <tr key={i.empreendimentoId}>
                  <td className="nome"><Link to={`/empreendimentos/${i.empreendimentoId}`}>{i.nome}</Link> {i.demo && <SeloDemo />}</td>
                  <td className="num">{i.completude}%</td>
                  <td className="pequeno">{i.faltantes.join(', ') || '—'}</td>
                  <td className="num">{i.diasSemConfirmacao ?? '—'}{i.desatualizado ? ' ⚠' : ''}</td>
                  <td className="num">{i.fontesDistintas}{i.temFonteOficial ? '' : ' (sem A)'}</td>
                  <td>{i.precisaoLocalizacao}</td>
                  <td className="num">{i.conflitosAbertos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </>
  );
}
