/**
 * Aplica as migrações SQL pendentes (db/migrations/*.sql) em ordem.
 * Com MIGRAR_SUPABASE=true também aplica db/migrations/supabase/*.sql (políticas RLS).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { carregarConfig } from '../config.js';

const amb = carregarConfig({ ...process.env, PERSISTENCIA: 'postgres' });
const raiz = resolve(process.env.MIGRACOES_DIR ?? join(process.cwd(), '../../db/migrations'));
const pool = new pg.Pool({ connectionString: amb.DATABASE_URL, ssl: amb.DATABASE_SSL ? { rejectUnauthorized: false } : undefined });

const arquivos = readdirSync(raiz).filter((f) => f.endsWith('.sql')).sort().map((f) => join(raiz, f));
if (['1', 'true'].includes(String(process.env.MIGRAR_SUPABASE))) {
  arquivos.push(...readdirSync(join(raiz, 'supabase')).filter((f) => f.endsWith('.sql')).sort().map((f) => join(raiz, 'supabase', f)));
}

const c = await pool.connect();
try {
  await c.query('create table if not exists schema_migracao (arquivo text primary key, aplicado_em timestamptz not null default now())');
  const aplicados = new Set((await c.query('select arquivo from schema_migracao')).rows.map((r) => r.arquivo));
  for (const arq of arquivos) {
    const nome = arq.slice(raiz.length + 1);
    if (aplicados.has(nome)) continue;
    process.stdout.write(`Aplicando ${nome}… `);
    await c.query('begin');
    try {
      await c.query(readFileSync(arq, 'utf8'));
      await c.query('insert into schema_migracao (arquivo) values ($1)', [nome]);
      await c.query('commit');
      console.log('ok');
    } catch (e) {
      await c.query('rollback');
      console.log('ERRO');
      throw e;
    }
  }
  console.log('Migrações concluídas.');
} finally {
  c.release();
  await pool.end();
}
