import { describe, expect, it } from 'vitest';
import { avaliarConfianca, preverEmpreendimento, verificarConsistenciaMarcos } from '../src/index.js';
import { evidencia, marco, projeto } from './fabrica.js';

const LT200 = { id: 't1', nome: 'LT 500 kV A – B', tensaoKv: 500, corrente: 'CA' as const, extensaoKm: 200, evidenciaIds: [] };
const SE_NOVA = { id: 's1', nome: 'SE B', natureza: 'nova' as const, tensoesKv: [500, 230], evidenciaIds: [] };

describe('previsão de janelas — concessão assinada', () => {
  const p = projeto({ marcos: [marco('contrato_concessao_assinado', '2025-03-15')], trechosLT: [LT200], subestacoes: [SE_NOVA] });
  const prev = preverEmpreendimento(p, { hoje: '2025-06-01' });

  it('calcula RFQ de LT e SE a partir da outorga com premissas por cenário', () => {
    expect(prev.cenarios.base.datas.rfq?.data).toBe('2025-09-15');
    expect(prev.cenarios.base.datas.rfq?.natureza).toBe('calculado_de_marco');
    expect(prev.cenarios.otimista.datas.rfq?.data).toBe('2025-06-15');
    expect(prev.cenarios.conservador.datas.rfq?.data).toBe('2026-01-15');
    expect(prev.janelas.rfq).toMatchObject({ inicio: '2025-06-15', base: '2025-09-15', fim: '2026-01-15' });
  });

  it('separa contratação de LT e de SE', () => {
    expect(prev.cenarios.base.datas.contratacaoLT?.data).toBe('2025-12-15');
    expect(prev.cenarios.base.datas.contratacaoSE?.data).toBe('2026-02-15');
    expect(prev.cenarios.base.datas.assinaturaContrato?.data).toBe('2025-12-15');
  });

  it('não mobiliza antes da Licença de Instalação estimada', () => {
    // LI estimada = outorga + 14 meses = 2026-05-15; mobilização = LI + 1 mês
    expect(prev.cenarios.base.datas.mobilizacao?.data).toBe('2026-06-15');
    expect(prev.cenarios.base.datas.inicioObras?.data).toBe('2026-07-15');
  });

  it('estima energização pela duração da obra (200 km → 16 meses + comissionamento)', () => {
    expect(prev.cenarios.base.datas.energizacao?.data).toBe('2028-01-15');
  });

  it('classifica a necessidade comercial e explicita premissas', () => {
    expect(prev.necessidadeComercial.classe).toBe('curto_prazo');
    expect(prev.cenarios.base.premissas.some((x) => x.includes('Outorga → RFQ/RFP de LT: +6 meses'))).toBe(true);
    expect(prev.cenarios.base.datas.rfq?.calculo).toContain('15/03/2025');
  });
});

