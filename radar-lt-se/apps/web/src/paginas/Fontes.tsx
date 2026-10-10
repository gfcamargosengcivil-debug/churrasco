import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ROTULO_FREQUENCIA, ROTULO_MARCO, ROTULO_METODO_ACESSO, ROTULO_NATUREZA_MARCO, ROTULO_STATUS_INTEGRACAO, ROTULO_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO, type Coleta, type Documento, type Fonte, type RegistroNormalizado,
} from '@radar/core';
import type { ResultadoAnaliseDocumental } from '@radar/ai';
import { Abas, Carregando, Cartao, Erro } from '../componentes/base';
import { api, useApi } from '../lib/api';
import { dataBR, dataHoraBR } from '../lib/formatos';
import type { Resumo } from '../lib/tipos';

type FonteApi = Fonte & { coletaAutomatica: boolean; pendencias: string[]; ultimasColetas: Coleta[] };
type Papel = 'admin' | 'analista' | 'comercial' | 'leitor' | undefined;
type Aba = 'catalogo' | 'importar' | 'documentos' | 'sinais' | 'coletas';

export function PaginaFontes({ papel }: { papel: Papel }) {
  const [aba, setAba] = useState<Aba>('catalogo');
  const { dados: fontes, erro, recarregar } = useApi<FonteApi[]>('/fontes');
  const pode = papel === 'admin' || papel === 'analista';
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!fontes) return <Carregando />;
  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Fontes e ingestão</h1>
          <p>Catálogo de fontes com método de acesso, frequência, última coleta e limitações. Integrações não validadas contra o serviço real são identificadas como tal; quando não há API, a operação é por planilha ou documento.</p>
        </div>
      </div>
      <Abas<Aba>
        abas={[
          { id: 'catalogo', rotulo: 'Catálogo de fontes' },
          { id: 'importar', rotulo: 'Importar planilha' },
          { id: 'documentos', rotulo: 'Documentos e IA' },
          { id: 'sinais', rotulo: 'Sinais para triagem' },
          { id: 'coletas', rotulo: 'Histórico de coletas' },
        ]}
        ativa={aba}
        onChange={setAba}
      />
      {aba === 'catalogo' && <Catalogo fontes={fontes} pode={pode} admin={papel === 'admin'} recarregar={recarregar} />}
      {aba === 'importar' && <Importar fontes={fontes} pode={pode} aoImportar={recarregar} />}
      {aba === 'documentos' && <Documentos fontes={fontes} pode={pode} />}
      {aba === 'sinais' && <Sinais pode={pode} />}
      {aba === 'coletas' && <Coletas fontes={fontes} />}
    </>
  );
}

