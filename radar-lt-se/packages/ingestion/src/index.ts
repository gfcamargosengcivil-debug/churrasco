import { adaptadorArcgis } from './adaptadores/arcgis.js';
import { adaptadorCkan } from './adaptadores/ckan.js';
import { adaptadorInlabs, adaptadorQueridoDiario, adaptadorRss } from './adaptadores/sinais.js';
import type { Adaptador } from './adaptadores/tipos.js';

export * from './adaptadores/tipos.js';
export * from './adaptadores/ckan.js';
export * from './adaptadores/arcgis.js';
export * from './adaptadores/sinais.js';
export * from './fontes/catalogo.js';
export * from './planilha.js';
export * from './documento.js';
export * from './pipeline.js';

/** Adaptadores com coleta automática. "planilha", "documento", "manual" e "demo" são acionados pela interface. */
export const ADAPTADORES: Record<string, Adaptador> = {
  ckan: adaptadorCkan,
  arcgis: adaptadorArcgis,
  rss: adaptadorRss,
  querido_diario: adaptadorQueridoDiario,
  inlabs: adaptadorInlabs,
};
