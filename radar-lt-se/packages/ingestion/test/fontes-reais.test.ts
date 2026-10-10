/**
 * Conectores reais (ANEEL SIGET, leilões de transmissão, EPE WebMap) contra respostas gravadas.
 * As linhas do SIGET (empreendimentos), dos leilões e da EPE são amostras reais dos conjuntos
 * públicos, registradas pela sonda de fontes (scripts/sonda) em 10/10/2026. As linhas de contrato
 * e de resolução usadas para testar as junções são FICTÍCIAS (mesmas colunas, valores inventados).
 */
import { describe, expect, it } from 'vitest';
import type { Fonte, RegistroNormalizado } from '@radar/core';
import {
  adaptadorEpeWebmap, adaptadorLeiloesTransmissao, adaptadorSiget, CATALOGO_FONTES, registroLeilao, registroSE, registrosLT,
  localizarPorSubestacao, poligonosUf, subestacoesCitadas, ufDoPonto, ufsDoModulo, type FeicaoEpe, type PoligonoUf,
} from '../src/index.js';

const HOJE = '2026-10-10';
const fonte = (id: string): Fonte => CATALOGO_FONTES.find((f) => f.id === id)!;

// --- Amostras reais do SIGET (datastore ANEEL) ---------------------------------------------------
const SIGET_RIBEIRAO = {
  _id: 253, DatGeracaoConjuntoDados: '2026-10-08', IdeCcd: '6385', IdeCcdProprietario: '6385', IdeDoc: '234859', IdeEpd: '5863', IdeOnsEpd: 'T2023-106',
  NomEpd: 'Reforço na SE Ribeirão Preto: Instalação do 2º RTB 500 kV – 3x60 Mvar',
  DscEpd: 'Instalação do 2º RTB 500 kV – 3x60 Mvar na SE Ribeirão Preto-Instalação da conexão para o 2º RTB 500 kV – 3x60 Mvar, em 500 kV e arranjo DJM, na SE Ribeirão Preto.',
  DscSituacaoEpd: 'Em andamento', DatEfeOprComEpd: null, DatCaoCgmAtoLgl: '27/06/2025', DatOprComEpd: '30/11/2026', IdeObr: '27249',
  DscObr: 'Instalação de IB em 500 kV e arranjo DJM, associada à instalação do 2º RTB 500 kV – 3x60 MVA na SE Ribeirão Preto', DscSitObr: 'Em andamento',
  NumVdaUtlMdl: '32', DatOprComObr: null, DscTipObr: 'Instalação', IdeMdl: '41128', IdeOnsMdl: 'INS-SPRPR', NomMdl: 'IB 500 kV MG 500 kV RIBEIRAO PRETO MG2 SP IB6',
  DscMdl: null, IdeTipMdl: '2', DscSituacaoModulo: 'IB 500 kV MG 500 kV RIBEIRAO PRETO MG2 SP IB6', DscTipMdl: 'Módulo de Manobra', SigTipMdl: 'MM',
  DscClfMdl: 'Composição da Rede Básica', SglClfMdl: 'RB', DscItmClfMdl: 'Rede Básica', IdeCcoTarReceita: '21', VlrHisRct: '2237678,4800000000', DatFimCcd: '20/04/2037',
};
const SIGET_ITAPETI_LT = {
  _id: 310, DatGeracaoConjuntoDados: '2026-10-08', IdeCcd: '6387', IdeCcdProprietario: '6387', IdeDoc: null, IdeEpd: '6732', IdeOnsEpd: 'T2026-263',
  NomEpd: 'Reforço na LT 345 kV Itapeti - Nordeste C2',
  DscEpd: 'Lançamento do 2° circuito em estruturas existentes de circuito duplo, 345 kV, 2 x 954 (RAIL), 1195/1350 MVA, 29 km1 EL (Entrada de Linha) 345 kV, Arranjo BD5 // ITAPETI1 EL (Entrada de Linha) 345 kV, Arranjo BD5 // NORDESTE',
  DscSituacaoEpd: 'Planejado', DatEfeOprComEpd: null, DatCaoCgmAtoLgl: null, DatOprComEpd: null, IdeObr: '30382',
  DscObr: 'Lançamento do 2° circuito da LT 345 KV Itapeti - Nordeste C2 em estruturas existentes de circuito duplo, 2 x 954 (RAIL), 1195/1350 MVA, 29 km.',
  DscSitObr: 'Planejado', NumVdaUtlMdl: '37', DatOprComObr: null, DscTipObr: 'Instalação', IdeMdl: '44946', IdeOnsMdl: null, NomMdl: 'LT 345 kV ITAPETI /NORDESTE C-2 SP',
  DscMdl: null, IdeTipMdl: '4', DscSituacaoModulo: 'LT 345 kV ITAPETI /NORDESTE C-2 SP', DscTipMdl: 'Módulo Linha de Transmissão', SigTipMdl: 'LT',
  DscClfMdl: 'Composição da Rede Básica', SglClfMdl: 'RB', DscItmClfMdl: 'Rede Básica', IdeCcoTarReceita: '21', VlrHisRct: '4469083,3700000000', DatFimCcd: '27/04/2036',
};
const SIGET_OPERACAO = { ...SIGET_RIBEIRAO, IdeEpd: '484', IdeOnsEpd: 'T2000-117-B', NomEpd: 'LT Picos / Tauá', DscSituacaoEpd: 'Em Operação', DatEfeOprComEpd: '17/04/2014' };
// FICTÍCIOS (somente para testar as junções contrato/resolução ↔ empreendimento).
const CONTRATO_6385 = { _id: 9, DatGeracaoConjuntoDados: '2026-10-08', IdeCcd: '6385', IdcTipoCcd: 'CCO-Contrato de Concessão', NumCnaCcd: 'TESTE/0000', DatAsnCcd: '20/04/2007', DatFimCcd: '20/04/2037', IdAgente: '1', NumCNPJ: '2998301000181', DscRazaoSocial: 'Transmissora Fictícia de Teste S.A.', SigUF: 'SP' };
const RESOLUCAO_5863 = {
  _id: 1, IdeCcd: 6385, IdcTipoCcd: 'CCO-Contrato de Concessão', NumCnaCcd: 'TESTE/0000', CodReg: 'REA-TESTE-0001', IdeDoc: 234859, NumAto: 1,
  DatAssDoc: '2023-06-27T00:00:00.000', DatEmiDoc: '2023-06-27T00:00:00.000', DatPubDoc: '2023-07-05T00:00:00.000',
  DscEmentaCcd: 'Ementa fictícia de teste.', DscLink: 'https://exemplo.invalid/REA-TESTE-0001', IdeEpd: 5863,
};

