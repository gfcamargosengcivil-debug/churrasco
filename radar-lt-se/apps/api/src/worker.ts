/**
 * Worker de processamento assíncrono (modo PostgreSQL): coleta de fontes, análise documental,
 * rotina diária de janelas/alertas e retrato mensal do pipeline. Pode haver várias réplicas:
 * a reserva de jobs usa FOR UPDATE SKIP LOCKED e o agendamento usa chaves únicas.
 */
import './env.js';
import pino from 'pino';
import { carregarConfig } from './config.js';
import { criarRepositorio } from './app.js';
import { criarManipuladores, iniciarAgendador, iniciarProcessamento } from './jobs/processador.js';
import { Servicos } from './servicos/dominio.js';
import { ServicoIngestao } from './servicos/ingestao.js';

const amb = { ...carregarConfig(), DEMO_AUTOCARGA: false };
const log = pino({ level: amb.LOG_LEVEL, name: 'radar-worker' });
const { repo, fila } = await criarRepositorio(amb);
const servicos = new Servicos(repo, fila, amb, log as never);
const ingestao = new ServicoIngestao(servicos);
await servicos.inicializar();

const pararFila = iniciarProcessamento(fila, criarManipuladores(servicos, ingestao), log as never, 3000);
const pararAgenda = amb.AGENDADOR ? iniciarAgendador(ingestao, fila, log as never) : () => undefined;
log.info({ persistencia: repo.tipo }, 'worker iniciado');

const encerrar = async () => {
  pararFila();
  pararAgenda();
  await repo.fechar();
  process.exit(0);
};
process.on('SIGINT', () => void encerrar());
process.on('SIGTERM', () => void encerrar());
