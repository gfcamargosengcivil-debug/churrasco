import { readFileSync } from 'node:fs';
import type { Empreendimento } from '@radar/core';
const e = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const ps: Empreendimento[] = e.empreendimentos;
for (const cod of ['RLT-000734', 'RLT-000146', 'RLT-000013']) {
  const p = ps.find((x) => x.codigo === cod)!;
  console.log('==', cod, p.nomeOficial, p.localizacao.ufs, 'alt:', p.nomesAlternativos);
  console.log('  trechos:', p.trechosLT.map((t) => `${t.nome}|${t.origem ?? ''}>${t.destino ?? ''}|${t.extensaoKm ?? ''}|${t.corrente}`).join(' ;; '));
  console.log('  ses:', p.subestacoes.map((s) => `${s.nome}(${s.natureza},${s.tensoesKv})`).join(', '));
  console.log('  part:', p.participantes.map((x) => `${e.organizacoes.find((o: { id: string }) => o.id === x.organizacaoId)?.nome}:${x.papel}`).join(', '));
  console.log('  hist ufs:', JSON.stringify(p.historico.filter((h) => h.campo.includes('uf')).slice(0, 6)));
  console.log('  ev:', p.evidencias.map((v) => `${v.fonteId}: ${v.titulo.slice(0, 80)}`).join(' | '));
  console.log('  desc:', (p.descricao ?? '').slice(0, 600));
}