/** CKAN falso: package_show lista recursos; datastore_search devolve as linhas por recurso (com paginação). */
function ckanFalso(recursos: Record<string, { nome: string; linhas: object[] }>, pacotes: Record<string, string[]>): typeof fetch {
  return (async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/package_show')) {
      const ids = pacotes[u.searchParams.get('id')!] ?? [];
      return new Response(JSON.stringify({ success: true, result: { resources: ids.map((id) => ({ id, name: recursos[id].nome, format: 'CSV', datastore_active: true, last_modified: '2026-10-08T05:35:30' })) } }), { status: 200 });
    }
    if (u.pathname.endsWith('/datastore_search')) {
      const r = recursos[u.searchParams.get('resource_id')!];
      const offset = Number(u.searchParams.get('offset') ?? 0);
      return new Response(JSON.stringify({ success: true, result: { records: r.linhas.slice(offset, offset + Number(u.searchParams.get('limit'))), total: r.linhas.length } }), { status: 200 });
    }
    return new Response('nao encontrado', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('ANEEL SIGET', () => {
  const recursos = {
    epd: { nome: 'SIGET - Contrato Empreendimento Obra Módulo.csv', linhas: [SIGET_RIBEIRAO, { ...SIGET_RIBEIRAO, _id: 254, IdeObr: '27250', DscObr: 'Instalação do reator', NomMdl: 'RTB 500 kV 3x60 Mvar RIBEIRAO PRETO RT2 SP', SigTipMdl: 'ME' }, SIGET_ITAPETI_LT, SIGET_OPERACAO] },
    res: { nome: 'SIGET - Resolução Contrato Agente.csv', linhas: [RESOLUCAO_5863] },
    ccd: { nome: 'SIGET - Contrato Agente.csv', linhas: [CONTRATO_6385] },
    lt: {
      nome: 'SIGET - Contrato Módulo Linha Transmissão Subestação Origem Subestação Destino.csv',
      linhas: [{ IdeMdl: 44946, NomLinTms: 'LT 345 kV ITAPETI /NORDESTE SP', NumCcuLinTms: 2, NumEtnLinTms: '29,0000000000', NomSubestacaoOrigem: 'ITAPETI', SigUFSubestacaoOrigem: 'SP', NomSubestacaoDestino: 'NORDESTE', SigUFSubestacaoDestino: 'SP', NumTensaoBaseLinhaTransm: '345,00' }],
    },
  };
  const f = ckanFalso(recursos, { 'sistema-de-gestao-da-transmissao-siget': ['epd', 'res', 'ccd', 'lt'] });

  it('agrupa módulos por empreendimento, mantém só em andamento/planejados e cita as colunas oficiais', async () => {
    const r = await adaptadorSiget.coletar(fonte('aneel-siget'), { fetch: f, hoje: HOJE, env: {} });
    expect(r.lidos).toBe(4);
    expect(r.registros.map((x) => x.chaveExterna).sort()).toEqual(['siget:5863', 'siget:6732']);
    const rib = r.registros.find((x) => x.chaveExterna === 'siget:5863')!;
    expect(rib).toMatchObject({ tipo: 'SE', ufs: ['SP'], tensoesKv: [500], statusGeral: 'ativo', situacoes: { regulatoria: 'autorizada' } });
    expect(rib.organizacoes?.[0]).toMatchObject({ nome: 'Transmissora Fictícia de Teste S.A.', papel: 'concessionaria', cnpj: '02998301000181' });
    expect(rib.marcos).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: 'autorizacao_publicada', data: '2023-07-05', natureza: 'realizado' }),
      expect.objectContaining({ tipo: 'prazo_contratual_energizacao', data: '2025-06-27', natureza: 'previsto_oficial' }),
      expect.objectContaining({ tipo: 'operacao_comercial', data: '2026-11-30', natureza: 'previsto_oficial' }),
    ]));
    expect(rib.identificadores).toEqual(expect.arrayContaining([{ tipo: 'aneel_siget_empreendimento', valor: '5863' }, { tipo: 'aneel_rea', valor: 'REA-TESTE-0001' }]));
    expect(rib.evidencia.trecho).toContain('DatCaoCgmAtoLgl=27/06/2025');
    expect(rib.evidencia.url).toContain('/dataset/sistema-de-gestao-da-transmissao-siget/resource/epd');
  });

  it('reforço planejado sem ato: sem outorga inventada; LT com extensão e extremidades oficiais', async () => {
    const r = await adaptadorSiget.coletar(fonte('aneel-siget'), { fetch: f, hoje: HOJE, env: {} });
    const lt = r.registros.find((x) => x.chaveExterna === 'siget:6732')!;
    expect(lt.situacoes).toEqual({ regulatoria: 'em_planejamento' });
    expect(lt.marcos).toEqual([]);
    expect(lt.tipo).toBe('LT');
    expect(lt.extensaoKm).toBe(29);
    expect(lt.trechosLT?.[0]).toMatchObject({ tensaoKv: 345, origem: 'ITAPETI', destino: 'NORDESTE', circuitos: 2 });
  });

  it('auxiliares de nome de módulo', () => {
    expect(ufsDoModulo('LT 230 kV PICOS /TAUA II C-1 PI/CE')).toEqual(['PI', 'CE']);
    expect(ufsDoModulo('TR 230/138 kV IBICOARA TR3 BA')).toEqual(['BA']);
    expect(subestacoesCitadas('Reforço na SE IBICOARA: Instalação do 3° ATF 230/138 kV')).toEqual(['IBICOARA']);
    // Resíduos reais apontados na revisão: caixa alta, palavra colada, preposição + palavra-chave.
    expect(subestacoesCitadas('Reforço na SE São Luis II DO BANCO DE CAPACITORES')).toEqual(['São Luis II']);
    expect(subestacoesCitadas('Reforço na SE Itararé IISubstituição do TR5')).toEqual(['Itararé II']);
    expect(subestacoesCitadas('SE Nova Ponte 3 Seccionamento da LT')).toEqual(['Nova Ponte 3']);
    expect(subestacoesCitadas('Reforço na SE Ponte Nova: 2º TR 345/138 kV')).toEqual(['Ponte Nova']);
    expect(subestacoesCitadas('SE CuiabáNorte; SE Cuiabá Norte')).toHaveLength(1);
  });
});

