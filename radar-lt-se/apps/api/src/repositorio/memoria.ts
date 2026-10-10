import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  AlertaNotificacao, AlertaRegra, AuditLog, Coleta, ConfiguracaoPlataforma, Documento, Empreendimento, EventoMudanca,
  Fonte, MatchCandidato, OportunidadeComercial, Organizacao,
} from '@radar/core';
import type { FiltroDocumentos, FiltroEventos, Repositorio } from './tipos.js';

interface Dados {
  versao: 1;
  sequencial: number;
  empreendimentos: Empreendimento[];
  organizacoes: Organizacao[];
  fontes: Fonte[];
  coletas: Coleta[];
  documentos: Documento[];
  matches: MatchCandidato[];
  eventos: EventoMudanca[];
  regras: AlertaRegra[];
  notificacoes: AlertaNotificacao[];
  oportunidades: OportunidadeComercial[];
  configuracao: ConfiguracaoPlataforma | null;
  auditoria: AuditLog[];
  snapshots: { data: string; dados: unknown }[];
}

const vazio = (): Dados => ({
  versao: 1,
  sequencial: 0,
  empreendimentos: [],
  organizacoes: [],
  fontes: [],
  coletas: [],
  documentos: [],
  matches: [],
  eventos: [],
  regras: [],
  notificacoes: [],
  oportunidades: [],
  configuracao: null,
  auditoria: [],
  snapshots: [],
});

const clonar = <T>(x: T): T => structuredClone(x);

function upsert<T extends { id: string }>(lista: T[], item: T) {
  const i = lista.findIndex((x) => x.id === item.id);
  if (i >= 0) lista[i] = clonar(item);
  else lista.push(clonar(item));
}

/**
 * Repositório em memória com persistência opcional em arquivo JSON (gravação atômica,
 * agrupada). Adequado para demonstração e desenvolvimento local; para produção use PostgreSQL.
 */
export class MemoryRepository implements Repositorio {
  readonly tipo = 'memoria' as const;
  private d: Dados;
  private temporizador?: NodeJS.Timeout;

  constructor(private arquivo?: string) {
    this.d = vazio();
    if (arquivo && existsSync(arquivo)) {
      this.d = { ...vazio(), ...(JSON.parse(readFileSync(arquivo, 'utf8')) as Dados) };
    }
  }

