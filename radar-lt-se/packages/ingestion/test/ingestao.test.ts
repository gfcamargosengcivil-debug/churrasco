import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { Empreendimento, EventoMudanca, Fonte, MatchCandidato, Organizacao } from '@radar/core';
import {
  CATALOGO_FONTES, adaptadorArcgis, adaptadorCkan, adaptadorInlabs, adaptadorRss, analisarFeed, extrairTextoDocumento,
  aplicarEncerramentos, gerarPlanilhaModelo, lerPlanilha, mapearLinhas, novaColeta, finalizarColeta, paginaDoTrecho, processarRegistros,
  type PortaIngestao,
} from '../src/index.js';

const HOJE = '2026-10-10';
const fonte = (id: string): Fonte => CATALOGO_FONTES.find((f) => f.id === id)!;

function fetchFalso(respostas: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    const chave = Object.keys(respostas).find((k) => u.includes(k));
    if (!chave) return new Response('nao encontrado', { status: 404 });
    const corpo = respostas[chave];
    return new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status: 200 });
  }) as typeof fetch;
}

class PortaMemoria implements PortaIngestao {
  projetos: Empreendimento[] = [];
  orgs: Organizacao[] = [];
  matches: MatchCandidato[] = [];
  eventos: EventoMudanca[] = [];
  seq = 0;
  async listarEmpreendimentos() { return this.projetos; }
  async listarOrganizacoes() { return this.orgs; }
  async salvarEmpreendimento(p: Empreendimento) {
    const i = this.projetos.findIndex((x) => x.id === p.id);
    if (i >= 0) this.projetos[i] = p;
    else this.projetos.push(p);
  }
  async salvarOrganizacao(o: Organizacao) { this.orgs.push(o); }
  async salvarMatchCandidato(m: MatchCandidato) { this.matches.push(m); }
  async registrarEventos(e: EventoMudanca[]) { this.eventos.push(...e); }
  async proximoCodigo() { return `RLT-${String(++this.seq).padStart(6, '0')}`; }
}

const CSV = [
  'nome;tensao_kv;extensao_km;ufs;municipios;empreendedor;data_leilao;data_assinatura_concessao;prazo_contratual_energizacao;capex_eletrico_brl;fonte_titulo;fonte_url;fonte_data_publicacao;identificador_tipo;identificador_valor',
  'LT 500 kV Teste A – Teste B;500;210,5;MG, BA;Montes Claros/MG;Transmissora Teste S.A.;15/12/2025;20/03/2026;20/03/2030;R$ 1,2 bilhão;Resultado do leilão (teste);https://exemplo.invalid/leilao;16/12/2025;aneel_leilao_lote;99/2025-L1',
  'SE 69 kV Pequena;69;;SP;;Distribuidora X;;;;;Doc;;;;',
  ';230;;;;;;;;;Doc sem nome;;;;',
  '[EXEMPLO] LT fictícia;230;10;MG;;;;;;;Exemplo;;;;',
].join('\n');