// --- Amostras reais do resultado de leilões de transmissão ------------------------------------------
const LEILAO_ESTANCIA = {
  _id: 486, AnoLeilao: 2024, DatLeilao: '2024-09-27T00:00:00.000', NumLeilao: '002/2024', NumLoteLeilao: 3,
  NomEmpreendimento: 'SE 440/138 kV Estância- Trechos de LT 440 kV entre a SE Estância e o seccionamento da LT 440 kV Bauru - Salto, C1.',
  SigUFPrincipal: 'SP', QtdPrazoConstrucaoMeses: 42, MdaExtensaoLinhaTransmissaoKm: '3,00', MdaSubEstacoesMVA: '600,00', VlrInvestimentoPrevisto: '244012905,07',
  VlrRAPEditalLeilao: '38156421,15', NomVencedorLeilao: 'Transmissora Aliança de Energia Elétrica S.A.', VlrRAPVencedorLeilao: '17760000,00', PctDesagio: '0,53', DatGeracaoConjuntoDados: '2026-10-01T00:00:00.000',
};
const LEILAO_ANTIGO = { ...LEILAO_ESTANCIA, _id: 1, AnoLeilao: 1999, DatLeilao: '1999-12-03T00:00:00.000', NumLeilao: '007/1999', NumLoteLeilao: 1 };

