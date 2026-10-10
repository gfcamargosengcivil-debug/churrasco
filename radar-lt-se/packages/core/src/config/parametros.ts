import type { Pacote } from '../constantes.js';
import { ETAPAS_PADRAO, FLUXOS_PADRAO, type EtapaDef, type FluxoDef } from './etapas.js';

/** Intervalo por cenário: [otimista, base, conservador] (em meses, salvo indicação). */
export type TriploMeses = [number, number, number];

/**
 * Premissas da previsão de janelas. IMPORTANTE: os valores padrão são
 * premissas iniciais de referência (ordem de grandeza observada no setor),
 * NÃO são estatísticas oficiais. Devem ser revisadas pela área comercial e
 * calibradas com o histórico da própria base (ver `calibracao.ts`).
 */
export interface ParametrosPrevisao {
  versao: string;
  /** Leilão → assinatura do contrato de concessão. */
  leilaoParaAssinatura: TriploMeses;
  /** Inclusão em plano (PDE/PET/POTEE/PAR) → leilão ou autorização. */
  planejamentoParaOutorga: TriploMeses;
  /** Edital publicado → leilão. */
  editalParaLeilao: TriploMeses;
  /** Outorga (concessão/autorização) → publicação de RFQ/RFP de montagem de LT. */
  outorgaParaRfqLT: TriploMeses;
  /** Outorga → RFQ/RFP de obras de SE. */
  outorgaParaRfqSE: TriploMeses;
  /** Outorga → Licença de Instalação (quando LI ainda não emitida). */
  outorgaParaLI: TriploMeses;
  /** Anúncio privado → decisão final de investimento (FID). */
  anuncioParaFID: TriploMeses;
  /** FID / contratação do EPC principal → RFQ dos pacotes de obra. */
  fidParaRfq: TriploMeses;
  /** Parecer de acesso / contrato de conexão → RFQ (conexão de geração). */
  acessoParaRfq: TriploMeses;
  /** Pré-qualificação/RFI identificada → publicação da RFQ/RFP. */
  preQualificacaoParaRfq: TriploMeses;
  /** RFQ/RFP → assinatura do contrato de execução. */
  rfqParaContrato: TriploMeses;
  /** Contrato de execução → mobilização. */
  contratoParaMobilizacao: TriploMeses;
  /** Licença de Instalação → mobilização (não se mobiliza antes da LI). */
  liParaMobilizacao: TriploMeses;
  /** Mobilização → início efetivo das obras. */
  mobilizacaoParaObras: TriploMeses;
  /** Duração de obra de LT: fixo + proporcional à extensão. */
  duracaoObraLT: { fixo: TriploMeses; por100km: TriploMeses; minimo: number; maximo: number };
  /** Duração de obra de SE por natureza. */
  duracaoObraSE: Record<'nova' | 'ampliacao' | 'seccionamento' | 'adequacao', TriploMeses>;
  /** Comissionamento até energização. */
  comissionamento: TriploMeses;
  /** Ajuste sobre data de energização divulgada (negativo = antecipação). */
  ajusteEnergizacaoDivulgada: TriploMeses;
  /** Ajuste sobre outras datas divulgadas (RFQ, contrato, início de obras) por cenário. */
  ajusteDataDivulgada: TriploMeses;
  /** Extensão assumida quando desconhecida (km), para duração de obra. */
  extensaoPadraoKm: number;
}

export const PARAMETROS_PREVISAO_PADRAO: ParametrosPrevisao = {
  versao: 'padrao-2026.1',
  leilaoParaAssinatura: [2, 3, 5],
  planejamentoParaOutorga: [12, 24, 36],
  editalParaLeilao: [1, 2, 3],
  outorgaParaRfqLT: [3, 6, 10],
  outorgaParaRfqSE: [4, 8, 12],
  outorgaParaLI: [9, 14, 20],
  anuncioParaFID: [6, 12, 24],
  fidParaRfq: [2, 4, 8],
  acessoParaRfq: [4, 8, 14],
  preQualificacaoParaRfq: [1, 2, 3],
  rfqParaContrato: [2, 3, 5],
  contratoParaMobilizacao: [1, 2, 3],
  liParaMobilizacao: [0, 1, 3],
  mobilizacaoParaObras: [1, 1, 2],
  duracaoObraLT: { fixo: [8, 10, 13], por100km: [2, 3, 4], minimo: 8, maximo: 36 },
  duracaoObraSE: {
    nova: [12, 15, 20],
    ampliacao: [6, 9, 12],
    seccionamento: [6, 8, 11],
    adequacao: [4, 6, 9],
  },
  comissionamento: [1, 2, 3],
  ajusteEnergizacaoDivulgada: [-3, 0, 6],
  ajusteDataDivulgada: [0, 0, 3],
  extensaoPadraoKm: 100,
};

/** Faixa de valores (mínimo, máximo) em R$. */
export type Faixa = [number, number];

