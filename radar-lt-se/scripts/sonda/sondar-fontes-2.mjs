/** Sonda 2: dicionários de dados, distribuição de situações e esquemas de leilões/BPR/EPE com geometria. */
import { extractText, getDocumentProxy } from 'unpdf';
const ANEEL = 'https://dadosabertos.aneel.gov.br/api/3/action';
const sep = (t) => console.log(`\n${'='.repeat(90)}\n### ${t}\n${'='.repeat(90)}`);
async function j(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'radar-lt-se-sonda/0.2' }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}
async function todos(resourceId) {
  const out = [];
  for (let off = 0; ; off += 32000) {
    const d = await j(`${ANEEL}/datastore_search?resource_id=${resourceId}&limit=32000&offset=${off}`);
    out.push(...d.result.records);
    if (out.length >= d.result.total || !d.result.records.length) break;
  }
  return out;
}
const contar = (linhas, campo) => Object.entries(linhas.reduce((m, l) => ((m[l[campo] ?? '∅'] = (m[l[campo] ?? '∅'] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
const anoDe = (s) => (s ? (/(\d{4})/.exec(s) ?? [])[1] : undefined);

async function pdf(url, max = 9000) {
  try {
    const buf = new Uint8Array(await (await fetch(url, { signal: AbortSignal.timeout(60000) })).arrayBuffer());
    const { text } = await extractText(await getDocumentProxy(buf), { mergePages: true });
    console.log(text.replace(/\s+\n/g, '\n').slice(0, max));
  } catch (e) { console.log('erro pdf', e.message); }
}

try {
  const pac = (await j(`${ANEEL}/package_show?id=sistema-de-gestao-da-transmissao-siget`)).result;
  for (const nome of ['SIGET - Contrato Empreendimento Obra Módulo', 'SIGET - Resolução Contrato Agente', 'SIGET - Contrato Módulo Linha Transmissão Subestação Origem Subestação Destino']) {
    const r = pac.resources.find((x) => x.name === nome && /pdf/i.test(x.format));
    sep(`Dicionário: ${nome}`);
    if (r) await pdf(r.url); else console.log('não encontrado');
  }
  for (const [nome, id] of [['Contrato Empreendimento Obra Módulo', 'a1366325-1071-4eeb-94bd-27915747b177'], ['Resolução Empreendimento Obra Módulo', '1c345514-893d-44a1-8e7e-a9362137c356']]) {
    sep(`Distribuição: ${nome}`);
    const L = await todos(id);
    console.log('linhas', L.length, 'empreendimentos', new Set(L.map((l) => l.IdeEpd)).size);
    for (const c of ['DscSituacaoEpd', 'DscSitObr', 'DscTipObr', 'SigTipMdl', 'SglClfMdl']) console.log(c, JSON.stringify(contar(L, c).slice(0, 25)));
    const ativos = L.filter((l) => !/opera/i.test(l.DscSituacaoEpd ?? ''));
    const porEpd = new Map();
    for (const l of ativos) porEpd.set(l.IdeEpd, l);
    console.log('empreendimentos fora de operação:', porEpd.size);
    console.log('ano DatCaoCgmAtoLgl (não operação):', JSON.stringify(contar([...porEpd.values()].map((l) => ({ a: anoDe(l.DatCaoCgmAtoLgl) })), 'a')));
    console.log('ano DatOprComEpd (não operação):', JSON.stringify(contar([...porEpd.values()].map((l) => ({ a: anoDe(l.DatOprComEpd) })), 'a')));
    for (const l of [...porEpd.values()].slice(0, 6)) console.log(JSON.stringify(l));
    const amostraSit = {};
    for (const l of ativos) if (!amostraSit[l.DscSituacaoEpd]) amostraSit[l.DscSituacaoEpd] = l;
    for (const [s, l] of Object.entries(amostraSit)) console.log(`EXEMPLO situação "${s}":`, JSON.stringify(l));
  }
  sep('Resolução Contrato Agente: tipos e situação');
  const R = await todos('59ab6779-505e-4aa9-8641-3e07aca25699');
  for (const c of ['IdcTipoCcd', 'DscSituacaoEpd']) console.log(c, JSON.stringify(contar(R, c)));
  console.log('ano DatAssDoc', JSON.stringify(contar(R.map((l) => ({ a: anoDe(l.DatAssDoc) })), 'a').slice(0, 15)));
  sep('Contrato Agente: tipos');
  const C = await todos('60e111c3-6ee1-412e-abe3-bc15af897537');
  console.log(JSON.stringify(contar(C, 'IdcTipoCcd')));
  console.log('ano assinatura', JSON.stringify(contar(C.map((l) => ({ a: anoDe(l.DatAsnCcd) })), 'a').slice(0, 15)));
  sep('LT origem/destino contratos: situação e tensão');
  const LT = await todos('89caca18-e9a8-484c-8772-c67b456d801a');
  for (const c of ['DscSitLinTms', 'NumTensaoBaseLinhaTransm']) console.log(c, JSON.stringify(contar(LT, c).slice(0, 20)));
} catch (e) { console.log('ERRO SIGET', e); }

for (const pacote of ['resultado-de-leiloes', 'bpr-banco-de-precos-de-referencia-linha-de-transmissao', 'bpr-banco-de-precos-de-referencia-subestacao']) {
  sep(`package_show ${pacote}`);
  try {
    const p = (await j(`${ANEEL}/package_show?id=${pacote}`)).result;
    console.log((p.notes ?? '').slice(0, 600));
    for (const r of p.resources.slice(0, 14)) {
      console.log(`--- ${r.id} | ${r.name} | ${r.format} | ds=${r.datastore_active} | ${r.last_modified ?? ''}`);
      if (r.datastore_active) {
        const d = await j(`${ANEEL}/datastore_search?resource_id=${r.id}&limit=2`);
        console.log(`   total=${d.result.total} campos=${d.result.fields.map((f) => f.id).join(', ')}`);
        for (const x of d.result.records) console.log('   ', JSON.stringify(x).slice(0, 1500));
        if (pacote === 'resultado-de-leiloes') {
          const T = await todos(r.id);
          const campoTipo = Object.keys(T[0] ?? {}).find((k) => /tip|segment|leil/i.test(k));
          console.log('   campos tipo candidatos', Object.keys(T[0] ?? {}).filter((k) => /tip|segment|leil|ano|dat/i.test(k)));
          if (campoTipo) console.log('  ', campoTipo, JSON.stringify(contar(T, campoTipo).slice(0, 20)));
          const trans = T.filter((x) => JSON.stringify(x).toLowerCase().includes('transmiss'));
          console.log('   linhas com "transmiss":', trans.length);
          for (const x of trans.slice(-4)) console.log('   T>', JSON.stringify(x).slice(0, 1500));
        }
      }
    }
  } catch (e) { console.log('erro', e.message); }
}

sep('EPE camada 10 com geometria');
const EPE = 'https://gisepeprd2.epe.gov.br/arcgis/rest/services/SMA/WMS_Webmap_EPE/MapServer';
try {
  const q = await j(`${EPE}/10/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=2&f=geojson`);
  console.log(JSON.stringify(q).slice(0, 2500));
  const anos = await j(`${EPE}/10/query?where=1%3D1&outFields=Ano_Planej,Tensao&returnGeometry=false&f=json`);
  console.log('LT por ano', JSON.stringify(contar(anos.features.map((f) => f.attributes), 'Ano_Planej')));
  console.log('LT por tensão', JSON.stringify(contar(anos.features.map((f) => f.attributes), 'Tensao')));
  const se = await j(`${EPE}/9/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=3&f=geojson`);
  console.log('SE geojson', JSON.stringify(se).slice(0, 1500));
  const sea = await j(`${EPE}/9/query?where=1%3D1&outFields=Ano_Opera,Concession&returnGeometry=false&f=json`);
  console.log('SE por ano', JSON.stringify(contar(sea.features.map((f) => f.attributes), 'Ano_Opera')));
  console.log('SE agente', JSON.stringify(contar(sea.features.map((f) => f.attributes), 'Concession').slice(0, 15)));
  const meta = await j(`${EPE}?f=json`);
  console.log('EPE serviço: descrição', (meta.serviceDescription ?? meta.description ?? '').slice(0, 800), '| copyright', meta.copyrightText);
} catch (e) { console.log('erro EPE', e.message); }
console.log('\nFIM SONDA 2');
