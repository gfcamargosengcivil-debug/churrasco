import { describe, expect, it } from 'vitest';
import {
  agruparPorProximidade, avaliarEmpreendimento, detectarMudancas, distanciaKm, eventoJanelaProxima, funilContratacao,
  identificarCorredores, painelExecutivo, preverEmpreendimento, proporCalibracao, regraAplica, PARAMETROS_PREVISAO_PADRAO,
  type AlertaRegra,
} from '../src/index.js';
import { marco, projeto } from './fabrica.js';

const LT = { id: 't1', nome: 'LT 500 kV A – B', tensaoKv: 500, corrente: 'CA' as const, extensaoKm: 100, evidenciaIds: [] };

describe('detecção de mudanças', () => {
  it('novo empreendimento', () => {
    const p = projeto();
    expect(detectarMudancas(null, p).map((e) => e.tipo)).toEqual(['novo_empreendimento']);
  });

  it('licença emitida, revisão de cronograma e atraso', () => {
    const antes = projeto({ marcos: [marco('energizacao', '2027-01-01', 'previsto_oficial')] });
    const depois = {
      ...antes,
      marcos: [marco('energizacao', '2027-06-01', 'previsto_oficial'), marco('licenca_instalacao', '2025-05-01')],
    };
    const tipos = detectarMudancas(antes, depois).map((e) => e.tipo);
    expect(tipos).toContain('licenca_emitida');
    expect(tipos).toContain('revisao_cronograma');
    expect(tipos).toContain('atraso');
  });

  it('abertura de cotação e suspensão', () => {
    const antes = projeto({ pacotes: [{ pacote: 'montagem_eletromecanica', escopo: 'LT', faseContratacao: 'prevista', evidenciaIds: [] }] });
    const depois = {
      ...antes,
      statusGeral: 'suspenso' as const,
      pacotes: [{ pacote: 'montagem_eletromecanica' as const, escopo: 'LT' as const, faseContratacao: 'rfq_rfp' as const, evidenciaIds: [] }],
    };
    const tipos = detectarMudancas(antes, depois).map((e) => e.tipo);
    expect(tipos).toContain('cotacao_aberta');
    expect(tipos).toContain('suspensao');
  });
});

describe('regras de alerta', () => {
  const regra = (filtros: AlertaRegra['filtros']): AlertaRegra => ({ id: 'r', nome: 'R', ativo: true, criadoPor: 'x', filtros, canais: ['app'] });
  const p = projeto({ localizacao: { ufs: ['PA'], municipios: [] }, trechosLT: [LT], marcos: [marco('contrato_concessao_assinado', '2025-03-15')] });
  const [ev] = detectarMudancas(null, p);

  it('filtra por região, tensão e tipo de evento', () => {
    expect(regraAplica(regra({ regioes: ['N'] }), ev, p)).toBe(true);
    expect(regraAplica(regra({ regioes: ['S'] }), ev, p)).toBe(false);
    expect(regraAplica(regra({ tensaoMinKv: 345 }), ev, p)).toBe(true);
    expect(regraAplica(regra({ tensaoMinKv: 600 }), ev, p)).toBe(false);
    expect(regraAplica(regra({ tiposEvento: ['cancelamento'] }), ev, p)).toBe(false);
  });

  it('filtra por janela de contratação (cenário base)', () => {
    const prev = preverEmpreendimento(p, { hoje: '2025-06-01' });
    expect(regraAplica(regra({ janelaContratacaoMeses: 6 }), ev, p, prev, '2025-06-01')).toBe(true);
    expect(regraAplica(regra({ janelaContratacaoMeses: 2 }), ev, p, prev, '2025-06-01')).toBe(false);
    expect(eventoJanelaProxima(p, prev, 6, '2025-06-01T00:00:00Z')?.tipo).toBe('janela_contratacao_proxima');
  });
});

describe('geografia', () => {
  it('distância geodésica BH–SP ≈ 490 km', () => {
    expect(distanciaKm({ lat: -19.92, lon: -43.94 }, { lat: -23.55, lon: -46.63 })).toBeGreaterThan(480);
    expect(distanciaKm({ lat: -19.92, lon: -43.94 }, { lat: -23.55, lon: -46.63 })).toBeLessThan(500);
  });

  it('agrupa oportunidades próximas e ignora localização só por UF', () => {
    const itens = [
      { id: 'a', ponto: { lat: -20.0, lon: -44.0, precisao: 'municipio' as const }, peso: 10 },
      { id: 'b', ponto: { lat: -20.3, lon: -44.2, precisao: 'municipio' as const }, peso: 5 },
      { id: 'c', ponto: { lat: -3.0, lon: -60.0, precisao: 'municipio' as const } },
      { id: 'd', ponto: { lat: -20.1, lon: -44.1, precisao: 'uf' as const } },
    ];
    const cl = agruparPorProximidade(itens, 100);
    expect(cl).toHaveLength(1);
    expect(cl[0].itens.sort()).toEqual(['a', 'b']);
    expect(cl[0].pesoTotal).toBe(15);
  });

  it('identifica corredores conectados por subestações', () => {
    const p1 = projeto({ trechosLT: [{ ...LT, origem: 'SE Alfa', destino: 'SE Beta' }] });
    const p2 = projeto({ trechosLT: [{ ...LT, id: 't2', origem: 'Beta', destino: 'Gama', extensaoKm: 50 }] });
    const c = identificarCorredores([p1, p2]);
    expect(c).toHaveLength(1);
    expect(c[0].subestacoes.sort()).toEqual(['Gama', 'SE Alfa', 'SE Beta']);
    expect(c[0].extensaoKm).toBe(150);
  });
});

describe('agregações', () => {
  it('painel por horizonte e funil com destaque de empreendedor definido sem contratação', () => {
    const p = projeto({
      trechosLT: [LT],
      tipo: 'LT',
      marcos: [marco('contrato_concessao_assinado', '2025-03-15')],
      participantes: [{ organizacaoId: 'o1', papel: 'concessionaria', evidenciaIds: [] }],
    });
    const v = avaliarEmpreendimento(p, { hoje: '2025-06-01' });
    const painel = painelExecutivo([v], { hoje: '2025-06-01' });
    expect(painel.horizontes.find((h) => h.meses === 6)?.quantidade).toBe(1);
    expect(painel.horizontes.find((h) => h.meses === 3)?.quantidade).toBe(0);
    expect(painel.mercado.central).toBeGreaterThan(0);
    const funil = funilContratacao([v], new Map([[p.id, p]]));
    expect(funil.empreendedorDefinidoSemContratacao).toEqual([p.id]);
  });

  it('calibração exige amostra mínima', () => {
    const projetos = Array.from({ length: 10 }, (_, i) =>
      projeto({ marcos: [marco('rfq_publicada', '2024-01-01'), marco('contrato_execucao_assinado', `2024-0${(i % 5) + 3}-01`)] }),
    );
    const props = proporCalibracao(projetos, PARAMETROS_PREVISAO_PADRAO);
    const rfq = props.find((x) => x.parametro === 'rfqParaContrato')!;
    expect(rfq.situacao).toBe('calibravel');
    expect(rfq.amostra).toBe(10);
    expect(rfq.proposto![0]).toBeLessThanOrEqual(rfq.proposto![1]);
    expect(props.find((x) => x.parametro === 'leilaoParaAssinatura')!.situacao).toBe('amostra_insuficiente');
  });
});
