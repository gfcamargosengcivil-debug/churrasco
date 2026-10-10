/**
 * Verificação de evidências: um valor extraído só é aceito se o trecho citado existir
 * LITERALMENTE no documento (ignorando apenas diferenças de espaços, maiúsculas e aspas).
 */
const normalizar = (s: string) =>
  s
    .replace(/\[\[página \d+\]\]/g, ' ')
    .replace(/[“”«»"]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export interface IndiceDocumento {
  normalizado: string;
  paginas: string[];
}

export function indexarDocumento(texto: string): IndiceDocumento {
  const paginas = texto.split(/\[\[página \d+\]\]/).filter((p) => p.trim().length).map(normalizar);
  return { normalizado: normalizar(texto), paginas };
}

/** Retorna a página (1-based) do trecho, 0 se encontrado sem marcação de página, ou undefined se não encontrado. */
export function localizarTrecho(indice: IndiceDocumento, trecho: string): number | undefined {
  const alvo = normalizar(trecho).replace(/^"|"$/g, '');
  if (alvo.length < 6) return undefined;
  if (!indice.normalizado.includes(alvo)) return undefined;
  const i = indice.paginas.findIndex((p) => p.includes(alvo));
  return i >= 0 && indice.paginas.length > 1 ? i + 1 : 0;
}

/** O valor deve aparecer (de forma reconhecível) no próprio trecho citado. */
export function valorPresenteNoTrecho(valor: string, trecho: string): boolean {
  const t = normalizar(trecho);
  const v = normalizar(valor);
  if (t.includes(v)) return true;
  const num = Number(valor);
  if (Number.isFinite(num)) {
    const digitos = t.replace(/[^\d]/g, ' ');
    const inteiro = String(Math.trunc(num >= 1e6 ? num / 1e6 : num));
    const inteiroBi = String(Math.trunc(num / 1e9));
    return digitos.includes(inteiro) || (num >= 1e9 && digitos.includes(inteiroBi)) || t.includes(String(num).replace('.', ','));
  }
  return false;
}