describe('planilha CSV/XLSX', () => {
  it('lê CSV com ";" e mapeia linhas, marcos e valores', async () => {
    const { linhas, cabecalhos } = await lerPlanilha(Buffer.from(CSV, 'utf8'), 'teste.csv');
    expect(linhas).toHaveLength(4);
    const { registros, erros } = mapearLinhas(linhas, cabecalhos, { fonteId: 'aneel-leiloes-transmissao', hoje: HOJE });
    expect(registros).toHaveLength(2);
    const r = registros[0];
    expect(r.tensoesKv).toEqual([500]);
    expect(r.extensaoKm).toBe(210.5);
    expect(r.ufs).toEqual(['MG', 'BA']);
    expect(r.capexInfraEletricaBRL).toBe(1.2e9);
    expect(r.marcos?.find((m) => m.tipo === 'leilao_realizado')).toMatchObject({ data: '2025-12-15', natureza: 'realizado' });
    expect(r.marcos?.find((m) => m.tipo === 'prazo_contratual_energizacao')).toMatchObject({ natureza: 'previsto_oficial' });
    expect(r.identificadores?.[0]).toMatchObject({ tipo: 'aneel_leilao_lote', valor: '99/2025-L1' });
    expect(r.organizacoes?.[0]).toMatchObject({ nome: 'Transmissora Teste S.A.', papel: 'empreendedor' });
    expect(erros.some((e) => e.mensagem.includes('nome'))).toBe(true);
    expect(erros.some((e) => e.mensagem.includes('EXEMPLO'))).toBe(true);
  });

  it('planilha modelo XLSX tem instruções, linha de exemplo ignorada e roundtrip funciona', async () => {
    const buf = await gerarPlanilhaModelo();
    const { linhas, cabecalhos, aba } = await lerPlanilha(buf, 'modelo.xlsx');
    expect(aba).toBe('empreendimentos');
    expect(cabecalhos).toContain('fonte_titulo');
    const { registros, erros } = mapearLinhas(linhas, cabecalhos, { fonteId: 'manual', hoje: HOJE });
    expect(registros).toHaveLength(0);
    expect(erros[0].mensagem).toContain('EXEMPLO');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('dados');
    ws.addRow(['Empreendimento', 'Tensão (kV)', 'Extensão (km)', 'UF', 'Documento', 'Data do leilão']);
    ws.addRow(['LT 230 kV X – Y', 230, 80, 'PA', 'Planilha de teste', new Date(Date.UTC(2025, 5, 30))]);
    const { linhas: l2, cabecalhos: c2 } = await lerPlanilha(Buffer.from(await wb.xlsx.writeBuffer()), 'outra.xlsx');
    const res = mapearLinhas(l2, c2, { fonteId: 'manual', hoje: HOJE });
    expect(res.erros).toEqual([]);
    expect(res.registros[0]).toMatchObject({ nome: 'LT 230 kV X – Y', tensoesKv: [230], extensaoKm: 80, ufs: ['PA'] });
    expect(res.registros[0].marcos?.[0]).toMatchObject({ tipo: 'leilao_realizado', data: '2025-06-30' });
  });

  it('rejeita formatos não suportados', async () => {
    await expect(lerPlanilha(Buffer.from('x'), 'a.doc')).rejects.toThrow('Formato não suportado');
  });
});

