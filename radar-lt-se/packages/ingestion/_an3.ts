import { readFileSync } from 'node:fs';
import { identidadesDoEmpreendimento, type Empreendimento } from '@radar/core';
const e = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const ps: Empreendimento[] = e.empreendimentos;
for (const cod of ['RLT-000146', 'RLT-000922', 'RLT-000929', 'RLT-000903', 'RLT-000930']) {
  const p = ps.find((x) => x.codigo === cod)!;
  console.log('==', cod, p.nomeOficial.slice(0, 100), p.localizacao.ufs);
  console.log('  ids:', identidadesDoEmpreendimento(p).map((i) => `${i.tipo}:${i.kv}:${i.a}|${i.b}:${i.circuitos}${i.se ? ':' + i.se : ''}`).join(' ; '));
  console.log('  nota:', (p.descricao ?? '').split('\n').filter((l) => /contratos|Investimento|Prazo/.test(l)).join(' / ').slice(0, 400));
}
