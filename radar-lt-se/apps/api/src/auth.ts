/**
 * Autenticação e autorização.
 * - AUTH_MODE=dev: sem login; usuário "dev" com papel admin (proibido em produção).
 * - AUTH_MODE=supabase: valida o JWT de acesso do Supabase Auth no servidor (JWKS do projeto
 *   ou segredo HS256 legado). O papel vem de app_metadata.role (definido por um admin).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { ConfigAmbiente } from './config.js';
import type { Usuario } from './servicos/dominio.js';

export type Papel = Usuario['papel'];
const PAPEIS: Papel[] = ['admin', 'analista', 'comercial', 'leitor'];

declare module 'fastify' {
  interface FastifyRequest {
    usuario: Usuario;
  }
}

export type Verificador = (req: FastifyRequest) => Promise<Usuario | undefined>;

export function criarVerificador(amb: ConfigAmbiente): Verificador {
  if (amb.AUTH_MODE === 'dev') {
    return async () => ({ id: 'dev', nome: 'Desenvolvimento (sem login)', papel: 'admin' });
  }
  const jwks = amb.SUPABASE_URL ? createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', amb.SUPABASE_URL)) : undefined;
  const segredo = amb.SUPABASE_JWT_SECRET ? new TextEncoder().encode(amb.SUPABASE_JWT_SECRET) : undefined;
  const emissor = amb.SUPABASE_URL ? new URL('/auth/v1', amb.SUPABASE_URL).toString() : undefined;
  return async (req) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return undefined;
    const token = h.slice(7);
    let payload: JWTPayload;
    try {
      const opcoes = { audience: amb.SUPABASE_JWT_AUDIENCE, issuer: emissor };
      payload = segredo ? (await jwtVerify(token, segredo, { ...opcoes, algorithms: ['HS256'] })).payload : (await jwtVerify(token, jwks!, opcoes)).payload;
    } catch (e) {
      req.log.info({ err: (e as Error).message }, 'token rejeitado');
      return undefined;
    }
    const meta = (payload.app_metadata ?? {}) as { role?: string };
    const papel = PAPEIS.includes(meta.role as Papel) ? (meta.role as Papel) : amb.PAPEL_PADRAO;
    return { id: String(payload.sub), email: payload.email as string | undefined, papel };
  };
}

/** Matriz de permissões por ação. */
export const PERMISSOES = {
  ler: ['admin', 'analista', 'comercial', 'leitor'],
  editarDados: ['admin', 'analista'],
  ingestao: ['admin', 'analista'],
  comercial: ['admin', 'analista', 'comercial'],
  alertas: ['admin', 'analista', 'comercial'],
  administrar: ['admin'],
} satisfies Record<string, Papel[]>;

export type Permissao = keyof typeof PERMISSOES;

export function exigir(permissao: Permissao) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.usuario) return reply.code(401).send({ erro: 'Não autenticado' });
    if (!(PERMISSOES[permissao] as Papel[]).includes(req.usuario.papel)) {
      return reply.code(403).send({ erro: `Permissão insuficiente (${permissao}) para o papel "${req.usuario.papel}".` });
    }
  };
}
