import {
  hojeISO, novoId, somarDias, DIAS_FREQUENCIA, type Coleta, type Documento, type Empreendimento, type EventoMudanca,
  type MatchCandidato, type Organizacao, type RegistroNormalizado, type TipoDocumento,
} from '@radar/core';
import {
  ADAPTADORES, AdaptadorNaoConfigurado, aplicarEncerramentos, extrairTextoDocumento, finalizarColeta, lerPlanilha, mapearLinhas, novaColeta,
  processarRegistros, type PortaIngestao, type SinalColetado,
} from '@radar/ingestion';
import { analisarDocumento, registroDeAnalise, type ResultadoAnaliseDocumental, type SelecaoAplicacao } from '@radar/ai';
import { ErroNegocio, type Servicos, type Usuario } from './dominio.js';

/** Implementação da porta de ingestão sobre o repositório + serviços (eventos/alertas). */
export class PortaRepositorio implements PortaIngestao {
  constructor(private s: Servicos) {}
  listarEmpreendimentos() { return this.s.repo.listarEmpreendimentos(); }
  listarOrganizacoes() { return this.s.repo.listarOrganizacoes(); }
  async salvarEmpreendimento(p: Empreendimento) { await this.s.repo.salvarEmpreendimento(p); }
  salvarOrganizacao(o: Organizacao) { return this.s.repo.salvarOrganizacao(o); }
  salvarMatchCandidato(m: MatchCandidato) { return this.s.repo.salvarMatch(m); }
  registrarEventos(e: EventoMudanca[]) { return this.s.registrarEventos(e); }
  async proximoCodigo() { return `RLT-${String(await this.s.repo.proximoSequencial()).padStart(6, '0')}`; }
  async registrarSinais(sinais: SinalColetado[], coletaId: string) {
    let novos = 0;
    for (const sn of sinais) {
      const hash = `sinal:${sn.fonteId}:${sn.chaveExterna}`;
      if (await this.s.repo.obterDocumentoPorHash(hash)) continue;
      await this.s.repo.salvarDocumento({
        id: novoId('doc'), titulo: sn.titulo, tipo: 'noticia', fonteId: sn.fonteId, url: sn.url, mime: 'text/plain',
        tamanhoBytes: (sn.resumo ?? '').length, hash, textoExtraido: [sn.titulo, sn.resumo].filter(Boolean).join('\n\n'),
        dataPublicacao: sn.dataPublicacao, carregadoEm: new Date().toISOString(), carregadoPor: `coleta:${coletaId}`, empreendimentoIds: [],
        analise: { termos: sn.termos, status: 'triagem' },
      });
      novos++;
    }
    return novos;
  }
}

export class ServicoIngestao {
  porta: PortaRepositorio;
  constructor(private s: Servicos) {
    this.porta = new PortaRepositorio(s);
  }

  private async fonte(id: string) {
    const f = await this.s.repo.obterFonte(id);
    if (!f) throw new ErroNegocio(404, `Fonte ${id} não encontrada`);
    return f;
  }