/**
 * Premissas do mercado endereçável. Os valores padrão são ILUSTRATIVOS
 * (ordem de grandeza) e marcados como premissa na interface. Substituir pela
 * base de custos/histórico de propostas da empresa em Configurações.
 */
export interface ParametrosMercado {
  versao: string;
  /** Fração do investimento elétrico de LT correspondente a serviços de construção/montagem (sem fornecimento de materiais/equipamentos). */
  participacaoServicosLT: Faixa;
  /** Idem para SE. */
  participacaoServicosSE: Faixa;
  /** Referência paramétrica de serviços de construção de LT por km, por classe de tensão (R$/km). */
  servicosLTporKm: Record<string, Faixa>;
  /** Referência paramétrica de serviços de construção de SE por natureza e classe de tensão (R$ por SE). */
  servicosSE: Record<'nova' | 'ampliacao' | 'seccionamento' | 'adequacao', Record<string, Faixa>>;
  /** Pacotes considerados endereçáveis pela construtora. */
  pacotesEnderecaveis: Pacote[];
  premissaIlustrativa: boolean;
}

export const PARAMETROS_MERCADO_PADRAO: ParametrosMercado = {
  versao: 'ilustrativo-2026.1',
  participacaoServicosLT: [0.25, 0.4],
  participacaoServicosSE: [0.15, 0.3],
  servicosLTporKm: {
    '138': [300_000, 600_000],
    '230': [450_000, 850_000],
    '345': [650_000, 1_100_000],
    '440': [800_000, 1_300_000],
    '500': [900_000, 1_600_000],
    '525': [900_000, 1_700_000],
    '600CC': [1_000_000, 1_800_000],
    '800CC': [1_300_000, 2_300_000],
  },
  servicosSE: {
    nova: {
      '138': [8_000_000, 18_000_000],
      '230': [15_000_000, 35_000_000],
      '345': [25_000_000, 55_000_000],
      '440': [30_000_000, 65_000_000],
      '500': [40_000_000, 90_000_000],
    },
    ampliacao: {
      '138': [2_000_000, 6_000_000],
      '230': [4_000_000, 10_000_000],
      '345': [6_000_000, 15_000_000],
      '440': [7_000_000, 18_000_000],
      '500': [8_000_000, 22_000_000],
    },
    seccionamento: {
      '138': [3_000_000, 8_000_000],
      '230': [5_000_000, 12_000_000],
      '345': [7_000_000, 16_000_000],
      '440': [8_000_000, 18_000_000],
      '500': [10_000_000, 24_000_000],
    },
    adequacao: {
      '138': [1_000_000, 3_000_000],
      '230': [1_500_000, 4_500_000],
      '345': [2_000_000, 6_000_000],
      '440': [2_500_000, 7_000_000],
      '500': [3_000_000, 8_000_000],
    },
  },
  pacotesEnderecaveis: ['montagem_eletromecanica', 'construcao_civil', 'lancamento_cabos', 'montagem_estruturas', 'comissionamento'],
  premissaIlustrativa: true,
};

/** Perfil da construtora usado no cálculo de aderência e capacidade. */
export interface PortfolioEmpresa {
  nome: string;
  tensaoMinimaKv: number;
  /** Classes de tensão em que a empresa tem experiência comprovada. */
  tensoesExperienciaKv: number[];
  executaLT: boolean;
  executaSE: boolean;
  executaCC: boolean;
  pacotesOfertados: Pacote[];
  /** UFs de atuação atual e UFs prioritárias para expansão. */
  ufsAtuacao: string[];
  ufsPrioritarias: string[];
  /** Bases operacionais (para distância logística). */
  bases: { nome: string; lat: number; lon: number }[];
  /** Faixa de porte de contrato que a empresa consegue executar (R$). */
  porteMinimoBRL: number;
  porteMaximoBRL: number;
  /** Capacidade de frentes simultâneas de LT (km/ano aproximado). */
  capacidadeKmAno: number;
}

export const PORTFOLIO_PADRAO: PortfolioEmpresa = {
  nome: 'Construtora (configurar)',
  tensaoMinimaKv: 138,
  tensoesExperienciaKv: [138, 230, 345, 500],
  executaLT: true,
  executaSE: true,
  executaCC: false,
  pacotesOfertados: ['montagem_eletromecanica', 'construcao_civil', 'lancamento_cabos', 'montagem_estruturas', 'comissionamento'],
  ufsAtuacao: ['MG', 'SP', 'GO', 'BA'],
  ufsPrioritarias: ['MG', 'BA', 'PA', 'MA', 'PI'],
  bases: [{ nome: 'Belo Horizonte (exemplo)', lat: -19.92, lon: -43.94 }],
  porteMinimoBRL: 10_000_000,
  porteMaximoBRL: 800_000_000,
  capacidadeKmAno: 600,
};