describe('pipeline de ingestão', () => {
  it('cria, deduplica, detecta mudanças e descarta fora do escopo', async () => {
    const porta = new PortaMemoria();
    const { linhas, cabecalhos } = await lerPlanilha(Buffer.from(CSV), 'x.csv');
    const { registros } = mapearLinhas(linhas, cabecalhos, { fonteId: 'aneel-leiloes-transmissao', hoje: HOJE });
    const c1 = novaColeta('aneel-leiloes-transmissao', 'upload', 'teste');
    const r1 = await processarRegistros(registros, { porta, fonte: fonte('aneel-leiloes-transmissao'), coleta: c1, por: 'teste' });
    finalizarColeta(r1.coleta);
    expect(r1.coleta).toMatchObject({ criados: 1, descartados: 1, status: 'sucesso' });
    expect(porta.projetos).toHaveLength(1);
    expect(porta.orgs.map((o) => o.nome)).toEqual(['Transmissora Teste S.A.']);
    expect(porta.eventos.map((e) => e.tipo)).toEqual(['novo_empreendimento']);

    // Segunda carga do mesmo lote (identificador oficial) com revisão de prazo → atualização + evento
    const atualizado = { ...registros[0], marcos: [{ tipo: 'prazo_contratual_energizacao' as const, data: '2030-09-20', natureza: 'previsto_oficial' as const }], evidencia: { ...registros[0].evidencia, titulo: 'Aditivo (teste)', dataPublicacao: '2026-06-01' } };
    const c2 = novaColeta('aneel-leiloes-transmissao', 'upload');
    const r2 = await processarRegistros([atualizado], { porta, fonte: fonte('aneel-leiloes-transmissao'), coleta: c2, por: 'teste' });
    expect(r2.coleta.atualizados).toBe(1);
    expect(porta.projetos).toHaveLength(1);
    expect(r2.eventos.map((e) => e.tipo)).toContain('revisao_cronograma');
    expect(r2.eventos.map((e) => e.tipo)).toContain('atraso');
    expect(porta.projetos[0].evidencias).toHaveLength(2);
  });

  it('correspondência duvidosa vai para a fila de revisão', async () => {
    const porta = new PortaMemoria();
    const base = { fonteId: 'manual', nome: 'LT 500 kV Teste A – Teste B', tensoesKv: [500], ufs: ['MG' as const], evidencia: { titulo: 'Registro de teste', tipoDocumento: 'registro_manual' as const } };
    await processarRegistros([base], { porta, fonte: fonte('manual'), coleta: novaColeta('manual', 'manual'), por: 't' });
    const r = await processarRegistros([{ ...base, nome: 'LT Teste B - Teste A', tensoesKv: undefined }], { porta, fonte: fonte('manual'), coleta: novaColeta('manual', 'manual'), por: 't' });
    expect(r.coleta, JSON.stringify(r.coleta)).toMatchObject({ paraRevisao: 1 });
    expect(porta.matches[0].candidatos[0].empreendimentoId).toBe(porta.projetos[0].id);
  });

  it('fonte complementar só acrescenta traçado/identificadores a empreendimento de outra fonte', async () => {
    const porta = new PortaMemoria();
    const siget = {
      fonteId: 'aneel-siget', chaveExterna: 'siget:1', nome: 'LT 500 kV Alfa - Beta C1', tipo: 'LT' as const, tensoesKv: [500], ufs: ['MG' as const], extensaoKm: 120,
      situacoes: { regulatoria: 'outorgada' as const },
      trechosLT: [{ nome: 'LT 500 kV ALFA /BETA C-1 MG', tensaoKv: 500, corrente: 'CA' as const, extensaoKm: 120, origem: 'ALFA', destino: 'BETA' }],
      marcos: [{ tipo: 'operacao_comercial' as const, data: '2027-06-30', natureza: 'previsto_oficial' as const }],
      evidencia: { titulo: 'SIGET', tipoDocumento: 'planilha' as const },
    };
    await processarRegistros([siget], { porta, fonte: fonte('aneel-siget'), coleta: novaColeta('aneel-siget', 'agendado'), por: 't' });
    const epe = {
      fonteId: 'epe-webmap', chaveExterna: 'epe:lt:alfa', nome: 'LT 500 kV Alfa - Beta, C1', tipo: 'LT' as const, tensoesKv: [500], ufs: ['MG' as const], extensaoKm: 3,
      situacoes: { regulatoria: 'em_planejamento' as const },
      trechosLT: [{ nome: 'LT 500 kV Alfa - Beta, C1', tensaoKv: 500, corrente: 'CA' as const, extensaoKm: 3, tracado: { coordenadas: [[-44, -19], [-43, -18]] as [number, number][], natureza: 'aproximado_digitalizado' as const } }],
      marcos: [{ tipo: 'energizacao' as const, data: '2029-12-31', natureza: 'previsto_oficial' as const }],
      evidencia: { titulo: 'EPE', tipoDocumento: 'relatorio_planejamento' as const },
    };
    const r = await processarRegistros([epe], { porta, fonte: fonte('epe-webmap'), coleta: novaColeta('epe-webmap', 'agendado'), por: 't', semRevisaoManual: true });
    expect(r.coleta).toMatchObject({ criados: 0, conflitos: 0 });
    const p = porta.projetos[0];
    expect(porta.projetos).toHaveLength(1);
    expect(p.situacoes.regulatoria).toBe('outorgada');
    expect(p.trechosLT).toHaveLength(1);
    expect(p.trechosLT[0]).toMatchObject({ extensaoKm: 120, tracado: { natureza: 'aproximado_digitalizado' } });
    expect(p.marcos.map((m) => m.tipo)).toEqual(['operacao_comercial']);
    expect(p.identificadores).toContainEqual(expect.objectContaining({ tipo: 'chave_fonte', valor: 'epe-webmap|epe:lt:alfa' }));
  });

  it('encerramento informado pela fonte conclui o empreendimento acompanhado (sem criar outros)', async () => {
    const porta = new PortaMemoria();
    const reg = { fonteId: 'aneel-siget', chaveExterna: 'siget:9', nome: 'Reforço na SE Teste: 2º ATF 500/230 kV', tensoesKv: [500], ufs: ['SP' as const], evidencia: { titulo: 'SIGET', tipoDocumento: 'planilha' as const } };
    await processarRegistros([reg], { porta, fonte: fonte('aneel-siget'), coleta: novaColeta('aneel-siget', 'agendado'), por: 't' });
    const coleta = novaColeta('aneel-siget', 'agendado');
    const n = await aplicarEncerramentos(
      [
        { chaveExterna: 'siget:9', statusGeral: 'concluido', motivo: 'SIGET informa situação "Em Operação"', marcos: [{ tipo: 'operacao_comercial', data: '2026-08-01', natureza: 'realizado' }], evidencia: { titulo: 'SIGET', tipoDocumento: 'planilha' } },
        { chaveExterna: 'siget:999', statusGeral: 'cancelado', motivo: 'revogado', evidencia: { titulo: 'SIGET', tipoDocumento: 'planilha' } },
      ],
      { porta, fonte: fonte('aneel-siget'), coleta, por: 't' },
    );
    expect(n).toBe(1);
    expect(porta.projetos).toHaveLength(1);
    expect(porta.projetos[0]).toMatchObject({ statusGeral: 'concluido', situacaoObra: 'concluida' });
    expect(porta.projetos[0].marcos.some((m) => m.tipo === 'operacao_comercial' && m.natureza === 'realizado')).toBe(true);
  });

  it('sem revisor: incerto vira novo (sinalizado); recoleta pela chave da fonte não duplica', async () => {
    const porta = new PortaMemoria();
    const base = { fonteId: 'manual', nome: 'LT 500 kV Teste A – Teste B', tensoesKv: [500], ufs: ['MG' as const], evidencia: { titulo: 'Registro de teste', tipoDocumento: 'registro_manual' as const } };
    await processarRegistros([base], { porta, fonte: fonte('manual'), coleta: novaColeta('manual', 'manual'), por: 't' });
    const incerto = { ...base, chaveExterna: 'x-1', nome: 'LT Teste B - Teste A', tensoesKv: undefined };
    const r = await processarRegistros([incerto], { porta, fonte: fonte('manual'), coleta: novaColeta('manual', 'manual'), por: 't', semRevisaoManual: true });
    expect(r.coleta).toMatchObject({ criados: 1, paraRevisao: 0 });
    expect(r.coleta.avisos.join(' ')).toContain('correspondência incerta');
    expect(porta.matches).toHaveLength(0);
    const r2 = await processarRegistros([incerto], { porta, fonte: fonte('manual'), coleta: novaColeta('manual', 'manual'), por: 't', semRevisaoManual: true });
    expect(r2.coleta.criados).toBe(0);
    expect(porta.projetos).toHaveLength(2);
    expect(porta.projetos[1].identificadores).toContainEqual(expect.objectContaining({ tipo: 'chave_fonte', valor: 'manual|x-1' }));
  });
});

