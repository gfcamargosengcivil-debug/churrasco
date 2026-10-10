import { afterAll, beforeAll, describe, expect, it as itBase } from 'vitest';
import { SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.js';
import { carregarConfig } from '../src/config.js';
import { MemoryRepository } from '../src/repositorio/memoria.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PgRepository, criarPool } from '../src/repositorio/postgres.js';
import { FilaPostgres } from '../src/jobs/fila.js';
import type { Repositorio } from '../src/repositorio/tipos.js';
import type { FilaJobs } from '../src/jobs/fila.js';
import { criarManipuladores, processarProximo } from '../src/jobs/processador.js';
import type { AppMontado } from '../src/app.js';

/** PostgreSQL de teste (opcional): DATABASE_URL_TESTE=postgres://… — o esquema public é recriado. */
const URL_PG = process.env.DATABASE_URL_TESTE;

async function prepararPostgres(): Promise<{ repo: Repositorio; fila: FilaJobs }> {
  const c = new pg.Client({ connectionString: URL_PG });
  await c.connect();
  await c.query('drop schema if exists public cascade; create schema public;');
  await c.query(readFileSync(fileURLToPath(new URL('../../../db/migrations/0001_init.sql', import.meta.url)), 'utf8'));
  await c.end();
  const pool = criarPool({ DATABASE_URL: URL_PG, DATABASE_SSL: false });
  return { repo: new PgRepository(pool), fila: new FilaPostgres(pool) };
}

function multipart(campos: Record<string, string>, arquivo: { nome: string; conteudo: Buffer | string; tipo?: string }) {
  const limite = '----radarlimite' + Math.random().toString(16).slice(2);
  const partes: Buffer[] = [];
  for (const [k, v] of Object.entries(campos)) {
    partes.push(Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  partes.push(Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="${arquivo.nome}"\r\nContent-Type: ${arquivo.tipo ?? 'application/octet-stream'}\r\n\r\n`));
  partes.push(Buffer.isBuffer(arquivo.conteudo) ? arquivo.conteudo : Buffer.from(arquivo.conteudo));
  partes.push(Buffer.from(`\r\n--${limite}--\r\n`));
  return { payload: Buffer.concat(partes), headers: { 'content-type': `multipart/form-data; boundary=${limite}` } };
}

const PERSISTENCIAS: { nome: 'memoria' | 'postgres'; ativo: boolean; montar: () => Promise<{ repo: Repositorio; fila?: FilaJobs }> }[] = [
  { nome: 'memoria', ativo: true, montar: async () => ({ repo: new MemoryRepository() }) },
  { nome: 'postgres', ativo: !!URL_PG, montar: prepararPostgres },
];

describe.each(PERSISTENCIAS)('API (modo dev, $nome, dados demo)', ({ nome, ativo, montar }) => {
  let app: FastifyInstance;
  let montado: AppMontado;
  beforeAll(async () => {
    if (!ativo) return;
    const amb = carregarConfig({ NODE_ENV: 'test', DEMO_AUTOCARGA: 'true', AGENDADOR: 'false' });
    montado = await construirApp({ amb, ...(await montar()), logger: false });
    ({ app } = montado);
  });
  afterAll(async () => app?.close());
  const it = ativo ? itBase : itBase.skip;

  it('saúde e lista com dados fictícios marcados', async () => {
    const s = await app.inject('/api/saude');
    expect(s.json()).toMatchObject({ ok: true, persistencia: nome, autenticacao: 'dev' });
    const r = await app.inject('/api/empreendimentos');
    const lista = r.json();
    expect(lista.length).toBe(31);
    expect(lista.every((v: { demo: boolean }) => v.demo)).toBe(true);
  });

  it('ficha detalhada traz projeto, visão calculada, organizações e eventos', async () => {
    const r = await app.inject('/api/empreendimentos/demo-emp-aurora');
    const f = r.json();
    expect(f.projeto.nomeOficial).toContain('[DEMO]');
    expect(f.visao.previsao.cenarios.base.datas.rfq).toBeDefined();
    expect(f.organizacoes.map((o: { nome: string }) => o.nome)).toContain('Transmissora Aurora S.A. (DEMO)');
    expect(f.projeto.conflitos[0].status).toBe('aberto');
    expect((await app.inject('/api/empreendimentos/nao-existe')).statusCode).toBe(404);
  });

  it('edição exige justificativa e gera evidência, histórico e proveniência', async () => {
    const { projeto } = (await app.inject('/api/empreendimentos/demo-emp-piaui')).json();
    const sem = await app.inject({ method: 'PUT', url: '/api/empreendimentos/demo-emp-piaui', payload: { projeto } });
    expect(sem.statusCode).toBe(422);
    projeto.tecnico.extensaoKm = 275;
    projeto.situacoes.ambiental = 'em_estudo';
    const r = await app.inject({
      method: 'PUT', url: '/api/empreendimentos/demo-emp-piaui',
      payload: { projeto, alteracao: { fonteId: 'manual', titulo: 'Reunião com o empreendedor (teste)', observacao: 'teste' } },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().campos).toEqual(expect.arrayContaining(['tecnico.extensaoKm', 'situacoes.ambiental']));
    const depois = (await app.inject('/api/empreendimentos/demo-emp-piaui')).json().projeto;
    expect(depois.proveniencia['tecnico.extensaoKm'].status).toBe('inferido');
    expect(depois.historico.some((h: { campo: string; para: unknown }) => h.campo === 'tecnico.extensaoKm' && h.para === 275)).toBe(true);
    expect(depois.evidencias.at(-1).titulo).toBe('Reunião com o empreendedor (teste)');
  });

  it('cadastro manual passa pela deduplicação', async () => {
    const reg = { fonteId: 'manual', nome: 'LT 230 kV Teste Cadastro A – Teste Cadastro B', tensoesKv: [230], ufs: ['GO'], extensaoKm: 90, evidencia: { titulo: 'Registro manual de teste', tipoDocumento: 'registro_manual' } };
    const r1 = await app.inject({ method: 'POST', url: '/api/empreendimentos', payload: reg });
    expect(r1.statusCode).toBe(201);
    expect(r1.json().coleta.criados).toBe(1);
    const r2 = await app.inject({ method: 'POST', url: '/api/empreendimentos', payload: { ...reg, organizacoes: [{ nome: 'Empresa Teste', papel: 'empreendedor' }] } });
    expect(r2.json().coleta.criados).toBe(0);
    expect(r2.json().coleta.atualizados + r2.json().coleta.paraRevisao).toBe(1);
  });

  it('importação CSV com prévia e gravação', async () => {
    const csv = 'nome;tensao_kv;extensao_km;ufs;empreendedor;data_assinatura_concessao;fonte_titulo\nLT 500 kV Importada X – Importada Y;500;140;TO;Transmissora Importada S.A.;01/02/2026;Planilha de teste\n';
    const previa = await app.inject({ method: 'POST', url: '/api/importacao/previa', ...multipart({ fonteId: 'aneel-leiloes-transmissao' }, { nome: 'lote.csv', conteudo: csv }) });
    expect(previa.statusCode).toBe(200);
    expect(previa.json()).toMatchObject({ linhas: 1, validos: 1 });
    const imp = await app.inject({ method: 'POST', url: '/api/importacao', ...multipart({ fonteId: 'aneel-leiloes-transmissao' }, { nome: 'lote.csv', conteudo: csv }) });
    expect(imp.json().coleta).toMatchObject({ criados: 1, status: 'sucesso' });
    const lista = (await app.inject('/api/empreendimentos')).json();
    const novo = lista.find((v: { nome: string }) => v.nome.startsWith('LT 500 kV Importada'));
    expect(novo.demo).toBe(false);
    expect(novo.previsao.base.rfq.natureza).toBe('calculado_de_marco');
    const fontes = (await app.inject('/api/fontes')).json();
    expect(fontes.find((f: { id: string }) => f.id === 'aneel-leiloes-transmissao').ultimaColeta).toBeDefined();
  });

  it('resolução de conflito com justificativa', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/empreendimentos/demo-emp-aurora/conflitos/demo-cf-aurora-km/resolver', payload: { valor: 380, justificativa: 'Ato oficial prevalece (teste)' } });
    expect(r.statusCode).toBe(200);
    const p = (await app.inject('/api/empreendimentos/demo-emp-aurora')).json().projeto;
    expect(p.conflitos[0]).toMatchObject({ status: 'resolvido', valorAdotado: 380 });
    const de_novo = await app.inject({ method: 'POST', url: '/api/empreendimentos/demo-emp-aurora/conflitos/demo-cf-aurora-km/resolver', payload: { valor: 380, justificativa: 'repetido' } });
    expect(de_novo.statusCode).toBe(409);
  });

  it('revisão manual de correspondência', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/revisao/matches/demo-match-1/decidir', payload: { acao: 'vincular', empreendimentoId: 'demo-emp-aurora' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().match.status).toBe('vinculado');
    const pendentes = (await app.inject('/api/revisao/matches')).json();
    expect(pendentes.some((m: { id: string }) => m.id === 'demo-match-1')).toBe(false);
  });

  it('gestão comercial: oportunidade, interação e pipelines separados', async () => {
    const r = await app.inject({ method: 'PUT', url: '/api/comercial/oportunidades/demo-emp-carajas', payload: { interesse: 'interessado', statusProspeccao: 'qualificada', responsavel: 'Teste' } });
    expect(r.json()).toMatchObject({ interesse: 'interessado', statusProspeccao: 'qualificada' });
    const i = await app.inject({ method: 'POST', url: '/api/comercial/oportunidades/demo-emp-carajas/interacoes', payload: { data: '2026-10-01', tipo: 'ligacao', resumo: 'Primeiro contato (teste)' } });
    expect(i.json().interacoes).toHaveLength(1);
    const pip = (await app.inject('/api/comercial/pipelines')).json();
    expect(pip.mercado.quantidade).toBeGreaterThan(pip.qualificado.quantidade);
  });

  it('regras de alerta e notificações', async () => {
    const nova = await app.inject({ method: 'POST', url: '/api/alertas/regras', payload: { nome: 'Teste MG', filtros: { ufs: ['MG'] } } });
    expect(nova.statusCode).toBe(201);
    expect((await app.inject('/api/alertas/notificacoes')).json().length).toBeGreaterThan(0);
    expect((await app.inject({ method: 'DELETE', url: `/api/alertas/regras/${nova.json().id}` })).json()).toEqual({ ok: true });
  });

  it('documento: upload, análise heurística e aplicação revisada', async () => {
    const texto = 'A Mineradora Teste S.A. anunciou a construção de uma LT 230 kV Teste Doc A – Teste Doc B, com extensão de 60 km, no estado de Goiás. A contratação da montagem por meio de RFP está prevista para março de 2027.';
    const up = await app.inject({ method: 'POST', url: '/api/documentos', ...multipart({ tipo: 'comunicado_empresa', titulo: 'Comunicado teste', fonteId: 'ri-empresas' }, { nome: 'comunicado.txt', conteudo: texto, tipo: 'text/plain' }) });
    expect(up.statusCode).toBe(201);
    const id = up.json().documento.id;
    const an = (await app.inject({ method: 'POST', url: `/api/documentos/${id}/analisar` })).json();
    expect(an.metodo).toBe('heuristico');
    const iKm = an.itens.findIndex((x: { campo: string }) => x.campo === 'extensaoKm');
    const iKv = an.itens.findIndex((x: { campo: string }) => x.campo === 'tensaoKv');
    const iMarco = an.marcos.findIndex((m: { tipo: string }) => m.tipo === 'rfq_publicada');
    expect(iKm).toBeGreaterThanOrEqual(0);
    expect(iMarco).toBeGreaterThanOrEqual(0);
    const ap = await app.inject({ method: 'POST', url: `/api/documentos/${id}/aplicar`, payload: { itens: [iKm, iKv], marcos: [iMarco], nome: 'LT 230 kV Teste Doc A – Teste Doc B' } });
    expect(ap.json().coleta.criados).toBe(1);
    const emp = (await app.inject(`/api/empreendimentos/${ap.json().empreendimentosAfetados[0]}`)).json().projeto;
    expect(emp.proveniencia['tecnico.extensaoKm'].status).toBe('inferido');
    expect(emp.evidencias[0].documentoId).toBe(id);
    expect(emp.marcos[0]).toMatchObject({ tipo: 'rfq_publicada', data: '2027-03-01', natureza: 'previsto_oficial' });
  });

  it('coleta via fila: adaptador sem configuração registra erro sem retentativa', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/fontes/aneel-dados-abertos/executar' });
    expect(r.json().enfileirado).toBe(true);
    const dup = await app.inject({ method: 'POST', url: '/api/fontes/aneel-dados-abertos/executar' });
    expect(dup.json().enfileirado).toBe(false);
    const manip = criarManipuladores(montado.servicos, montado.ingestao);
    expect(await processarProximo(montado.fila, manip, app.log)).toBe(true);
    const job = (await montado.fila.listar(10)).find((j) => j.id === r.json().job.id);
    expect(job).toMatchObject({ status: 'erro', tentativas: 1 });
    const coletas = (await app.inject('/api/coletas?fonteId=aneel-dados-abertos')).json();
    expect(coletas[0]).toMatchObject({ status: 'erro' });
    expect(coletas[0].erros[0]).toContain('Adaptador não configurado');
  });

  it('exportações para Excel/Power BI', async () => {
    const x = await app.inject('/api/export/radar.xlsx');
    expect(x.headers['content-type']).toContain('spreadsheetml');
    const c = await app.inject('/api/export/previsoes.csv');
    expect(c.body.split('\r\n')[0]).toContain('cenario;evento');
    expect((await app.inject('/api/export/inexistente.csv')).statusCode).toBe(404);
  });

  it('remove dados demonstrativos sem afetar dados reais', async () => {
    const r = await app.inject({ method: 'DELETE', url: '/api/demo' });
    expect(r.json().empreendimentos).toBe(31);
    const lista = (await app.inject('/api/empreendimentos')).json();
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.some((v: { demo: boolean }) => v.demo)).toBe(false);
  });
});

describe('API — autenticação Supabase (JWT) e papéis', () => {
  const it = itBase;
  const SEGREDO = 'segredo-de-teste-com-tamanho-suficiente-123';
  let app: FastifyInstance;
  const token = (role: string | undefined, segredo = SEGREDO) =>
    new SignJWT({ app_metadata: role ? { role } : {}, email: 'teste@exemplo.invalid' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('usuario-1')
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(segredo));

  beforeAll(async () => {
    const amb = carregarConfig({ NODE_ENV: 'test', AUTH_MODE: 'supabase', SUPABASE_JWT_SECRET: SEGREDO, DEMO_AUTOCARGA: 'true' });
    ({ app } = await construirApp({ amb, repo: new MemoryRepository(), logger: false }));
  });
  afterAll(async () => app.close());

  it('exige token válido', async () => {
    expect((await app.inject('/api/empreendimentos')).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/empreendimentos', headers: { authorization: `Bearer ${await token('admin', 'outro-segredo-qualquer-123456789')}` } })).statusCode).toBe(401);
    expect((await app.inject('/api/saude')).statusCode).toBe(200);
  });

  it('aplica permissões por papel', async () => {
    const leitor = { authorization: `Bearer ${await token(undefined)}` };
    expect((await app.inject({ url: '/api/eu', headers: leitor })).json()).toMatchObject({ papel: 'leitor', id: 'usuario-1' });
    expect((await app.inject({ url: '/api/empreendimentos', headers: leitor })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: '/api/comercial/oportunidades/demo-emp-aurora', headers: leitor, payload: { interesse: 'monitorar' } })).statusCode).toBe(403);
    const comercial = { authorization: `Bearer ${await token('comercial')}` };
    expect((await app.inject({ method: 'PUT', url: '/api/comercial/oportunidades/demo-emp-aurora', headers: comercial, payload: { interesse: 'monitorar' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: '/api/demo', headers: comercial })).statusCode).toBe(403);
    const auditoria = await app.inject({ url: '/api/auditoria', headers: { authorization: `Bearer ${await token('admin')}` } });
    expect(auditoria.json().some((a: { usuario: string; entidade: string }) => a.usuario === 'usuario-1' && a.entidade === 'oportunidade_comercial')).toBe(true);
  });

  it('modo dev é proibido em produção', () => {
    expect(() => carregarConfig({ NODE_ENV: 'production', AUTH_MODE: 'dev' })).toThrow('não é permitido em produção');
  });
});