describe('previsão — casos especiais', () => {
  it('limita a contratação pela data-limite do prazo de energização e avisa cronograma apertado', () => {
    const p = projeto({
      marcos: [marco('contrato_concessao_assinado', '2025-03-15'), marco('prazo_contratual_energizacao', '2027-03-15', 'previsto_oficial')],
      trechosLT: [{ ...LT200, extensaoKm: 300 }],
      tipo: 'LT',
    });
    const prev = preverEmpreendimento(p, { hoje: '2025-04-01' });
    expect(prev.cenarios.base.datas.rfq?.data).toBe('2024-12-15');
    expect(prev.cenarios.conservador.datas.rfq?.data).toBe('2026-01-15');
    expect(prev.avisos.some((a) => a.includes('cronograma apertado'))).toBe(true);
    expect(prev.avisos.some((a) => a.includes('incompatível'))).toBe(true);
    expect(prev.necessidadeComercial.classe).toBe('verificar');
  });

  it('RFQ observada → necessidade imediata e data realizada', () => {
    const p = projeto({
      marcos: [marco('contrato_concessao_assinado', '2025-01-15'), marco('rfq_publicada', '2025-05-01', 'realizado', { escopo: 'LT' })],
      trechosLT: [LT200],
      subestacoes: [SE_NOVA],
    });
    const prev = preverEmpreendimento(p, { hoje: '2025-06-01' });
    expect(prev.cenarios.base.datas.rfq).toMatchObject({ data: '2025-05-01', natureza: 'realizado' });
    expect(prev.cenarios.otimista.datas.rfq?.data).toBe('2025-05-01');
    expect(prev.necessidadeComercial.classe).toBe('imediata');
  });

  it('contratação já realizada em todos os escopos → já contratada', () => {
    const p = projeto({
      marcos: [marco('contrato_concessao_assinado', '2024-01-15')],
      trechosLT: [LT200],
      subestacoes: [SE_NOVA],
      pacotes: [
        { pacote: 'montagem_eletromecanica', escopo: 'LT', faseContratacao: 'contratada', dataEvento: '2025-02-01', evidenciaIds: [] },
        { pacote: 'construcao_civil', escopo: 'SE', faseContratacao: 'contratada', dataEvento: '2025-03-01', evidenciaIds: [] },
      ],
    });
    const prev = preverEmpreendimento(p, { hoje: '2025-06-01' });
    expect(prev.cenarios.base.datas.contratacaoLT).toMatchObject({ data: '2025-02-01', natureza: 'realizado' });
    expect(prev.cenarios.base.datas.contratacaoSE).toMatchObject({ data: '2025-03-01', natureza: 'realizado' });
    expect(prev.necessidadeComercial.classe).toBe('ja_contratada');
  });

  it('apenas anúncio privado → datas heurísticas e confiança no máximo baixa', () => {
    const p = projeto({
      nomeOficial: 'Expansão da Mina X — SE 230 kV',
      tipo: 'infraestrutura_associada',
      setorOrigem: 'mineracao',
      fluxoId: 'privado_industrial',
      tecnico: { tensoesKv: [230], extensaoKm: 50 },
      marcos: [marco('anuncio', '2025-01-10', 'realizado', { evidenciaIds: ['e1'] })],
      evidencias: [evidencia('e1', { classe: 'B', fonteId: 'ri', dataColeta: '2025-01-20' })],
    });
    const prev = preverEmpreendimento(p, { hoje: '2025-02-01' });
    expect(prev.cenarios.base.datas.rfq).toMatchObject({ data: '2026-05-10', natureza: 'heuristico' });
    expect(['baixa', 'muito_baixa']).toContain(prev.confianca.nivel);
  });

  it('empreendimento cancelado não tem previsão', () => {
    const p = projeto({ statusGeral: 'cancelado', marcos: [marco('contrato_concessao_assinado', '2025-03-15')], trechosLT: [LT200] });
    const prev = preverEmpreendimento(p, { hoje: '2025-06-01' });
    expect(prev.cenarios.base.datas).toEqual({});
    expect(prev.necessidadeComercial.classe).toBe('encerrada');
  });

  it('subestação isolada não gera contratação de LT', () => {
    const p = projeto({ tipo: 'SE', subestacoes: [{ ...SE_NOVA, natureza: 'ampliacao', tensoesKv: [230] }], marcos: [marco('autorizacao_publicada', '2025-02-01')], fluxoId: 'transmissao_autorizacao' });
    const prev = preverEmpreendimento(p, { hoje: '2025-03-01' });
    expect(prev.aplicavel).toEqual({ LT: false, SE: true });
    expect(prev.cenarios.base.datas.contratacaoLT).toBeUndefined();
    expect(prev.cenarios.base.datas.rfq?.data).toBe('2025-10-01');
    expect(prev.cenarios.base.datas.contratacaoSE?.data).toBe('2026-01-01');
  });

  it('prazo contratual nunca é tratado como energização realizada', () => {
    const p = projeto({ marcos: [marco('contrato_concessao_assinado', '2025-03-15'), marco('prazo_contratual_energizacao', '2029-03-15', 'realizado')], trechosLT: [LT200] });
    const prev = preverEmpreendimento(p, { hoje: '2025-06-01' });
    expect(prev.cenarios.base.datas.energizacao?.natureza).not.toBe('realizado');
    expect(prev.cenarios.base.datas.energizacao?.data).toBe('2029-03-15');
    expect(prev.cenarios.base.datas.energizacao?.natureza).toBe('divulgado');
  });

  it('janela estimada que passou sem evidência → verificar', () => {
    const p = projeto({ marcos: [marco('contrato_concessao_assinado', '2023-01-01')], trechosLT: [LT200], tipo: 'LT' });
    const prev = preverEmpreendimento(p, { hoje: '2025-01-01' });
    expect(prev.cenarios.base.datas.rfq?.vencida).toBe(true);
    expect(prev.necessidadeComercial.classe).toBe('verificar');
  });

  it('assinatura de entrada muda quando um marco muda', () => {
    const a = projeto({ marcos: [marco('contrato_concessao_assinado', '2025-03-15')], trechosLT: [LT200] });
    const b = { ...a, marcos: [marco('contrato_concessao_assinado', '2025-04-15')] };
    expect(preverEmpreendimento(a).assinaturaEntrada).not.toBe(preverEmpreendimento(b).assinaturaEntrada);
  });
});

