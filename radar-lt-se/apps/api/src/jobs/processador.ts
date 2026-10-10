import type { FastifyBaseLogger } from 'fastify';
import { hojeISO } from '@radar/core';
import type { Servicos } from '../servicos/dominio.js';
import type { ServicoIngestao } from '../servicos/ingestao.js';
import type { FilaJobs, Job, TipoJob } from './fila.js';

export type Manipulador = (job: Job) => Promise<unknown>;

export function criarManipuladores(s: Servicos, ing: ServicoIngestao): Record<TipoJob, Manipulador> {
  return {
    coletar_fonte: async (job) => {
      const { fonteId, usuario, disparo } = job.payload as { fonteId: string; usuario?: string; disparo?: 'agendado' | 'manual' };
      const c = await ing.executarFonte(fonteId, disparo ?? 'agendado', usuario);
      if (c.status === 'erro') throw new Error(c.erros.join(' | ').slice(0, 1000));
      return { coleta: c.id, status: c.status, criados: c.criados, atualizados: c.atualizados };
    },
    analisar_documento: async (job) => {
      const { documentoId, usuario } = job.payload as { documentoId: string; usuario?: string };
      const r = await ing.analisarDocumento(documentoId, usuario ? { id: usuario } : undefined);
      return { metodo: r.metodo, itens: r.itens.length, descartados: r.descartados.length };
    },
    avaliar_janelas: async () => s.rotinaJanelas(),
    snapshot_pipeline: async () => s.snapshotPipeline(),
  };
}

export async function processarProximo(fila: FilaJobs, manip: Record<TipoJob, Manipulador>, log: FastifyBaseLogger): Promise<boolean> {
  const job = await fila.reservar();
  if (!job) return false;
  const inicio = Date.now();
  try {
    const resultado = await manip[job.tipo](job);
    await fila.concluir(job.id, resultado);
    log.info({ job: job.id, tipo: job.tipo, ms: Date.now() - inicio }, 'job concluído');
  } catch (e) {
    await fila.falhar(job.id, (e as Error).message);
    log.error({ job: job.id, tipo: job.tipo, tentativa: job.tentativas, err: (e as Error).message }, 'job falhou');
  }
  return true;
}

/** Loop de processamento da fila. Retorna função para parar. */
export function iniciarProcessamento(fila: FilaJobs, manip: Record<TipoJob, Manipulador>, log: FastifyBaseLogger, intervaloMs = 2000) {
  let ativo = true;
  let emExecucao = false;
  const tick = async () => {
    if (!ativo || emExecucao) return;
    emExecucao = true;
    try {
      while (ativo && (await processarProximo(fila, manip, log)));
    } catch (e) {
      log.error({ err: (e as Error).message }, 'erro no loop da fila');
    } finally {
      emExecucao = false;
    }
  };
  const t = setInterval(tick, intervaloMs);
  void tick();
  return () => {
    ativo = false;
    clearInterval(t);
  };
}

/**
 * Agendador: enfileira coletas vencidas (pela frequência de cada fonte), a rotina diária de
 * janelas de contratação e o retrato mensal do pipeline. Chaves únicas evitam duplicidade
 * mesmo com vários processos.
 */
export function iniciarAgendador(ing: ServicoIngestao, fila: FilaJobs, log: FastifyBaseLogger, intervaloMs = 60_000) {
  const ciclo = async () => {
    try {
      for (const fonteId of await ing.fontesVencidas()) {
        await fila.enfileirar('coletar_fonte', { fonteId, disparo: 'agendado' }, { chaveUnica: `coletar:${fonteId}` });
      }
      const hoje = hojeISO();
      await fila.enfileirar('avaliar_janelas', {}, { chaveUnica: `janelas:${hoje}` });
      await fila.enfileirar('snapshot_pipeline', {}, { chaveUnica: `snapshot:${hoje.slice(0, 7)}` });
    } catch (e) {
      log.error({ err: (e as Error).message }, 'erro no agendador');
    }
  };
  const t = setInterval(ciclo, intervaloMs);
  void ciclo();
  return () => clearInterval(t);
}
