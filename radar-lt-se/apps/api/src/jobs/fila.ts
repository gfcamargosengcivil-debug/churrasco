import type pg from 'pg';

export type TipoJob = 'coletar_fonte' | 'analisar_documento' | 'avaliar_janelas' | 'snapshot_pipeline';

export interface Job {
  id: string;
  tipo: TipoJob;
  payload: Record<string, unknown>;
  status: 'pendente' | 'executando' | 'concluido' | 'erro';
  tentativas: number;
  maxTentativas: number;
  executarEm: string;
  criadoEm: string;
  iniciadoEm?: string;
  finalizadoEm?: string;
  erro?: string;
  resultado?: unknown;
  chaveUnica?: string;
}

export interface OpcoesEnfileirar {
  chaveUnica?: string;
  executarEm?: string;
  maxTentativas?: number;
}

/** Fila de processamento assíncrono (coletas, extração documental, rotinas de alerta). */
export interface FilaJobs {
  enfileirar(tipo: TipoJob, payload: Record<string, unknown>, opcoes?: OpcoesEnfileirar): Promise<Job | undefined>;
  reservar(): Promise<Job | undefined>;
  concluir(id: string, resultado?: unknown): Promise<void>;
  /** Registra a falha; reagenda com atraso exponencial salvo se `definitivo` ou tentativas esgotadas. */
  falhar(id: string, erro: string, definitivo?: boolean): Promise<void>;
  listar(limite?: number): Promise<Job[]>;
}

/** Atraso exponencial entre tentativas: 1, 4, 9 … minutos. */
const atrasoMs = (tentativa: number) => tentativa * tentativa * 60_000;

export class FilaMemoria implements FilaJobs {
  private jobs: Job[] = [];
  private seq = 0;

  async enfileirar(tipo: TipoJob, payload: Record<string, unknown>, op: OpcoesEnfileirar = {}) {
    if (op.chaveUnica && this.jobs.some((j) => j.chaveUnica === op.chaveUnica && (j.status === 'pendente' || j.status === 'executando'))) return undefined;
    const job: Job = {
      id: String(++this.seq), tipo, payload, status: 'pendente', tentativas: 0, maxTentativas: op.maxTentativas ?? 3,
      executarEm: op.executarEm ?? new Date().toISOString(), criadoEm: new Date().toISOString(), chaveUnica: op.chaveUnica,
    };
    this.jobs.push(job);
    if (this.jobs.length > 1000) this.jobs = this.jobs.filter((j) => j.status === 'pendente' || j.status === 'executando').concat(this.jobs.slice(-500));
    return { ...job };
  }

  async reservar() {
    const agora = new Date().toISOString();
    const j = this.jobs.find((x) => x.status === 'pendente' && x.executarEm <= agora);
    if (!j) return undefined;
    j.status = 'executando';
    j.tentativas++;
    j.iniciadoEm = agora;
    return { ...j };
  }

  async concluir(id: string, resultado?: unknown) {
    const j = this.jobs.find((x) => x.id === id);
    if (j) Object.assign(j, { status: 'concluido', resultado, finalizadoEm: new Date().toISOString(), erro: undefined });
  }

  async falhar(id: string, erro: string, definitivo = false) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) return;
    j.erro = erro;
    if (!definitivo && j.tentativas < j.maxTentativas) {
      j.status = 'pendente';
      j.executarEm = new Date(Date.now() + atrasoMs(j.tentativas)).toISOString();
    } else {
      j.status = 'erro';
      j.finalizadoEm = new Date().toISOString();
    }
  }

  async listar(limite = 100) {
    return [...this.jobs].reverse().slice(0, limite).map((j) => ({ ...j }));
  }
}

function linhaParaJob(r: Record<string, any>): Job {
  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : (d as string | undefined) ?? undefined);
  return {
    id: String(r.id), tipo: r.tipo, payload: r.payload, status: r.status, tentativas: r.tentativas, maxTentativas: r.max_tentativas,
    executarEm: iso(r.executar_em)!, criadoEm: iso(r.criado_em)!, iniciadoEm: iso(r.iniciado_em), finalizadoEm: iso(r.finalizado_em),
    erro: r.erro ?? undefined, resultado: r.resultado ?? undefined, chaveUnica: r.chave_unica ?? undefined,
  };
}

/** Fila em tabela PostgreSQL com reserva concorrente segura (FOR UPDATE SKIP LOCKED). */
export class FilaPostgres implements FilaJobs {
  constructor(private pool: pg.Pool) {}

  async enfileirar(tipo: TipoJob, payload: Record<string, unknown>, op: OpcoesEnfileirar = {}) {
    const r = await this.pool.query(
      `insert into job (tipo, payload, max_tentativas, executar_em, chave_unica)
       values ($1, $2, $3, coalesce($4::timestamptz, now()), $5)
       on conflict do nothing returning *`,
      [tipo, payload, op.maxTentativas ?? 3, op.executarEm ?? null, op.chaveUnica ?? null],
    );
    return r.rows[0] ? linhaParaJob(r.rows[0]) : undefined;
  }

  async reservar() {
    const r = await this.pool.query(
      `update job set status = 'executando', tentativas = tentativas + 1, iniciado_em = now()
       where id = (select id from job where status = 'pendente' and executar_em <= now()
                   order by executar_em, id for update skip locked limit 1)
       returning *`,
    );
    return r.rows[0] ? linhaParaJob(r.rows[0]) : undefined;
  }

  async concluir(id: string, resultado?: unknown) {
    await this.pool.query(`update job set status = 'concluido', resultado = $2, erro = null, finalizado_em = now() where id = $1`, [id, resultado === undefined ? null : JSON.stringify(resultado)]);
  }

  async falhar(id: string, erro: string, definitivo = false) {
    await this.pool.query(
      `update job set erro = $2,
         status = case when not $3 and tentativas < max_tentativas then 'pendente' else 'erro' end,
         executar_em = case when not $3 and tentativas < max_tentativas then now() + (tentativas * tentativas) * interval '1 minute' else executar_em end,
         finalizado_em = case when not $3 and tentativas < max_tentativas then null else now() end
       where id = $1`,
      [id, erro.slice(0, 4000), definitivo],
    );
  }

  async listar(limite = 100) {
    const r = await this.pool.query('select * from job order by id desc limit $1', [limite]);
    return r.rows.map(linhaParaJob);
  }
}
