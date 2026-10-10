import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EmpreendimentoSchema, RegistroNormalizadoSchema, resolverConflito, somarMeses, hojeISO, type Empreendimento, type Marco } from '@radar/core';
import { compararCronogramas, descreverDiferencas, resumoExecutivo } from '@radar/ai';
import { exigir } from '../auth.js';
import { ErroNegocio } from '../servicos/dominio.js';
import { AlteracaoManualSchema, aplicarEdicaoManual } from '../servicos/edicao.js';
import { visaoResumida, type ContextoRotas } from './contexto.js';

export async function rotasEmpreendimentos(app: FastifyInstance, { s, ing }: ContextoRotas) {
  app.get('/empreendimentos', { preHandler: exigir('ler') }, async () => {
    const projetos = await s.repo.listarEmpreendimentos();
    const [visoes, orgs] = await Promise.all([s.visoes(projetos), s.organizacoesMap()]);
    return visoes.map((v) => visaoResumida(v, v.contratanteId ? orgs.get(v.contratanteId)?.nome : undefined));
  });

  app.get<{ Params: { id: string } }>('/empreendimentos/:id', { preHandler: exigir('ler') }, async (req) => {
    const p = await s.repo.obterEmpreendimento(req.params.id);
    if (!p) throw new ErroNegocio(404, 'Empreendimento não encontrado');
    const [[visao], orgs, fontes, oportunidade, eventos, documentos, matches] = await Promise.all([
      s.visoes([p]),
      s.organizacoesMap(),
      s.fontesMap(),
      s.oportunidadeDe(p.id),
      s.repo.listarEventos({ empreendimentoId: p.id, limite: 100 }),
      s.repo.listarDocumentos({ empreendimentoId: p.id, limite: 50 }),
      s.repo.listarMatches('pendente'),
    ]);
    const idsOrg = new Set([...p.participantes.map((x) => x.organizacaoId), ...p.contratos.flatMap((c) => [c.contratadaId, c.contratanteId]), ...p.pacotes.map((x) => x.contratadaId)].filter(Boolean) as string[]);
    const idsFonte = new Set(p.evidencias.map((e) => e.fonteId));
    return {
      projeto: p,
      visao,
      organizacoes: [...idsOrg].map((id) => orgs.get(id)).filter(Boolean),
      fontes: [...idsFonte].map((id) => fontes.get(id)).filter(Boolean),
      oportunidade,
      eventos,
      documentos,
      matchesPendentes: matches.filter((m) => m.candidatos.some((c) => c.empreendimentoId === p.id)),
    };
  });

  /** Cadastro manual: passa pelo pipeline (deduplicação, proveniência, eventos). */
  app.post('/empreendimentos', { preHandler: exigir('editarDados') }, async (req, reply) => {
    const r = RegistroNormalizadoSchema.parse(req.body);
    const res = await ing.registrarManual(r, req.usuario);
    reply.code(res.coleta.criados ? 201 : 200);
    return res;
  });

  /** Acrescenta informação com fonte a um empreendimento existente (mescla com conflitos). */
  app.post<{ Params: { id: string } }>('/empreendimentos/:id/registros', { preHandler: exigir('editarDados') }, async (req) => {
    if (!(await s.repo.obterEmpreendimento(req.params.id))) throw new ErroNegocio(404, 'Empreendimento não encontrado');
    const r = RegistroNormalizadoSchema.parse(req.body);
    return ing.registrarManual(r, req.usuario, req.params.id);
  });

  /** Edição estruturada (exige justificativa/fonte; gera evidência, histórico e proveniência). */
  app.put<{ Params: { id: string } }>('/empreendimentos/:id', { preHandler: exigir('editarDados') }, async (req) => {
    const corpo = z.object({ projeto: z.unknown(), alteracao: AlteracaoManualSchema }).parse(req.body);
    const antes = await s.repo.obterEmpreendimento(req.params.id);
    if (!antes) throw new ErroNegocio(404, 'Empreendimento não encontrado');
    const editado = EmpreendimentoSchema.parse({ ...(corpo.projeto as object), id: antes.id });
    const fonte = await s.repo.obterFonte(corpo.alteracao.fonteId);
    if (!fonte) throw new ErroNegocio(400, 'Fonte da alteração inválida');
    const { projeto, campos } = aplicarEdicaoManual(antes, editado, corpo.alteracao, fonte, req.usuario.id);
    if (!campos.length) return { alterado: false, campos };
    const eventos = await s.salvarEmpreendimento(projeto, antes, req.usuario, 'editar');
    return { alterado: true, campos, eventos: eventos.map((e) => e.tipo) };
  });

  app.post<{ Params: { id: string; conflito: string } }>('/empreendimentos/:id/conflitos/:conflito/resolver', { preHandler: exigir('editarDados') }, async (req) => {
    const corpo = z.object({ valor: z.unknown(), justificativa: z.string().min(5, 'Justifique a decisão') }).parse(req.body);
    const antes = await s.repo.obterEmpreendimento(req.params.id);
    if (!antes) throw new ErroNegocio(404, 'Empreendimento não encontrado');
    let depois: Empreendimento;
    try {
      depois = resolverConflito(antes, req.params.conflito, corpo.valor, corpo.justificativa, req.usuario.id, (proj, valor) => aplicarValorCampo(proj, antes.conflitos.find((c) => c.id === req.params.conflito)!.campo, valor));
    } catch (e) {
      throw new ErroNegocio(409, (e as Error).message);
    }
    await s.salvarEmpreendimento(depois, antes, req.usuario, 'resolver_conflito');
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/empreendimentos/:id', { preHandler: exigir('administrar') }, async (req) => {
    const p = await s.repo.obterEmpreendimento(req.params.id);
    if (!p) throw new ErroNegocio(404, 'Empreendimento não encontrado');
    await s.repo.excluirEmpreendimento(p.id);
    await s.auditar(req.usuario, 'excluir', 'empreendimento', p.id, { nome: p.nomeOficial });
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/empreendimentos/:id/resumo', { preHandler: exigir('ler') }, async (req) => {
    const p = await s.repo.obterEmpreendimento(req.params.id);
    if (!p) throw new ErroNegocio(404, 'Empreendimento não encontrado');
    const [v] = await s.visoes([p]);
    const usarIA = (req.query as { ia?: string }).ia === '1';
    return resumoExecutivo(p, v, await s.organizacoesMap(), usarIA ? { habilitado: !!s.amb.ANTHROPIC_API_KEY, apiKey: s.amb.ANTHROPIC_API_KEY, modelo: s.amb.IA_MODELO } : undefined);
  });

  /** Comparação do cronograma atual com uma versão anterior reconstruída do histórico. */
  app.get<{ Params: { id: string }; Querystring: { desde?: string } }>('/empreendimentos/:id/cronograma', { preHandler: exigir('ler') }, async (req) => {
    const p = await s.repo.obterEmpreendimento(req.params.id);
    if (!p) throw new ErroNegocio(404, 'Empreendimento não encontrado');
    return compararCronogramasRegistro(p, req.query.desde);
  });
}