describe('adaptadores', () => {
  it('CKAN pagina o datastore e usa o mapeamento de colunas', async () => {
    const f: Fonte = { ...fonte('aneel-dados-abertos'), config: { baseUrl: 'https://ckan.teste', resourceId: 'abc', tamanhoPagina: 2, mapeamento: { nome: ['DscEmpreendimento'], tensao_kv: ['MdaTensao'], ufs: ['SigUF'] } } };
    let chamadas = 0;
    const fake = (async (url: string) => {
      chamadas++;
      const off = Number(new URL(url).searchParams.get('offset'));
      const todos = [
        { _id: 1, DscEmpreendimento: 'LT 230 kV P – Q', MdaTensao: '230', SigUF: 'GO' },
        { _id: 2, DscEmpreendimento: 'SE R 500/230 kV', MdaTensao: '500', SigUF: 'TO' },
        { _id: 3, DscEmpreendimento: 'LT 345 kV S – T', MdaTensao: 345, SigUF: 'MG' },
      ];
      return new Response(JSON.stringify({ success: true, result: { records: todos.slice(off, off + 2), total: 3 } }));
    }) as unknown as typeof fetch;
    const r = await adaptadorCkan.coletar(f, { fetch: fake, hoje: HOJE, env: {} });
    expect(chamadas).toBe(2);
    expect(r.lidos).toBe(3);
    expect(r.registros.map((x) => x.tensoesKv?.[0])).toEqual([230, 500, 345]);
    expect(r.registros[0].evidencia.titulo).toContain('conjunto abc');
  });

  it('CKAN sem resourceId informa pendência', async () => {
    expect(adaptadorCkan.validarConfiguracao(fonte('aneel-dados-abertos'), {})).toContain('informar resourceId do conjunto de dados');
  });

  it('ArcGIS converte linhas em traçados aproximados e pontos em SE', async () => {
    const f: Fonte = { ...fonte('epe-webmap'), config: { servicoUrl: 'https://gis.teste/arcgis/rest/services/X/MapServer', camada: 3, mapeamento: { nome: ['NOME'], tensao_kv: ['TENSAO'], extensao_km: ['EXTENSAO'] } } };
    const fake = fetchFalso({
      '/3/query': {
        type: 'FeatureCollection',
        features: [
          { geometry: { type: 'LineString', coordinates: [[-44, -19], [-45, -18]] }, properties: { OBJECTID: 7, NOME: 'LT 500 kV U – V', TENSAO: 500, EXTENSAO: 160 } },
          { geometry: { type: 'Point', coordinates: [-47.9, -15.8] }, properties: { OBJECTID: 8, NOME: 'SE W', TENSAO: '230' } },
        ],
      },
    });
    const r = await adaptadorArcgis.coletar(f, { fetch: fake, hoje: HOJE, env: {} });
    expect(r.registros).toHaveLength(2);
    expect(r.registros[0].trechosLT?.[0].tracado?.natureza).toBe('aproximado_digitalizado');
    expect(r.registros[0].extensaoKm).toBe(160);
    expect(r.registros[1].subestacoes?.[0].ponto).toMatchObject({ lat: -15.8, precisao: 'subestacao' });
  });

  it('RSS e Atom viram sinais filtrados por palavras-chave', async () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
      <item><title>Empresa anuncia subestação 230 kV</title><link>https://exemplo.invalid/1</link><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Nova &lt;b&gt;SE&lt;/b&gt;&lt;/p&gt;</description></item>
      <item><title>Resultado trimestral</title><link>https://exemplo.invalid/2</link></item>
    </channel></rss>`;
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Linha de transmissão licenciada</title><link href="https://exemplo.invalid/3"/><updated>2026-10-01T00:00:00Z</updated><summary>LI emitida</summary></entry></feed>`;
    expect(analisarFeed(rss)[0]).toMatchObject({ titulo: 'Empresa anuncia subestação 230 kV', data: '2026-10-05', resumo: 'Nova SE' });
    expect(analisarFeed(atom)[0]).toMatchObject({ url: 'https://exemplo.invalid/3', data: '2026-10-01' });
    const f: Fonte = { ...fonte('rss-setorial'), config: { feeds: ['https://feed.teste/rss', 'https://feed.teste/atom'], filtroPalavras: ['subestação', 'linha de transmissão'] } };
    const r = await adaptadorRss.coletar(f, { fetch: fetchFalso({ '/rss': rss, '/atom': atom }), hoje: HOJE, env: {} });
    expect(r.sinais.map((s) => s.titulo)).toEqual(['Empresa anuncia subestação 230 kV', 'Linha de transmissão licenciada']);
    expect(r.registros).toEqual([]);
  });

  it('INLABS permanece preparado e não simula coleta', async () => {
    await expect(adaptadorInlabs.coletar(fonte('dou-inlabs'), { fetch, hoje: HOJE, env: {} })).rejects.toThrow('não implementado');
  });

  it('fonte externa só é declarada validada com registro da validação contra o serviço real', () => {
    const externas = CATALOGO_FONTES.filter((f) => ['api_ckan', 'api_arcgis', 'api_rest', 'rss'].includes(f.metodoAcesso));
    const validadas = externas.filter((f) => f.statusIntegracao === 'implementado');
    expect(validadas.every((f) => f.limitacoes.some((l) => l.startsWith('Validado contra o serviço real')))).toBe(true);
    expect(externas.filter((f) => f.statusIntegracao !== 'implementado').every((f) => f.statusIntegracao !== 'implementado')).toBe(true);
  });
});

