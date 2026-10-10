import { useCallback, useEffect, useRef, useState } from 'react';
import { obterToken } from './auth';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ErroApi extends Error {
  constructor(public status: number, mensagem: string, public detalhes?: unknown) {
    super(mensagem);
  }
}

function cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
  const t = obterToken();
  return { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra };
}

async function tratar<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let corpo: { erro?: string; detalhes?: unknown } = {};
    try {
      corpo = await r.json();
    } catch {
      /* resposta sem JSON */
    }
    const detalhes = Array.isArray(corpo.detalhes)
      ? (corpo.detalhes as { path?: (string | number)[]; message?: string }[]).map((d) => `${d.path?.join('.') ?? ''}: ${d.message ?? ''}`).join('; ')
      : '';
    throw new ErroApi(r.status, `${corpo.erro ?? `Erro ${r.status}`}${detalhes ? ` — ${detalhes}` : ''}`, corpo.detalhes);
  }
  const tipo = r.headers.get('content-type') ?? '';
  return (tipo.includes('application/json') ? r.json() : r.text()) as Promise<T>;
}

export const api = {
  get: <T>(caminho: string) => fetch(`${BASE}/api${caminho}`, { headers: cabecalhos() }).then((r) => tratar<T>(r)),
  enviar: <T>(metodo: 'POST' | 'PUT' | 'DELETE', caminho: string, corpo?: unknown) =>
    fetch(`${BASE}/api${caminho}`, {
      method: metodo,
      headers: cabecalhos(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    }).then((r) => tratar<T>(r)),
  upload: <T>(caminho: string, arquivo: File, campos: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.append(k, v);
    fd.append('arquivo', arquivo);
    return fetch(`${BASE}/api${caminho}`, { method: 'POST', headers: cabecalhos(), body: fd }).then((r) => tratar<T>(r));
  },
  /** Baixa um arquivo autenticado (exportações). */
  baixar: async (caminho: string, nome: string) => {
    const r = await fetch(`${BASE}/api${caminho}`, { headers: cabecalhos() });
    if (!r.ok) throw new ErroApi(r.status, `Falha ao baixar (${r.status})`);
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};

/** Carrega um recurso da API; mantém o dado anterior enquanto recarrega (sem salto de layout). */
export function useApi<T>(caminho: string | null) {
  const [dados, setDados] = useState<T>();
  const [erro, setErro] = useState<string>();
  const [carregando, setCarregando] = useState(!!caminho);
  const seq = useRef(0);
  const carregar = useCallback(() => {
    if (!caminho) return;
    const n = ++seq.current;
    setCarregando(true);
    api
      .get<T>(caminho)
      .then((d) => {
        if (n === seq.current) {
          setDados(d);
          setErro(undefined);
        }
      })
      .catch((e: Error) => n === seq.current && setErro(e.message))
      .finally(() => n === seq.current && setCarregando(false));
  }, [caminho]);
  useEffect(carregar, [carregar]);
  return { dados, erro, carregando, recarregar: carregar, setDados };
}
