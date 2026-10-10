/**
 * Extração de texto de documentos enviados (PDF, HTML, TXT) com marcação de páginas,
 * para que extrações posteriores possam citar a página do trecho.
 */
import { createHash } from 'node:crypto';

export interface TextoDocumento {
  texto: string;
  paginas: string[];
  totalPaginas: number;
  hash: string;
  mime: string;
  avisos: string[];
}

export const LIMITE_DOCUMENTO_BYTES = 25 * 1024 * 1024;

export function hashConteudo(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function detectarMime(nome: string, buf: Buffer): string {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  const ext = nome.toLowerCase().split('.').pop();
  if (ext === 'html' || ext === 'htm') return 'text/html';
  if (ext === 'txt' || ext === 'md') return 'text/plain';
  if (ext === 'xml') return 'application/xml';
  return 'application/octet-stream';
}

function htmlParaTexto(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export async function extrairTextoDocumento(buf: Buffer, nome: string): Promise<TextoDocumento> {
  if (buf.length > LIMITE_DOCUMENTO_BYTES) throw new Error(`Documento excede ${LIMITE_DOCUMENTO_BYTES / 1024 / 1024} MB.`);
  const mime = detectarMime(nome, buf);
  const hash = hashConteudo(buf);
  const avisos: string[] = [];
  if (mime === 'application/pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const paginas = (Array.isArray(text) ? text : [text]).map((t) => t.replace(/[ \t]+/g, ' ').trim());
    if (paginas.every((p) => p.length < 20)) {
      avisos.push('PDF sem camada de texto (provavelmente digitalizado): é necessário OCR antes da extração.');
    }
    return { texto: paginas.map((p, i) => `[[página ${i + 1}]]\n${p}`).join('\n\n'), paginas, totalPaginas: totalPages, hash, mime, avisos };
  }
  if (mime === 'text/html' || mime === 'application/xml') {
    const t = htmlParaTexto(buf.toString('utf8'));
    return { texto: t, paginas: [t], totalPaginas: 1, hash, mime, avisos };
  }
  if (mime === 'text/plain') {
    const t = buf.toString('utf8');
    return { texto: t, paginas: [t], totalPaginas: 1, hash, mime, avisos };
  }
  throw new Error('Formato de documento não suportado (use PDF, HTML ou TXT).');
}

/** Página (1-based) em que um trecho aparece no texto marcado; undefined se não localizado. */
export function paginaDoTrecho(paginas: string[], trecho: string): number | undefined {
  const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
  const alvo = norm(trecho);
  const i = paginas.findIndex((p) => norm(p).includes(alvo));
  return i >= 0 ? i + 1 : undefined;
}
