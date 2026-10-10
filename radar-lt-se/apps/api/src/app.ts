import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { criarVerificador } from './auth.js';
import type { ConfigAmbiente } from './config.js';
import { FilaMemoria, type FilaJobs } from './jobs/fila.js';
import { MemoryRepository } from './repositorio/memoria.js';
import type { Repositorio } from './repositorio/tipos.js';
import { rotasAdmin } from './rotas/admin.js';
import { rotasAnalises } from './rotas/analises.js';
import { rotasComercial } from './rotas/comercial.js';
import { rotasEmpreendimentos } from './rotas/empreendimentos.js';
import { rotasFontes } from './rotas/fontes.js';
import { ErroNegocio, Servicos } from './servicos/dominio.js';
import { ServicoIngestao } from './servicos/ingestao.js';

export interface OpcoesApp {
  amb: ConfigAmbiente;
  repo?: Repositorio;
  fila?: FilaJobs;
  logger?: boolean;
}

export interface AppMontado {
  app: FastifyInstance;
  servicos: Servicos;
  ingestao: ServicoIngestao;
  fila: FilaJobs;
  repo: Repositorio;
}

export async function criarRepositorio(amb: ConfigAmbiente): Promise<{ repo: Repositorio; fila: FilaJobs }> {
  if (amb.PERSISTENCIA === 'postgres') {
    const { PgRepository, criarPool } = await import('./repositorio/postgres.js');
    const { FilaPostgres } = await import('./jobs/fila.js');
    const pool = criarPool(amb);
    return { repo: new PgRepository(pool), fila: new FilaPostgres(pool) };
  }
  return { repo: new MemoryRepository(amb.ARQUIVO_DADOS), fila: new FilaMemoria() };
}

export async function construirApp(op: OpcoesApp): Promise<AppMontado> {
  const { amb } = op;
  const app = Fastify({
    logger:
      op.logger === false
        ? false
        : {
            level: amb.LOG_LEVEL,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            transport: amb.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } : undefined,
          },
    bodyLimit: 5 * 1024 * 1024,
    trustProxy: true,
  });

  const padrao = op.repo ? { repo: op.repo, fila: op.fila ?? new FilaMemoria() } : await criarRepositorio(amb);
  const repo = padrao.repo;
  const fila = op.fila ?? padrao.fila;
  const servicos = new Servicos(repo, fila, amb, app.log);
  const ingestao = new ServicoIngestao(servicos);
  await servicos.inicializar();

  await app.register(cors, { origin: amb.CORS_ORIGINS.split(',').map((x) => x.trim()), credentials: false });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 20 } });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    return payload;
  });

  const verificar = criarVerificador(amb);
  app.decorateRequest('usuario', null as never);
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/saude')) return;
    const u = await verificar(req);
    if (!u) return reply.code(401).send({ erro: 'Não autenticado' });
    req.usuario = u;
  });

  app.setErrorHandler((erro, req, reply) => {
    if (erro instanceof ErroNegocio) return reply.code(erro.status).send({ erro: erro.message, detalhes: erro.detalhes });
    if (erro instanceof ZodError) return reply.code(422).send({ erro: 'Dados inválidos', detalhes: erro.issues });
    const status = (erro as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ erro: (erro as Error).message });
    req.log.error({ err: erro }, 'erro interno');
    return reply.code(500).send({ erro: 'Erro interno. Consulte os logs do servidor.' });
  });

  app.get('/api/saude', async () => ({
    ok: true,
    persistencia: repo.tipo,
    autenticacao: amb.AUTH_MODE,
    ia: !!amb.ANTHROPIC_API_KEY,
    versao: '0.1.0',
    agora: new Date().toISOString(),
  }));

  const ctx = { s: servicos, ing: ingestao, fila };
  await app.register(
    async (api) => {
      await rotasEmpreendimentos(api, ctx);
      await rotasAnalises(api, ctx);
      await rotasFontes(api, ctx);
      await rotasComercial(api, ctx);
      await rotasAdmin(api, ctx);
    },
    { prefix: '/api' },
  );

  // Serve o front compilado (produção), com fallback de SPA.
  const dist = amb.WEB_DIST ? resolve(amb.WEB_DIST) : undefined;
  if (dist && existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ erro: 'Rota não encontrada' });
      return reply.sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => {
    await repo.fechar();
  });

  return { app, servicos, ingestao, fila, repo };
}