  /** Executa a coleta automática de uma fonte com adaptador (CKAN, ArcGIS, RSS, Querido Diário…). */
  async executarFonte(fonteId: string, disparo: Coleta['disparo'], usuario?: string, opcoes: { semRevisaoManual?: boolean } = {}): Promise<Coleta> {
    const f = await this.fonte(fonteId);
    const adaptador = ADAPTADORES[f.adaptador];
    if (!adaptador) throw new ErroNegocio(400, `A fonte "${f.nome}" não tem coleta automática (opera por ${f.adaptador}).`);
    const coleta = novaColeta(f.id, disparo, usuario);
    await this.s.repo.salvarColeta(coleta);
    try {
      const ultima = f.ultimaColeta?.slice(0, 10);
      const res = await adaptador.coletar(f, { fetch, hoje: hojeISO(), env: process.env, desde: ultima ? somarDias(ultima, -1) : undefined });
      coleta.avisos.push(...res.avisos);
      const cfg = await this.s.configuracao();
      await processarRegistros(res.registros, { porta: this.porta, fonte: f, coleta, config: cfg, por: usuario ?? `fonte:${f.id}`, semRevisaoManual: opcoes.semRevisaoManual });
      await aplicarEncerramentos(res.encerramentos ?? [], { porta: this.porta, fonte: f, coleta, config: cfg, por: usuario ?? `fonte:${f.id}` });
      coleta.registrosLidos = Math.max(coleta.registrosLidos, res.lidos);
      if (res.sinais.length) {
        const novos = await this.porta.registrarSinais(res.sinais, coleta.id);
        coleta.avisos.push(`${novos} sinal(is) novo(s) para triagem.`);
      }
    } catch (e) {
      coleta.erros.push(e instanceof AdaptadorNaoConfigurado ? e.message : `Falha na coleta: ${(e as Error).message}`);
    }
    finalizarColeta(coleta);
    await this.s.repo.salvarColeta(coleta);
    await this.s.repo.salvarFonte({ ...f, ultimaColeta: coleta.finalizadaEm, ultimaColetaStatus: coleta.status === 'em_andamento' ? undefined : coleta.status });
    return coleta;
  }

  /** Lê e mapeia uma planilha sem gravar (pré-visualização). */
  async previaPlanilha(buf: Buffer, nome: string, fonteId: string) {
    const f = await this.fonte(fonteId);
    const { linhas, cabecalhos, aba } = await lerPlanilha(buf, nome);
    const m = mapearLinhas(linhas, cabecalhos, { fonteId: f.id, mapeamento: (f.config as { mapeamento?: Record<string, string[]> }).mapeamento, setorPadrao: f.config.setorPadrao as string | undefined, tipoPadrao: f.config.tipoPadrao as string | undefined });
    return { aba, linhas: linhas.length, colunas: m.colunas, ignoradas: m.ignoradas, registros: m.registros.slice(0, 20), validos: m.registros.length, erros: m.erros.slice(0, 200) };
  }

  async importarPlanilha(buf: Buffer, nome: string, fonteId: string, usuario: Usuario) {
    const f = await this.fonte(fonteId);
    const { linhas, cabecalhos } = await lerPlanilha(buf, nome);
    const m = mapearLinhas(linhas, cabecalhos, { fonteId: f.id, mapeamento: (f.config as { mapeamento?: Record<string, string[]> }).mapeamento, setorPadrao: f.config.setorPadrao as string | undefined, tipoPadrao: f.config.tipoPadrao as string | undefined });
    const coleta = novaColeta(f.id, 'upload', usuario.id);
    coleta.avisos.push(`Arquivo: ${nome}`);
    for (const e of m.erros) (e.mensagem.startsWith('aviso:') ? coleta.avisos : coleta.erros).push(`Linha ${e.linha}: ${e.mensagem}`);
    coleta.descartados += m.erros.filter((e) => !e.mensagem.startsWith('aviso:')).length;
    const cfg = await this.s.configuracao();
    const res = await processarRegistros(m.registros, { porta: this.porta, fonte: f, coleta, config: cfg, por: usuario.id, origem: 'ingestao' });
    finalizarColeta(coleta);
    await this.s.repo.salvarColeta(coleta);
    await this.s.repo.salvarFonte({ ...f, ultimaColeta: coleta.finalizadaEm, ultimaColetaStatus: coleta.status === 'em_andamento' ? undefined : coleta.status });
    await this.s.auditar(usuario, 'importar_planilha', 'fonte', f.id, { arquivo: nome, coleta: coleta.id, criados: coleta.criados, atualizados: coleta.atualizados });
    return { coleta, empreendimentosAfetados: res.empreendimentosAfetados };
  }