describe('ANEEL leilões de transmissão', () => {
  it('converte lote com investimento previsto, vencedor e energização apenas estimada (rotulada)', () => {
    const r = registroLeilao(LEILAO_ESTANCIA, { fonte: fonte('aneel-leiloes-transmissao'), hoje: HOJE, url: 'https://dadosabertos.aneel.gov.br/x', mesesAssinatura: 3 });
    if ('erro' in r) throw new Error(r.erro);
    expect(r).toMatchObject({
      tipo: 'LT+SE', ufs: ['SP'], extensaoKm: 3, capacidadeMva: 600, capexInfraEletricaBRL: 244012905.07, rapAnualBRL: 17760000,
      identificadores: [{ tipo: 'aneel_leilao_lote', valor: '002/2024 lote 3' }],
    });
    expect(r.tensoesKv).toEqual([440, 138]);
    expect(r.nome).toMatch(/^Leilão 002\/2024 · Lote 3: SE 440\/138 kV Estância/);
    expect(r.marcos).toEqual([
      expect.objectContaining({ tipo: 'leilao_realizado', data: '2024-09-27', natureza: 'realizado' }),
      expect.objectContaining({ tipo: 'energizacao', data: '2028-06-27', natureza: 'previsto_estimado' }),
    ]);
    expect(r.marcos?.[1].descricao).toContain('Não é data divulgada');
  });

  it('coleta só lotes recentes e localiza o recurso pelo nome', async () => {
    const f = ckanFalso({ lt: { nome: 'resultado-leiloes-transmissao.csv', linhas: [LEILAO_ANTIGO, LEILAO_ESTANCIA] } }, { 'resultado-de-leiloes': ['lt'] });
    const r = await adaptadorLeiloesTransmissao.coletar(fonte('aneel-leiloes-transmissao'), { fetch: f, hoje: HOJE, env: {} });
    expect(r.lidos).toBe(2);
    expect(r.registros.map((x) => x.chaveExterna)).toEqual(['leilao:002/2024:3']);
  });
});

