/** Gera identificadores únicos (UUID v4) em Node e no navegador. */
export function novoId(prefixo?: string): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
  return prefixo ? `${prefixo}_${uuid}` : uuid;
}

/** Hash determinístico curto (FNV-1a 32 bits) — para chaves de deduplicação, não para segurança. */
export function hashCurto(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Serialização JSON estável (chaves ordenadas), útil para comparar estruturas. */
export function jsonEstavel(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(jsonEstavel).join(',')}]`;
  const obj = valor as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${jsonEstavel(obj[k])}`)
    .join(',')}}`;
}
