// Empacota a API (e o worker) em JavaScript único por entrada, com dependências externas.
import { build } from 'esbuild';

const comum = { bundle: true, platform: 'node', target: 'node20', format: 'esm', sourcemap: true, packages: 'external', logLevel: 'info' };
// Os pacotes do monorepo (@radar/*) são TypeScript-fonte: incluí-los no bundle.
const externos = { name: 'radar-interno', setup(b) { b.onResolve({ filter: /^@radar\// }, () => undefined); } };
await build({
  ...comum,
  entryPoints: { server: 'src/server.ts', worker: 'src/worker.ts', migrar: 'src/db/migrar.ts', 'semear-demo': 'src/db/semear-demo.ts' },
  outdir: 'dist',
  plugins: [externos],
  packages: undefined,
  external: ['pg', 'pg-native', 'fastify', '@fastify/*', 'exceljs', 'jose', 'zod', 'pino', 'pino-pretty', 'csv-parse', 'fast-xml-parser', 'unpdf', '@anthropic-ai/sdk'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