  /** Processa um registro avulso (formulário manual) pelo mesmo pipeline (deduplicação incluída). */
  async registrarManual(r: RegistroNormalizado, usuario: Usuario, vincularA?: string) {
    const f = await this.fonte(r.fonteId);
    const coleta = novaColeta(f.id, 'manual', usuario.id);
    const cfg = await this.s.configuracao();
    const res = await processarRegistros([r], { porta: this.porta, fonte: f, coleta, config: cfg, por: usuario.id, origem: 'manual', vincularA, filtrarTensao: false });
    finalizarColeta(coleta);
    await this.s.repo.salvarColeta(coleta);
    await this.s.auditar(usuario, 'registro_manual', 'empreendimento', res.empreendimentosAfetados[0], { coleta: coleta.id });
    return { coleta, empreendimentosAfetados: res.empreendimentosAfetados, eventos: res.eventos };
  }

  /** Decisão manual sobre correspondência duvidosa. */
  async decidirMatch(id: string, acao: 'vincular' | 'novo' | 'descartar', usuario: Usuario, empreendimentoId?: string) {
    const m = await this.s.repo.obterMatch(id);
    if (!m) throw new ErroNegocio(404, 'Correspondência não encontrada');
    if (m.status !== 'pendente') throw new ErroNegocio(409, 'Correspondência já decidida');
    let resultado: unknown;
    if (acao === 'vincular' || acao === 'novo') {
      if (acao === 'vincular' && !empreendimentoId) throw new ErroNegocio(400, 'Informe o empreendimento a vincular');
      const f = (await this.s.repo.obterFonte(m.fonteId)) ?? (await this.fonte('manual'));
      const coleta = novaColeta(f.id, 'manual', usuario.id);
      const cfg = await this.s.configuracao();
      const reg = m.registro as RegistroNormalizado;
      if (acao === 'vincular') {
        resultado = await processarRegistros([reg], { porta: this.porta, fonte: f, coleta, config: cfg, por: usuario.id, origem: 'manual', vincularA: empreendimentoId, filtrarTensao: false });
      } else {
        // Força criação: decisão humana de que não há correspondência.
        const { criarEmpreendimentoDeRegistro } = await import('@radar/core');
        const orgs = await this.s.repo.listarOrganizacoes();
        const r = criarEmpreendimentoDeRegistro(reg, { fonte: f, organizacoes: orgs, por: usuario.id, origem: 'manual', fluxos: cfg.fluxos }, await this.porta.proximoCodigo());
        for (const o of r.organizacoesNovas) await this.s.repo.salvarOrganizacao(o);
        await this.s.salvarEmpreendimento(r.projeto, null, usuario, 'criar');
        resultado = { empreendimentoId: r.projeto.id };
      }
      finalizarColeta(coleta);
      await this.s.repo.salvarColeta(coleta);
    }
    const decidido: MatchCandidato = { ...m, status: acao === 'vincular' ? 'vinculado' : acao === 'novo' ? 'novo' : 'descartado', decididoPor: usuario.id, decididoEm: new Date().toISOString() };
    await this.s.repo.salvarMatch(decidido);
    await this.s.auditar(usuario, `match_${acao}`, 'match', id, { empreendimentoId });
    return { match: decidido, resultado };
  }

  /** Upload de documento: extrai texto e registra (análise por IA é solicitada à parte). */
  async receberDocumento(buf: Buffer, nome: string, meta: { titulo?: string; tipo: TipoDocumento; fonteId?: string; url?: string; dataPublicacao?: string; empreendimentoId?: string }, usuario: Usuario) {
    const texto = await extrairTextoDocumento(buf, nome);
    const existente = await this.s.repo.obterDocumentoPorHash(texto.hash);
    if (existente) return { documento: existente, duplicado: true, avisos: ['Documento idêntico já carregado anteriormente.'] };
    const doc: Documento = {
      id: novoId('doc'), titulo: meta.titulo?.trim() || nome, tipo: meta.tipo, fonteId: meta.fonteId, url: meta.url, mime: texto.mime,
      tamanhoBytes: buf.length, hash: texto.hash, textoExtraido: texto.texto, paginas: texto.totalPaginas, dataPublicacao: meta.dataPublicacao,
      carregadoEm: new Date().toISOString(), carregadoPor: usuario.id, empreendimentoIds: meta.empreendimentoId ? [meta.empreendimentoId] : [],
    };
    await this.s.repo.salvarDocumento(doc);
    await this.s.auditar(usuario, 'enviar_documento', 'documento', doc.id, { nome, paginas: texto.totalPaginas });
    return { documento: doc, duplicado: false, avisos: texto.avisos };
  }

