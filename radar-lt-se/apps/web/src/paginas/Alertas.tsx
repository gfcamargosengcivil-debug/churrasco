import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  REGIOES, ROTULO_EVENTO, ROTULO_REGIAO, ROTULO_SETOR, SETORES, TIPOS_EVENTO, UFS, type AlertaNotificacao, type AlertaRegra,
  type EventoMudanca, type Organizacao, type TipoEvento,
} from '@radar/core';
import { Carregando, Cartao, Erro } from '../componentes/base';
import { api, useApi } from '../lib/api';
import { dataHoraBR } from '../lib/formatos';
import type { Resumo } from '../lib/tipos';

type Notif = AlertaNotificacao & { evento?: EventoMudanca; regra?: string };
type EventoComNome = EventoMudanca & { empreendimento?: string };

export function PaginaAlertas() {
  const { dados: notifs, erro, recarregar } = useApi<Notif[]>('/alertas/notificacoes');
  const { dados: regras, recarregar: recRegras } = useApi<AlertaRegra[]>('/alertas/regras');
  const { dados: eventos } = useApi<EventoComNome[]>('/eventos?limite=300');
  const [tipo, setTipo] = useState<'' | TipoEvento>('');
  const [editando, setEditando] = useState<AlertaRegra | 'nova'>();
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!notifs || !regras) return <Carregando />;
  const marcar = async (n: Notif, lido: boolean) => {
    await api.enviar('POST', `/alertas/notificacoes/${n.id}/lida`, { lido });
    recarregar();
  };
  const naoLidas = notifs.filter((n) => !n.lido);
  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Monitoramento e alertas</h1>
          <p>Mudanças relevantes detectadas nas coletas e edições (novos empreendimentos, editais, leilões, vencedores, concessões, licenças, revisões de cronograma, cotações, suspensões, atrasos e cancelamentos) e as regras que geram alertas.</p>
        </div>
        <div className="acoes"><button className="botao primario" onClick={() => setEditando('nova')}>Nova regra</button></div>
      </div>
      {editando && <EditorRegra regra={editando === 'nova' ? undefined : editando} aoFechar={() => setEditando(undefined)} aoSalvar={() => { setEditando(undefined); recRegras(); recarregar(); }} />}
      <div className="grade g2">
        <Cartao titulo={`Alertas (${naoLidas.length} não lidos)`} acoes={naoLidas.length ? <button className="botao peq" onClick={() => void Promise.all(naoLidas.map((n) => api.enviar('POST', `/alertas/notificacoes/${n.id}/lida`, { lido: true }))).then(recarregar)}>Marcar todos como lidos</button> : undefined}>
          <div className="lista">
            {notifs.slice(0, 80).map((n) => (
              <div className="item" key={n.id} style={{ opacity: n.lido ? 0.6 : 1 }}>
                <span className="selo">{n.evento ? ROTULO_EVENTO[n.evento.tipo] : 'Evento'}</span>
                <div style={{ flex: 1 }}>
                  {n.evento ? <Link to={`/empreendimentos/${n.empreendimentoId}`}>{n.evento.titulo}</Link> : n.eventoId}
                  <div className="meta">{n.evento?.descricao} · regra “{n.regra}” · {dataHoraBR(n.criadoEm)} · {n.canal}{!n.entregue && n.erroEntrega ? ` · não entregue: ${n.erroEntrega}` : ''}</div>
                </div>
                <button className="botao peq" onClick={() => void marcar(n, !n.lido)}>{n.lido ? 'Não lido' : 'Lido'}</button>
              </div>
            ))}
            {!notifs.length && <div className="vazio">Nenhum alerta. Crie regras para ser avisado.</div>}
          </div>
        </Cartao>
        <Cartao titulo="Regras de alerta">
          <div className="lista">
            {regras.map((r) => (
              <div className="item" key={r.id}>
                <div style={{ flex: 1 }}>
                  <strong>{r.nome}</strong> {!r.ativo && <span className="selo">inativa</span>}
                  <div className="meta">{descreverFiltros(r)}</div>
                </div>
                <button className="botao peq" onClick={() => setEditando(r)}>Editar</button>
                <button className="botao peq perigo" onClick={() => void api.enviar('DELETE', `/alertas/regras/${r.id}`).then(recRegras)}>Excluir</button>
              </div>
            ))}
            {!regras.length && <div className="vazio">Nenhuma regra.</div>}
          </div>
        </Cartao>
      </div>
      <Cartao
        titulo="Feed de mudanças detectadas"
        acoes={
          <select className="entrada" style={{ width: 'auto' }} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="">Todos os tipos</option>
            {TIPOS_EVENTO.map((t) => <option key={t} value={t}>{ROTULO_EVENTO[t]}</option>)}
          </select>
        }
      >
        {!eventos ? <Carregando /> : (
          <div className="lista">
            {eventos.filter((e) => !tipo || e.tipo === tipo).slice(0, 150).map((e) => (
              <div className="item" key={e.id}>
                <span className="selo">{ROTULO_EVENTO[e.tipo]}</span>
                <div><Link to={`/empreendimentos/${e.empreendimentoId}`}>{e.empreendimento ?? e.titulo}</Link><div className="meta">{e.descricao} · {dataHoraBR(e.em)} · relevância {e.relevancia}</div></div>
              </div>
            ))}
          </div>
        )}
      </Cartao>
    </>
  );
}

