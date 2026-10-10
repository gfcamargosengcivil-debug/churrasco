/** Gera docs/FONTES.md a partir do catálogo de fontes (fonte única da verdade). */
import { writeFileSync } from 'node:fs';
import { ROTULO_FREQUENCIA, ROTULO_METODO_ACESSO, ROTULO_STATUS_INTEGRACAO, DESCRICAO_CLASSE_FONTE } from '@radar/core';
import { CATALOGO_FONTES } from '@radar/ingestion';

const linhas: string[] = [
  '# Catálogo de fontes',
  '',
  '> Gerado por `npm run docs:fontes` a partir de `packages/ingestion/src/fontes/catalogo.ts`. Não editar à mão.',
  '',
  'Princípios: nenhuma integração é declarada como validada sem teste contra o serviço real; quando não há API',
  'utilizável, a fonte opera por **importação manual (CSV/XLSX)** ou **extração documental assistida** com revisão.',
  'A data da última coleta de cada fonte fica registrada na tela **Fontes e ingestão** (tabela `fonte` / `coleta`).',
  '',
  '## Classes de confiabilidade',
  '',
  ...Object.entries(DESCRICAO_CLASSE_FONTE).map(([k, v]) => `- **${k}** — ${v}`),
  '',
  '## Resumo',
  '',
  '| Fonte | Classe | Método | Frequência | Status da integração |',
  '|---|---|---|---|---|',
  ...CATALOGO_FONTES.map((f) => `| ${f.nome} | ${f.classe} | ${ROTULO_METODO_ACESSO[f.metodoAcesso]} | ${ROTULO_FREQUENCIA[f.frequencia]} | ${ROTULO_STATUS_INTEGRACAO[f.statusIntegracao]} |`),
  '',
  '## Detalhamento',
  '',
];
for (const f of CATALOGO_FONTES) {
  linhas.push(`### ${f.nome}`, '');
  linhas.push(`- **Id:** \`${f.id}\` · **Órgão:** ${f.orgao} · **Classe:** ${f.classe}`);
  if (f.url) linhas.push(`- **Portal:** ${f.url}`);
  linhas.push(`- **Método de acesso:** ${ROTULO_METODO_ACESSO[f.metodoAcesso]} (adaptador \`${f.adaptador}\`)`);
  linhas.push(`- **Frequência esperada:** ${ROTULO_FREQUENCIA[f.frequencia]}`);
  linhas.push(`- **Status:** ${ROTULO_STATUS_INTEGRACAO[f.statusIntegracao]}${f.ativo ? '' : ' — desativada até configuração'}`);
  if (f.credenciais.length) linhas.push(`- **Credenciais (variáveis de ambiente do servidor):** ${f.credenciais.map((c) => `\`${c}\``).join(', ')}`);
  if (f.limitacoes.length) {
    linhas.push('- **Limitações conhecidas:**');
    for (const l of f.limitacoes) linhas.push(`  - ${l}`);
  }
  if (f.termosUso) linhas.push(`- **Termos de uso:** ${f.termosUso}`);
  linhas.push('');
}
linhas.push(
  '## Como incluir uma nova fonte',
  '',
  '1. Acrescente a entrada em `packages/ingestion/src/fontes/catalogo.ts` (classe, método, frequência, limitações, status honesto).',
  '2. Se houver API/arquivo estruturado, reutilize um adaptador existente (`ckan`, `arcgis`, `rss`, `querido_diario`) configurando `config`,',
  '   ou crie um novo implementando a interface `Adaptador` (`packages/ingestion/src/adaptadores/tipos.ts`) e registre em `ADAPTADORES`.',
  '3. Escreva teste com resposta simulada (veja `packages/ingestion/test/ingestao.test.ts`).',
  '4. Valide contra o serviço real em homologação (Fontes → Executar agora) e só então altere o status para `implementado`.',
  '5. Rode `npm run docs:fontes` para atualizar este documento.',
  '',
);
writeFileSync(new URL('../docs/FONTES.md', import.meta.url), linhas.join('\n'));
console.log(`docs/FONTES.md gerado (${CATALOGO_FONTES.length} fontes).`);
