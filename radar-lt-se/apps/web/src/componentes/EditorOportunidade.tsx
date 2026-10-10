import { useState } from 'react';
import {
  INTERESSES, PACOTES, ROTULO_INTERESSE, ROTULO_PACOTE, ROTULO_STATUS_PROSPECCAO, STATUS_PROSPECCAO, novoId,
  type OportunidadeComercial, type Organizacao,
} from '@radar/core';
import { api } from '../lib/api';
import { Modal } from './base';

type Rascunho = Omit<OportunidadeComercial, 'id' | 'empreendimentoId' | 'criadoEm' | 'atualizadoEm' | 'demo'>;

const vazio = (): Rascunho => ({
  interesse: 'nao_avaliado', statusProspeccao: 'identificada', pacotesInteresse: [], decisao: { decisao: 'pendente' },
  contatos: [], interacoes: [], proximosPassos: [],
});

/** Registro do interesse comercial, estratégia, contatos, interações, próximos passos e decisão de participar. */
export function EditorOportunidade({ empreendimentoId, nome, atual, organizacoes, aoFechar, aoSalvar }: {
  empreendimentoId: string; nome: string; atual?: OportunidadeComercial; organizacoes: Organizacao[]; aoFechar: () => void; aoSalvar: () => void;
}) {
  const [r, setR] = useState<Rascunho>(() => (atual ? structuredClone(atual) : vazio()));
  const [erro, setErro] = useState<string>();
  const [novaInteracao, setNovaInteracao] = useState({ data: new Date().toISOString().slice(0, 10), tipo: 'reuniao' as const, resumo: '' });
  const salvar = async () => {
    try {
      const corpo = { ...r, interacoes: novaInteracao.resumo.trim() ? [...r.interacoes, { id: novoId('int'), ...novaInteracao, por: '' }] : r.interacoes };
      await api.enviar('PUT', `/comercial/oportunidades/${empreendimentoId}`, corpo);
      aoSalvar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };
  return (
    <Modal titulo={`Gestão comercial — ${nome}`} onFechar={aoFechar}>
      <div className="form-grade">
        <label className="campo"><span>Interesse da empresa</span>
          <select className="entrada" value={r.interesse} onChange={(e) => setR({ ...r, interesse: e.target.value as Rascunho['interesse'] })}>
            {INTERESSES.map((i) => <option key={i} value={i}>{ROTULO_INTERESSE[i]}</option>)}
          </select>
        </label>
        <label className="campo"><span>Status da prospecção</span>
          <select className="entrada" value={r.statusProspeccao} onChange={(e) => setR({ ...r, statusProspeccao: e.target.value as Rascunho['statusProspeccao'] })}>
            {STATUS_PROSPECCAO.map((s) => <option key={s} value={s}>{ROTULO_STATUS_PROSPECCAO[s]}</option>)}
          </select>
        </label>
        <label className="campo"><span>Responsável comercial</span><input className="entrada" value={r.responsavel ?? ''} onChange={(e) => setR({ ...r, responsavel: e.target.value || undefined })} /></label>
        <label className="campo"><span>Valor qualificado (R$)</span><input className="entrada" inputMode="decimal" value={r.valorQualificadoBRL ?? ''} onChange={(e) => setR({ ...r, valorQualificadoBRL: e.target.value ? Number(e.target.value) : undefined })} /></label>
      </div>
      <label className="campo"><span>Estratégia de abordagem</span><textarea className="entrada" value={r.estrategia ?? ''} onChange={(e) => setR({ ...r, estrategia: e.target.value || undefined })} /></label>
      <div className="campo">
        <span>Pacotes de interesse</span>
        <div className="flex">
          {PACOTES.map((p) => (
            <label key={p} className="chk"><input type="checkbox" checked={r.pacotesInteresse.includes(p)} onChange={(e) => setR({ ...r, pacotesInteresse: e.target.checked ? [...r.pacotesInteresse, p] : r.pacotesInteresse.filter((x) => x !== p) })} />{ROTULO_PACOTE[p]}</label>
          ))}
        </div>
      </div>
      <div className="form-grade">
        <label className="campo"><span>Decisão de participar</span>
          <select className="entrada" value={r.decisao.decisao} onChange={(e) => setR({ ...r, decisao: { ...r.decisao, decisao: e.target.value as Rascunho['decisao']['decisao'] } })}>
            <option value="pendente">Pendente</option><option value="participar">Participar</option><option value="nao_participar">Não participar</option>
          </select>
        </label>
        <label className="campo" style={{ gridColumn: 'span 2' }}><span>Justificativa da decisão</span><input className="entrada" value={r.decisao.justificativa ?? ''} onChange={(e) => setR({ ...r, decisao: { ...r.decisao, justificativa: e.target.value || undefined } })} /></label>
      </div>

      <h3>Contatos</h3>
      {r.contatos.map((c, i) => (
        <div key={c.id} className="linha">
          <input className="entrada" style={{ flex: 1 }} placeholder="Nome" value={c.nome} onChange={(e) => { const x = [...r.contatos]; x[i] = { ...c, nome: e.target.value }; setR({ ...r, contatos: x }); }} />
          <input className="entrada" style={{ flex: 1 }} placeholder="Cargo" value={c.cargo ?? ''} onChange={(e) => { const x = [...r.contatos]; x[i] = { ...c, cargo: e.target.value }; setR({ ...r, contatos: x }); }} />
          <select className="entrada" style={{ flex: 1 }} value={c.organizacaoId ?? ''} onChange={(e) => { const x = [...r.contatos]; x[i] = { ...c, organizacaoId: e.target.value || undefined }; setR({ ...r, contatos: x }); }}>
            <option value="">Organização…</option>
            {organizacoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
          <button className="botao peq perigo" onClick={() => setR({ ...r, contatos: r.contatos.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button className="botao peq" onClick={() => setR({ ...r, contatos: [...r.contatos, { id: novoId('ct'), nome: '' }] })}>+ Contato</button>

      <h3>Próximos passos</h3>
      {r.proximosPassos.map((p, i) => (
        <div key={p.id} className="linha">
          <label className="chk"><input type="checkbox" checked={p.concluido} onChange={(e) => { const x = [...r.proximosPassos]; x[i] = { ...p, concluido: e.target.checked }; setR({ ...r, proximosPassos: x }); }} /></label>
          <input className="entrada" style={{ flex: 2 }} value={p.descricao} onChange={(e) => { const x = [...r.proximosPassos]; x[i] = { ...p, descricao: e.target.value }; setR({ ...r, proximosPassos: x }); }} />
          <input className="entrada" style={{ flex: 1 }} placeholder="Responsável" value={p.responsavel ?? ''} onChange={(e) => { const x = [...r.proximosPassos]; x[i] = { ...p, responsavel: e.target.value }; setR({ ...r, proximosPassos: x }); }} />
          <input className="entrada" type="date" style={{ width: 150 }} value={p.prazo ?? ''} onChange={(e) => { const x = [...r.proximosPassos]; x[i] = { ...p, prazo: e.target.value || undefined }; setR({ ...r, proximosPassos: x }); }} />
        </div>
      ))}
      <button className="botao peq" onClick={() => setR({ ...r, proximosPassos: [...r.proximosPassos, { id: novoId('pp'), descricao: '', concluido: false }] })}>+ Próximo passo</button>

      <h3>Interações</h3>
      <div className="lista">
        {r.interacoes.map((i) => <div className="item" key={i.id}><span className="selo">{i.tipo}</span><div>{i.resumo}<div className="meta">{i.data} · {i.por}</div></div></div>)}
      </div>
      <div className="linha">
        <input className="entrada" type="date" style={{ width: 150 }} value={novaInteracao.data} onChange={(e) => setNovaInteracao({ ...novaInteracao, data: e.target.value })} />
        <select className="entrada" style={{ width: 130 }} value={novaInteracao.tipo} onChange={(e) => setNovaInteracao({ ...novaInteracao, tipo: e.target.value as typeof novaInteracao.tipo })}>
          {['reuniao', 'ligacao', 'email', 'visita', 'evento', 'outro'].map((t) => <option key={t}>{t}</option>)}
        </select>
        <input className="entrada" style={{ flex: 1 }} placeholder="Registrar nova interação (resumo)" value={novaInteracao.resumo} onChange={(e) => setNovaInteracao({ ...novaInteracao, resumo: e.target.value })} />
      </div>

      {erro && <div className="aviso erro">{erro}</div>}
      <div className="flex">
        <button className="botao primario" onClick={() => void salvar()}>Salvar</button>
        <button className="botao" onClick={aoFechar}>Cancelar</button>
      </div>
    </Modal>
  );
}
