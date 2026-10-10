/** Sonda 3: camada de UFs do WebMap EPE (por que a BA não é reconhecida). */
const BASE = 'https://gisepeprd2.epe.gov.br/arcgis/rest/services/SMA/WMS_Webmap_EPE/MapServer/23';
const j = async (u) => (await fetch(u, { signal: AbortSignal.timeout(120000) })).json();
const meta = await j(`${BASE}?f=json`);
console.log('campos', (meta.fields ?? []).map((f) => `${f.name}:${f.type}`).join(', '), '| maxRecord', meta.maxRecordCount, '| geom', meta.geometryType);
const attrs = await j(`${BASE}/query?where=1%3D1&outFields=*&returnGeometry=false&f=json`);
for (const f of attrs.features ?? []) console.log(JSON.stringify(f.attributes));
for (const off of [undefined, 0.01]) {
  const q = new URLSearchParams({ where: '1=1', outFields: '*', f: 'geojson', outSR: '4326' });
  if (off) q.set('maxAllowableOffset', String(off));
  const g = await j(`${BASE}/query?${q}`);
  console.log(`\n--- geojson offset=${off ?? 'nenhum'}: ${g.features?.length} feições; erro=${JSON.stringify(g.error ?? null)}`);
  for (const f of g.features ?? []) {
    const geo = f.geometry;
    const aneis = !geo ? 0 : geo.type === 'Polygon' ? geo.coordinates.length : geo.coordinates.reduce((s, p) => s + p.length, 0);
    const pts = !geo ? 0 : JSON.stringify(geo.coordinates).length;
    console.log(`${JSON.stringify(f.properties).slice(0, 120)} | ${geo?.type ?? 'SEM GEOMETRIA'} | anéis ${aneis} | tamanho ${pts}`);
  }
}
console.log('FIM SONDA 3');
