import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ROTULO_EVENTO, ROTULO_PAPEL, ROTULO_SITUACAO_OBRA, ROTULO_STATUS_PROSPECCAO, ROTULO_TIPO_DOCUMENTO, ROTULO_TIPO_ORGANIZACAO,
  TIPOS_ORGANIZACAO, type Documento, type EventoMudanca, type Organizacao, type ResumoCliente,
} from '@radar/core';
import { Carregando, Cartao, Erro, Kpi, SeloDemo } from '../componentes/base';
import { BarrasHorizontais } from '../componentes/graficos';
import { api, ESTATICO, useApi } from '../lib/api';
import { brl, dataBR, dataHoraBR, num } from '../lib/formatos';

export function PaginaClientes({ papel }: { papel?: string }) {
  const pode = !ESTATICO && papel !== undefined && papel !== 'leitor';
  const { dados, erro, recarregar } = useApi<ResumoCliente[]>('/clientes');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [nova, setNova] = useState(false);
  const lista = useMemo(() => (dados ?? []).filter((c) => (!busca || c.organizacao.nome.toLowerCase().includes(busca.toLowerCase())) && (!tipo || c.organizacao.tipo === tipo)), [dados, busca, tipo]);
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;
  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Inteligência por cliente</h1>
          <p>Concessionárias, mineradoras, indústrias e demais organizações com empreendimentos mapeados — ordenadas pelo potencial de serviços ainda não contratados.</p>
        </div>
        {pode && <div className="acoes"><button className="botao" onClick={() => setNova(true)}>Nova organização</button></div>}
      </div>
      {nova && <NovaOrganizacao aoFechar={() => setNova(false)} aoSalvar={() => { setNova(false); recarregar(); }} />}
      <div className="filtros">
        <label className="campo largo"><span>Buscar</span><input className="entrada" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <label className="campo"><span>Tipo</span><select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option>{TIPOS_ORGANIZACAO.map((t) => <option key={t} value={t}>{ROTULO_TIPO_ORGANIZACAO[t]}</option>)}</select></label>
      </div>
      <div className="tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Organização</th><th>Tipo</th><th>Papéis</th><th className="num">Empreend.</th><th className="num">Ativos</th><th className="num">Em execução</th><th className="num">Prioridade alta</th><th className="num">Potencial</th><th>Próxima demanda</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.organizacao.id}>
                <td className="nome"><Link to={`/clientes/${c.organizacao.id}`}>{c.organizacao.nome}</Link> {c.organizacao.demo && <SeloDemo />}</td>
                <td>{ROTULO_TIPO_ORGANIZACAO[c.organizacao.tipo]}</td>
                <td className="pequeno">{c.papeis.map((p) => ROTULO_PAPEL[p]).join(', ')}</td>
                <td className="num">{c.empreendimentos}</td><td className="num">{c.ativos}</td><td className="num">{c.emExecucao}</td><td className="num">{c.prioridadeAlta}</td>
                <td className="num">{brl(c.potencialCentral)}</td><td>{dataBR(c.proximaDemanda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NovaOrganizacao({ aoFechar, aoSalvar }: { aoFechar: () => void; aoSalvar: () => void }) {
  const [o, setO] = useState({ nome: '', tipo: 'concessionaria_transmissao', cnpj: '', site: '' });
  const [erro, setErro] = useState<string>();
  return (
    <Cartao titulo="Nova organização" acoes={<button className="botao fantasma" onClick={aoFechar}>Fechar</button>}>
      <div className="form-grade">
        <label className="campo"><span>Nome</span><input className="entrada" value={o.nome} onChange={(e) => setO({ ...o, nome: e.target.value })} /></label>
        <label className="campo"><span>Tipo</span><select className="entrada" value={o.tipo} onChange={(e) => setO({ ...o, tipo: e.target.value })}>{TIPOS_ORGANIZACAO.map((t) => <option key={t} value={t}>{ROTULO_TIPO_ORGANIZACAO[t]}</option>)}</select></label>
        <label className="campo"><span>CNPJ</span><input className="entrada" value={o.cnpj} onChange={(e) => setO({ ...o, cnpj: e.target.value })} /></label>
        <label className="campo"><span>Site</span><input className="entrada" value={o.site} onChange={(e) => setO({ ...o, site: e.target.value })} /></label>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      <button className="botao primario" style={{ marginTop: 8 }} onClick={() => void api.enviar('POST', '/organizacoes', { ...o, cnpj: o.cnpj.replace(/\D/g, '') || undefined, site: o.site || undefined }).then(aoSalvar).catch((e: Error) => setErro(e.message))}>Salvar</button>
    </Cartao>
  );
}

interface Ficha {
  organizacao: Organizacao;
  empreendimentos: { id: string; nome: string; papeis: string[]; situacaoObra: string; statusGeral: string; etapa?: string; tensaoMaxKv?: number; dataDemandaBase?: string; energizacaoBase?: string; central?: number; faixaPrioridade?: string; capex?: number; capexEletrico?: number }[];
  ativos: Ficha['empreendimentos'];
  emExecucao: Ficha['empreendimentos'];
  anunciados: Ficha['empreendimentos'];
  oportunidadesFuturas: Ficha['empreendimentos'];
  fornecedores: { empreendimentoId: string; empreendimento: string; organizacao: string; papel: string; escopo?: string }[];
  contratos: { id: string; empreendimentoId: string; empreendimento: string; objeto: string; contratada?: string; dataAssinatura?: string; status: string; valorBRL?: number }[];
  investimentos: { ano: string; valor: number; empreendimento: string }[];
  eventos: EventoMudanca[];
  documentos: (Documento & { empreendimento: string; empreendimentoId: string; titulo: string; url?: string; dataPublicacao?: string; tipoDocumento: Documento['tipo'] })[];
  relacionamento: { oportunidadeId: string; empreendimentoId: string; status: string; responsavel?: string; interacoes: { id: string; data: string; tipo: string; resumo: string; por: string }[]; proximosPassos: { id: string; descricao: string; prazo?: string; responsavel?: string }[] }[];
}

export function PaginaClienteFicha() {
  const { id } = useParams();
  const { dados, erro, recarregar } = useApi<Ficha>(`/clientes/${id}`);
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;
  const o = dados.organizacao;
  const nomes = new Map(dados.empreendimentos.map((e) => [e.id, e.nome]));
  const porAno = Object.entries(dados.investimentos.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.ano]: (acc[i.ano] ?? 0) + i.valor }), {})).sort();
  const tabela = (lista: Ficha['empreendimentos'], vazio: string) =>
    lista.length ? (
      <table className="tabela">
        <thead><tr><th>Empreendimento</th><th>Papel</th><th>Situação</th><th>Demanda (base)</th><th className="num">Potencial</th></tr></thead>
        <tbody>
          {lista.map((e) => (
            <tr key={e.id}><td><Link to={`/empreendimentos/${e.id}`}>{e.nome}</Link></td><td className="pequeno">{e.papeis.join(', ')}</td><td className="pequeno">{ROTULO_SITUACAO_OBRA[e.situacaoObra as keyof typeof ROTULO_SITUACAO_OBRA] ?? e.situacaoObra}{e.etapa ? ` · ${e.etapa}` : ''}</td><td>{dataBR(e.dataDemandaBase)}</td><td className="num">{brl(e.central)}</td></tr>
          ))}
        </tbody>
      </table>
    ) : <div className="muted">{vazio}</div>;
  return (
    <>
      <div className="cabecalho">
        <div>
          <div className="muted pequeno"><Link to="/clientes">Clientes</Link> / {ROTULO_TIPO_ORGANIZACAO[o.tipo]}</div>
          <h1 style={{ marginTop: 4 }}>{o.nome} {o.demo && <SeloDemo />}</h1>
          <p>{o.cnpj ? `CNPJ ${o.cnpj} · ` : ''}{o.site ? <a href={o.site} target="_blank" rel="noreferrer noopener">{o.site}</a> : ''}</p>
        </div>
      </div>
      <div className="grade g4">
        <Kpi rotulo="Empreendimentos" valor={num(dados.empreendimentos.length)} />
        <Kpi rotulo="Ativos / em execução" valor={`${dados.ativos.length} / ${dados.emExecucao.length}`} />
        <Kpi rotulo="Oportunidades futuras" valor={num(dados.oportunidadesFuturas.length)} complemento={brl(dados.oportunidadesFuturas.reduce((s, e) => s + (e.central ?? 0), 0))} />
        <Kpi rotulo="Contratos/fornecedores identificados" valor={`${dados.contratos.length} / ${dados.fornecedores.length}`} />
      </div>
      <div className="grade g2">
        <Cartao titulo="Oportunidades futuras" sub="Ordenadas pela data de demanda estimada (cenário base)">{tabela(dados.oportunidadesFuturas, 'Nenhuma oportunidade futura identificada.')}</Cartao>
        <Cartao titulo="Projetos anunciados / planejados">{tabela(dados.anunciados, 'Nenhum projeto anunciado.')}</Cartao>
        <Cartao titulo="Projetos em execução">{tabela(dados.emExecucao, 'Nenhum projeto em execução.')}</Cartao>
        <Cartao titulo="Histórico de investimentos declarados" sub="CAPEX declarado (total ou elétrico) por ano de anúncio/outorga — valores das fontes">
          {porAno.length ? <BarrasHorizontais dados={porAno.map(([ano, v]) => ({ rotulo: ano, valor: v }))} formatar={(v) => brl(v)} rotuloValor="investimento declarado" /> : <div className="muted">Sem valores declarados.</div>}
        </Cartao>
        <Cartao titulo="Contratos e fornecedores identificados">
          {dados.contratos.map((c) => <div key={c.id} className="pequeno" style={{ padding: '3px 0' }}>{c.objeto} — {c.contratada ?? '?'} · {c.status} {dataBR(c.dataAssinatura)} · <Link to={`/empreendimentos/${c.empreendimentoId}`}>{c.empreendimento}</Link></div>)}
          {dados.fornecedores.map((f, i) => <div key={i} className="pequeno" style={{ padding: '3px 0' }}>{f.organizacao} — {f.papel}{f.escopo ? ` (${f.escopo})` : ''} · <Link to={`/empreendimentos/${f.empreendimentoId}`}>{f.empreendimento}</Link></div>)}
          {!dados.contratos.length && !dados.fornecedores.length && <div className="muted">Nenhum identificado.</div>}
        </Cartao>
        <Cartao titulo="Relacionamento comercial e próximas ações">
          {dados.relacionamento.length === 0 && <div className="muted">Sem registros comerciais.</div>}
          {dados.relacionamento.map((r) => (
            <div key={r.oportunidadeId} style={{ marginBottom: 10 }}>
              <Link to={`/empreendimentos/${r.empreendimentoId}`}>{nomes.get(r.empreendimentoId)}</Link> <span className="selo">{ROTULO_STATUS_PROSPECCAO[r.status as keyof typeof ROTULO_STATUS_PROSPECCAO] ?? r.status}</span>
              {r.proximosPassos.map((p) => <div key={p.id} className="pequeno">▸ {p.descricao}{p.prazo ? ` — até ${dataBR(p.prazo)}` : ''}{p.responsavel ? ` (${p.responsavel})` : ''}</div>)}
              {r.interacoes.slice(-3).map((i) => <div key={i.id} className="pequeno muted">{dataBR(i.data)} · {i.tipo}: {i.resumo}</div>)}
            </div>
          ))}
        </Cartao>
        <Cartao titulo="Últimas notícias, eventos e documentos">
          <div className="lista">
            {dados.eventos.slice(0, 8).map((e) => <div className="item" key={e.id}><span className="selo">{ROTULO_EVENTO[e.tipo]}</span><div>{e.descricao}<div className="meta">{dataHoraBR(e.em)} · {nomes.get(e.empreendimentoId)}</div></div></div>)}
            {dados.documentos.slice(0, 8).map((d) => <div className="item" key={d.id}><span className="selo">{ROTULO_TIPO_DOCUMENTO[d.tipoDocumento]}</span><div>{d.url ? <a href={d.url} target="_blank" rel="noreferrer noopener">{d.titulo}</a> : d.titulo}<div className="meta">{dataBR(d.dataPublicacao)} · {d.empreendimento}</div></div></div>)}
          </div>
        </Cartao>
      </div>
    </>
  );
}
