import { describe, expect, it } from 'vitest';
import {
  CONFIG_SCORE_PADRAO, PORTFOLIO_PADRAO, calcularScore, estimarMercado, justificativaPriorizacao, preverEmpreendimento,
} from '../src/index.js';
import { marco, projeto } from './fabrica.js';

const LT = { id: 't1', nome: 'LT 500 kV A – B', tensaoKv: 500, corrente: 'CA' as const, extensaoKm: 100, evidenciaIds: [] };
const SE = { id: 's1', nome: 'SE B', natureza: 'nova' as const, tensoesKv: [500], evidenciaIds: [] };

describe('mercado endereçável', () => {
  it('CAPEX total isolado não é endereçável', () => {
    const p = projeto({ tipo: 'expansao_industrial', setorOrigem: 'mineracao', financeiro: { capexTotal: { valorBRL: 5e9, natureza: 'declarado' } } });
    const m = estimarMercado(p);
    expect(m.metodo).toBe('nao_estimavel');
    expect(m.central).toBeUndefined();
    expect(m.capexTotalBRL).toBe(5e9);
    expect(m.memoria.join(' ')).toContain('não é usado como mercado endereçável');
  });

  it('usa % do investimento elétrico declarado, dividido entre LT e SE pela referência paramétrica', () => {
    const p = projeto({ trechosLT: [LT], subestacoes: [SE], financeiro: { capexInfraEletrica: { valorBRL: 1e9, natureza: 'declarado' } } });
    const m = estimarMercado(p);
    expect(m.metodo).toBe('percentual_capex_eletrico');
    // LT ref média = 100 km × 1,25 mi = 125 mi; SE ref média = 65 mi → LT 65,8%
    const pesoLT = 125 / (125 + 65);
    expect(m.porEscopo.LT![0]).toBeCloseTo(1e9 * pesoLT * 0.25, -3);
    expect(m.porEscopo.SE![1]).toBeCloseTo(1e9 * (1 - pesoLT) * 0.3, -3);
    expect(m.faixa![0]).toBeLessThan(m.faixa![1]);
  });

  it('paramétrico por km e por subestação quando não há investimento declarado', () => {
    const p = projeto({ trechosLT: [LT], subestacoes: [SE] });
    const m = estimarMercado(p);
    expect(m.metodo).toBe('parametrico_fisico');
    expect(m.faixa).toEqual([100 * 900_000 + 40_000_000, 100 * 1_600_000 + 90_000_000]);
    expect(m.premissaIlustrativa).toBe(true);
  });

  it('exclui escopos já contratados', () => {
    const p = projeto({
      trechosLT: [LT],
      subestacoes: [SE],
      pacotes: [{ pacote: 'montagem_eletromecanica', escopo: 'LT', faseContratacao: 'contratada', evidenciaIds: [] }],
    });
    const m = estimarMercado(p);
    expect(m.jaContratado).toEqual({ LT: true, SE: false });
    expect(m.porEscopo.LT).toBeUndefined();
    expect(m.faixa).toEqual([40_000_000, 90_000_000]);
  });
});

describe('índice de priorização', () => {
  const base = () =>
    projeto({
      trechosLT: [LT],
      subestacoes: [SE],
      localizacao: { ufs: ['MG'], municipios: [] },
      marcos: [marco('contrato_concessao_assinado', '2025-03-15')],
      participantes: [{ organizacaoId: 'o1', papel: 'concessionaria', evidenciaIds: [] }],
      etapas: [{ etapaId: 'concessao', status: 'concluida', evidenciaIds: [] }],
    });

  it('produz índice 0–100, faixa e justificativa por critério', () => {
    const p = base();
    const previsao = preverEmpreendimento(p, { hoje: '2025-06-01' });
    const r = calcularScore(p, { previsao, mercado: estimarMercado(p), hoje: '2025-06-01' });
    expect(r.indice).toBeGreaterThan(0);
    expect(r.indice).toBeLessThanOrEqual(100);
    expect(r.notas).toHaveLength(10);
    expect(r.notas.every((n) => n.justificativa.length > 5)).toBe(true);
    expect(r.aviso).toContain('não representa probabilidade');
    expect(justificativaPriorizacao(r)).toContain(`índice ${r.indice}/100`);
  });

  it('abaixo de 138 kV fica fora do escopo e com prioridade baixa', () => {
    const p = projeto({ tipo: 'LT', trechosLT: [{ ...LT, tensaoKv: 69 }] });
    const r = calcularScore(p, { previsao: preverEmpreendimento(p), mercado: estimarMercado(p) });
    expect(r.foraDoEscopo).toContain('69 kV');
    expect(r.faixa).toBe('baixa');
  });

  it('pesos configuráveis alteram o índice', () => {
    const p = base();
    const previsao = preverEmpreendimento(p, { hoje: '2025-06-01' });
    const mercado = estimarMercado(p);
    const r1 = calcularScore(p, { previsao, mercado, hoje: '2025-06-01' });
    const pesos = { ...CONFIG_SCORE_PADRAO.pesos, atratividadeGeografica: 0, aderenciaTecnica: 0, proximidadeJanela: 60 };
    const r2 = calcularScore(p, { previsao, mercado, hoje: '2025-06-01', config: { ...CONFIG_SCORE_PADRAO, pesos } });
    expect(r2.indice).not.toBe(r1.indice);
  });

  it('UF prioritária do portfólio recebe nota máxima de geografia', () => {
    const p = base();
    const r = calcularScore(p, {
      previsao: preverEmpreendimento(p),
      mercado: estimarMercado(p),
      portfolio: { ...PORTFOLIO_PADRAO, ufsPrioritarias: ['MG'] },
    });
    expect(r.notas.find((n) => n.criterio === 'atratividadeGeografica')?.nota).toBe(5);
  });
});