function pdfMinimo(linhas: string[][]): Buffer {
  const objetos: string[] = [];
  const paginasIds: number[] = [];
  objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objetos[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let prox = 4;
  for (const pagina of linhas) {
    const conteudo = `BT /F1 11 Tf 50 750 Td 14 TL ${pagina.map((l) => `(${l}) Tj T*`).join(' ')} ET`;
    const idConteudo = prox++;
    const idPagina = prox++;
    objetos[idConteudo] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
    objetos[idPagina] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${idConteudo} 0 R >>`;
    paginasIds.push(idPagina);
  }
  objetos[2] = `<< /Type /Pages /Kids [${paginasIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${paginasIds.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < objetos.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objetos[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

describe('documentos', () => {
  it('extrai texto de PDF por página e localiza a página de um trecho', async () => {
    const buf = pdfMinimo([['Resolucao Autorizativa de teste'], ['LT 230 kV Alfa - Beta', 'extensao de 45 km']]);
    const doc = await extrairTextoDocumento(buf, 'rea.pdf');
    expect(doc.mime).toBe('application/pdf');
    expect(doc.totalPaginas).toBe(2);
    expect(doc.texto).toContain('[[página 2]]');
    expect(paginaDoTrecho(doc.paginas, 'LT 230 kV Alfa - Beta')).toBe(2);
    expect(doc.hash).toHaveLength(64);
  });

  it('extrai texto de HTML removendo scripts', async () => {
    const doc = await extrairTextoDocumento(Buffer.from('<html><script>x()</script><p>SE 500 kV</p></html>'), 'a.html');
    expect(doc.texto).toBe('SE 500 kV');
  });
});