/**
 * Reconstrói a versão do cronograma vigente em `desde` (padrão: 12 meses atrás) a partir do
 * histórico de revisões e a compara com a versão atual.
 */
function compararCronogramasRegistro(p: Empreendimento, desde?: string) {
  const ref = desde ?? somarMeses(hojeISO(), -12);
  const anterior: Marco[] = p.marcos.map((m) => ({ ...m }));
  const revisoes = p.historico
    .filter((h) => h.campo.startsWith('marcos.') && h.em.slice(0, 10) >= ref)
    .sort((a, b) => (a.em < b.em ? -1 : 1));
  const revertidos = new Set<string>();
  for (const h of revisoes) {
    const [, tipo, escopo] = h.campo.split('.');
    const chave = `${tipo}|${escopo}`;
    if (revertidos.has(chave)) continue;
    revertidos.add(chave);
    const idx = anterior.findIndex((m) => m.tipo === tipo && m.escopo === escopo);
    if (h.de === undefined || h.de === null) {
      if (idx >= 0) anterior.splice(idx, 1);
    } else if (typeof h.de === 'string' && idx >= 0) {
      anterior[idx] = { ...anterior[idx], data: h.de, natureza: anterior[idx].natureza === 'realizado' ? 'previsto_oficial' : anterior[idx].natureza };
    } else if (typeof h.de === 'object' && h.de && 'data' in h.de && idx >= 0) {
      const d = h.de as { data: string; natureza: Marco['natureza'] };
      anterior[idx] = { ...anterior[idx], data: d.data, natureza: d.natureza };
    }
  }
  const diferencas = compararCronogramas(anterior, p.marcos);
  return { desde: ref, diferencas, descricao: descreverDiferencas(diferencas), revisoesConsideradas: revisoes.length };
}

/** Aplica o valor escolhido na resolução de conflito ao campo correspondente. */
function aplicarValorCampo(p: Empreendimento, campo: string, valor: unknown) {
  const partes = campo.split('.');
  if (partes[0] === 'marcos') {
    const [, tipo, escopo] = partes;
    const m = p.marcos.find((x) => x.tipo === tipo && x.escopo === escopo);
    if (m && typeof valor === 'string') m.data = valor;
    return;
  }
  if (partes[0] === 'trechosLT' || partes[0] === 'subestacoes') {
    const [col, id, prop] = partes;
    const item = (p[col as 'trechosLT' | 'subestacoes'] as unknown as Record<string, unknown>[]).find((x) => x.id === id);
    if (item) item[prop] = valor;
    return;
  }
  if (partes[0] === 'financeiro' && typeof valor === 'number') {
    const k = partes[1] as 'capexTotal' | 'capexInfraEletrica' | 'rapAnual';
    p.financeiro[k] = { ...(p.financeiro[k] ?? { natureza: 'declarado' }), valorBRL: valor };
    return;
  }
  let alvo = p as unknown as Record<string, unknown>;
  for (const k of partes.slice(0, -1)) alvo = alvo[k] as Record<string, unknown>;
  alvo[partes.at(-1)!] = valor;
}
