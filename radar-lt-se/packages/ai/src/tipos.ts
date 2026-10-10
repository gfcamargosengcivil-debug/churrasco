import type { NaturezaMarco, TipoMarco } from '@radar/core';

export type CampoExtraido =
  | 'nome' | 'tipo' | 'setor' | 'tensaoKv' | 'extensaoKm' | 'capacidadeMva' | 'qtdSubestacoes' | 'capexTotalBRL'
  | 'capexInfraEletricaBRL' | 'rapAnualBRL' | 'organizacao' | 'empreendedor' | 'contratada' | 'cnpj' | 'uf' | 'municipio'
  | 'situacaoAmbiental' | 'faseContratacao' | 'outro';

export interface ItemExtraido {
  campo: CampoExtraido;
  valor: string;
  /** Trecho LITERAL do documento que sustenta o valor. */
  trecho: string;
  pagina?: number;
  metodo: 'heuristico' | 'llm';
  observacao?: string;
}

export interface MarcoExtraido {
  tipo: TipoMarco;
  data: string;
  precisao?: 'dia' | 'mes' | 'ano';
  natureza: NaturezaMarco;
  trecho: string;
  pagina?: number;
  metodo: 'heuristico' | 'llm';
  escopo?: 'LT' | 'SE' | 'geral';
}

export interface IndicioContratacao {
  tipo: 'contratacao_proxima' | 'contratacao_realizada' | 'obra_iniciada';
  descricao: string;
  trecho: string;
  pagina?: number;
  metodo: 'heuristico' | 'llm';
}

export interface Descartado {
  item: unknown;
  motivo: string;
}

export interface ResultadoAnaliseDocumental {
  metodo: 'heuristico' | 'llm+heuristico';
  modelo?: string;
  analisadoEm: string;
  itens: ItemExtraido[];
  marcos: MarcoExtraido[];
  indicios: IndicioContratacao[];
  /** Resumo do documento (somente LLM); cada afirmação deve ter citação entre aspas. */
  resumo?: string;
  /** Informações relevantes que o documento NÃO traz. */
  lacunas: string[];
  /** Itens propostos pelo modelo e descartados por falta de evidência literal ou formato inválido. */
  descartados: Descartado[];
  avisos: string[];
  classificacao?: { tipo?: string; setor?: string; justificativa: string; trecho?: string };
}