  private persistir() {
    if (!this.arquivo) return;
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.gravarAgora(), 200);
  }

  gravarAgora() {
    if (!this.arquivo) return;
    clearTimeout(this.temporizador);
    mkdirSync(dirname(this.arquivo), { recursive: true });
    const tmp = `${this.arquivo}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.d));
    renameSync(tmp, this.arquivo);
  }

  async listarEmpreendimentos() { return clonar(this.d.empreendimentos); }
  async obterEmpreendimento(id: string) { return clonar(this.d.empreendimentos.find((p) => p.id === id)); }
  async salvarEmpreendimento(p: Empreendimento) {
    upsert(this.d.empreendimentos, p);
    const seq = Number(p.codigo.replace(/\D/g, ''));
    if (Number.isFinite(seq) && seq > this.d.sequencial) this.d.sequencial = seq;
    this.persistir();
  }
  async excluirEmpreendimento(id: string) {
    this.d.empreendimentos = this.d.empreendimentos.filter((p) => p.id !== id);
    this.d.oportunidades = this.d.oportunidades.filter((o) => o.empreendimentoId !== id);
    this.d.eventos = this.d.eventos.filter((e) => e.empreendimentoId !== id);
    this.persistir();
  }
  async proximoSequencial() {
    this.d.sequencial++;
    this.persistir();
    return this.d.sequencial;
  }

  async listarOrganizacoes() { return clonar(this.d.organizacoes); }
  async obterOrganizacao(id: string) { return clonar(this.d.organizacoes.find((o) => o.id === id)); }
  async salvarOrganizacao(o: Organizacao) { upsert(this.d.organizacoes, o); this.persistir(); }

  async listarFontes() { return clonar(this.d.fontes); }
  async obterFonte(id: string) { return clonar(this.d.fontes.find((f) => f.id === id)); }
  async salvarFonte(f: Fonte) { upsert(this.d.fontes, f); this.persistir(); }

  async salvarColeta(c: Coleta) {
    upsert(this.d.coletas, c);
    if (this.d.coletas.length > 2000) this.d.coletas = this.d.coletas.slice(-2000);
    this.persistir();
  }
  async listarColetas(filtro: { fonteId?: string; limite?: number } = {}) {
    return clonar(
      this.d.coletas
        .filter((c) => !filtro.fonteId || c.fonteId === filtro.fonteId)
        .sort((a, b) => (a.iniciadaEm < b.iniciadaEm ? 1 : -1))
        .slice(0, filtro.limite ?? 100),
    );
  }

  async salvarDocumento(d: Documento) { upsert(this.d.documentos, d); this.persistir(); }
  async obterDocumento(id: string) { return clonar(this.d.documentos.find((d) => d.id === id)); }
  async obterDocumentoPorHash(hash: string) { return clonar(this.d.documentos.find((d) => d.hash === hash)); }
  async listarDocumentos(filtro: FiltroDocumentos = {}) {
    return clonar(
      this.d.documentos
        .filter((d) => !filtro.tipo || d.tipo === filtro.tipo)
        .filter((d) => !filtro.empreendimentoId || d.empreendimentoIds.includes(filtro.empreendimentoId))
        .sort((a, b) => (a.carregadoEm < b.carregadoEm ? 1 : -1))
        .slice(0, filtro.limite ?? 200)
        .map((d) => ({ ...d, textoExtraido: d.textoExtraido && d.textoExtraido.length > 2000 ? d.textoExtraido.slice(0, 2000) + '…' : d.textoExtraido })),
    );
  }

  async salvarMatch(m: MatchCandidato) { upsert(this.d.matches, m); this.persistir(); }
  async obterMatch(id: string) { return clonar(this.d.matches.find((m) => m.id === id)); }
  async listarMatches(status?: MatchCandidato['status']) {
    return clonar(this.d.matches.filter((m) => !status || m.status === status).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1)));
  }

  async salvarEventos(e: EventoMudanca[]) {
    for (const ev of e) upsert(this.d.eventos, ev);
    if (this.d.eventos.length > 20000) this.d.eventos = this.d.eventos.slice(-20000);
    this.persistir();
  }
  async listarEventos(filtro: FiltroEventos = {}) {
    return clonar(
      this.d.eventos
        .filter((e) => !filtro.desde || e.em >= filtro.desde)
        .filter((e) => !filtro.empreendimentoId || e.empreendimentoId === filtro.empreendimentoId)
        .sort((a, b) => (a.em < b.em ? 1 : -1))
        .slice(0, filtro.limite ?? 500),
    );
  }

  async listarRegras() { return clonar(this.d.regras); }
  async salvarRegra(r: AlertaRegra) { upsert(this.d.regras, r); this.persistir(); }
  async excluirRegra(id: string) {
    this.d.regras = this.d.regras.filter((r) => r.id !== id);
    this.d.notificacoes = this.d.notificacoes.filter((n) => n.regraId !== id);
    this.persistir();
  }
  async salvarNotificacoes(n: AlertaNotificacao[]) {
    for (const x of n) {
      if (!this.d.notificacoes.some((y) => y.regraId === x.regraId && y.eventoId === x.eventoId && y.canal === x.canal)) this.d.notificacoes.push(clonar(x));
    }
    this.persistir();
  }
  async listarNotificacoes(filtro: { lido?: boolean; limite?: number } = {}) {
    return clonar(
      this.d.notificacoes
        .filter((n) => filtro.lido === undefined || n.lido === filtro.lido)
        .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1))
        .slice(0, filtro.limite ?? 300),
    );
  }
  async marcarNotificacao(id: string, lido: boolean) {
    const n = this.d.notificacoes.find((x) => x.id === id);
    if (n) n.lido = lido;
    this.persistir();
  }

  async listarOportunidades() { return clonar(this.d.oportunidades); }
  async obterOportunidade(id: string) { return clonar(this.d.oportunidades.find((o) => o.id === id)); }
  async salvarOportunidade(o: OportunidadeComercial) { upsert(this.d.oportunidades, o); this.persistir(); }

  async obterConfiguracao() { return clonar(this.d.configuracao); }
  async salvarConfiguracao(c: ConfiguracaoPlataforma) { this.d.configuracao = clonar(c); this.persistir(); }

  async registrarAuditoria(a: AuditLog) {
    this.d.auditoria.push(clonar(a));
    if (this.d.auditoria.length > 20000) this.d.auditoria = this.d.auditoria.slice(-20000);
    this.persistir();
  }
  async listarAuditoria(limite = 300) { return clonar([...this.d.auditoria].reverse().slice(0, limite)); }

  async salvarSnapshot(data: string, dados: unknown) {
    this.d.snapshots = [...this.d.snapshots.filter((s) => s.data !== data), { data, dados }].sort((a, b) => (a.data < b.data ? -1 : 1));
    this.persistir();
  }
  async listarSnapshots() { return clonar(this.d.snapshots); }

  async removerDemo() {
    const ids = new Set(this.d.empreendimentos.filter((p) => p.demo).map((p) => p.id));
    const orgs = this.d.organizacoes.filter((o) => o.demo).length;
    this.d.empreendimentos = this.d.empreendimentos.filter((p) => !p.demo);
    this.d.organizacoes = this.d.organizacoes.filter((o) => !o.demo);
    this.d.oportunidades = this.d.oportunidades.filter((o) => !o.demo && !ids.has(o.empreendimentoId));
    this.d.eventos = this.d.eventos.filter((e) => !e.demo && !ids.has(e.empreendimentoId));
    this.d.notificacoes = this.d.notificacoes.filter((n) => !ids.has(n.empreendimentoId));
    this.d.matches = this.d.matches.filter((m) => m.fonteId !== 'demo');
    this.d.documentos = this.d.documentos.filter((d) => d.fonteId !== 'demo');
    this.d.regras = this.d.regras.filter((r) => r.criadoPor !== 'demo');
    this.persistir();
    return { empreendimentos: ids.size, organizacoes: orgs };
  }

  async fechar() { this.gravarAgora(); }
}