describe('previsão — escopos e Licença de Instalação', () => {
  it('cotação aberta em um escopo prevalece sobre janela vencida do outro', () => {
    const p = projeto({
      marcos: [marco('contrato_concessao_assinado', '2024-08-15')],
      trechosLT: [LT200],
      subestacoes: [SE_NOVA],
      pacotes: [{ pacote: 'montagem_eletromecanica', escopo: 'LT', faseContratacao: 'rfq_rfp', dataEvento: '2025-05-20', evidenciaIds: [] }],
    });
    const prev = preverEmpreendimento(p, { hoje: '2025-06-01' });
    expect(prev.cenarios.base.rfqPorEscopo.LT?.natureza).toBe('realizado');
    expect(prev.cenarios.base.rfqPorEscopo.SE?.vencida).toBe(true);
    expect(prev.necessidadeComercial.classe).toBe('imediata');
    expect(prev.necessidadeComercial.descricao).toContain('LT');
  });

  it('LI emitida sem RFQ identificada antecipa a RFQ (teto de 2 meses no cenário base)', () => {
    const p = projeto({
      tipo: 'LT',
      marcos: [marco('contrato_concessao_assinado', '2025-03-15'), marco('licenca_instalacao', '2025-05-01')],
      trechosLT: [LT200],
    });
    const prev = preverEmpreendimento(p, { hoje: '2025-06-01' });
    expect(prev.cenarios.base.datas.rfq?.data).toBe('2025-07-01');
    expect(prev.cenarios.conservador.datas.rfq?.data).toBe('2026-01-15');
  });

  it('obra iniciada não marca como contratado o escopo com pacote ainda em negociação', () => {
    const p = projeto({
      marcos: [marco('contrato_concessao_assinado', '2024-01-15'), marco('contrato_execucao_assinado', '2025-03-01', 'realizado', { escopo: 'LT' })],
      trechosLT: [LT200],
      subestacoes: [SE_NOVA],
      situacaoObra: 'mobilizacao',
      pacotes: [
        { pacote: 'montagem_eletromecanica', escopo: 'LT', faseContratacao: 'contratada', dataEvento: '2025-03-01', evidenciaIds: [] },
        { pacote: 'construcao_civil', escopo: 'SE', faseContratacao: 'negociacao', dataEvento: '2025-05-01', evidenciaIds: [] },
      ],
    });
    const prev = preverEmpreendimento(p, { hoje: '2025-06-01' });
    expect(prev.cenarios.base.datas.contratacaoLT?.natureza).toBe('realizado');
    expect(prev.cenarios.base.datas.contratacaoSE?.natureza).not.toBe('realizado');
    expect(prev.necessidadeComercial.classe).toBe('imediata');
  });
});

describe('confiança da previsão', () => {
  it('alta com fonte oficial recente, 3 fontes independentes e marcos consistentes', () => {
    const p = projeto({
      trechosLT: [LT200],
      tipo: 'LT',
      marcos: [
        marco('leilao_realizado', '2024-12-10', 'realizado', { evidenciaIds: ['e2'] }),
        marco('contrato_concessao_assinado', '2025-03-15', 'realizado', { evidenciaIds: ['e1', 'e3'] }),
      ],
      evidencias: [
        evidencia('e1', { fonteId: 'aneel', dataColeta: '2025-05-20' }),
        evidencia('e2', { fonteId: 'ccee', dataColeta: '2025-05-20' }),
        evidencia('e3', { fonteId: 'dou', dataColeta: '2025-05-25' }),
      ],
    });
    const prev = preverEmpreendimento(p, { hoje: '2025-06-01' });
    expect(prev.confianca.pontos).toBe(10);
    expect(prev.confianca.nivel).toBe('alta');
  });

  it('inconsistência grave limita a confiança a média', () => {
    const p = projeto({
      trechosLT: [LT200],
      marcos: [
        marco('contrato_concessao_assinado', '2025-03-15', 'realizado', { evidenciaIds: ['e1'] }),
        marco('licenca_previa', '2025-05-10', 'realizado', { evidenciaIds: ['e2'] }),
        marco('licenca_instalacao', '2025-04-10', 'realizado', { evidenciaIds: ['e3'] }),
      ],
      evidencias: [evidencia('e1'), evidencia('e2', { fonteId: 'ibama' }), evidencia('e3', { fonteId: 'dou' })],
    });
    const problemas = verificarConsistenciaMarcos(p, '2025-06-01');
    expect(problemas.some((x) => x.gravidade === 'grave')).toBe(true);
    const prev = preverEmpreendimento(p, { hoje: '2025-06-01' });
    const conf = avaliarConfianca(p, prev.cenarios.base, { hoje: '2025-06-01' });
    expect(['media', 'baixa', 'muito_baixa']).toContain(conf.nivel);
    expect(conf.componentes.find((c) => c.criterio === 'consistencia_marcos')?.pontos).toBe(0);
  });

  it('sem evidências → muito baixa', () => {
    const p = projeto({ marcos: [marco('contrato_concessao_assinado', '2025-03-15')], trechosLT: [LT200] });
    expect(preverEmpreendimento(p, { hoje: '2025-06-01' }).confianca.nivel).toBe('muito_baixa');
  });
});
