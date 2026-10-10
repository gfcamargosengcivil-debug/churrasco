import type {
  AlertaNotificacao, AlertaRegra, AuditLog, Coleta, ConfiguracaoPlataforma, Documento, Empreendimento, EventoMudanca,
  Fonte, MatchCandidato, OportunidadeComercial, Organizacao,
} from '@radar/core';

export interface FiltroEventos {
  desde?: string;
  empreendimentoId?: string;
  limite?: number;
}

export interface FiltroDocumentos {
  tipo?: Documento['tipo'];
  empreendimentoId?: string;
  limite?: number;
}

/**
 * Interface única de persistência. Implementações: MemoryRepository (arquivo JSON local) e
 * PgRepository (PostgreSQL/PostGIS). Toda a lógica de negócio fica fora do repositório.
 */
export interface Repositorio {
  readonly tipo: 'memoria' | 'postgres';

  listarEmpreendimentos(): Promise<Empreendimento[]>;
  obterEmpreendimento(id: string): Promise<Empreendimento | undefined>;
  salvarEmpreendimento(p: Empreendimento): Promise<void>;
  excluirEmpreendimento(id: string): Promise<void>;
  proximoSequencial(): Promise<number>;

  listarOrganizacoes(): Promise<Organizacao[]>;
  obterOrganizacao(id: string): Promise<Organizacao | undefined>;
  salvarOrganizacao(o: Organizacao): Promise<void>;

  listarFontes(): Promise<Fonte[]>;
  obterFonte(id: string): Promise<Fonte | undefined>;
  salvarFonte(f: Fonte): Promise<void>;

  salvarColeta(c: Coleta): Promise<void>;
  listarColetas(filtro?: { fonteId?: string; limite?: number }): Promise<Coleta[]>;

  salvarDocumento(d: Documento): Promise<void>;
  obterDocumento(id: string): Promise<Documento | undefined>;
  obterDocumentoPorHash(hash: string): Promise<Documento | undefined>;
  listarDocumentos(filtro?: FiltroDocumentos): Promise<Documento[]>;

  salvarMatch(m: MatchCandidato): Promise<void>;
  obterMatch(id: string): Promise<MatchCandidato | undefined>;
  listarMatches(status?: MatchCandidato['status']): Promise<MatchCandidato[]>;

  salvarEventos(e: EventoMudanca[]): Promise<void>;
  listarEventos(filtro?: FiltroEventos): Promise<EventoMudanca[]>;

  listarRegras(): Promise<AlertaRegra[]>;
  salvarRegra(r: AlertaRegra): Promise<void>;
  excluirRegra(id: string): Promise<void>;
  salvarNotificacoes(n: AlertaNotificacao[]): Promise<void>;
  listarNotificacoes(filtro?: { lido?: boolean; limite?: number }): Promise<AlertaNotificacao[]>;
  marcarNotificacao(id: string, lido: boolean): Promise<void>;

  listarOportunidades(): Promise<OportunidadeComercial[]>;
  obterOportunidade(id: string): Promise<OportunidadeComercial | undefined>;
  salvarOportunidade(o: OportunidadeComercial): Promise<void>;

  obterConfiguracao(): Promise<Partial<ConfiguracaoPlataforma> | null>;
  salvarConfiguracao(c: ConfiguracaoPlataforma, por: string): Promise<void>;

  registrarAuditoria(a: AuditLog): Promise<void>;
  listarAuditoria(limite?: number): Promise<AuditLog[]>;

  salvarSnapshot(data: string, dados: unknown): Promise<void>;
  listarSnapshots(): Promise<{ data: string; dados: unknown }[]>;

  /** Remove todos os registros demonstrativos (demo=true). */
  removerDemo(): Promise<{ empreendimentos: number; organizacoes: number }>;
  fechar(): Promise<void>;
}
