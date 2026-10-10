import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AlertaRegraSchema, OportunidadeComercialSchema, OrganizacaoSchema, agoraISO, novoId, pipelines, type OportunidadeComercial } from '@radar/core';
import { exigir } from '../auth.js';
import { ErroNegocio } from '../servicos/dominio.js';
import type { ContextoRotas } from './contexto.js';

export async function rotasComercial(app: FastifyInstance, { s }: ContextoRotas) {
  // Oportunidades comerciais (pipeline qualificado pela empresa)
  app.get('/comercial/oportunidades', { preHandler: exigir('ler') }, async () => {
    const [ops, projetos] = await Promise.all([s.repo.listarOportunidades(), s.repo.listarEmpreendimentos()]);
    const visoes = new Map((await s.visoes(projetos)).map((v) => [v.id, v]));
    return ops.map((o) => {
      const v = visoes.get(o.empreendimentoId);
      return { ...o, empreendimento: v?.nome, codigo: v?.codigo, dataDemandaBase: v?.dataDemandaBase, mercadoCentral: v?.mercado.central, faixaPrioridade: v?.score.faixa, indice: v?.score.indice };
    });
  });

  app.get('/comercial/pipelines', { preHandler: exigir('ler') }, async () => pipelines(await s.visoes(), await s.repo.listarOportunidades()));

  /** Cria ou atualiza a oportunidade comercial de um empreendimento. */
  app.put<{ Params: { empreendimentoId: string } }>('/comercial/oportunidades/:empreendimentoId', { preHandler: exigir('comercial') }, async (req) => {
    const p = await s.repo.obterEmpreendimento(req.params.empreendimentoId);
    if (!p) throw new ErroNegocio(404, 'Empreendimento não encontrado');
    const atual = await s.oportunidadeDe(p.id);
    const agora = agoraISO();
    const corpo = OportunidadeComercialSchema.omit({ id: true, empreendimentoId: true, criadoEm: true, atualizadoEm: true, demo: true }).partial().parse(req.body);
    const nova: OportunidadeComercial = OportunidadeComercialSchema.parse({
      ...(atual ?? { id: novoId('op'), empreendimentoId: p.id, criadoEm: agora, demo: p.demo }),
      ...corpo,
      contatos: (corpo.contatos ?? atual?.contatos ?? []).map((c) => ({ ...c, id: c.id || novoId('ct') })),
      interacoes: (corpo.interacoes ?? atual?.interacoes ?? []).map((i) => ({ ...i, id: i.id || novoId('int'), por: i.por || req.usuario.id })),
      proximosPassos: (corpo.proximosPassos ?? atual?.proximosPassos ?? []).map((x) => ({ ...x, id: x.id || novoId('pp') })),
      atualizadoEm: agora,
    });
    if (nova.decisao.decisao !== 'pendente' && (!atual || atual.decisao.decisao !== nova.decisao.decisao)) {
      nova.decisao = { ...nova.decisao, data: nova.decisao.data ?? agora.slice(0, 10), por: req.usuario.id };
    }
    await s.repo.salvarOportunidade(nova);
    await s.auditar(req.usuario, atual ? 'atualizar' : 'criar', 'oportunidade_comercial', nova.id, { empreendimentoId: p.id, status: nova.statusProspeccao, decisao: nova.decisao.decisao });
    return nova;
  });

  app.post<{ Params: { empreendimentoId: string } }>('/comercial/oportunidades/:empreendimentoId/interacoes', { preHandler: exigir('comercial') }, async (req) => {
    const corpo = z.object({ data: z.string(), tipo: z.enum(['reuniao', 'ligacao', 'email', 'visita', 'evento', 'outro']), resumo: z.string().min(3) }).parse(req.body);
    const op = await s.oportunidadeDe(req.params.empreendimentoId);
    if (!op) throw new ErroNegocio(404, 'Oportunidade não encontrada — registre o interesse primeiro');
    op.interacoes.push({ id: novoId('int'), ...corpo, por: req.usuario.id });
    op.atualizadoEm = agoraISO();
    await s.repo.salvarOportunidade(op);
    await s.auditar(req.usuario, 'registrar_interacao', 'oportunidade_comercial', op.id, { tipo: corpo.tipo });
    return op;
  });

  // Organizações
  app.get('/organizacoes', { preHandler: exigir('ler') }, async () => s.repo.listarOrganizacoes());

  app.post('/organizacoes', { preHandler: exigir('editarDados') }, async (req, reply) => {
    const o = OrganizacaoSchema.parse({ ...(req.body as object), id: novoId('org') });
    await s.repo.salvarOrganizacao(o);
    await s.auditar(req.usuario, 'criar', 'organizacao', o.id, { nome: o.nome });
    reply.code(201);
    return o;
  });

  app.put<{ Params: { id: string } }>('/organizacoes/:id', { preHandler: exigir('editarDados') }, async (req) => {
    const atual = await s.repo.obterOrganizacao(req.params.id);
    if (!atual) throw new ErroNegocio(404, 'Organização não encontrada');
    const o = OrganizacaoSchema.parse({ ...atual, ...(req.body as object), id: atual.id, demo: atual.demo });
    await s.repo.salvarOrganizacao(o);
    await s.auditar(req.usuario, 'atualizar', 'organizacao', o.id, {});
    return o;
  });

  // Alertas
  app.get('/alertas/regras', { preHandler: exigir('ler') }, async () => s.repo.listarRegras());

  app.post('/alertas/regras', { preHandler: exigir('alertas') }, async (req, reply) => {
    const r = AlertaRegraSchema.parse({ ...(req.body as object), id: novoId('rg'), criadoPor: req.usuario.id });
    await s.repo.salvarRegra(r);
    await s.auditar(req.usuario, 'criar', 'alerta_regra', r.id, { nome: r.nome });
    reply.code(201);
    return r;
  });

  app.put<{ Params: { id: string } }>('/alertas/regras/:id', { preHandler: exigir('alertas') }, async (req) => {
    const atual = (await s.repo.listarRegras()).find((r) => r.id === req.params.id);
    if (!atual) throw new ErroNegocio(404, 'Regra não encontrada');
    const r = AlertaRegraSchema.parse({ ...atual, ...(req.body as object), id: atual.id, criadoPor: atual.criadoPor });
    await s.repo.salvarRegra(r);
    await s.auditar(req.usuario, 'atualizar', 'alerta_regra', r.id, {});
    return r;
  });

  app.delete<{ Params: { id: string } }>('/alertas/regras/:id', { preHandler: exigir('alertas') }, async (req) => {
    await s.repo.excluirRegra(req.params.id);
    await s.auditar(req.usuario, 'excluir', 'alerta_regra', req.params.id, {});
    return { ok: true };
  });

  app.get<{ Querystring: { lido?: string } }>('/alertas/notificacoes', { preHandler: exigir('ler') }, async (req) => {
    const lido = req.query.lido === undefined ? undefined : req.query.lido === '1';
    const [notifs, eventos, regras] = await Promise.all([s.repo.listarNotificacoes({ lido, limite: 300 }), s.repo.listarEventos({ limite: 5000 }), s.repo.listarRegras()]);
    const evMap = new Map(eventos.map((e) => [e.id, e]));
    const rgMap = new Map(regras.map((r) => [r.id, r.nome]));
    return notifs.map((n) => ({ ...n, evento: evMap.get(n.eventoId), regra: rgMap.get(n.regraId) }));
  });

  app.post<{ Params: { id: string } }>('/alertas/notificacoes/:id/lida', { preHandler: exigir('ler') }, async (req) => {
    const { lido } = z.object({ lido: z.boolean().default(true) }).parse(req.body ?? {});
    await s.repo.marcarNotificacao(req.params.id, lido);
    return { ok: true };
  });
}
