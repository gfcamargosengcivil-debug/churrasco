import type { NaturezaMarco, TipoMarco } from '../constantes.js';
import type { Cenario } from '../tipos.js';

export const EVENTOS_PREVISAO = [
  'rfq', 'contratacaoLT', 'contratacaoSE', 'assinaturaContrato', 'mobilizacao', 'inicioObras', 'energizacao',
] as const;
export type EventoPrevisao = (typeof EVENTOS_PREVISAO)[number];

export const ROTULO_EVENTO_PREVISAO: Record<EventoPrevisao, string> = {
  rfq: 'Publicação de RFQ/RFP ou concorrência',
  contratacaoLT: 'Contratação dos serviços de LT',
  contratacaoSE: 'Contratação dos serviços de SE',
  assinaturaContrato: 'Assinatura do contrato de execução',
  mobilizacao: 'Início da mobilização',
  inicioObras: 'Início das obras',
  energizacao: 'Conclusão / energização',
};

/**
 * Natureza da data prevista — fundamental para não apresentar estimativas como fatos:
 * - `realizado`: evento já ocorrido, com evidência;
 * - `divulgado`: data publicada por fonte (empreendedor, regulador, contrato) e usada sem ajuste;
 * - `calculado_de_marco`: calculada a partir de marco verificável + premissa explícita;
 * - `heuristico`: calculada a partir de sinais fracos (anúncio, inclusão em plano) — baixa precisão.
 */
export type NaturezaData = 'realizado' | 'divulgado' | 'calculado_de_marco' | 'heuristico';

export const ROTULO_NATUREZA_DATA: Record<NaturezaData, string> = {
  realizado: 'Realizado',
  divulgado: 'Data divulgada',
  calculado_de_marco: 'Calculada a partir de marco',
  heuristico: 'Estimativa heurística',
};

export interface AncoraPrevisao {
  descricao: string;
  marcoTipo?: TipoMarco;
  data: string;
  natureza: NaturezaMarco | 'calculada';
  evidenciaIds: string[];
}

export interface DataPrevista {
  data: string;
  natureza: NaturezaData;
  ancora?: AncoraPrevisao;
  /** Memória de cálculo legível. */
  calculo: string;
  evidenciaIds: string[];
  /** Data já passou sem que o evento tenha sido observado. */
  vencida?: boolean;
  /** Evento ocorrido sem data registrada (a data exibida é apenas referência). */
  dataDesconhecida?: boolean;
}

export interface CenarioPrevisao {
  cenario: Cenario;
  premissas: string[];
  datas: Partial<Record<EventoPrevisao, DataPrevista>>;
  /** RFQ estimada/observada por escopo (LT e SE separadamente). */
  rfqPorEscopo: Partial<Record<'LT' | 'SE', DataPrevista>>;
}

export interface Janela {
  inicio: string;
  base: string;
  fim: string;
  natureza: NaturezaData;
  vencida: boolean;
}

export type ClasseNecessidade =
  | 'imediata' | 'curto_prazo' | 'medio_prazo' | 'longo_prazo' | 'verificar' | 'ja_contratada'
  | 'indefinida' | 'suspensa' | 'encerrada';

export const ROTULO_NECESSIDADE: Record<ClasseNecessidade, string> = {
  imediata: 'Imediata (até 3 meses / cotação aberta)',
  curto_prazo: 'Curto prazo (3–12 meses)',
  medio_prazo: 'Médio prazo (12–24 meses)',
  longo_prazo: 'Longo prazo (> 24 meses)',
  verificar: 'Verificar (janela estimada passou sem evidência)',
  ja_contratada: 'Já contratada',
  indefinida: 'Indefinida (sem marco de referência)',
  suspensa: 'Suspensa/adiada',
  encerrada: 'Encerrada',
};

export type NivelConfianca = 'alta' | 'media' | 'baixa' | 'muito_baixa';
export const ROTULO_NIVEL_CONFIANCA: Record<NivelConfianca, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
  muito_baixa: 'Muito baixa',
};

export interface ComponenteConfianca {
  criterio: 'qualidade_fonte' | 'atualidade' | 'evidencias_independentes' | 'consistencia_marcos' | 'metodo';
  rotulo: string;
  pontos: number;
  maximo: number;
  justificativa: string;
}

export interface ConfiancaPrevisao {
  nivel: NivelConfianca;
  pontos: number;
  maximo: number;
  componentes: ComponenteConfianca[];
  limitadores: string[];
}

export interface PrevisaoEmpreendimento {
  empreendimentoId: string;
  calculadoEm: string;
  parametrosVersao: string;
  /** Assinatura dos dados de entrada: muda quando algo relevante para a previsão muda. */
  assinaturaEntrada: string;
  aplicavel: { LT: boolean; SE: boolean };
  cenarios: Record<Cenario, CenarioPrevisao>;
  janelas: Partial<Record<EventoPrevisao, Janela>>;
  proximoMarco?: { descricao: string; data: string; natureza: 'previsto_oficial' | 'previsto_estimado' | 'calculado'; evidenciaIds: string[] };
  necessidadeComercial: { classe: ClasseNecessidade; mesesAteDemanda?: number; descricao: string };
  confianca: ConfiancaPrevisao;
  avisos: string[];
}
