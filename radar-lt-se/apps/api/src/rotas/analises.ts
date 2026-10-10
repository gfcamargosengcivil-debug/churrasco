import type { FastifyInstance } from 'fastify';
import {
  CENARIOS, agruparPorProximidade, avaliarPriorizacao, conflitosAbertos, demandaPrevista, evolucaoPipeline, fichaCliente,
  funilContratacao, identificarCorredores, painelExecutivo, paraGeoJSON, pipelines, possiveisDuplicidades, principaisRiscos,
  proporCalibracao, resumirClientes, resumoQualidade, type Cenario,
} from '@radar/core';
import { exigir } from '../auth.js';
import { ErroNegocio } from '../servicos/dominio.js';
import { visaoResumida, type ContextoRotas } from './contexto.js';

export async function rotasAnalises(app: FastifyInstance, { s }: ContextoRotas) {
  const carregar = async () => {
    const projetos = await s.repo.listarEmpreendimentos();
    const visoes = await s.visoes(projetos);
    return { projetos, visoes, mapa: new Map(visoes.map((v) => [v.id, v])) };
  };

  app.get('/painel', { preHandler: exigir('ler') }, async () => {
    const { projetos, visoes, mapa } = await carregar();
    const cfg = await s.configuracao();
    const [eventos, oportunidades, orgs, snapshots] = await Promise.all([
      s.repo.listarEventos({ limite: 2000 }),
      s.repo.listarOportunidades(),
      s.organizacoesMap(),
      s.repo.listarSnapshots(),
    ]);
    const painel = painelExecutivo(visoes, { etapas: cfg.etapas, topN: 10 });
    return {
      painel,
      top: painel.prioridade.top.map((id) => {
        const v = mapa.get(id)!;
        return visaoResumida(v, v.contratanteId ? orgs.get(v.contratanteId)?.nome : undefined);
      }),
      evolucao: evolucaoPipeline(projetos, mapa, { meses: 18, etapas: cfg.etapas }),
      snapshots,
      riscos: principaisRiscos(visoes, eventos),
      pipelines: pipelines(visoes, oportunidades),
      etapas: cfg.etapas,
    };
  });

  app.get('/funil', { preHandler: exigir('ler') }, async () => {
    const { projetos, visoes } = await carregar();
    const orgs = await s.organizacoesMap();
    return {
      ...funilContratacao(visoes, new Map(projetos.map((p) => [p.id, p]))),
      empreendimentos: visoes.map((v) => visaoResumida(v, v.contratanteId ? orgs.get(v.contratanteId)?.nome : undefined)),
    };
  });

  app.get<{ Querystring: { cenario?: string; meses?: string } }>('/demanda', { preHandler: exigir('ler') }, async (req) => {
    const cenario = (CENARIOS as string[]).includes(req.query.cenario ?? '') ? (req.query.cenario as Cenario) : 'base';
    const { visoes } = await carregar();
    return demandaPrevista(visoes, cenario, { meses: Math.min(60, Number(req.query.meses ?? 36) || 36) });
  });

  app.get('/mapa', { preHandler: exigir('ler') }, async () => {
    const { projetos, visoes } = await carregar();
    const cfg = await s.configuracao();
    const orgs = await s.organizacoesMap();
    const ativos = visoes.filter((v) => v.statusGeral !== 'cancelado' && v.statusGeral !== 'concluido' && !v.score.foraDoEscopo);
    const clusters = agruparPorProximidade(
      ativos.filter((v) => v.ponto).map((v) => ({ id: v.id, ponto: v.ponto!, peso: v.mercado.central ?? 0 })),
      cfg.raioClusterKm,
    );
    return {
      geojson: paraGeoJSON(projetos),
      clusters,
      corredores: identificarCorredores(projetos),
      empreendimentos: visoes.map((v) => visaoResumida(v, v.contratanteId ? orgs.get(v.contratanteId)?.nome : undefined)),
      raioClusterKm: cfg.raioClusterKm,
      aviso: 'Somente coordenadas registradas são exibidas. Retas "esquemáticas" ligam extremidades e não representam traçado; centros de município indicam localização aproximada.',
    };
  });

  app.get('/clientes', { preHandler: exigir('ler') }, async () => {
    const { projetos, mapa } = await carregar();
    return resumirClientes(await s.repo.listarOrganizacoes(), projetos, mapa);
  });

  app.get<{ Params: { id: string } }>('/clientes/:id', { preHandler: exigir('ler') }, async (req) => {
    const org = await s.repo.obterOrganizacao(req.params.id);
    if (!org) throw new ErroNegocio(404, 'Organização não encontrada');
    const { projetos, mapa } = await carregar();
    const [orgs, eventos, ops] = await Promise.all([s.organizacoesMap(), s.repo.listarEventos({ limite: 3000 }), s.repo.listarOportunidades()]);
    return fichaCliente(org, projetos, mapa, orgs, eventos, ops);
  });

  app.get('/qualidade', { preHandler: exigir('ler') }, async () => {
    const { projetos, visoes } = await carregar();
    const orgs = await s.organizacoesMap();
    const cfg = await s.configuracao();
    const matches = await s.repo.listarMatches('pendente');
    const nomes = new Map(projetos.map((p) => [p.id, p.nomeOficial]));
    return {
      resumo: resumoQualidade(visoes.map((v) => v.qualidade)),
      indicadores: visoes.map((v) => ({ ...v.qualidade, nome: v.nome, codigo: v.codigo, demo: v.demo })),
      conflitos: projetos.flatMap((p) => conflitosAbertos(p).map((c) => ({ ...c, empreendimentoId: p.id, empreendimento: p.nomeOficial }))),
      duplicidades: possiveisDuplicidades(projetos.filter((p) => p.statusGeral !== 'cancelado'), orgs, cfg.dedup).map((d) => ({ ...d, nomeA: nomes.get(d.a), nomeB: nomes.get(d.b) })),
      matchesPendentes: matches.map((m) => ({ ...m, candidatos: m.candidatos.map((c) => ({ ...c, nome: nomes.get(c.empreendimentoId) })) })),
    };
  });

  app.get('/calibracao', { preHandler: exigir('ler') }, async () => {
    const { projetos, visoes } = await carregar();
    const cfg = await s.configuracao();
    return {
      prazos: proporCalibracao(projetos, cfg.previsao),
      priorizacao: avaliarPriorizacao(await s.repo.listarOportunidades(), new Map(visoes.map((v) => [v.id, v.score.faixa]))),
    };
  });

  app.get<{ Querystring: { desde?: string; limite?: string } }>('/eventos', { preHandler: exigir('ler') }, async (req) => {
    const eventos = await s.repo.listarEventos({ desde: req.query.desde, limite: Math.min(2000, Number(req.query.limite ?? 300) || 300) });
    const nomes = new Map((await s.repo.listarEmpreendimentos()).map((p) => [p.id, p.nomeOficial]));
    return eventos.map((e) => ({ ...e, empreendimento: nomes.get(e.empreendimentoId) }));
  });
}