function Catalogo({ fontes, pode, admin, recarregar }: { fontes: FonteApi[]; pode: boolean; admin: boolean; recarregar: () => void }) {
  const [msg, setMsg] = useState<string>();
  const [editando, setEditando] = useState<FonteApi>();
  const executar = async (f: FonteApi) => {
    try {
      const r = await api.enviar<{ mensagem: string }>('POST', `/fontes/${f.id}/executar`);
      setMsg(`${f.nome}: ${r.mensagem}`);
      setTimeout(recarregar, 3000);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <>
      {msg && <div className="aviso info">{msg}</div>}
      <div className="tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Fonte</th><th>Classe</th><th>Método</th><th>Frequência</th><th>Status da integração</th><th>Última coleta</th><th>Limitações / pendências</th><th /></tr></thead>
          <tbody>
            {fontes.map((f) => (
              <tr key={f.id}>
                <td className="nome">{f.url ? <a href={f.url} target="_blank" rel="noreferrer noopener">{f.nome}</a> : f.nome}<div className="muted pequeno">{f.orgao} · {f.id}{!f.ativo && ' · desativada'}</div></td>
                <td>{f.classe}</td>
                <td>{ROTULO_METODO_ACESSO[f.metodoAcesso]}</td>
                <td>{ROTULO_FREQUENCIA[f.frequencia]}</td>
                <td><span className="selo">{ROTULO_STATUS_INTEGRACAO[f.statusIntegracao]}</span>{f.credenciais.length > 0 && <div className="pequeno muted">credenciais: {f.credenciais.join(', ')}</div>}</td>
                <td>{f.ultimaColeta ? <>{dataHoraBR(f.ultimaColeta)}<div className="pequeno">{f.ultimaColetaStatus}</div></> : <span className="muted">nunca</span>}</td>
                <td className="pequeno" style={{ maxWidth: 420 }}>
                  <ul style={{ margin: 0, paddingLeft: 14 }}>{f.limitacoes.map((l) => <li key={l}>{l}</li>)}</ul>
                  {f.pendencias.length > 0 && <div style={{ color: 'var(--atencao-texto)' }}>Pendências: {f.pendencias.join('; ')}</div>}
                </td>
                <td>
                  <div className="flex">
                    {f.coletaAutomatica && pode && <button className="botao peq" onClick={() => void executar(f)} disabled={!f.ativo}>Executar agora</button>}
                    {admin && f.coletaAutomatica && <button className="botao peq" onClick={() => setEditando(f)}>Configurar</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editando && <ConfigFonte fonte={editando} aoFechar={() => setEditando(undefined)} aoSalvar={() => { setEditando(undefined); recarregar(); }} />}
    </>
  );
}

function ConfigFonte({ fonte, aoFechar, aoSalvar }: { fonte: FonteApi; aoFechar: () => void; aoSalvar: () => void }) {
  const [texto, setTexto] = useState(JSON.stringify(fonte.config, null, 2));
  const [ativo, setAtivo] = useState(fonte.ativo);
  const [erro, setErro] = useState<string>();
  const salvar = async () => {
    try {
      await api.enviar('PUT', `/fontes/${fonte.id}`, { ativo, config: JSON.parse(texto) });
      aoSalvar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };
  return (
    <Cartao titulo={`Configurar ${fonte.nome}`} acoes={<button className="botao fantasma" onClick={aoFechar}>Fechar</button>}>
      <label className="chk"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Fonte ativa (coleta agendada)</label>
      <label className="campo" style={{ marginTop: 8 }}><span>Configuração (JSON) — não coloque segredos aqui; credenciais vão em variáveis de ambiente do servidor</span><textarea className="entrada mono" style={{ minHeight: 200 }} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
      {erro && <div className="aviso erro">{erro}</div>}
      <div className="flex" style={{ marginTop: 8 }}><button className="botao primario" onClick={() => void salvar()}>Salvar</button></div>
    </Cartao>
  );
}

interface Previa {
  aba?: string;
  linhas: number;
  validos: number;
  colunas: Record<string, string>;
  ignoradas: string[];
  registros: RegistroNormalizado[];
  erros: { linha: number; mensagem: string }[];
}

function Importar({ fontes, pode, aoImportar }: { fontes: FonteApi[]; pode: boolean; aoImportar: () => void }) {
  const [arquivo, setArquivo] = useState<File>();
  const [fonteId, setFonteId] = useState('importacao-planilha');
  const [previa, setPrevia] = useState<Previa>();
  const [resultado, setResultado] = useState<{ coleta: Coleta }>();
  const [erro, setErro] = useState<string>();
  const [ocupado, setOcupado] = useState(false);
  const opcoes = fontes.filter((f) => f.adaptador === 'planilha');
  const rodar = async (tipo: 'previa' | 'importar') => {
    if (!arquivo) return;
    setErro(undefined);
    setOcupado(true);
    try {
      if (tipo === 'previa') {
        setResultado(undefined);
        setPrevia(await api.upload<Previa>('/importacao/previa', arquivo, { fonteId }));
      } else {
        setResultado(await api.upload<{ coleta: Coleta }>('/importacao', arquivo, { fonteId }));
        aoImportar();
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  if (!pode) return <div className="aviso info">Seu papel permite apenas consulta. A importação é feita por analistas.</div>;
  return (
    <div className="grade g2">
      <Cartao titulo="1. Selecionar arquivo e fonte" sub="CSV (; ou ,) ou XLSX. Cada linha precisa do documento de origem (coluna fonte_titulo).">
        <div className="flex" style={{ marginBottom: 10 }}>
          <button className="botao" onClick={() => void api.baixar('/importacao/modelo', 'modelo-importacao-radar-lt-se.xlsx')}>Baixar planilha modelo</button>
        </div>
        <div className="form-grade">
          <label className="campo"><span>Fonte (define a classe de confiabilidade)</span>
            <select className="entrada" value={fonteId} onChange={(e) => setFonteId(e.target.value)}>
              {opcoes.map((f) => <option key={f.id} value={f.id}>{f.nome} (classe {f.classe})</option>)}
            </select>
          </label>
          <label className="campo"><span>Arquivo</span><input className="entrada" type="file" accept=".csv,.xlsx,.txt" onChange={(e) => { setArquivo(e.target.files?.[0]); setPrevia(undefined); setResultado(undefined); }} /></label>
        </div>
        <div className="flex" style={{ marginTop: 10 }}>
          <button className="botao" disabled={!arquivo || ocupado} onClick={() => void rodar('previa')}>Pré-visualizar</button>
          <button className="botao primario" disabled={!arquivo || !previa || ocupado} onClick={() => void rodar('importar')}>Importar {previa ? `${previa.validos} registro(s)` : ''}</button>
        </div>
        {erro && <div className="aviso erro" style={{ marginTop: 10 }}>{erro}</div>}
        <div className="sub" style={{ marginTop: 10 }}>
          A importação passa pela deduplicação: registros coincidentes atualizam o cadastro (com histórico e conflitos), duvidosos vão para revisão manual e linhas &lt; 138 kV são descartadas.
        </div>
      </Cartao>
      <Cartao titulo="2. Pré-visualização e resultado">
        {!previa && !resultado && <div className="muted">Selecione um arquivo e clique em pré-visualizar.</div>}
        {previa && (
          <>
            <div>{previa.linhas} linha(s) lidas{previa.aba ? ` (aba "${previa.aba}")` : ''} · <strong>{previa.validos} válidas</strong> · {previa.erros.filter((e) => !e.mensagem.startsWith('aviso')).length} com erro</div>
            <details style={{ marginTop: 6 }}><summary>Colunas reconhecidas ({Object.keys(previa.colunas).length})</summary>
              <div className="pequeno">{Object.entries(previa.colunas).map(([k, v]) => <div key={k}><span className="mono">{k}</span> ← “{v}”</div>)}</div>
              {previa.ignoradas.length > 0 && <div className="pequeno muted">Ignoradas: {previa.ignoradas.join(', ')}</div>}
            </details>
            {previa.erros.length > 0 && (
              <details open style={{ marginTop: 6 }}><summary>Erros e avisos por linha</summary>
                <div className="pequeno">{previa.erros.slice(0, 50).map((e, i) => <div key={i}>Linha {e.linha}: {e.mensagem}</div>)}</div>
              </details>
            )}
            <table className="tabela" style={{ marginTop: 8 }}>
              <thead><tr><th>Nome</th><th>kV</th><th>km</th><th>UF</th><th>Marcos</th></tr></thead>
              <tbody>{previa.registros.map((r, i) => <tr key={i}><td>{r.nome}</td><td>{r.tensoesKv?.join('/')}</td><td>{r.extensaoKm ?? ''}</td><td>{r.ufs?.join('/')}</td><td>{r.marcos?.length ?? 0}</td></tr>)}</tbody>
            </table>
          </>
        )}
        {resultado && (
          <div className="aviso info" style={{ flexDirection: 'column', marginTop: 10 }}>
            <strong>Importação {resultado.coleta.status}</strong>
            <div>{resultado.coleta.criados} criados · {resultado.coleta.atualizados} atualizados · {resultado.coleta.semMudanca} sem mudança · {resultado.coleta.paraRevisao} para revisão · {resultado.coleta.conflitos} conflitos · {resultado.coleta.descartados} descartados</div>
            {resultado.coleta.paraRevisao > 0 && <Link to="/qualidade">Revisar correspondências →</Link>}
          </div>
        )}
      </Cartao>
    </div>
  );
}

function Documentos({ fontes, pode }: { fontes: FonteApi[]; pode: boolean }) {
  const { dados: docs, recarregar } = useApi<Documento[]>('/documentos');
  const { dados: ia } = useApi<{ habilitada: boolean; modo: string; modelo?: string }>('/ia/status');
  const [arquivo, setArquivo] = useState<File>();
  const [meta, setMeta] = useState({ titulo: '', tipo: 'ato_regulatorio', fonteId: 'aneel-rea', url: '', dataPublicacao: '' });
  const [sel, setSel] = useState<string>();
  const [erro, setErro] = useState<string>();
  const enviar = async () => {
    if (!arquivo) return;
    setErro(undefined);
    try {
      const r = await api.upload<{ documento: Documento; duplicado: boolean; avisos: string[] }>('/documentos', arquivo, meta);
      setSel(r.documento.id);
      recarregar();
      if (r.avisos.length) setErro(r.avisos.join(' '));
    } catch (e) {
      setErro((e as Error).message);
    }
  };
  const lista = (docs ?? []).filter((d) => d.tipo !== 'noticia' || d.fonteId !== 'rss-setorial');
  return (
    <>
      <div className="aviso info">
        Extração: {ia?.modo ?? '…'}{ia?.modelo ? ` (${ia.modelo})` : ''}. Toda informação extraída cita o trecho literal do documento; itens sem citação verificável são descartados.
        Nada é gravado sem revisão humana, e o que for aplicado entra como “inferido”.
      </div>
      {pode && (
        <Cartao titulo="Enviar documento" sub="PDF com texto, HTML ou TXT (editais, REAs, licenças, cronogramas, comunicados, notícias)">
          <div className="form-grade">
            <label className="campo"><span>Arquivo</span><input className="entrada" type="file" accept=".pdf,.html,.htm,.txt" onChange={(e) => setArquivo(e.target.files?.[0])} /></label>
            <label className="campo"><span>Título</span><input className="entrada" value={meta.titulo} onChange={(e) => setMeta({ ...meta, titulo: e.target.value })} /></label>
            <label className="campo"><span>Tipo</span><select className="entrada" value={meta.tipo} onChange={(e) => setMeta({ ...meta, tipo: e.target.value })}>{TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{ROTULO_TIPO_DOCUMENTO[t]}</option>)}</select></label>
            <label className="campo"><span>Fonte</span><select className="entrada" value={meta.fonteId} onChange={(e) => setMeta({ ...meta, fonteId: e.target.value })}>{fontes.filter((f) => f.id !== 'demo').map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
            <label className="campo"><span>Link de origem</span><input className="entrada" value={meta.url} onChange={(e) => setMeta({ ...meta, url: e.target.value })} /></label>
            <label className="campo"><span>Data de publicação</span><input className="entrada" type="date" value={meta.dataPublicacao} onChange={(e) => setMeta({ ...meta, dataPublicacao: e.target.value })} /></label>
          </div>
          <div className="flex" style={{ marginTop: 10 }}><button className="botao primario" disabled={!arquivo} onClick={() => void enviar()}>Enviar</button></div>
          {erro && <div className="aviso atencao" style={{ marginTop: 8 }}>{erro}</div>}
        </Cartao>
      )}
      <div className="grade g2">
        <Cartao titulo="Documentos">
          {!docs ? <Carregando /> : (
            <div className="lista">
              {lista.map((d) => (
                <div className="item" key={d.id} style={{ cursor: 'pointer', background: sel === d.id ? 'var(--acento-fundo)' : undefined }} onClick={() => setSel(d.id)}>
                  <span className="selo">{ROTULO_TIPO_DOCUMENTO[d.tipo]}</span>
                  <div>
                    <div>{d.titulo}</div>
                    <div className="meta">{dataBR(d.dataPublicacao)} · carregado {dataHoraBR(d.carregadoEm)} · {d.empreendimentoIds.length} empreendimento(s){(d.analise as { metodo?: string } | undefined)?.metodo ? ` · analisado (${(d.analise as { metodo: string }).metodo})` : ''}</div>
                  </div>
                </div>
              ))}
              {!lista.length && <div className="vazio">Nenhum documento.</div>}
            </div>
          )}
        </Cartao>
        {sel ? <AnaliseDocumento id={sel} pode={pode} aoAplicar={recarregar} /> : <Cartao titulo="Análise"><div className="muted">Selecione um documento.</div></Cartao>}
      </div>
    </>
  );
}

export function AnaliseDocumento({ id, pode, aoAplicar }: { id: string; pode: boolean; aoAplicar?: () => void }) {
  const { dados: doc, recarregar } = useApi<Documento>(`/documentos/${id}`);
  const { dados: lista } = useApi<Resumo[]>('/empreendimentos');
  const [analisando, setAnalisando] = useState(false);
  const [selItens, setSelItens] = useState<number[]>([]);
  const [selMarcos, setSelMarcos] = useState<number[]>([]);
  const [destino, setDestino] = useState('');
  const [nome, setNome] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'info'; texto: string }>();
  const analise = doc?.analise as ResultadoAnaliseDocumental | undefined;
  const valida = analise && Array.isArray(analise.itens);
  const analisar = async () => {
    setAnalisando(true);
    setMsg(undefined);
    try {
      await api.enviar('POST', `/documentos/${id}/analisar`);
      recarregar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setAnalisando(false);
    }
  };
  const aplicar = async () => {
    try {
      const r = await api.enviar<{ coleta: Coleta; empreendimentosAfetados: string[] }>('POST', `/documentos/${id}/aplicar`, {
        itens: selItens, marcos: selMarcos, empreendimentoId: destino || undefined, nome: nome || undefined,
      });
      setMsg({ tipo: 'info', texto: `Aplicado: ${r.coleta.criados} criado(s), ${r.coleta.atualizados} atualizado(s), ${r.coleta.paraRevisao} para revisão.` });
      aoAplicar?.();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  };
  const nomesSugeridos = useMemo(() => (valida ? analise!.itens.filter((i) => i.campo === 'nome').map((i) => i.valor) : []), [analise, valida]);
  if (!doc) return <Cartao titulo="Análise"><Carregando /></Cartao>;
  return (
    <Cartao titulo={doc.titulo} sub={`${ROTULO_TIPO_DOCUMENTO[doc.tipo]} · ${doc.paginas ?? 1} página(s)`} acoes={pode ? <button className="botao" disabled={analisando} onClick={() => void analisar()}>{analisando ? 'Analisando…' : valida ? 'Reanalisar' : 'Analisar'}</button> : undefined}>
      {doc.url && <div className="pequeno"><a href={doc.url} target="_blank" rel="noreferrer noopener">{doc.url}</a></div>}
      <details style={{ margin: '8px 0' }}><summary>Texto extraído</summary><pre className="pequeno" style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{doc.textoExtraido}</pre></details>
      {!valida && <div className="muted">Documento ainda não analisado.</div>}
      {valida && (
        <>
          <div className="pequeno muted">Método: {analise!.metodo}{analise!.modelo ? ` · ${analise!.modelo}` : ''} · {dataHoraBR(analise!.analisadoEm)}</div>
          {analise!.avisos.map((a) => <div key={a} className="aviso atencao pequeno" style={{ marginTop: 6 }}>{a}</div>)}
          {analise!.resumo && <p style={{ marginTop: 8 }}>{analise!.resumo}</p>}
          <h3 style={{ marginTop: 10 }}>Itens extraídos — selecione o que foi conferido</h3>
          <div className="lista">
            {analise!.itens.map((it, i) => (
              <label className="item" key={i} style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={selItens.includes(i)} onChange={(e) => setSelItens(e.target.checked ? [...selItens, i] : selItens.filter((x) => x !== i))} disabled={!pode} />
                <div>
                  <strong className="mono">{it.campo}</strong>: {it.valor} <span className="selo">{it.metodo}</span>{it.pagina ? <span className="muted pequeno"> p. {it.pagina}</span> : null}
                  <div className="trecho">“{it.trecho}”</div>
                  {it.observacao && <div className="meta">{it.observacao}</div>}
                </div>
              </label>
            ))}
          </div>
          <h3 style={{ marginTop: 10 }}>Marcos</h3>
          <div className="lista">
            {analise!.marcos.map((m, i) => (
              <label className="item" key={i} style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={selMarcos.includes(i)} onChange={(e) => setSelMarcos(e.target.checked ? [...selMarcos, i] : selMarcos.filter((x) => x !== i))} disabled={!pode} />
                <div><strong>{ROTULO_MARCO[m.tipo]}</strong> — {dataBR(m.data)} <span className="selo">{ROTULO_NATUREZA_MARCO[m.natureza]}</span> <span className="selo">{m.metodo}</span><div className="trecho">“{m.trecho}”</div></div>
              </label>
            ))}
            {!analise!.marcos.length && <div className="muted">Nenhum marco com data identificado.</div>}
          </div>
          {analise!.indicios.length > 0 && (
            <>
              <h3 style={{ marginTop: 10 }}>Indícios de contratação</h3>
              {analise!.indicios.map((x, i) => <div key={i} className="pequeno" style={{ marginBottom: 6 }}><span className="selo">{x.tipo.replace('_', ' ')}</span> {x.descricao}<div className="trecho">“{x.trecho}”</div></div>)}
            </>
          )}
          {analise!.lacunas.length > 0 && <div className="pequeno muted" style={{ marginTop: 8 }}>Lacunas: {analise!.lacunas.join('; ')}</div>}
          {analise!.descartados.length > 0 && <details style={{ marginTop: 8 }}><summary>{analise!.descartados.length} item(ns) da IA descartados por falta de evidência</summary><pre className="pequeno" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(analise!.descartados, null, 2)}</pre></details>}
          {pode && (
            <div className="cartao" style={{ marginTop: 12 }}>
              <h3>Aplicar itens selecionados</h3>
              <div className="form-grade" style={{ marginTop: 8 }}>
                <label className="campo"><span>Empreendimento de destino</span>
                  <select className="entrada" value={destino} onChange={(e) => setDestino(e.target.value)}>
                    <option value="">Deduplicação automática (novo ou existente)</option>
                    {(lista ?? []).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </label>
                <label className="campo"><span>Nome do empreendimento</span>
                  <input className="entrada" list="nomes-sugeridos" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={nomesSugeridos[0] ?? doc.titulo} />
                  <datalist id="nomes-sugeridos">{nomesSugeridos.map((n) => <option key={n} value={n} />)}</datalist>
                </label>
              </div>
              <button className="botao primario" style={{ marginTop: 8 }} disabled={!selItens.length && !selMarcos.length} onClick={() => void aplicar()}>Aplicar como dado inferido</button>
            </div>
          )}
        </>
      )}
      {msg && <div className={`aviso ${msg.tipo}`} style={{ marginTop: 8 }}>{msg.texto}</div>}
    </Cartao>
  );
}

function Sinais({ pode }: { pode: boolean }) {
  const { dados: docs, recarregar } = useApi<Documento[]>('/documentos?tipo=noticia');
  const { dados: lista } = useApi<Resumo[]>('/empreendimentos');
  const [sel, setSel] = useState<string>();
  const [vinculo, setVinculo] = useState<Record<string, string>>({});
  const acao = async (id: string, corpo: { empreendimentoId?: string; descartar?: boolean }) => {
    await api.enviar('POST', `/documentos/${id}/vincular`, corpo);
    recarregar();
  };
  const triagem = (docs ?? []).filter((d) => (d.analise as { status?: string } | undefined)?.status !== 'descartado');
  return (
    <div className="grade g2">
      <Cartao titulo="Sinais de mercado" sub="Notícias, diários oficiais e releases capturados por palavras-chave (não criam empreendimentos automaticamente)">
        {!docs ? <Carregando /> : (
          <div className="lista">
            {triagem.map((d) => (
              <div className="item" key={d.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ cursor: 'pointer' }} onClick={() => setSel(d.id)}><strong>{d.titulo}</strong></div>
                  <div className="meta">{dataBR(d.dataPublicacao)} · {d.fonteId} · {d.empreendimentoIds.length ? 'vinculado' : 'em triagem'}</div>
                  {d.url && <a className="pequeno" href={d.url} target="_blank" rel="noreferrer noopener">abrir origem</a>}
                  {pode && (
                    <div className="flex" style={{ marginTop: 6 }}>
                      <select className="entrada" style={{ maxWidth: 280 }} value={vinculo[d.id] ?? ''} onChange={(e) => setVinculo({ ...vinculo, [d.id]: e.target.value })}>
                        <option value="">Vincular a empreendimento…</option>
                        {(lista ?? []).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                      </select>
                      <button className="botao peq" disabled={!vinculo[d.id]} onClick={() => void acao(d.id, { empreendimentoId: vinculo[d.id] })}>Vincular</button>
                      <button className="botao peq" onClick={() => setSel(d.id)}>Analisar</button>
                      <button className="botao peq perigo" onClick={() => void acao(d.id, { descartar: true })}>Descartar</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {!triagem.length && <div className="vazio">Nenhum sinal em triagem. Configure feeds RSS ou o Querido Diário no catálogo.</div>}
          </div>
        )}
      </Cartao>
      {sel ? <AnaliseDocumento id={sel} pode={pode} aoAplicar={recarregar} /> : <Cartao titulo="Análise"><div className="muted">Selecione um sinal para analisar.</div></Cartao>}
    </div>
  );
}

function Coletas({ fontes }: { fontes: FonteApi[] }) {
  const { dados } = useApi<Coleta[]>('/coletas');
  const nomes = new Map(fontes.map((f) => [f.id, f.nome]));
  if (!dados) return <Carregando />;
  return (
    <div className="tabela-wrap">
      <table className="tabela">
        <thead><tr><th>Início</th><th>Fonte</th><th>Disparo</th><th>Status</th><th className="num">Lidos</th><th className="num">Criados</th><th className="num">Atualiz.</th><th className="num">Revisão</th><th className="num">Conflitos</th><th className="num">Descart.</th><th>Erros / avisos</th></tr></thead>
        <tbody>
          {dados.map((c) => (
            <tr key={c.id}>
              <td>{dataHoraBR(c.iniciadaEm)}</td><td>{nomes.get(c.fonteId) ?? c.fonteId}</td><td>{c.disparo}{c.usuario ? ` (${c.usuario})` : ''}</td><td><span className="selo">{c.status}</span></td>
              <td className="num">{c.registrosLidos}</td><td className="num">{c.criados}</td><td className="num">{c.atualizados}</td><td className="num">{c.paraRevisao}</td><td className="num">{c.conflitos}</td><td className="num">{c.descartados}</td>
              <td className="pequeno" style={{ maxWidth: 420 }}>{[...c.erros, ...c.avisos].slice(0, 4).map((e, i) => <div key={i}>{e}</div>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!dados.length && <div className="vazio">Nenhuma coleta registrada.</div>}
    </div>
  );
}
