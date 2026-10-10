import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FonteSchema, TIPOS_DOCUMENTO, DataISO } from '@radar/core';
import { ADAPTADORES, COLUNAS_MODELO, gerarPlanilhaModelo } from '@radar/ingestion';
import { exigir } from '../auth.js';
import { ErroNegocio } from '../servicos/dominio.js';
import type { ContextoRotas } from './contexto.js';

/** Lê um arquivo multipart + campos de formulário. */
async function lerUpload(req: FastifyRequest): Promise<{ buffer: Buffer; nome: string; campos: Record<string, string> }> {
  const partes = req.parts();
  let buffer: Buffer | undefined;
  let nome = '';
  const campos: Record<string, string> = {};
  for await (const parte of partes) {
    if (parte.type === 'file') {
      buffer = await parte.toBuffer();
      nome = parte.filename;
    } else {
      campos[parte.fieldname] = String(parte.value ?? '');
    }
  }
  if (!buffer) throw new ErroNegocio(400, 'Arquivo não enviado (campo "arquivo").');
  return { buffer, nome, campos };
}

export async function rotasFontes(app: FastifyInstance, { s, ing, fila }: ContextoRotas) {
  app.get('/fontes', { preHandler: exigir('ler') }, async () => {
    const [fontes, coletas] = await Promise.all([s.repo.listarFontes(), s.repo.listarColetas({ limite: 300 })]);
    return fontes.map((f) => ({
      ...f,
      coletaAutomatica: !!ADAPTADORES[f.adaptador],
      pendencias: ADAPTADORES[f.adaptador]?.validarConfiguracao(f, process.env) ?? [],
      ultimasColetas: coletas.filter((c) => c.fonteId === f.id).slice(0, 5),
    }));
  });

  app.put<{ Params: { id: string } }>('/fontes/:id', { preHandler: exigir('administrar') }, async (req) => {
    const atual = await s.repo.obterFonte(req.params.id);
    if (!atual) throw new ErroNegocio(404, 'Fonte não encontrada');
    const corpo = z.object({ ativo: z.boolean().optional(), config: z.record(z.unknown()).optional(), frequencia: FonteSchema.shape.frequencia.optional() }).parse(req.body);
    const nova = { ...atual, ...corpo, config: { ...atual.config, ...corpo.config } };
    await s.repo.salvarFonte(nova);
    await s.auditar(req.usuario, 'configurar_fonte', 'fonte', atual.id, corpo);
    return nova;
  });

  app.post<{ Params: { id: string } }>('/fontes/:id/executar', { preHandler: exigir('ingestao') }, async (req, reply) => {
    const f = await s.repo.obterFonte(req.params.id);
    if (!f) throw new ErroNegocio(404, 'Fonte não encontrada');
    if (!ADAPTADORES[f.adaptador]) throw new ErroNegocio(400, `A fonte opera por ${f.adaptador}: use importação de planilha/documento.`);
    const job = await fila.enfileirar('coletar_fonte', { fonteId: f.id, usuario: req.usuario.id, disparo: 'manual' }, { chaveUnica: `coletar:${f.id}` });
    reply.code(202);
    return { enfileirado: !!job, job, mensagem: job ? 'Coleta enfileirada.' : 'Já existe coleta pendente para esta fonte.' };
  });

  app.get<{ Querystring: { fonteId?: string } }>('/coletas', { preHandler: exigir('ler') }, async (req) => s.repo.listarColetas({ fonteId: req.query.fonteId, limite: 200 }));

  app.get('/importacao/modelo', { preHandler: exigir('ler') }, async (_req, reply) => {
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('content-disposition', 'attachment; filename="modelo-importacao-radar-lt-se.xlsx"');
    return reply.send(await gerarPlanilhaModelo());
  });

  app.get('/importacao/colunas', { preHandler: exigir('ler') }, async () => COLUNAS_MODELO);

  app.post('/importacao/previa', { preHandler: exigir('ingestao') }, async (req) => {
    const { buffer, nome, campos } = await lerUpload(req);
    return ing.previaPlanilha(buffer, nome, campos.fonteId || 'importacao-planilha');
  });

  app.post('/importacao', { preHandler: exigir('ingestao') }, async (req) => {
    const { buffer, nome, campos } = await lerUpload(req);
    return ing.importarPlanilha(buffer, nome, campos.fonteId || 'importacao-planilha', req.usuario);
  });

  // Documentos e sinais
  app.get<{ Querystring: { tipo?: string; empreendimentoId?: string } }>('/documentos', { preHandler: exigir('ler') }, async (req) => {
    const tipo = (TIPOS_DOCUMENTO as readonly string[]).includes(req.query.tipo ?? '') ? (req.query.tipo as (typeof TIPOS_DOCUMENTO)[number]) : undefined;
    return s.repo.listarDocumentos({ tipo, empreendimentoId: req.query.empreendimentoId, limite: 300 });
  });

  app.get<{ Params: { id: string } }>('/documentos/:id', { preHandler: exigir('ler') }, async (req) => {
    const d = await s.repo.obterDocumento(req.params.id);
    if (!d) throw new ErroNegocio(404, 'Documento não encontrado');
    return d;
  });

  app.post('/documentos', { preHandler: exigir('ingestao') }, async (req, reply) => {
    const { buffer, nome, campos } = await lerUpload(req);
    const meta = z
      .object({
        titulo: z.string().optional(),
        tipo: z.enum(TIPOS_DOCUMENTO).default('outro'),
        fonteId: z.string().optional(),
        url: z.string().optional(),
        dataPublicacao: DataISO.optional().or(z.literal('').transform(() => undefined)),
        empreendimentoId: z.string().optional(),
        analisar: z.string().optional(),
      })
      .parse(campos);
    const r = await ing.receberDocumento(buffer, nome, meta, req.usuario);
    if (meta.analisar === '1' && !r.duplicado) await fila.enfileirar('analisar_documento', { documentoId: r.documento.id, usuario: req.usuario.id });
    reply.code(r.duplicado ? 200 : 201);
    return { ...r, documento: { ...r.documento, textoExtraido: r.documento.textoExtraido?.slice(0, 3000) } };
  });

  app.post<{ Params: { id: string } }>('/documentos/:id/analisar', { preHandler: exigir('ingestao') }, async (req) => ing.analisarDocumento(req.params.id, req.usuario));

  app.post<{ Params: { id: string } }>('/documentos/:id/aplicar', { preHandler: exigir('ingestao') }, async (req) => {
    const sel = z
      .object({ itens: z.array(z.number().int()).default([]), marcos: z.array(z.number().int()).default([]), nome: z.string().optional(), empreendimentoId: z.string().optional(), fonteId: z.string().optional() })
      .parse(req.body);
    return ing.aplicarAnalise(req.params.id, sel, req.usuario);
  });

  app.post<{ Params: { id: string } }>('/documentos/:id/vincular', { preHandler: exigir('ingestao') }, async (req) => {
    const { empreendimentoId, descartar } = z.object({ empreendimentoId: z.string().optional(), descartar: z.boolean().optional() }).parse(req.body);
    const d = await s.repo.obterDocumento(req.params.id);
    if (!d) throw new ErroNegocio(404, 'Documento não encontrado');
    const analise = (d.analise ?? {}) as Record<string, unknown>;
    const novo = {
      ...d,
      empreendimentoIds: empreendimentoId ? [...new Set([...d.empreendimentoIds, empreendimentoId])] : d.empreendimentoIds,
      analise: { ...analise, status: descartar ? 'descartado' : empreendimentoId ? 'vinculado' : analise.status },
    };
    await s.repo.salvarDocumento(novo);
    await s.auditar(req.usuario, descartar ? 'descartar_sinal' : 'vincular_documento', 'documento', d.id, { empreendimentoId });
    return { ok: true };
  });

  // Revisão manual de correspondências
  app.get('/revisao/matches', { preHandler: exigir('ler') }, async () => s.repo.listarMatches('pendente'));

  app.post<{ Params: { id: string } }>('/revisao/matches/:id/decidir', { preHandler: exigir('editarDados') }, async (req) => {
    const { acao, empreendimentoId } = z.object({ acao: z.enum(['vincular', 'novo', 'descartar']), empreendimentoId: z.string().optional() }).parse(req.body);
    return ing.decidirMatch(req.params.id, acao, req.usuario, empreendimentoId);
  });
}
