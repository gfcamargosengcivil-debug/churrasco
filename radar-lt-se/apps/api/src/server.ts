import './env.js';
import { construirApp } from './app.js';
import { carregarConfig } from './config.js';
import { criarManipuladores, iniciarAgendador, iniciarProcessamento } from './jobs/processador.js';

const amb = carregarConfig();
const { app, servicos, ingestao, fila } = await construirApp({ amb });

const paradas: (() => void)[] = [];
if (amb.PERSISTENCIA === 'memoria') {
  // No modo memória a fila vive no processo da API.
  paradas.push(iniciarProcessamento(fila, criarManipuladores(servicos, ingestao), app.log));
  if (amb.AGENDADOR) paradas.push(iniciarAgendador(ingestao, fila, app.log));
} else {
  app.log.info('Modo PostgreSQL: execute o worker (npm run worker) para processar coletas, documentos e alertas.');
}

if (amb.AUTH_MODE === 'dev') app.log.warn('AUTH_MODE=dev: API SEM autenticação (somente para desenvolvimento).');

const encerrar = async (sinal: string) => {
  app.log.info({ sinal }, 'encerrando');
  for (const p of paradas) p();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void encerrar('SIGINT'));
process.on('SIGTERM', () => void encerrar('SIGTERM'));

await app.listen({ port: amb.PORT, host: amb.HOST });