// --- Amostras reais do WebMap EPE ---------------------------------------------------------------------
const UF_TESTE: PoligonoUf[] = [
  { uf: 'GO', poligonos: [[[[-53, -19.5], [-52, -19.5], [-52, -18.5], [-53, -18.5], [-53, -19.5]]]] },
  { uf: 'MA', poligonos: [[[[-45, -6], [-44, -6], [-44, -5], [-45, -5], [-45, -6]]]] },
];
const LT_PARAISO: FeicaoEpe = {
  geometry: { type: 'LineString', coordinates: [[-52.865, -19.2636], [-52.7559, -19.2067], [-52.3819, -18.9024]] },
  properties: { Nome: 'LT 230 kV Paraíso 2 - Chapadão, C3', Ano_Planej: 2037, Tensao: 230, Extensao: 65.87259868, OBJECTID: 12761, Concession: ' ' },
};
const SECC_A: FeicaoEpe = { geometry: { type: 'LineString', coordinates: [[-55.2403, -21.7517], [-55.1132, -21.6827]] }, properties: { Nome: 'SECC LT 230 kV Dourados - Anastácio, C1, na SE Maracaju 2', Ano_Planej: 2037, Tensao: 230, Extensao: 15.20148803, OBJECTID: 12762, Concession: ' ' } };
const SECC_B: FeicaoEpe = { ...SECC_A, properties: { ...SECC_A.properties, OBJECTID: 12763 } };
const SE_GRACA: FeicaoEpe = { geometry: { type: 'Point', coordinates: [-44.35665586999993, -5.374211927823772] }, properties: { Nome: 'SE Graça Aranha', Ano_Opera: '2028', Tensao: '800/500', Concession: '-', OBJECTID: 5586, longitude: null, latitude: null } };

describe('EPE WebMap', () => {
  const ctx = { fonte: fonte('epe-webmap'), hoje: HOJE, url: 'https://gisepeprd2.epe.gov.br/x/10', rotuloCamada: 'Linhas de Transmissão - Expansão Planejada', ufs: UF_TESTE };

  it('LT planejada: traçado aproximado, UF pela geometria, ano com precisão anual explícita', () => {
    const { registros } = registrosLT([LT_PARAISO], ctx);
    expect(registros).toHaveLength(1);
    const r = registros[0];
    expect(r).toMatchObject({ tipo: 'LT', tensoesKv: [230], extensaoKm: 65.87, ufs: ['GO'], situacoes: { regulatoria: 'em_planejamento' } });
    expect(r.trechosLT?.[0].tracado?.natureza).toBe('aproximado_digitalizado');
    expect(r.marcos).toEqual([expect.objectContaining({ tipo: 'energizacao', data: '2037-07-01', natureza: 'previsto_estimado' })]);
    expect(r.marcos?.[0].descricao).toContain('Precisão anual');
    expect(r.marcos?.[0].descricao).toContain('não é data divulgada');
    expect(r.organizacoes).toBeUndefined();
  });

  it('feição repetida na camada (mesma geometria, caso real) conta uma vez; pernas distintas viram trechos', () => {
    const { registros } = registrosLT([SECC_A, SECC_B], ctx);
    expect(registros).toHaveLength(1);
    expect(registros[0].trechosLT).toHaveLength(1);
    expect(registros[0].extensaoKm).toBeCloseTo(15.2, 1);
    expect(registros[0].descricao).toContain('repetida');
    const perna2: FeicaoEpe = { ...SECC_B, geometry: { type: 'LineString', coordinates: [[-55.1132, -21.6827], [-55.0, -21.6]] } };
    const r2 = registrosLT([SECC_A, perna2], ctx).registros[0];
    expect(r2.trechosLT).toHaveLength(2);
    expect(new Set(r2.trechosLT!.map((t) => t.nome)).size).toBe(2);
  });

  it('UF pelo código IBGE quando a sigla da camada diverge (caso real: Bahia gravada como "BH")', () => {
    const ufs = poligonosUf([{ geometry: { type: 'Polygon', coordinates: [[[-42, -15], [-39, -15], [-39, -11], [-42, -11], [-42, -15]]] }, properties: { Nome: 'BAHIA', COD_UF: 29, UF: 'BH' } }]);
    expect(ufs.map((u) => u.uf)).toEqual(['BA']);
    expect(ufDoPonto([-40, -13], ufs)).toBe('BA');
  });

  it('SE planejada: localização aproximada, tensões e UF', () => {
    const r = registroSE(SE_GRACA, { ...ctx, rotuloCamada: 'Subestações - Expansão Planejada' });
    if ('erro' in r) throw new Error(r.erro);
    expect(r).toMatchObject({ nome: 'SE Graça Aranha', tensoesKv: [800, 500], ufs: ['MA'], ponto: { precisao: 'aproximada' } });
    expect(r.marcos?.[0]).toMatchObject({ data: '2028-07-01', natureza: 'previsto_estimado' });
    expect(ufDoPonto([-44.5, -5.5], UF_TESTE)).toBe('MA');
    // Polygon com a ilha antes do continente (ordem devolvida pelo serviço): par-ímpar resolve.
    const ilhaPrimeiro: PoligonoUf[] = [{ uf: 'BA', poligonos: [[[[-38.7, -13.0], [-38.6, -13.0], [-38.6, -12.9], [-38.7, -12.9], [-38.7, -13.0]], [[-42, -15], [-39, -15], [-39, -11], [-42, -11], [-42, -15]]]] }];
    expect(ufDoPonto([-40.5, -12.5], ilhaPrimeiro)).toBe('BA');
    expect(ufDoPonto([-38.65, -12.95], ilhaPrimeiro)).toBe('BA');
    expect(ufDoPonto([-40, -5.5], UF_TESTE)).toBeUndefined();
  });

  it('coleta paginada das camadas (LT, SE, UF)', async () => {
    const respostas: Record<string, object> = {
      '/10/query': { type: 'FeatureCollection', features: [LT_PARAISO] },
      '/9/query': { type: 'FeatureCollection', features: [SE_GRACA] },
      '/23/query': { type: 'FeatureCollection', features: [{ geometry: { type: 'Polygon', coordinates: UF_TESTE[1].poligonos[0] }, properties: { SIGLA: 'MA', NOME: 'Maranhão' } }] },
    };
    const f = (async (url: string) => {
      const k = Object.keys(respostas).find((x) => new URL(url).pathname.endsWith(x));
      return new Response(JSON.stringify(k ? respostas[k] : {}), { status: k ? 200 : 404 });
    }) as unknown as typeof fetch;
    const r = await adaptadorEpeWebmap.coletar(fonte('epe-webmap'), { fetch: f, hoje: HOJE, env: {} });
    expect(r.lidos).toBe(2);
    expect(r.registros.map((x) => x.nome)).toEqual(['LT 230 kV Paraíso 2 - Chapadão, C3', 'SE Graça Aranha']);
    expect(r.registros[1].ufs).toEqual(['MA']);
  });
});

