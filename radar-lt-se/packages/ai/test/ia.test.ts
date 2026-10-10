import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { analisarDocumento, compararCronogramas, descreverDiferencas, extrairHeuristico, registroDeAnalise, type SaidaExtracao } from '../src/index.js';

const DOC = `[[página 1]]
RESOLUÇÃO AUTORIZATIVA Nº 0000/2026 (texto fictício de teste).
Autoriza a Transmissora Teste S.A. a implantar a LT 230 kV Alfa – Beta, com extensão de 45 km, no estado de Minas Gerais.
[[página 2]]
O investimento previsto na linha de transmissão é de R$ 120 milhões. A entrada em operação está prevista para 15/06/2028.
A empresa informou que pretende publicar pedido de cotação (RFQ) para a montagem eletromecânica no 2º semestre de 2026.`;

function clienteFalso(saida: SaidaExtracao): Anthropic {
  return {
    beta: {
      messages: {
        parse: async () => ({ stop_reason: 'end_turn', model: 'modelo-teste', parsed_output: saida }),
      },
    },
  } as unknown as Anthropic;
}

describe('extração heurística', () => {
  const r = extrairHeuristico(DOC, '2026-10-10');
  it('extrai tensão, extensão, valor elétrico e UF com trecho e página', () => {
    expect(r.itens.find((i) => i.campo === 'tensaoKv')).toMatchObject({ valor: '230', pagina: 1 });
    expect(r.itens.find((i) => i.campo === 'extensaoKm')?.valor).toBe('45');
    expect(r.itens.find((i) => i.campo === 'capexInfraEletricaBRL')).toMatchObject({ valor: '120000000', pagina: 2 });
    expect(r.itens.find((i) => i.campo === 'uf')?.valor).toBe('MG');
    expect(r.itens.find((i) => i.campo === 'organizacao')?.valor).toBe('Transmissora Teste S.A.');
  });
  it('identifica marcos com natureza e indícios de contratação', () => {
    const energ = r.marcos.find((m) => m.tipo === 'energizacao');
    expect(energ).toMatchObject({ data: '2028-06-15', natureza: 'previsto_oficial' });
    expect(r.marcos.find((m) => m.tipo === 'rfq_publicada')).toMatchObject({ data: '2026-07-01', natureza: 'previsto_oficial' });
    expect(r.indicios.some((i) => i.tipo === 'contratacao_proxima')).toBe(true);
  });
});

