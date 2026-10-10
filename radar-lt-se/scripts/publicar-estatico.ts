/**
 * Gera a versão publicada (somente leitura) do Radar: coleta as fontes automáticas sobre a base
 * persistida, exporta cada consulta GET da API como arquivo JSON/XLSX e grava os metadados da
 * publicação. O front compilado com VITE_ESTATICO=1 lê esses arquivos (GitHub Pages).
 *
 * Uso:
 *   tsx scripts/publicar-estatico.ts --estado data/estado.json --saida apps/web/dist-estatico \
 *       [--coletar aneel-siget,aneel-leiloes-transmissao,epe-webmap] [--demo]
 *
 * A coleta só roda onde há acesso às fontes (ex.: GitHub Actions). Falha de uma fonte não derruba
 * a publicação: fica registrada na coleta e os dados anteriores da base são mantidos.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { arquivoEstatico, hojeISO, mesclarConfiguracao, type ConfiguracaoPlataforma } from '@radar/core';
import { CATALOGO_FONTES } from '@radar/ingestion';
import { construirApp } from '../apps/api/src/app.js';
import { carregarConfig } from '../apps/api/src/config.js';
import { MemoryRepository } from '../apps/api/src/repositorio/memoria.js';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? (process.argv[i + 1]?.startsWith('--') ? '' : process.argv[i + 1] ?? '') : undefined;
}

const estado = resolve(argumento('estado') ?? 'data/estado-publicacao.json');
const saida = resolve(argumento('saida') ?? 'apps/web/dist-estatico');
const coletar = (argumento('coletar') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const demo = argumento('demo') !== undefined;

const amb = carregarConfig({
  NODE_ENV: 'development',
  PERSISTENCIA: 'memoria',
  ARQUIVO_DADOS: estado,
  DEMO_AUTOCARGA: demo ? 'true' : 'false',
  AGENDADOR: 'false',
  LOG_LEVEL: 'warn',
});
const repo = new MemoryRepository(estado);
const { app, servicos, ingestao } = await construirApp({ amb, repo, logger: false });
await app.ready();

// Configuração da publicação versionada no repositório (a versão publicada não tem administrador).
const arqConfig = resolve(argumento('config') ?? 'config/publicacao.json');
const configPublicacao = existsSync(arqConfig) ? (JSON.parse(readFileSync(arqConfig, 'utf8')) as Partial<ConfiguracaoPlataforma> & { configurado?: boolean }) : {};
const atual = await servicos.configuracao();
await servicos.salvarConfiguracao(mesclarConfiguracao({ ...atual, portfolio: { ...atual.portfolio, ...configPublicacao.portfolio } }), { id: 'publicacao', papel: 'admin' } as never);
// A configuração das fontes vem sempre do catálogo versionado (correções de código chegam à coleta).
for (const f of CATALOGO_FONTES) {
  const persistida = (await repo.listarFontes()).find((x) => x.id === f.id);
  if (persistida) await repo.salvarFonte({ ...persistida, config: f.config, statusIntegracao: f.statusIntegracao, limitacoes: f.limitacoes, nome: f.nome, url: f.url, frequencia: f.frequencia });
}

// 1) Coleta das fontes automáticas (sequencial: a deduplicação de uma fonte vê o que a anterior gravou).
const coletas: { fonteId: string; fonte: string; status: string; registrosLidos: number; criados: number; atualizados: number; erros: string[]; avisos: string[] }[] = [];
for (const fonteId of coletar) {
  const inicio = Date.now();
  try {
    // Publicação automática não tem revisor: correspondências incertas viram registros novos (sinalizados).
    const c = await ingestao.executarFonte(fonteId, 'agendado', 'publicacao', { semRevisaoManual: true });
    const fonte = (await repo.listarFontes()).find((f) => f.id === fonteId);
    coletas.push({ fonteId, fonte: fonte?.nome ?? fonteId, status: c.status, registrosLidos: c.registrosLidos, criados: c.criados, atualizados: c.atualizados, erros: c.erros, avisos: c.avisos });
    console.log(`[coleta] ${fonteId}: ${c.status} — lidos ${c.registrosLidos}, criados ${c.criados}, atualizados ${c.atualizados}, revisão ${c.paraRevisao}, conflitos ${c.conflitos}, descartados ${c.descartados} (${Math.round((Date.now() - inicio) / 1000)} s)`);
    for (const a of c.avisos.slice(0, 15)) console.log(`   aviso: ${a}`);
    for (const e of c.erros.slice(0, 15)) console.log(`   ERRO: ${e}`);
  } catch (e) {
    coletas.push({ fonteId, fonte: fonteId, status: 'erro', registrosLidos: 0, criados: 0, atualizados: 0, erros: [(e as Error).message], avisos: [] });
    console.log(`[coleta] ${fonteId}: FALHOU — ${(e as Error).message}`);
  }
}
await servicos.rotinaJanelas();
repo.gravarAgora();

// 2) Exportação das consultas GET.
let arquivos = 0;
let bytes = 0;
async function exportar(caminho: string, substituto?: unknown): Promise<unknown> {
  const destino = join(saida, arquivoEstatico(caminho));
  mkdirSync(dirname(destino), { recursive: true });
  if (substituto !== undefined) {
    const corpo = JSON.stringify(substituto);
    writeFileSync(destino, corpo);
    arquivos++;
    bytes += corpo.length;
    return substituto;
  }
  const r = await app.inject({ method: 'GET', url: `/api${caminho}` });
  if (r.statusCode !== 200) {
    console.log(`[exportar] ${caminho}: HTTP ${r.statusCode} — ignorado`);
    return undefined;
  }
  writeFileSync(destino, r.rawPayload);
  arquivos++;
  bytes += r.rawPayload.length;
  return (r.headers['content-type'] ?? '').toString().includes('json') ? r.json() : undefined;
}

// Visitante da versão publicada: somente leitura (a interface oculta ações de edição).
await exportar('/eu', { id: 'visitante', nome: 'Visitante', papel: 'leitor' });
await exportar('/ia/status', { habilitada: false, modo: 'Versão publicada somente leitura (sem IA generativa).' });
const qualidade = (await exportar('/qualidade')) as { duplicidades?: unknown[] } | undefined;
for (const c of [
  '/painel', '/funil', '/mapa', '/calibracao', '/config', '/fontes', '/coletas', '/organizacoes',
  '/comercial/oportunidades', '/comercial/pipelines', '/alertas/regras', '/alertas/notificacoes', '/alertas/notificacoes?lido=0',
  '/eventos?limite=300', '/documentos', '/documentos?tipo=noticia', '/export/radar.xlsx', '/importacao/modelo',
  ...['otimista', 'base', 'conservador'].map((c) => `/demanda?cenario=${c}&meses=36`),
]) await exportar(c);

// Última coleta com dados (sucesso ou parcial) de cada fonte, incluindo execuções anteriores.
const historico = ((await app.inject('/api/coletas')).json() ?? []) as { fonteId: string; status: string; finalizadaEm?: string }[];
const ultimaColeta = new Map<string, string>();
for (const c of historico) {
  if (!c.finalizadaEm || !['sucesso', 'parcial'].includes(c.status)) continue;
  if ((ultimaColeta.get(c.fonteId) ?? '') < c.finalizadaEm) ultimaColeta.set(c.fonteId, c.finalizadaEm);
}

const lista = (await exportar('/empreendimentos')) as { id: string }[] | undefined;
for (const v of lista ?? []) {
  await exportar(`/empreendimentos/${v.id}`);
  await exportar(`/empreendimentos/${v.id}/cronograma`);
  await exportar(`/empreendimentos/${v.id}/resumo`);
}
const clientes = (await exportar('/clientes')) as { organizacao: { id: string } }[] | undefined;
for (const c of clientes ?? []) await exportar(`/clientes/${c.organizacao.id}`);
const documentos = (await app.inject('/api/documentos')).json() as { id: string }[];
for (const d of documentos) await exportar(`/documentos/${d.id}`);

const incertos = coletas.reduce((t, c) => t + c.avisos.reduce((u, a) => u + Number(/^(\d+) registro\(s\) com correspondência incerta/.exec(a)?.[1] ?? 0), 0), 0);
await exportar('/publicacao', {
  geradoEm: new Date().toISOString(),
  hoje: hojeISO(),
  coletas: coletas.map(({ avisos: _a, ...c }) => ({ ...c, ultimaColetaComDados: ultimaColeta.get(c.fonteId) })),
  /** Data da coleta com dados mais recente entre as fontes publicadas (a base é desta data, não de geradoEm). */
  dadosAtualizadosEm: [...ultimaColeta.values()].sort().at(-1),
  empreendimentos: lista?.length ?? 0,
  /** Registros desta coleta cadastrados como novos por correspondência incerta (sem revisor). */
  incertos,
  /** Pares de empreendimentos com alta similaridade (podem ser o mesmo empreendimento). */
  possiveisDuplicidades: qualidade?.duplicidades?.length ?? 0,
  /** Prioridade calculada sem o portfólio da empresa (critério geográfico neutro). */
  portfolioConfigurado: !!configPublicacao.configurado,
  demo,
});
await app.close();
console.log(`[publicação] ${arquivos} arquivos, ${(bytes / 1e6).toFixed(1)} MB em ${saida}; ${lista?.length ?? 0} empreendimentos; estado em ${estado}`);
if (coletar.length && coletas.every((c) => c.status === 'erro') && !(lista?.length)) {
  console.error('Nenhuma fonte respondeu e a base está vazia: publicação abortada.');
  process.exit(1);
}
