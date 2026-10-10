/**
 * Sonda as fontes públicas reais (rodar onde há acesso à internet, ex.: GitHub Actions).
 * Imprime metadados, campos e amostras para mapear os conectores — não grava nada.
 */
const T = 45000;
const sep = (t) => console.log(`\n${'='.repeat(100)}\n### ${t}\n${'='.repeat(100)}`);
async function get(url, { bytes = 0, json = true } = {}) {
  const c = new AbortController();
  const tm = setTimeout(() => c.abort(), T);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'radar-lt-se-sonda/0.1 (+github actions)', Accept: json ? 'application/json' : '*/*' } });
    if (!bytes) {
      const txt = await r.text();
      if (!r.ok) return { erro: `HTTP ${r.status}`, corpo: txt.slice(0, 300) };
      try { return json ? JSON.parse(txt) : txt; } catch { return { erro: 'nao-json', corpo: txt.slice(0, 500) }; }
    }
    const leitor = r.body.getReader();
    const partes = []; let total = 0;
    while (total < bytes) { const { done, value } = await leitor.read(); if (done) break; partes.push(value); total += value.length; }
    c.abort();
    const buf = Buffer.concat(partes.map((p) => Buffer.from(p))).subarray(0, bytes);
    const utf = buf.toString('utf8');
    return { status: r.status, tipo: r.headers.get('content-type'), tamanho: r.headers.get('content-length'), texto: utf.includes('�') ? buf.toString('latin1') : utf };
  } catch (e) { return { erro: String(e?.message ?? e) }; } finally { clearTimeout(tm); }
}
const curto = (o, n = 1500) => JSON.stringify(o, null, 1).slice(0, n);

// ---------- ANEEL CKAN ----------
const ANEEL = 'https://dadosabertos.aneel.gov.br/api/3/action';
for (const q of ['transmissão', 'transmissao', 'leilão transmissão', 'SIGET', 'subestação', 'linha de transmissão', 'RAP receita anual permitida', 'outorga', 'SIGEL', 'despacho']) {
  sep(`ANEEL package_search: ${q}`);
  const r = await get(`${ANEEL}/package_search?q=${encodeURIComponent(q)}&rows=40`);
  if (r.erro) { console.log(r); continue; }
  console.log(`count=${r.result.count}`);
  for (const p of r.result.results) console.log(`- ${p.name} | ${p.title} | mod ${p.metadata_modified?.slice(0, 10)} | ${p.num_resources} rec`);
}
for (const pacote of ['sistema-de-gestao-da-transmissao-siget']) {
  sep(`ANEEL package_show: ${pacote}`);
  const r = await get(`${ANEEL}/package_show?id=${pacote}`);
  if (r.erro) { console.log(r); continue; }
  console.log(r.result.notes?.slice(0, 800));
  for (const res of r.result.resources) {
    console.log(`\n--- recurso ${res.id} | ${res.name} | ${res.format} | datastore=${res.datastore_active} | mod ${res.last_modified ?? res.metadata_modified}\n    ${res.url}`);
    if (res.datastore_active) {
      const d = await get(`${ANEEL}/datastore_search?resource_id=${res.id}&limit=3`);
      if (d.erro) console.log('   datastore erro', d);
      else {
        console.log(`   total=${d.result.total} campos=${d.result.fields.map((f) => `${f.id}:${f.type}`).join(', ')}`);
        for (const rec of d.result.records) console.log('   ', curto(rec, 1200));
      }
    } else if (/csv/i.test(res.format) || /\.csv$/i.test(res.url)) {
      const a = await get(res.url, { bytes: 2500 });
      console.log('   amostra:', curto(a, 2500));
    }
  }
}

// ---------- EPE ArcGIS ----------
for (const base of ['https://gisepeprd2.epe.gov.br/arcgis/rest/services/SMA/WMS_Webmap_EPE/MapServer', 'https://gisepeprd2.epe.gov.br/arcgis/rest/services/WMS_Webmap_EPE_Data/MapServer']) {
  sep(`EPE ${base}`);
  const s = await get(`${base}?f=json`);
  if (s.erro) { console.log(s); continue; }
  console.log((s.layers ?? []).map((l) => `${l.id}:${l.name}`).join(' | '));
  for (const id of [9, 10]) {
    const m = await get(`${base}/${id}?f=json`);
    if (m.erro) { console.log(id, m); continue; }
    console.log(`\n--- camada ${id} ${m.name} geom=${m.geometryType} maxRecord=${m.maxRecordCount} desc=${(m.description ?? '').slice(0, 300)}`);
    console.log('   campos:', (m.fields ?? []).map((f) => `${f.name}(${f.alias}):${f.type}`).join(', '));
    const n = await get(`${base}/${id}/query?where=1%3D1&returnCountOnly=true&f=json`);
    console.log('   count:', curto(n, 200));
    const q = await get(`${base}/${id}/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=5&f=json`);
    for (const f of q.features ?? []) console.log('   ', curto(f.attributes, 900));
    if (q.erro) console.log('   query erro', q);
  }
}
sep('EPE services root');
console.log(curto(await get('https://gisepeprd2.epe.gov.br/arcgis/rest/services?f=json'), 3000));

// ---------- ANEEL SIGEL ----------
sep('SIGEL services root');
const sg = await get('https://sigel.aneel.gov.br/arcgis/rest/services?f=json');
console.log(curto(sg, 3000));
for (const pasta of sg.folders ?? []) {
  const f = await get(`https://sigel.aneel.gov.br/arcgis/rest/services/${pasta}?f=json`);
  console.log(`pasta ${pasta}:`, curto(f.services ?? f, 1500));
}

// ---------- ONS CKAN ----------
for (const q of ['linha transmissão', 'subestação', 'expansão', 'equipamentos rede básica']) {
  sep(`ONS package_search: ${q}`);
  const r = await get(`https://dados.ons.org.br/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=20`);
  if (r.erro) { console.log(r); continue; }
  for (const p of r.result.results) console.log(`- ${p.name} | ${p.title} | ${p.num_resources} rec | ${p.resources.map((x) => x.format).join(',')}`);
}

// ---------- Páginas ANEEL (acompanhamento / leilões) ----------
for (const u of ['https://www.gov.br/aneel/pt-br/assuntos/transmissao/expansao-da-transmissao', 'https://www.gov.br/aneel/pt-br/assuntos/transmissao', 'https://www.gov.br/aneel/pt-br/assuntos/leiloes']) {
  sep(`Página ${u}`);
  const h = await get(u, { json: false });
  if (typeof h !== 'string') { console.log(h); continue; }
  const links = [...h.matchAll(/href="([^"]+)"[^>]*>([^<]{3,140})</g)].map((m) => `${m[2].trim()} -> ${m[1]}`).filter((l) => /transmiss|leil|acompanh|xls|csv|pdf|expans|obra|empreend/i.test(l));
  console.log([...new Set(links)].slice(0, 120).join('\n'));
}
console.log('\nFIM DA SONDAGEM');
