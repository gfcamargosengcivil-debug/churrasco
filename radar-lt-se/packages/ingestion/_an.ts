import { readFileSync } from 'node:fs';
import { possiveisDuplicidades, type Empreendimento, type Organizacao } from '@radar/core';
const e = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const ps: Empreendimento[] = e.empreendimentos;
const orgs = new Map<string, Organizacao>((e.organizacoes ?? []).map((o: Organizacao) => [o.id, o]));
const fontes = (p: Empreendimento) => [...new Set(p.evidencias.map((x) => x.fonteId))].join('+');
const cont: Record<string, number> = {};
for (const p of ps) cont[fontes(p)] = (cont[fontes(p)] ?? 0) + 1;
console.log('combinações de fontes', cont);
const q = ps.find((p) => p.nomeOficial.startsWith('LT 525 kV Curitiba Oeste – Abdon Batista 2'));
if (q) console.log(q.codigo, q.localizacao.ufs, fontes(q), JSON.stringify(q.proveniencia?.['localizacao.ufs'] ?? q.proveniencia?.ufs ?? Object.keys(q.proveniencia ?? {}).filter((k) => k.includes('uf'))));
const d = possiveisDuplicidades(ps.filter((p) => p.statusGeral !== 'cancelado'), orgs);
console.log('duplicidades', d.length, 'score1', d.filter((x) => x.pontuacao === 1).length);
const nome = new Map(ps.map((p) => [p.id, `${p.codigo} ${p.nomeOficial.slice(0, 70)} [${fontes(p)}]`]));
for (const x of d.slice(0, 25)) console.log(x.pontuacao, '|', nome.get(x.a), '×', nome.get(x.b));
for (const t of ['Graça Aranha', 'Quixadá', 'Estância', 'Chapecoense', 'Água Azul', 'Porto do Açu', 'Ourolândia']) {
  console.log('--', t);
  for (const p of ps.filter((p) => p.nomeOficial.includes(t) || p.nomesAlternativos.some((n) => n.includes(t))).slice(0, 8)) console.log('  ', p.codigo, p.statusGeral, p.nomeOficial.slice(0, 90), '[', fontes(p), ']', p.financeiro.capexInfraEletrica ? `capex ${p.financeiro.capexInfraEletrica.valorBRL} ${p.financeiro.capexInfraEletrica.natureza}` : '');
}
