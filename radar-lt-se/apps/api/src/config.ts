import { z } from 'zod';

const Booleano = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'sim', 'yes', 'on'].includes(v.toLowerCase())));

const EsquemaAmbiente = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  /** memoria = arquivo JSON local (demonstração/desenvolvimento); postgres = PostgreSQL/PostGIS (produção). */
  PERSISTENCIA: z.enum(['memoria', 'postgres']).default('memoria'),
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: Booleano.default(false),
  ARQUIVO_DADOS: z.string().default('data/radar.json'),
  /** dev = sem login (bloqueado em produção); supabase = JWT do Supabase Auth validado no servidor. */
  AUTH_MODE: z.enum(['dev', 'supabase']).default('dev'),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().default('authenticated'),
  PAPEL_PADRAO: z.enum(['admin', 'analista', 'comercial', 'leitor']).default('leitor'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Carrega os dados demonstrativos FICTÍCIOS se a base estiver vazia. */
  DEMO_AUTOCARGA: Booleano.default(true),
  /** Agendador de coletas/alertas no processo da API (modo memória) — no modo postgres use o worker. */
  AGENDADOR: Booleano.default(true),
  ANTHROPIC_API_KEY: z.string().optional(),
  IA_MODELO: z.string().default('claude-opus-5-5'),
  IA_LIMITE_CARACTERES: z.coerce.number().int().default(400_000),
  WEB_DIST: z.string().optional(),
  INLABS_EMAIL: z.string().optional(),
  INLABS_SENHA: z.string().optional(),
  SMTP_URL: z.string().optional(),
});

export type ConfigAmbiente = z.infer<typeof EsquemaAmbiente>;

export function carregarConfig(env: Record<string, string | undefined> = process.env): ConfigAmbiente {
  const cfg = EsquemaAmbiente.parse(env);
  if (cfg.NODE_ENV === 'production' && cfg.AUTH_MODE === 'dev') {
    throw new Error('AUTH_MODE=dev não é permitido em produção. Configure AUTH_MODE=supabase.');
  }
  if (cfg.PERSISTENCIA === 'postgres' && !cfg.DATABASE_URL) {
    throw new Error('PERSISTENCIA=postgres exige DATABASE_URL.');
  }
  if (cfg.AUTH_MODE === 'supabase' && !cfg.SUPABASE_URL && !cfg.SUPABASE_JWT_SECRET) {
    throw new Error('AUTH_MODE=supabase exige SUPABASE_URL (JWKS) ou SUPABASE_JWT_SECRET (HS256).');
  }
  return cfg;
}
