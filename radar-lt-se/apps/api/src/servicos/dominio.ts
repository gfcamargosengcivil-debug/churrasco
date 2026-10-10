import type { FastifyBaseLogger } from 'fastify';
import {
  EmpreendimentoSchema, agoraISO, avaliarEmpreendimento, detectarMudancas, eventoJanelaProxima, hojeISO, jsonEstavel,
  mesclarConfiguracao, novoId, regraAplica, type AlertaNotificacao, type ConfiguracaoPlataforma, type Empreendimento,
  type EventoMudanca, type Fonte, type OportunidadeComercial, type Organizacao, type VisaoEmpreendimento,
} from '@radar/core';
import { CATALOGO_FONTES } from '@radar/ingestion';
import type { ConfigAmbiente } from '../config.js';
import type { FilaJobs } from '../jobs/fila.js';
import type { Repositorio } from '../repositorio/tipos.js';
import { gerarDemo } from '../seed/demo.js';

export interface Usuario {
  id: string;
  email?: string;
  nome?: string;
  papel: 'admin' | 'analista' | 'comercial' | 'leitor';
}

export class ErroNegocio extends Error {
  constructor(public status: number, mensagem: string, public detalhes?: unknown) {
    super(mensagem);
  }
}

/** Serviços de domínio compartilhados pelas rotas, pelo agendador e pelo worker. */
export class Servicos {
  private configCache?: ConfiguracaoPlataforma;
  private cacheVisoes = new Map<string, { chave: string; visao: VisaoEmpreendimento }>();

  constructor(
    public repo: Repositorio,
    public fila: FilaJobs,
    public amb: ConfigAmbiente,
    public log: FastifyBaseLogger,
  ) {}

  /** Garante catálogo de fontes atualizado (preservando configuração local) e carga demo opcional. */
  async inicializar() {
    const existentes = new Map((await this.repo.listarFontes()).map((f) => [f.id, f]));
    for (const f of CATALOGO_FONTES) {
      const atual = existentes.get(f.id);
      await this.repo.salvarFonte(
        atual
          ? { ...f, config: { ...f.config, ...atual.config }, ativo: atual.ativo, ultimaColeta: atual.ultimaColeta, ultimaColetaStatus: atual.ultimaColetaStatus }
          : f,
      );
    }
    if (this.amb.DEMO_AUTOCARGA && (await this.repo.listarEmpreendimentos()).length === 0) {
      await this.carregarDemo('sistema');
      this.log.warn('Base vazia: dados DEMONSTRATIVOS FICTÍCIOS carregados (DEMO_AUTOCARGA=true).');
    }
  }

  async configuracao(): Promise<ConfiguracaoPlataforma> {
    if (!this.configCache) this.configCache = mesclarConfiguracao(await this.repo.obterConfiguracao());
    return this.configCache;
  }

  async salvarConfiguracao(c: ConfiguracaoPlataforma, usuario: Usuario) {
    const nova = mesclarConfiguracao(c);
    await this.repo.salvarConfiguracao(nova, usuario.id);
    this.configCache = nova;
    this.cacheVisoes.clear();
    await this.auditar(usuario, 'atualizar', 'configuracao', undefined, { versoes: { score: nova.score.versao, previsao: nova.previsao.versao, mercado: nova.mercado.versao } });
    return nova;
  }

  async fontesMap(): Promise<Map<string, Fonte>> {
    return new Map((await this.repo.listarFontes()).map((f) => [f.id, f]));
  }

