import type {
  ClasseNecessidade, FaseContratacao, Janela, NaturezaData, NivelConfianca, Ponto, Regiao, Setor, SituacaoObra, StatusGeral,
  Subsetor, TipoEmpreendimento, EventoPrevisao, MetodoMercado,
} from '@radar/core';

/** Espelho da visão resumida servida em /api/empreendimentos (listas). */
export interface Resumo {
  id: string;
  codigo: string;
  nome: string;
  tipo: TipoEmpreendimento;
  setor: Setor;
  subsetor?: Subsetor;
  ufs: string[];
  regioes: Regiao[];
  municipios: string[];
  ponto?: Ponto;
  tensaoMaxKv?: number;
  extensaoKm?: number;
  qtdSubestacoes: number;
  statusGeral: StatusGeral;
  situacaoObra: SituacaoObra;
  etapa?: { id: string; nome: string; ordem: number };
  fase: { LT: FaseContratacao; SE: FaseContratacao; geral: FaseContratacao };
  contratanteId?: string;
  contratante?: string;
  executorIdentificado: boolean;
  previsao: {
    janelas: Partial<Record<EventoPrevisao, Janela>>;
    base: Partial<Record<EventoPrevisao, { data: string; natureza: NaturezaData; vencida?: boolean; dataDesconhecida?: boolean }>>;
    necessidade: { classe: ClasseNecessidade; mesesAteDemanda?: number; descricao: string };
    confianca: NivelConfianca;
    proximoMarco?: { descricao: string; data: string; natureza: string };
    avisos: number;
  };
  dataDemandaBase?: string;
  mercado: { metodo: MetodoMercado; faixa?: [number, number]; central?: number; capexTotalBRL?: number; capexInfraEletricaBRL?: number; premissaIlustrativa: boolean };
  score: { indice: number; faixa: 'alta' | 'media' | 'baixa'; foraDoEscopo?: string };
  qualidade: { completude: number; conflitosAbertos: number; desatualizado: boolean };
  confiancaDados: NivelConfianca;
  ultimaAtualizacao: string;
  ultimaConfirmacao?: string;
  oportunidadeComercialId?: string;
  demo: boolean;
}