  async analisarDocumento(id: string, usuario?: Pick<Usuario, 'id'>): Promise<ResultadoAnaliseDocumental> {
    const doc = await this.s.repo.obterDocumento(id);
    if (!doc) throw new ErroNegocio(404, 'Documento não encontrado');
    const amb = this.s.amb;
    const analise = await analisarDocumento(doc.textoExtraido ?? '', {
      titulo: doc.titulo,
      tipoDocumento: doc.tipo,
      hoje: hojeISO(),
      limiteCaracteres: amb.IA_LIMITE_CARACTERES,
      llm: { habilitado: !!amb.ANTHROPIC_API_KEY, apiKey: amb.ANTHROPIC_API_KEY, modelo: amb.IA_MODELO },
    });
    await this.s.repo.salvarDocumento({ ...doc, analise });
    if (usuario) await this.s.auditar(usuario, 'analisar_documento', 'documento', id, { metodo: analise.metodo, itens: analise.itens.length, descartados: analise.descartados.length });
    return analise;
  }

  /** Aplica itens aprovados da análise ao cadastro (novo ou vinculado), sempre como dado inferido. */
  async aplicarAnalise(id: string, sel: SelecaoAplicacao & { empreendimentoId?: string; fonteId?: string }, usuario: Usuario) {
    const doc = await this.s.repo.obterDocumento(id);
    if (!doc) throw new ErroNegocio(404, 'Documento não encontrado');
    const analise = doc.analise as ResultadoAnaliseDocumental | undefined;
    if (!analise || !Array.isArray((analise as ResultadoAnaliseDocumental).itens)) throw new ErroNegocio(409, 'Documento ainda não analisado');
    if (!sel.itens.length && !sel.marcos.length) throw new ErroNegocio(400, 'Selecione ao menos um item revisado');
    const fonteId = sel.fonteId ?? doc.fonteId ?? 'manual';
    const reg = registroDeAnalise(analise, sel, { id: doc.id, titulo: doc.titulo, url: doc.url, tipo: doc.tipo, dataPublicacao: doc.dataPublicacao, fonteId });
    const f = await this.fonte(fonteId);
    const coleta = novaColeta(f.id, 'upload', usuario.id);
    const cfg = await this.s.configuracao();
    const res = await processarRegistros([reg], { porta: this.porta, fonte: f, coleta, config: cfg, por: usuario.id, origem: 'ia', vincularA: sel.empreendimentoId, filtrarTensao: false });
    finalizarColeta(coleta);
    await this.s.repo.salvarColeta(coleta);
    const afetados = res.empreendimentosAfetados;
    await this.s.repo.salvarDocumento({ ...doc, empreendimentoIds: [...new Set([...doc.empreendimentoIds, ...afetados])] });
    await this.s.auditar(usuario, 'aplicar_extracao', 'documento', id, { itens: sel.itens.length, marcos: sel.marcos.length, empreendimentos: afetados });
    return { coleta, empreendimentosAfetados: afetados };
  }

  /** Fontes com coleta automática vencidas segundo a frequência configurada. */
  async fontesVencidas(): Promise<string[]> {
    const fontes = await this.s.repo.listarFontes();
    const agora = Date.now();
    return fontes
      .filter((f) => f.ativo && ADAPTADORES[f.adaptador] && f.statusIntegracao !== 'desativado')
      .filter((f) => {
        const dias = DIAS_FREQUENCIA[f.frequencia];
        if (!dias) return false;
        return !f.ultimaColeta || agora - Date.parse(f.ultimaColeta) >= dias * 86_400_000;
      })
      .map((f) => f.id);
  }
}