export const CRITERIOS_SCORE = [
  'aderenciaTecnica', 'potencialReceita', 'proximidadeJanela', 'probabilidadeExecucao', 'maturidade',
  'visibilidadeContratante', 'atratividadeGeografica', 'capacidadeExecucao', 'competitividade', 'risco',
] as const;
export type CriterioScore = (typeof CRITERIOS_SCORE)[number];

export const ROTULO_CRITERIO: Record<CriterioScore, string> = {
  aderenciaTecnica: 'Aderência técnica ao portfólio',
  potencialReceita: 'Potencial de receita endereçável',
  proximidadeJanela: 'Proximidade da janela de contratação',
  probabilidadeExecucao: 'Probabilidade de execução (qualitativa)',
  maturidade: 'Maturidade técnica e regulatória',
  visibilidadeContratante: 'Visibilidade do contratante e acesso comercial',
  atratividadeGeografica: 'Atratividade geográfica e logística',
  capacidadeExecucao: 'Capacidade de execução e recursos',
  competitividade: 'Competitividade (contratos já adjudicados)',
  risco: 'Risco de atraso, cancelamento ou escopo indefinido (invertido)',
};

export interface ConfigScore {
  versao: string;
  pesos: Record<CriterioScore, number>;
  /** Limites do índice (0–100) para as faixas de prioridade. */
  faixas: { alta: number; media: number };
  /** Limites de receita endereçável (valor central, R$) para notas 1..5. */
  limitesReceita: [number, number, number, number];
}

export const CONFIG_SCORE_PADRAO: ConfigScore = {
  versao: 'padrao-2026.1',
  pesos: {
    aderenciaTecnica: 15,
    potencialReceita: 12,
    proximidadeJanela: 15,
    probabilidadeExecucao: 12,
    maturidade: 8,
    visibilidadeContratante: 8,
    atratividadeGeografica: 8,
    capacidadeExecucao: 7,
    competitividade: 10,
    risco: 5,
  },
  faixas: { alta: 65, media: 45 },
  limitesReceita: [20_000_000, 60_000_000, 150_000_000, 400_000_000],
};

export interface ConfigDedup {
  /** Pontuação a partir da qual o registro é vinculado automaticamente. */
  limiarAutomatico: number;
  /** Pontuação a partir da qual o registro vai para revisão manual. */
  limiarRevisao: number;
  /** Distância máxima (km) para considerar localizações compatíveis. */
  distanciaMaxKm: number;
}

export const CONFIG_DEDUP_PADRAO: ConfigDedup = { limiarAutomatico: 0.85, limiarRevisao: 0.55, distanciaMaxKm: 60 };

export interface ConfiguracaoPlataforma {
  portfolio: PortfolioEmpresa;
  score: ConfigScore;
  previsao: ParametrosPrevisao;
  mercado: ParametrosMercado;
  dedup: ConfigDedup;
  etapas: EtapaDef[];
  fluxos: FluxoDef[];
  /** Raio (km) para agrupamento geográfico de oportunidades. */
  raioClusterKm: number;
  /** Dias sem confirmação a partir dos quais a informação é considerada desatualizada. */
  diasDesatualizacao: number;
}

export const CONFIGURACAO_PADRAO: ConfiguracaoPlataforma = {
  portfolio: PORTFOLIO_PADRAO,
  score: CONFIG_SCORE_PADRAO,
  previsao: PARAMETROS_PREVISAO_PADRAO,
  mercado: PARAMETROS_MERCADO_PADRAO,
  dedup: CONFIG_DEDUP_PADRAO,
  etapas: ETAPAS_PADRAO,
  fluxos: FLUXOS_PADRAO,
  raioClusterKm: 150,
  diasDesatualizacao: 180,
};

/** Mescla parcial de configuração salva com os padrões (para tolerar versões antigas). */
export function mesclarConfiguracao(parcial: Partial<ConfiguracaoPlataforma> | null | undefined): ConfiguracaoPlataforma {
  const p = parcial ?? {};
  return {
    portfolio: { ...PORTFOLIO_PADRAO, ...p.portfolio },
    score: {
      ...CONFIG_SCORE_PADRAO,
      ...p.score,
      pesos: { ...CONFIG_SCORE_PADRAO.pesos, ...p.score?.pesos },
      faixas: { ...CONFIG_SCORE_PADRAO.faixas, ...p.score?.faixas },
    },
    previsao: { ...PARAMETROS_PREVISAO_PADRAO, ...p.previsao },
    mercado: { ...PARAMETROS_MERCADO_PADRAO, ...p.mercado },
    dedup: { ...CONFIG_DEDUP_PADRAO, ...p.dedup },
    etapas: p.etapas?.length ? p.etapas : ETAPAS_PADRAO,
    fluxos: p.fluxos?.length ? p.fluxos : FLUXOS_PADRAO,
    raioClusterKm: p.raioClusterKm ?? 150,
    diasDesatualizacao: p.diasDesatualizacao ?? 180,
  };
}
