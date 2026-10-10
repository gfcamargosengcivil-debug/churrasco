/**
 * Teste de fumaça da interface: percorre as páginas principais em tema claro e escuro,
 * falha se houver erro de JavaScript/console ou se o título da página não renderizar,
 * e salva capturas de tela para inspeção visual.
 *
 * Uso: com API e web em execução →  BASE_URL=http://localhost:5173 npm run test:ui
 * Navegador: CHROMIUM_PATH (padrão: Chromium do Playwright em PLAYWRIGHT_BROWSERS_PATH).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SAIDA = process.env.SAIDA ?? 'test-results/ui';
const EXEC = process.env.CHROMIUM_PATH ?? `${process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'}/chromium-1194/chrome-linux/chrome`;
const ROTAS = [
  ['/', 'Visão executiva'],
  ['/radar', 'Radar de oportunidades'],
  ['/mapa', 'Mapa de oportunidades'],
  ['/funil', 'Funil de contratação'],
  ['/previsao', 'Previsão de demanda'],
  ['/clientes', 'Inteligência por cliente'],
  ['/comercial', 'Gestão comercial'],
  ['/alertas', 'Monitoramento e alertas'],
  ['/fontes', 'Fontes e ingestão'],
  ['/qualidade', 'Qualidade e revisão de dados'],
  ['/config', 'Configurações'],
  ['/metodologia', 'Metodologia'],
];

mkdirSync(SAIDA, { recursive: true });
const navegador = await chromium.launch({ executablePath: EXEC });
const falhas = [];
for (const tema of ['light', 'dark']) {
  for (const largura of tema === 'light' ? [1440, 390] : [1440]) {
    const ctx = await navegador.newContext({ viewport: { width: largura, height: 1000 }, colorScheme: tema });
    const pagina = await ctx.newPage();
    const erros = [];
    pagina.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
    pagina.on('console', (m) => {
      // Tiles do mapa podem falhar sem rede externa; não é erro da aplicação.
      if (m.type() === 'error' && !/tile|openstreetmap|ERR_|Failed to load resource/i.test(m.text())) erros.push(`console: ${m.text()}`);
    });
    const rotas = largura === 1440 ? ROTAS : ROTAS.slice(0, 3);
    for (const [rota, titulo] of rotas) {
      erros.length = 0;
      await pagina.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' });
      const ok = await pagina.getByRole('heading', { level: 1, name: titulo }).isVisible().catch(() => false);
      const nome = `${tema}-${largura}${rota.replace(/\//g, '_') || '_inicio'}`;
      await pagina.screenshot({ path: `${SAIDA}/${nome}.png`, fullPage: largura === 1440 });
      const larguraDoc = await pagina.evaluate(() => document.documentElement.scrollWidth);
      if (!ok) falhas.push(`${nome}: título "${titulo}" não encontrado`);
      if (larguraDoc > largura + 2) falhas.push(`${nome}: rolagem horizontal da página (${larguraDoc}px)`);
      for (const e of erros) falhas.push(`${nome}: ${e}`);
    }
    if (largura === 1440) {
      // Ficha do primeiro empreendimento do radar, todas as abas.
      await pagina.goto(`${BASE}/radar`, { waitUntil: 'networkidle' });
      const link = pagina.locator('td.nome a, .nome a').first();
      await link.click();
      await pagina.waitForLoadState('networkidle');
      await pagina.getByRole('tablist').first().waitFor({ timeout: 15000 });
      for (const aba of ['Visão geral', 'Previsão e janelas', 'Prioridade e potencial', 'Marcos', 'Evidências', 'Conflitos e histórico', 'Editar']) {
        erros.length = 0;
        const botao = pagina.getByRole('tab', { name: new RegExp(`^${aba}`) });
        if (!(await botao.count())) continue;
        await botao.click();
        await pagina.waitForTimeout(300);
        await pagina.screenshot({ path: `${SAIDA}/${tema}-ficha-${aba.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}.png`, fullPage: true });
        for (const e of erros) falhas.push(`ficha/${aba} (${tema}): ${e}`);
      }
    }
    await ctx.close();
  }
}
await navegador.close();
if (falhas.length) {
  console.error(`FALHAS (${falhas.length}):\n- ${falhas.join('\n- ')}`);
  process.exit(1);
}
console.log(`OK — páginas renderizadas sem erros. Capturas em ${SAIDA}/`);
