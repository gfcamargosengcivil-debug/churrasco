/**
 * Publicação estática (GitHub Pages): cada rota GET da API vira um arquivo. Regra única usada pelo
 * gerador (scripts/publicar-estatico.ts) e pelo front em modo estático.
 */
export function arquivoEstatico(caminho: string): string {
  const [rota, consulta = ''] = caminho.split('?');
  // Parâmetros que não alteram o resultado (ex.: rota atual usada só para revalidar) são ignorados.
  const params = new URLSearchParams(consulta);
  params.delete('p');
  params.sort();
  const sufixo = params.toString() ? `__${params.toString().replace(/[^a-zA-Z0-9]+/g, '_')}` : '';
  const ext = /\.(xlsx|csv)$/.test(rota) ? '' : '.json';
  return `dados${rota}${sufixo}${ext}`;
}