  /** Visões calculadas (previsão, mercado, score, qualidade) com cache por versão dos dados. */
  async visoes(projetos?: Empreendimento[]): Promise<VisaoEmpreendimento[]> {
    const lista = projetos ?? (await this.repo.listarEmpreendimentos());
    const [cfg, fontes, ops] = await Promise.all([this.configuracao(), this.fontesMap(), this.repo.listarOportunidades()]);
    const opsPorEmp = new Map(ops.map((o) => [o.empreendimentoId, o]));
    const hoje = hojeISO();
    const versaoCfg = `${cfg.previsao.versao}|${cfg.score.versao}|${cfg.mercado.versao}|${jsonEstavel(cfg).length}`;
    return lista.map((p) => {
      const op = opsPorEmp.get(p.id);
      const chave = `${p.atualizadoEm}|${op?.atualizadoEm ?? ''}|${hoje}|${versaoCfg}`;
      const c = this.cacheVisoes.get(p.id);
      if (c && c.chave === chave) return c.visao;
      const visao = avaliarEmpreendimento(p, { config: cfg, fontes, oportunidades: opsPorEmp, hoje });
      this.cacheVisoes.set(p.id, { chave, visao });
      return visao;
    });
  }

  async visao(id: string): Promise<VisaoEmpreendimento | undefined> {
    const p = await this.repo.obterEmpreendimento(id);
    return p ? (await this.visoes([p]))[0] : undefined;
  }

  async auditar(u: Pick<Usuario, 'id'>, acao: string, entidade: string, entidadeId?: string, detalhes: Record<string, unknown> = {}) {
    await this.repo.registrarAuditoria({ id: novoId('aud'), em: agoraISO(), usuario: u.id, acao, entidade, entidadeId, detalhes });
  }

  /**
   * Persiste um empreendimento validado, registra eventos de mudança e dispara alertas.
   * `antes` = versão anterior (null para criação).
   */
  async salvarEmpreendimento(depois: Empreendimento, antes: Empreendimento | null, usuario: Pick<Usuario, 'id'>, acao = 'atualizar'): Promise<EventoMudanca[]> {
    const valido = EmpreendimentoSchema.safeParse(depois);
    if (!valido.success) throw new ErroNegocio(422, 'Empreendimento inválido', valido.error.issues);
    await this.repo.salvarEmpreendimento(valido.data);
    this.cacheVisoes.delete(depois.id);
    const cfg = await this.configuracao();
    const orgs = new Map((await this.repo.listarOrganizacoes()).map((o) => [o.id, o]));
    const eventos = detectarMudancas(antes, valido.data, { etapas: cfg.etapas, nomeOrganizacao: (id) => orgs.get(id)?.nome });
    if (eventos.length) await this.registrarEventos(eventos);
    await this.auditar(usuario, acao, 'empreendimento', depois.id, { eventos: eventos.map((e) => e.tipo) });
    return eventos;
  }

  async registrarEventos(eventos: EventoMudanca[]) {
    if (!eventos.length) return;
    await this.repo.salvarEventos(eventos);
    await this.avaliarAlertas(eventos);
  }

  /** Avalia regras de alerta para os eventos e cria notificações (app; e-mail registra pendência sem SMTP). */
  async avaliarAlertas(eventos: EventoMudanca[]) {
    const regras = (await this.repo.listarRegras()).filter((r) => r.ativo);
    if (!regras.length) return;
    const cfg = await this.configuracao();
    const fontes = await this.fontesMap();
    const hoje = hojeISO();
    const notifs: AlertaNotificacao[] = [];
    const cacheProj = new Map<string, Empreendimento | undefined>();
    for (const e of eventos) {
      if (!cacheProj.has(e.empreendimentoId)) cacheProj.set(e.empreendimentoId, await this.repo.obterEmpreendimento(e.empreendimentoId));
      const p = cacheProj.get(e.empreendimentoId);
      if (!p) continue;
      const prev = avaliarEmpreendimento(p, { config: cfg, fontes, hoje }).previsao;
      for (const r of regras) {
        if (!regraAplica(r, e, p, prev, hoje)) continue;
        for (const canal of r.canais) {
          notifs.push({
            id: novoId('ntf'), regraId: r.id, eventoId: e.id, empreendimentoId: p.id, criadoEm: agoraISO(), lido: false, canal,
            entregue: canal === 'app',
            erroEntrega: canal === 'email' ? (this.amb.SMTP_URL ? 'Envio de e-mail ainda não implementado (pendente).' : 'SMTP não configurado (SMTP_URL).') : undefined,
          });
        }
      }
    }
    if (notifs.length) await this.repo.salvarNotificacoes(notifs);
  }

