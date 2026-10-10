import { useState } from 'react';
import {
  ESCOPOS, ETAPAS_PADRAO, FASES_CONTRATACAO, FLUXOS_PADRAO, NATUREZAS_MARCO, PACOTES, PAPEIS, ROTULO_FASE_CONTRATACAO, ROTULO_MARCO,
  ROTULO_NATUREZA_MARCO, ROTULO_PACOTE, ROTULO_PAPEL, ROTULO_SETOR, ROTULO_SITUACAO, ROTULO_SITUACAO_OBRA, ROTULO_STATUS_GERAL,
  ROTULO_SUBSETOR, ROTULO_TIPO, SETORES, SITUACAO_AMBIENTAL, SITUACAO_ENGENHARIA, SITUACAO_FUNDIARIA, SITUACAO_REGULATORIA,
  SITUACOES_OBRA, STATUS_ETAPA, STATUS_GERAL, SUBSETORES, TIPOS_EMPREENDIMENTO, TIPOS_MARCO, novoId, normalizarUF,
  type Empreendimento, type Fonte, type Organizacao, type UF,
} from '@radar/core';
import { api, useApi } from '../lib/api';
import { Cartao } from './base';

const numOuUndef = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));

/** Edição estruturada do cadastro mestre. Toda alteração exige a fonte/justificativa (gera evidência e histórico). */
export function EditorEmpreendimento({ projeto, organizacoes, aoSalvar }: { projeto: Empreendimento; organizacoes: Organizacao[]; aoSalvar: () => void }) {
  const [p, setP] = useState<Empreendimento>(() => structuredClone(projeto));
  const [alt, setAlt] = useState({ fonteId: 'manual', titulo: '', url: '', trecho: '', dataPublicacao: '', observacao: '' });
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'info'; texto: string }>();
  const [salvando, setSalvando] = useState(false);
  const { dados: fontes } = useApi<Fonte[]>('/fontes');
  const { dados: todasOrgs } = useApi<Organizacao[]>('/organizacoes');
  const orgs = todasOrgs ?? organizacoes;
  const up = (f: (x: Empreendimento) => void) => setP((atual) => { const c = structuredClone(atual); f(c); return c; });

  const salvar = async () => {
    setSalvando(true);
    setMsg(undefined);
    try {
      const r = await api.enviar<{ alterado: boolean; campos: string[] }>('PUT', `/empreendimentos/${p.id}`, {
        projeto: p,
        alteracao: { ...alt, url: alt.url || undefined, dataPublicacao: alt.dataPublicacao || undefined, trecho: alt.trecho || undefined },
      });
      if (!r.alterado) setMsg({ tipo: 'info', texto: 'Nenhuma alteração detectada.' });
      else aoSalvar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  };

  const sel = <T extends string>(valor: T | undefined, opcoes: readonly T[], rotulo: (x: T) => string, aoMudar: (v: T) => void, vazio?: string) => (
    <select className="entrada" value={valor ?? ''} onChange={(e) => aoMudar(e.target.value as T)}>
      {vazio !== undefined && <option value="">{vazio}</option>}
      {opcoes.map((o) => <option key={o} value={o}>{rotulo(o)}</option>)}
    </select>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Cartao titulo="Identificação e situação">
        <div className="form-grade">
          <label className="campo" style={{ gridColumn: '1 / -1' }}><span>Nome oficial</span><input className="entrada" value={p.nomeOficial} onChange={(e) => up((x) => (x.nomeOficial = e.target.value))} /></label>
          <label className="campo"><span>Tipo</span>{sel(p.tipo, TIPOS_EMPREENDIMENTO, (x) => ROTULO_TIPO[x], (v) => up((x) => (x.tipo = v)))}</label>
          <label className="campo"><span>Setor de origem</span>{sel(p.setorOrigem, SETORES, (x) => ROTULO_SETOR[x], (v) => up((x) => (x.setorOrigem = v)))}</label>
          <label className="campo"><span>Subsetor</span>{sel(p.subsetor, SUBSETORES, (x) => ROTULO_SUBSETOR[x], (v) => up((x) => (x.subsetor = v || undefined)), '—')}</label>
          <label className="campo"><span>Fluxo de maturidade</span>{sel(p.fluxoId, FLUXOS_PADRAO.map((f) => f.id), (x) => FLUXOS_PADRAO.find((f) => f.id === x)!.nome, (v) => up((x) => (x.fluxoId = v)))}</label>
          <label className="campo"><span>Status geral</span>{sel(p.statusGeral, STATUS_GERAL, (x) => ROTULO_STATUS_GERAL[x], (v) => up((x) => (x.statusGeral = v)))}</label>
          <label className="campo"><span>Situação da obra</span>{sel(p.situacaoObra, SITUACOES_OBRA, (x) => ROTULO_SITUACAO_OBRA[x], (v) => up((x) => (x.situacaoObra = v)))}</label>
          <label className="campo"><span>Regulatória</span>{sel(p.situacoes.regulatoria, SITUACAO_REGULATORIA, (x) => ROTULO_SITUACAO[x], (v) => up((x) => (x.situacoes.regulatoria = v)))}</label>
          <label className="campo"><span>Ambiental</span>{sel(p.situacoes.ambiental, SITUACAO_AMBIENTAL, (x) => ROTULO_SITUACAO[x], (v) => up((x) => (x.situacoes.ambiental = v)))}</label>
          <label className="campo"><span>Fundiária</span>{sel(p.situacoes.fundiaria, SITUACAO_FUNDIARIA, (x) => ROTULO_SITUACAO[x], (v) => up((x) => (x.situacoes.fundiaria = v)))}</label>
          <label className="campo"><span>Engenharia</span>{sel(p.situacoes.engenharia, SITUACAO_ENGENHARIA, (x) => ROTULO_SITUACAO[x], (v) => up((x) => (x.situacoes.engenharia = v)))}</label>
          <label className="campo"><span>Responsável interno</span><input className="entrada" value={p.responsavelInterno ?? ''} onChange={(e) => up((x) => (x.responsavelInterno = e.target.value || undefined))} /></label>
          <label className="campo" style={{ gridColumn: '1 / -1' }}><span>Descrição</span><textarea className="entrada" value={p.descricao ?? ''} onChange={(e) => up((x) => (x.descricao = e.target.value || undefined))} /></label>
          <label className="campo" style={{ gridColumn: '1 / -1' }}><span>Observações internas</span><textarea className="entrada" value={p.observacoes ?? ''} onChange={(e) => up((x) => (x.observacoes = e.target.value || undefined))} /></label>
        </div>
      </Cartao>

      <div className="grade g2">
        <Cartao titulo="Técnico (resumo declarado)" sub="Trechos e subestações detalhados vêm das fontes/importação">
          <div className="form-grade">
            <label className="campo"><span>Tensões (kV, separadas por /)</span><input className="entrada" value={p.tecnico.tensoesKv.join('/')} onChange={(e) => up((x) => (x.tecnico.tensoesKv = e.target.value.split(/[/,; ]+/).map(Number).filter((n) => n > 0)))} /></label>
            <label className="campo"><span>Extensão (km)</span><input className="entrada" inputMode="decimal" value={p.tecnico.extensaoKm ?? ''} onChange={(e) => up((x) => (x.tecnico.extensaoKm = numOuUndef(e.target.value)))} /></label>
            <label className="campo"><span>Circuitos</span><input className="entrada" inputMode="numeric" value={p.tecnico.circuitos ?? ''} onChange={(e) => up((x) => (x.tecnico.circuitos = numOuUndef(e.target.value)))} /></label>
            <label className="campo"><span>Qtd. subestações</span><input className="entrada" inputMode="numeric" value={p.tecnico.qtdSubestacoes ?? ''} onChange={(e) => up((x) => (x.tecnico.qtdSubestacoes = numOuUndef(e.target.value)))} /></label>
            <label className="campo"><span>Capacidade (MVA)</span><input className="entrada" inputMode="decimal" value={p.tecnico.capacidadeMva ?? ''} onChange={(e) => up((x) => (x.tecnico.capacidadeMva = numOuUndef(e.target.value)))} /></label>
            <label className="campo"><span>Potência associada (MW)</span><input className="entrada" inputMode="decimal" value={p.tecnico.potenciaMw ?? ''} onChange={(e) => up((x) => (x.tecnico.potenciaMw = numOuUndef(e.target.value)))} /></label>
          </div>
        </Cartao>
        <Cartao titulo="Valores (R$)" sub="CAPEX total não é endereçável; informe o investimento em LT/SE quando a fonte o declarar">
          <div className="form-grade">
            {(['capexTotal', 'capexInfraEletrica', 'rapAnual'] as const).map((k) => (
              <label key={k} className="campo">
                <span>{{ capexTotal: 'CAPEX total', capexInfraEletrica: 'Investimento em LT/SE', rapAnual: 'RAP anual' }[k]}</span>
                <input className="entrada" inputMode="decimal" value={p.financeiro[k]?.valorBRL ?? ''} onChange={(e) => up((x) => { const v = numOuUndef(e.target.value); x.financeiro[k] = v === undefined ? undefined : { ...(x.financeiro[k] ?? { natureza: 'declarado' }), valorBRL: v }; })} />
              </label>
            ))}
            <label className="campo"><span>Fonte de financiamento</span><input className="entrada" value={p.financeiro.fonteFinanciamento ?? ''} onChange={(e) => up((x) => (x.financeiro.fonteFinanciamento = e.target.value || undefined))} /></label>
          </div>
        </Cartao>
      </div>

      <Cartao titulo="Localização" sub="Informe coordenadas apenas se constarem da fonte; nunca estime coordenadas.">
        <div className="form-grade">
          <label className="campo"><span>UFs (separadas por vírgula)</span><input className="entrada" value={p.localizacao.ufs.join(', ')} onChange={(e) => up((x) => (x.localizacao.ufs = e.target.value.split(/[,; ]+/).map((u) => normalizarUF(u)).filter((u): u is UF => !!u)))} /></label>
          <label className="campo" style={{ gridColumn: 'span 2' }}><span>Municípios (Cidade/UF; Cidade/UF)</span><input className="entrada" defaultValue={p.localizacao.municipios.map((m) => `${m.nome}/${m.uf}`).join('; ')} onBlur={(e) => up((x) => (x.localizacao.municipios = e.target.value.split(';').map((m) => m.trim()).filter(Boolean).flatMap((m) => { const [nome, uf] = m.split('/'); const u = normalizarUF(uf); return u ? [{ nome: nome.trim(), uf: u }] : []; })))} /></label>
        </div>
      </Cartao>

      <Cartao titulo="Maturidade — status por etapa" sub="Etapas podem correr em paralelo; marque apenas o que tem evidência">
        <div className="form-grade">
          {ETAPAS_PADRAO.map((e) => {
            const st = p.etapas.find((x) => x.etapaId === e.id);
            return (
              <div key={e.id} className="campo">
                <span>{e.ordem}. {e.nome}</span>
                <div className="flex">
                  <select className="entrada" style={{ flex: 1 }} value={st?.status ?? 'nao_iniciada'} onChange={(ev) => up((x) => {
                    const v = ev.target.value as (typeof STATUS_ETAPA)[number];
                    const i = x.etapas.findIndex((y) => y.etapaId === e.id);
                    if (i >= 0) x.etapas[i].status = v; else x.etapas.push({ etapaId: e.id, status: v, evidenciaIds: [] });
                  })}>
                    {STATUS_ETAPA.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                  <input className="entrada" type="date" style={{ width: 140 }} value={st?.dataInicio ?? ''} onChange={(ev) => up((x) => {
                    const i = x.etapas.findIndex((y) => y.etapaId === e.id);
                    if (i >= 0) x.etapas[i].dataInicio = ev.target.value || undefined;
                    else x.etapas.push({ etapaId: e.id, status: 'em_andamento', dataInicio: ev.target.value, evidenciaIds: [] });
                  })} title="Data de início" />
                </div>
              </div>
            );
          })}
        </div>
      </Cartao>

      <Cartao titulo="Marcos" acoes={<button className="botao peq" onClick={() => up((x) => x.marcos.push({ id: novoId('mc'), tipo: 'outro', data: new Date().toISOString().slice(0, 10), natureza: 'previsto_oficial', escopo: 'geral', evidenciaIds: [] }))}>+ Marco</button>}>
        <table className="tabela">
          <thead><tr><th>Tipo</th><th>Data</th><th>Natureza</th><th>Escopo</th><th /></tr></thead>
          <tbody>
            {p.marcos.map((m, i) => (
              <tr key={m.id}>
                <td>{sel(m.tipo, TIPOS_MARCO, (t) => ROTULO_MARCO[t], (v) => up((x) => (x.marcos[i].tipo = v)))}</td>
                <td><input className="entrada" type="date" value={m.data} onChange={(e) => up((x) => (x.marcos[i].data = e.target.value))} /></td>
                <td>{sel(m.natureza, NATUREZAS_MARCO, (t) => ROTULO_NATUREZA_MARCO[t], (v) => up((x) => (x.marcos[i].natureza = v)))}</td>
                <td>{sel(m.escopo, ESCOPOS, (t) => t, (v) => up((x) => (x.marcos[i].escopo = v)))}</td>
                <td><button className="botao peq perigo" onClick={() => up((x) => x.marcos.splice(i, 1))}>Remover</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>

      <div className="grade g2">
        <Cartao titulo="Pacotes de contratação" acoes={<button className="botao peq" onClick={() => up((x) => x.pacotes.push({ pacote: 'montagem_eletromecanica', escopo: 'LT', faseContratacao: 'prevista', evidenciaIds: [] }))}>+ Pacote</button>}>
          <table className="tabela">
            <thead><tr><th>Pacote</th><th>Escopo</th><th>Fase</th><th>Data</th><th /></tr></thead>
            <tbody>
              {p.pacotes.map((pk, i) => (
                <tr key={i}>
                  <td>{sel(pk.pacote, PACOTES, (t) => ROTULO_PACOTE[t], (v) => up((x) => (x.pacotes[i].pacote = v)))}</td>
                  <td>{sel(pk.escopo, ESCOPOS, (t) => t, (v) => up((x) => (x.pacotes[i].escopo = v)))}</td>
                  <td>{sel(pk.faseContratacao, FASES_CONTRATACAO, (t) => ROTULO_FASE_CONTRATACAO[t], (v) => up((x) => (x.pacotes[i].faseContratacao = v)))}</td>
                  <td><input className="entrada" type="date" value={pk.dataEvento ?? ''} onChange={(e) => up((x) => (x.pacotes[i].dataEvento = e.target.value || undefined))} /></td>
                  <td><button className="botao peq perigo" onClick={() => up((x) => x.pacotes.splice(i, 1))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
        <Cartao titulo="Participantes" acoes={<button className="botao peq" disabled={!orgs.length} onClick={() => up((x) => x.participantes.push({ organizacaoId: orgs[0].id, papel: 'potencial_contratante', evidenciaIds: [] }))}>+ Participante</button>}>
          <table className="tabela">
            <thead><tr><th>Organização</th><th>Papel</th><th /></tr></thead>
            <tbody>
              {p.participantes.map((pt, i) => (
                <tr key={i}>
                  <td>{sel(pt.organizacaoId, orgs.map((o) => o.id), (id) => orgs.find((o) => o.id === id)?.nome ?? id, (v) => up((x) => (x.participantes[i].organizacaoId = v)))}</td>
                  <td>{sel(pt.papel, PAPEIS, (t) => ROTULO_PAPEL[t], (v) => up((x) => (x.participantes[i].papel = v)))}</td>
                  <td><button className="botao peq perigo" onClick={() => up((x) => x.participantes.splice(i, 1))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sub" style={{ marginTop: 6 }}>Nova organização? Cadastre em Clientes.</div>
        </Cartao>
      </div>

      <Cartao titulo="Fonte da alteração (obrigatória)" sub="Gera evidência, histórico campo a campo e proveniência. Fontes A/B → confirmado; demais → inferido.">
        <div className="form-grade">
          <label className="campo"><span>Fonte</span>
            <select className="entrada" value={alt.fonteId} onChange={(e) => setAlt({ ...alt, fonteId: e.target.value })}>
              {(fontes ?? []).filter((f) => f.id !== 'demo').map((f) => <option key={f.id} value={f.id}>{f.nome} (classe {f.classe})</option>)}
            </select>
          </label>
          <label className="campo" style={{ gridColumn: 'span 2' }}><span>Documento / justificativa</span><input className="entrada" value={alt.titulo} onChange={(e) => setAlt({ ...alt, titulo: e.target.value })} placeholder="Ex.: Ata de reunião com o cliente em 05/10/2026" /></label>
          <label className="campo"><span>Link (opcional)</span><input className="entrada" value={alt.url} onChange={(e) => setAlt({ ...alt, url: e.target.value })} /></label>
          <label className="campo"><span>Data de publicação</span><input className="entrada" type="date" value={alt.dataPublicacao} onChange={(e) => setAlt({ ...alt, dataPublicacao: e.target.value })} /></label>
          <label className="campo" style={{ gridColumn: '1 / -1' }}><span>Trecho que sustenta a alteração (opcional)</span><textarea className="entrada" value={alt.trecho} onChange={(e) => setAlt({ ...alt, trecho: e.target.value })} /></label>
        </div>
        <div className="flex" style={{ marginTop: 12 }}>
          <button className="botao primario" disabled={salvando || alt.titulo.trim().length < 3} onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar alterações'}</button>
          <button className="botao" onClick={() => setP(structuredClone(projeto))}>Descartar</button>
          {msg && <div className={`aviso ${msg.tipo}`}>{msg.texto}</div>}
        </div>
      </Cartao>
    </div>
  );
}