describe('localização pela SE homônima', () => {
  const base = { fonteId: 'aneel-siget', evidencia: { titulo: 'x', tipoDocumento: 'planilha' as const } };
  it('localiza só com correspondência inequívoca de nome e UF; prefere a base existente', () => {
    const indice = new Map([
      ['ribeirao preto', [{ nome: 'SE Ribeirão Preto', uf: 'SP' as const, lon: -47.8, lat: -21.2, base: 'existente' as const }, { nome: 'SE Ribeirão Preto', uf: 'SP' as const, lon: -47.7, lat: -21.1, base: 'planejada' as const }]],
      ['campo grande', [{ nome: 'SE Campo Grande', uf: 'MS' as const, lon: -54.6, lat: -20.4, base: 'existente' as const }, { nome: 'SE Campo Grande', uf: 'RJ' as const, lon: -43.5, lat: -22.9, base: 'existente' as const }]],
      ['dupla', [{ nome: 'SE Dupla', uf: 'GO' as const, lon: -49, lat: -16, base: 'existente' as const }, { nome: 'SE Dupla', uf: 'GO' as const, lon: -49.5, lat: -16.5, base: 'existente' as const }]],
    ]);
    const regs: RegistroNormalizado[] = [
      { ...base, nome: 'Reforço na SE Ribeirão Preto: Instalação do 2º RTB', ufs: ['SP' as const] },
      { ...base, nome: 'Reforço na SE Campo Grande: novo ATF', ufs: ['RJ' as const] },
      { ...base, nome: 'Reforço na SE Campo Grande: outro', ufs: [] },
      { ...base, nome: 'Reforço na SE Dupla: ambígua', ufs: ['GO' as const] },
    ];
    const n = localizarPorSubestacao(regs, indice, (r) => subestacoesCitadas(r.nome));
    expect(n).toBe(2);
    expect(regs[0].ponto).toMatchObject({ lon: -47.8, precisao: 'subestacao' });
    expect(regs[0].ponto?.fonte).toContain('correspondência por nome e UF');
    expect(regs[1].ponto).toMatchObject({ lon: -43.5 });
    expect(regs[2].ponto).toBeUndefined();
    expect(regs[3].ponto).toBeUndefined();
  });
});