  /** Rotina diária: gera eventos de "janela de contratação próxima" para regras com horizonte. */
  async rotinaJanelas() {
    const regras = (await this.repo.listarRegras()).filter((r) => r.ativo && r.filtros.janelaContratacaoMeses);
    if (!regras.length) return { eventos: 0 };
    const horizonte = Math.max(...regras.map((r) => r.filtros.janelaContratacaoMeses!));
    const projetos = await this.repo.listarEmpreendimentos();
    const visoes = await this.visoes(projetos);
    const recentes = await this.repo.listarEventos({ desde: new Date(Date.now() - 30 * 86_400_000).toISOString(), limite: 5000 });
    const eventos: EventoMudanca[] = [];
    for (const v of visoes) {
      const p = projetos.find((x) => x.id === v.id)!;
      const ev = eventoJanelaProxima(p, v.previsao, horizonte, agoraISO());
      if (!ev) continue;
      const jaAvisado = recentes.some((r) => r.empreendimentoId === p.id && r.tipo === 'janela_contratacao_proxima' && (r.dados as { data?: string }).data === (ev.dados as { data?: string }).data);
      if (!jaAvisado) eventos.push(ev);
    }
    await this.registrarEventos(eventos);
    return { eventos: eventos.length };
  }

  async snapshotPipeline() {
    const visoes = await this.visoes();
    const ativos = visoes.filter((v) => v.statusGeral !== 'cancelado' && v.statusGeral !== 'concluido');
    const dados = {
      total: ativos.length,
      central: ativos.reduce((s, v) => s + (v.mercado.central ?? 0), 0),
      porEtapa: Object.fromEntries([...new Set(ativos.map((v) => v.etapa?.id ?? 'sem_etapa'))].map((e) => [e, ativos.filter((v) => (v.etapa?.id ?? 'sem_etapa') === e).length])),
    };
    await this.repo.salvarSnapshot(hojeISO(), dados);
    return dados;
  }

  async carregarDemo(usuario: string) {
    const pacote = gerarDemo(hojeISO(), 0);
    const existentes = new Set((await this.repo.listarEmpreendimentos()).map((p) => p.id));
    for (const o of pacote.organizacoes) await this.repo.salvarOrganizacao(o);
    let seq = await this.repo.proximoSequencial();
    for (const p of pacote.empreendimentos) {
      if (existentes.has(p.id)) continue;
      await this.repo.salvarEmpreendimento({ ...p, codigo: `RLT-${String(seq++).padStart(6, '0')}` });
    }
    for (const o of pacote.oportunidades) await this.repo.salvarOportunidade(o);
    for (const r of pacote.regras) await this.repo.salvarRegra(r);
    for (const d of pacote.documentos) await this.repo.salvarDocumento(d);
    for (const m of pacote.matches) await this.repo.salvarMatch(m);
    await this.repo.salvarEventos(pacote.eventos);
    const recentes = pacote.eventos.filter((e) => e.em >= new Date(Date.now() - 60 * 86_400_000).toISOString());
    await this.avaliarAlertas(recentes);
    this.cacheVisoes.clear();
    await this.auditar({ id: usuario }, 'carregar_demo', 'sistema', undefined, { empreendimentos: pacote.empreendimentos.length });
    return { empreendimentos: pacote.empreendimentos.length, organizacoes: pacote.organizacoes.length };
  }

  async removerDemo(usuario: Usuario) {
    const r = await this.repo.removerDemo();
    this.cacheVisoes.clear();
    await this.auditar(usuario, 'remover_demo', 'sistema', undefined, r);
    return r;
  }

  async organizacoesMap(): Promise<Map<string, Organizacao>> {
    return new Map((await this.repo.listarOrganizacoes()).map((o) => [o.id, o]));
  }

  async oportunidadeDe(empreendimentoId: string): Promise<OportunidadeComercial | undefined> {
    return (await this.repo.listarOportunidades()).find((o) => o.empreendimentoId === empreendimentoId);
  }
}
