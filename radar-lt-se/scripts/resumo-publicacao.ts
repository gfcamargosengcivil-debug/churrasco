/**
 * Resumo (Markdown) dos dados publicados, para o log/sumário da execução: volumes por situação,
 * necessidade, confiança e prioridade, e os empreendimentos de maior prioridade com a janela base.
 * Uso: tsx scripts/resumo-publicacao.ts <pasta do site estático>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pasta = process.argv[2] ?? 'apps/web/dist-estatico';
const ler = <T>(arq: string): T => JSON.parse(readFileSync(join(pasta, 'dados', arq), 'utf8')) as T;

interface Resumo {
  id: string;
  nome: string;
  ufs: string[];
  tensaoMaxKv?: number;
  statusGeral: string;
  ponto?: unknown;
  contratante?: string;
  previsao: { base: { rfq?: { data: string; natureza: string; vencida?: boolean } }; necessidade: { classe: string }; confianca: string };
  mercado: { metodo: string; central?: number };
  score: { indice: number; faixa: string; foraDoEscopo: boolean };
  demo: boolean;
}

const lista = ler<Resumo[]>('empreendimentos.json');
const pub = ler<{ geradoEm: string; coletas: { fonte: string; status: string; registrosLidos: number; criados: number; atualizados: number; erros: string[] }[] }>('publicacao.json');
const contar = (f: (v: Resumo) => string) =>
  Object.entries(lista.reduce<Record<string, number>>((m, v) => ((m[f(v)] = (m[f(v)] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}: ${n}`)
    .join(' · ');

const linhas: string[] = [];
linhas.push(`### Dados publicados (${pub.geradoEm})`, '');
linhas.push(`- Empreendimentos: **${lista.length}** (demo: ${lista.filter((v) => v.demo).length})`);
linhas.push(`- Situação: ${contar((v) => v.statusGeral)}`);
linhas.push(`- Necessidade comercial: ${contar((v) => v.previsao.necessidade.classe)}`);
linhas.push(`- Confiança da previsão: ${contar((v) => v.previsao.confianca)}`);
linhas.push(`- Prioridade: ${contar((v) => v.score.faixa)} (fora do escopo < 138 kV: ${lista.filter((v) => v.score.foraDoEscopo).length})`);
linhas.push(`- Método de potencial: ${contar((v) => v.mercado.metodo)}`);
linhas.push(`- Com localização: ${lista.filter((v) => v.ponto).length}; com contratante identificado: ${lista.filter((v) => v.contratante).length}`);
for (const c of pub.coletas) linhas.push(`- Coleta ${c.fonte}: ${c.status} — lidos ${c.registrosLidos}, criados ${c.criados}, atualizados ${c.atualizados}${c.erros.length ? `, erros: ${c.erros.slice(0, 2).join(' | ')}` : ''}`);
linhas.push('', '| # | Empreendimento | UF | kV | RFQ base | Necessidade | Confiança | Índice |', '|---|---|---|---|---|---|---|---|');
const ativos = lista.filter((v) => v.statusGeral === 'ativo').sort((a, b) => b.score.indice - a.score.indice);
ativos.slice(0, 25).forEach((v, i) => {
  const rfq = v.previsao.base.rfq;
  linhas.push(`| ${i + 1} | ${v.nome.replace(/\|/g, '/').slice(0, 90)} | ${v.ufs.join('/')} | ${v.tensaoMaxKv ?? '—'} | ${rfq ? `${rfq.data} (${rfq.natureza}${rfq.vencida ? ', vencida' : ''})` : '—'} | ${v.previsao.necessidade.classe} | ${v.previsao.confianca} | ${v.score.indice} |`);
});
console.log(linhas.join('\n'));