function descreverFiltros(r: AlertaRegra): string {
  const f = r.filtros;
  const partes: string[] = [];
  if (f.tiposEvento?.length) partes.push(`eventos: ${f.tiposEvento.map((t) => ROTULO_EVENTO[t]).join(', ')}`);
  if (f.setores?.length) partes.push(`setores: ${f.setores.map((s) => ROTULO_SETOR[s]).join(', ')}`);
  if (f.regioes?.length) partes.push(`regiões: ${f.regioes.join(', ')}`);
  if (f.ufs?.length) partes.push(`UFs: ${f.ufs.join(', ')}`);
  if (f.tensaoMinKv) partes.push(`≥ ${f.tensaoMinKv} kV`);
  if (f.janelaContratacaoMeses) partes.push(`janela ≤ ${f.janelaContratacaoMeses} meses`);
  if (f.empreendimentoIds?.length) partes.push(`${f.empreendimentoIds.length} empreendimento(s)`);
  if (f.organizacaoIds?.length) partes.push(`${f.organizacaoIds.length} cliente(s)`);
  if (f.relevanciaMinima) partes.push(`relevância ≥ ${f.relevanciaMinima}`);
  return partes.join(' · ') || 'todos os eventos';
}

function EditorRegra({ regra, aoFechar, aoSalvar }: { regra?: AlertaRegra; aoFechar: () => void; aoSalvar: () => void }) {
  const [r, setR] = useState<Omit<AlertaRegra, 'id' | 'criadoPor'>>(() => (regra ? structuredClone(regra) : { nome: '', ativo: true, filtros: {}, canais: ['app'] }));
  const { dados: lista } = useApi<Resumo[]>('/empreendimentos');
  const { dados: orgs } = useApi<Organizacao[]>('/organizacoes');
  const [erro, setErro] = useState<string>();
  const f = r.filtros;
  const setF = (x: Partial<AlertaRegra['filtros']>) => setR({ ...r, filtros: { ...f, ...x } });
  const multi = <T extends string>(valores: readonly T[], sel: T[] | undefined, rotulo: (v: T) => string, aoMudar: (v: T[]) => void) => (
    <div className="flex" style={{ maxHeight: 120, overflowY: 'auto' }}>
      {valores.map((v) => (
        <label key={v} className="chk pequeno"><input type="checkbox" checked={!!sel?.includes(v)} onChange={(e) => aoMudar(e.target.checked ? [...(sel ?? []), v] : (sel ?? []).filter((x) => x !== v))} />{rotulo(v)}</label>
      ))}
    </div>
  );
  const salvar = async () => {
    try {
      const limpo = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)));
      const corpo = { ...r, filtros: limpo };
      if (regra) await api.enviar('PUT', `/alertas/regras/${regra.id}`, corpo);
      else await api.enviar('POST', '/alertas/regras', corpo);
      aoSalvar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };
  return (
    <Cartao titulo={regra ? 'Editar regra' : 'Nova regra de alerta'} acoes={<button className="botao fantasma" onClick={aoFechar}>Fechar</button>}>
      <div className="form-grade">
        <label className="campo"><span>Nome</span><input className="entrada" value={r.nome} onChange={(e) => setR({ ...r, nome: e.target.value })} /></label>
        <label className="campo"><span>Tensão mínima (kV)</span><input className="entrada" type="number" value={f.tensaoMinKv ?? ''} onChange={(e) => setF({ tensaoMinKv: e.target.value ? Number(e.target.value) : undefined })} /></label>
        <label className="campo"><span>Janela de contratação até (meses)</span><input className="entrada" type="number" value={f.janelaContratacaoMeses ?? ''} onChange={(e) => setF({ janelaContratacaoMeses: e.target.value ? Number(e.target.value) : undefined })} /></label>
        <label className="campo"><span>Relevância mínima</span><select className="entrada" value={f.relevanciaMinima ?? ''} onChange={(e) => setF({ relevanciaMinima: (e.target.value || undefined) as AlertaRegra['filtros']['relevanciaMinima'] })}><option value="">Qualquer</option><option value="media">Média</option><option value="alta">Alta</option></select></label>
        <label className="chk"><input type="checkbox" checked={r.ativo} onChange={(e) => setR({ ...r, ativo: e.target.checked })} /> Ativa</label>
        <label className="chk" title="Envio de e-mail depende de SMTP configurado no servidor (pendente)"><input type="checkbox" checked={r.canais.includes('email')} onChange={(e) => setR({ ...r, canais: e.target.checked ? ['app', 'email'] : ['app'] })} /> Também por e-mail</label>
      </div>
      {r.canais.includes('email') && <label className="campo" style={{ marginTop: 8 }}><span>E-mail de destino</span><input className="entrada" value={r.emailDestino ?? ''} onChange={(e) => setR({ ...r, emailDestino: e.target.value || undefined })} /></label>}
      <div className="campo" style={{ marginTop: 10 }}><span>Tipos de evento (vazio = todos)</span>{multi(TIPOS_EVENTO, f.tiposEvento, (t) => ROTULO_EVENTO[t], (v) => setF({ tiposEvento: v }))}</div>
      <div className="campo" style={{ marginTop: 10 }}><span>Setores</span>{multi(SETORES, f.setores, (t) => ROTULO_SETOR[t], (v) => setF({ setores: v }))}</div>
      <div className="campo" style={{ marginTop: 10 }}><span>Regiões</span>{multi(REGIOES, f.regioes, (t) => ROTULO_REGIAO[t], (v) => setF({ regioes: v }))}</div>
      <div className="campo" style={{ marginTop: 10 }}><span>UFs</span>{multi(UFS, f.ufs, (t) => t, (v) => setF({ ufs: v }))}</div>
      <div className="campo" style={{ marginTop: 10 }}><span>Clientes</span>{multi((orgs ?? []).map((o) => o.id), f.organizacaoIds, (id) => orgs?.find((o) => o.id === id)?.nome ?? id, (v) => setF({ organizacaoIds: v }))}</div>
      <div className="campo" style={{ marginTop: 10 }}><span>Empreendimentos específicos</span>{multi((lista ?? []).map((v) => v.id), f.empreendimentoIds, (id) => lista?.find((v) => v.id === id)?.nome ?? id, (v) => setF({ empreendimentoIds: v }))}</div>
      {erro && <div className="aviso erro" style={{ marginTop: 8 }}>{erro}</div>}
      <div className="flex" style={{ marginTop: 12 }}><button className="botao primario" disabled={r.nome.trim().length < 2} onClick={() => void salvar()}>Salvar regra</button></div>
    </Cartao>
  );
}