describe('análise com LLM (cliente simulado)', () => {
  const saida: SaidaExtracao = {
    itens: [
      { campo: 'extensaoKm', valor: '45', trecho: 'com extensão de 45 km', observacao: null },
      { campo: 'empreendedor', valor: 'Transmissora Teste S.A.', trecho: 'Autoriza a Transmissora Teste S.A. a implantar', observacao: null },
      // Alucinação: trecho inexistente no documento → deve ser descartado
      { campo: 'capacidadeMva', valor: '300', trecho: 'transformador de 300 MVA', observacao: null },
      // Valor ausente do trecho citado → descartado
      { campo: 'tensaoKv', valor: '500', trecho: 'implantar a LT 230 kV Alfa – Beta', observacao: null },
    ],
    marcos: [
      { tipo: 'energizacao', data: '2028-06-15', natureza: 'previsto_oficial', escopo: 'geral', trecho: 'A entrada em operação está prevista para 15/06/2028.' },
      { tipo: 'licenca_instalacao', data: '2026-03-01', natureza: 'realizado', escopo: 'geral', trecho: 'LI emitida em março de 2026' },
    ],
    indicios: [{ tipo: 'contratacao_proxima', descricao: 'RFQ prevista', trecho: 'pretende publicar pedido de cotação (RFQ)' }],
    classificacao: { tipo: 'LT', setor: 'transmissao', justificativa: 'Trata de LT 230 kV', trecho: 'LT 230 kV Alfa – Beta' },
    resumo: 'Autorização para "LT 230 kV Alfa – Beta".',
    lacunas: ['Contratante da obra não informado'],
  };

  it('aceita apenas itens com citação literal e descarta o restante', async () => {
    const r = await analisarDocumento(DOC, { titulo: 'REA teste', hoje: '2026-10-10', llm: { habilitado: true, cliente: clienteFalso(saida) } });
    expect(r.metodo).toBe('llm+heuristico');
    expect(r.modelo).toBe('modelo-teste');
    const llm = r.itens.filter((i) => i.metodo === 'llm');
    expect(llm.map((i) => i.campo).sort()).toEqual(['empreendedor', 'extensaoKm']);
    expect(r.descartados.map((d) => d.motivo)).toEqual([
      'Trecho citado não encontrado literalmente no documento.',
      'Valor não aparece no trecho citado.',
      'Trecho do marco não encontrado literalmente no documento.',
    ]);
    expect(r.marcos.find((m) => m.tipo === 'energizacao' && m.metodo === 'llm')?.pagina).toBe(2);
    expect(r.classificacao?.trecho).toBe('LT 230 kV Alfa – Beta');
    expect(r.lacunas).toEqual(['Contratante da obra não informado']);
  });

  it('sem chave de API usa somente heurística e avisa', async () => {
    const r = await analisarDocumento(DOC, { titulo: 'REA teste', hoje: '2026-10-10' });
    expect(r.metodo).toBe('heuristico');
    expect(r.avisos[0]).toContain('desabilitada');
  });

  it('falha da API cai para heurística sem inventar dados', async () => {
    const quebrado = { beta: { messages: { parse: async () => { throw new Error('rede indisponível'); } } } } as unknown as Anthropic;
    const r = await analisarDocumento(DOC, { titulo: 'x', hoje: '2026-10-10', llm: { habilitado: true, cliente: quebrado } });
    expect(r.metodo).toBe('heuristico');
    expect(r.avisos.join(' ')).toContain('IA generativa indisponível');
  });

  it('registro aplicado contém apenas o aprovado, como inferido e com evidência do documento', async () => {
    const r = await analisarDocumento(DOC, { titulo: 'REA teste', hoje: '2026-10-10', llm: { habilitado: true, cliente: clienteFalso(saida) } });
    const iExt = r.itens.findIndex((i) => i.campo === 'extensaoKm');
    const iMarco = r.marcos.findIndex((m) => m.tipo === 'energizacao');
    const reg = registroDeAnalise(r, { itens: [iExt], marcos: [iMarco], nome: 'LT 230 kV Alfa – Beta' }, { id: 'doc1', titulo: 'REA teste', tipo: 'ato_regulatorio', fonteId: 'aneel-rea' });
    expect(reg).toMatchObject({ nome: 'LT 230 kV Alfa – Beta', extensaoKm: 45, statusDado: 'inferido' });
    expect(reg.capacidadeMva).toBeUndefined();
    expect(reg.marcos).toEqual([{ tipo: 'energizacao', data: '2028-06-15', natureza: 'previsto_oficial', escopo: 'geral', descricao: undefined }]);
    expect(reg.evidencia.documentoId).toBe('doc1');
    expect(reg.evidencia.trecho).toContain('45 km');
  });
});

describe('comparação de cronogramas', () => {
  it('identifica adiamentos, antecipações, realizações, novos e removidos', () => {
    const a = [
      { tipo: 'licenca_instalacao' as const, escopo: 'geral' as const, data: '2026-03-01', natureza: 'previsto_oficial' as const },
      { tipo: 'energizacao' as const, escopo: 'geral' as const, data: '2028-01-01', natureza: 'previsto_oficial' as const },
      { tipo: 'inicio_obras' as const, escopo: 'geral' as const, data: '2026-06-01', natureza: 'previsto_oficial' as const },
    ];
    const b = [
      { tipo: 'licenca_instalacao' as const, escopo: 'geral' as const, data: '2026-04-10', natureza: 'realizado' as const },
      { tipo: 'energizacao' as const, escopo: 'geral' as const, data: '2028-07-01', natureza: 'previsto_oficial' as const },
      { tipo: 'rfq_publicada' as const, escopo: 'LT' as const, data: '2026-05-01', natureza: 'previsto_oficial' as const },
    ];
    const d = compararCronogramas(a, b);
    expect(d.find((x) => x.tipo === 'energizacao')).toMatchObject({ situacao: 'adiado', deltaDias: 182 });
    expect(d.find((x) => x.tipo === 'licenca_instalacao')?.situacao).toBe('realizado');
    expect(d.find((x) => x.tipo === 'rfq_publicada')?.situacao).toBe('novo');
    expect(d.find((x) => x.tipo === 'inicio_obras')?.situacao).toBe('removido');
    expect(descreverDiferencas(d).some((t) => t.includes('+182 dias'))).toBe(true);
  });
});
