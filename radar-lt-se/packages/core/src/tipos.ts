import { z } from 'zod';
import {
  CLASSES_FONTE, ESCOPOS, FASES_CONTRATACAO, FREQUENCIAS, INTERESSES, METODOS_ACESSO,
  NATUREZAS_MARCO, PACOTES, PAPEIS, SETORES, SITUACAO_AMBIENTAL, SITUACAO_ENGENHARIA,
  SITUACAO_FUNDIARIA, SITUACAO_REGULATORIA, SITUACOES_OBRA, STATUS_DADO, STATUS_ETAPA,
  STATUS_GERAL, STATUS_INTEGRACAO, STATUS_PROSPECCAO, SUBSETORES, TIPOS_DOCUMENTO,
  TIPOS_EMPREENDIMENTO, TIPOS_EVENTO, TIPOS_MARCO, TIPOS_ORGANIZACAO, UFS,
} from './constantes.js';

/** Data ISO `AAAA-MM-DD`. */
export const DataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve estar em AAAA-MM-DD');
/** Data/hora ISO completa. */
export const DataHoraISO = z.string().min(10);

export const PontoSchema = z.object({
  lat: z.number().min(-35).max(6),
  lon: z.number().min(-75).max(-28),
  /**
   * Precisão da coordenada. Nunca registrar `exata` sem fonte que a sustente.
   * `municipio` = centroide aproximado do município (não é a localização da obra).
   */
  precisao: z.enum(['exata', 'subestacao', 'municipio', 'uf', 'aproximada']),
  fonte: z.string().optional(),
});
export type Ponto = z.infer<typeof PontoSchema>;

export const TracadoSchema = z.object({
  /** Coordenadas `[lon, lat]` (ordem GeoJSON). */
  coordenadas: z.array(z.tuple([z.number(), z.number()])).min(2),
  /**
   * `oficial` = geometria publicada por fonte oficial (ex.: shapefile do órgão);
   * `aproximado_digitalizado` = digitalizado a partir de mapa/documento;
   * `esquematico` = reta entre extremidades, apenas indicativo (não é traçado).
   */
  natureza: z.enum(['oficial', 'aproximado_digitalizado', 'esquematico']),
  evidenciaId: z.string().optional(),
  observacao: z.string().optional(),
});
export type Tracado = z.infer<typeof TracadoSchema>;

export const EvidenciaSchema = z.object({
  id: z.string(),
  fonteId: z.string(),
  titulo: z.string(),
  url: z.string().optional(),
  documentoId: z.string().optional(),
  /** Trecho literal do documento que sustenta a informação. */
  trecho: z.string().optional(),
  pagina: z.number().int().optional(),
  tipoDocumento: z.enum(TIPOS_DOCUMENTO),
  dataPublicacao: DataISO.optional(),
  dataColeta: DataISO,
  /** Validade da informação (ex.: vencimento de licença), quando aplicável. */
  validoAte: DataISO.optional(),
  ultimaConfirmacao: DataISO.optional(),
  /** Classe de confiabilidade; herda da fonte quando ausente. */
  classe: z.enum(CLASSES_FONTE).optional(),
  coletaId: z.string().optional(),
});
export type Evidencia = z.infer<typeof EvidenciaSchema>;

export const ProvenienciaCampoSchema = z.object({
  status: z.enum(STATUS_DADO),
  evidenciaIds: z.array(z.string()).default([]),
  observacao: z.string().optional(),
  emConflito: z.boolean().optional(),
  atualizadoEm: DataISO,
});
export type ProvenienciaCampo = z.infer<typeof ProvenienciaCampoSchema>;

export const ValorMonetarioSchema = z.object({
  valorBRL: z.number().nonnegative(),
  dataBase: DataISO.optional(),
  natureza: z.enum(['declarado', 'estimado']),
  observacao: z.string().optional(),
});
export type ValorMonetario = z.infer<typeof ValorMonetarioSchema>;

export const MarcoSchema = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_MARCO),
  data: DataISO,
  natureza: z.enum(NATUREZAS_MARCO),
  escopo: z.enum(ESCOPOS).default('geral'),
  descricao: z.string().optional(),
  evidenciaIds: z.array(z.string()).default([]),
});
export type Marco = z.infer<typeof MarcoSchema>;

export const EtapaStatusSchema = z.object({
  etapaId: z.string(),
  status: z.enum(STATUS_ETAPA),
  dataInicio: DataISO.optional(),
  dataFim: DataISO.optional(),
  evidenciaIds: z.array(z.string()).default([]),
  observacao: z.string().optional(),
});
export type EtapaStatus = z.infer<typeof EtapaStatusSchema>;

export const ParticipacaoSchema = z.object({
  organizacaoId: z.string(),
  papel: z.enum(PAPEIS),
  escopo: z.string().optional(),
  evidenciaIds: z.array(z.string()).default([]),
});
export type Participacao = z.infer<typeof ParticipacaoSchema>;

export const LoteSchema = z.object({
  id: z.string(),
  nome: z.string(),
  leilao: z.string().optional(),
  evidenciaIds: z.array(z.string()).default([]),
});
export type Lote = z.infer<typeof LoteSchema>;

export const TrechoLTSchema = z.object({
  id: z.string(),
  loteId: z.string().optional(),
  nome: z.string(),
  tensaoKv: z.number().positive(),
  corrente: z.enum(['CA', 'CC']).default('CA'),
  extensaoKm: z.number().positive().optional(),
  circuitos: z.number().int().positive().optional(),
  cabo: z.string().optional(),
  estruturas: z.string().optional(),
  origem: z.string().optional(),
  destino: z.string().optional(),
  tracado: TracadoSchema.optional(),
  evidenciaIds: z.array(z.string()).default([]),
});
export type TrechoLT = z.infer<typeof TrechoLTSchema>;

export const SubestacaoSchema = z.object({
  id: z.string(),
  loteId: z.string().optional(),
  nome: z.string(),
  natureza: z.enum(['nova', 'ampliacao', 'seccionamento', 'adequacao']),
  tensoesKv: z.array(z.number().positive()).min(1),
  capacidadeMva: z.number().nonnegative().optional(),
  transformadores: z.string().optional(),
  isolamento: z.enum(['AIS', 'GIS', 'hibrida']).optional(),
  municipio: z.string().optional(),
  uf: z.enum(UFS).optional(),
  ponto: PontoSchema.optional(),
  evidenciaIds: z.array(z.string()).default([]),
});
export type Subestacao = z.infer<typeof SubestacaoSchema>;

export const ContratoSchema = z.object({
  id: z.string(),
  objeto: z.string(),
  pacotes: z.array(z.enum(PACOTES)).default([]),
  escopo: z.enum(ESCOPOS).default('geral'),
  contratanteId: z.string().optional(),
  contratadaId: z.string().optional(),
  valorBRL: z.number().nonnegative().optional(),
  dataAssinatura: DataISO.optional(),
  status: z.enum(['previsto', 'em_negociacao', 'assinado', 'encerrado']),
  evidenciaIds: z.array(z.string()).default([]),
});
export type Contrato = z.infer<typeof ContratoSchema>;

export const PacoteServicoSchema = z.object({
  pacote: z.enum(PACOTES),
  escopo: z.enum(ESCOPOS),
  faseContratacao: z.enum(FASES_CONTRATACAO),
  contratadaId: z.string().optional(),
  dataEvento: DataISO.optional(),
  evidenciaIds: z.array(z.string()).default([]),
  observacao: z.string().optional(),
});
export type PacoteServico = z.infer<typeof PacoteServicoSchema>;

export const ConflitoSchema = z.object({
  id: z.string(),
  campo: z.string(),
  valores: z.array(
    z.object({
      valor: z.unknown(),
      evidenciaId: z.string().optional(),
      fonteId: z.string().optional(),
      classe: z.enum(CLASSES_FONTE).optional(),
      dataPublicacao: DataISO.optional(),
      registradoEm: DataISO,
    }),
  ),
  valorAdotado: z.unknown().optional(),
  criterioAdocao: z.string(),
  status: z.enum(['aberto', 'resolvido']),
  resolucao: z
    .object({ valor: z.unknown(), justificativa: z.string(), por: z.string(), em: DataISO })
    .optional(),
  abertoEm: DataISO,
});
export type Conflito = z.infer<typeof ConflitoSchema>;

export const AlteracaoSchema = z.object({
  id: z.string(),
  em: DataHoraISO,
  por: z.string(),
  origem: z.enum(['ingestao', 'manual', 'sistema', 'ia']),
  campo: z.string(),
  de: z.unknown().optional(),
  para: z.unknown().optional(),
  evidenciaId: z.string().optional(),
  coletaId: z.string().optional(),
  observacao: z.string().optional(),
});
export type Alteracao = z.infer<typeof AlteracaoSchema>;

export const IdentificadorSchema = z.object({
  tipo: z.enum([
    'aneel_leilao_lote', 'aneel_rea', 'aneel_contrato_concessao', 'aneel_ceg', 'epe_pet',
    'ons_par', 'mme_potee', 'licenca_ambiental', 'processo_ambiental', 'cnpj_spe', 'interno', 'outro',
    'aneel_siget_empreendimento', 'ons_empreendimento',
    /** Chave do registro na fonte de origem ("fonteId|chave"): reconhece o mesmo item em coletas seguintes. */
    'chave_fonte',
  ]),
  valor: z.string().min(1),
  evidenciaId: z.string().optional(),
});
export type Identificador = z.infer<typeof IdentificadorSchema>;

export const EmpreendimentoSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  nomeOficial: z.string().min(3),
  nomesAlternativos: z.array(z.string()).default([]),
  identificadores: z.array(IdentificadorSchema).default([]),
  tipo: z.enum(TIPOS_EMPREENDIMENTO),
  setorOrigem: z.enum(SETORES),
  subsetor: z.enum(SUBSETORES).optional(),
  descricao: z.string().optional(),

  fluxoId: z.string(),
  etapas: z.array(EtapaStatusSchema).default([]),
  statusGeral: z.enum(STATUS_GERAL).default('ativo'),
  situacaoObra: z.enum(SITUACOES_OBRA).default('nao_iniciada'),
  situacoes: z
    .object({
      regulatoria: z.enum(SITUACAO_REGULATORIA).default('indefinida'),
      ambiental: z.enum(SITUACAO_AMBIENTAL).default('indefinida'),
      fundiaria: z.enum(SITUACAO_FUNDIARIA).default('indefinida'),
      engenharia: z.enum(SITUACAO_ENGENHARIA).default('indefinida'),
    })
    .default({}),

  participantes: z.array(ParticipacaoSchema).default([]),
  localizacao: z
    .object({
      municipios: z.array(z.object({ nome: z.string(), uf: z.enum(UFS) })).default([]),
      ufs: z.array(z.enum(UFS)).default([]),
      ponto: PontoSchema.optional(),
    })
    .default({}),

  /** Resumo técnico declarado (usado quando não há desdobramento em trechos/SEs). */
  tecnico: z
    .object({
      tensoesKv: z.array(z.number().positive()).default([]),
      extensaoKm: z.number().positive().optional(),
      circuitos: z.number().int().positive().optional(),
      capacidadeMva: z.number().nonnegative().optional(),
      qtdSubestacoes: z.number().int().nonnegative().optional(),
      potenciaMw: z.number().nonnegative().optional(),
      caracteristicas: z.string().optional(),
    })
    .default({}),
  lotes: z.array(LoteSchema).default([]),
  trechosLT: z.array(TrechoLTSchema).default([]),
  subestacoes: z.array(SubestacaoSchema).default([]),
  contratos: z.array(ContratoSchema).default([]),
  pacotes: z.array(PacoteServicoSchema).default([]),

  financeiro: z
    .object({
      /** Investimento total do empreendimento (ex.: mina, planta, usina inteira). */
      capexTotal: ValorMonetarioSchema.optional(),
      /** Investimento em infraestrutura elétrica (LT/SE). */
      capexInfraEletrica: ValorMonetarioSchema.optional(),
      /** Receita Anual Permitida (concessões de transmissão). */
      rapAnual: ValorMonetarioSchema.optional(),
      fonteFinanciamento: z.string().optional(),
    })
    .default({}),

  marcos: z.array(MarcoSchema).default([]),
  evidencias: z.array(EvidenciaSchema).default([]),
  proveniencia: z.record(ProvenienciaCampoSchema).default({}),
  conflitos: z.array(ConflitoSchema).default([]),
  historico: z.array(AlteracaoSchema).default([]),

  responsavelInterno: z.string().optional(),
  observacoes: z.string().optional(),
  tags: z.array(z.string()).default([]),

  identificadoEm: DataISO,
  criadoEm: DataHoraISO,
  atualizadoEm: DataHoraISO,
  /** Dados demonstrativos fictícios — nunca misturar com dados reais sem esta marcação. */
  demo: z.boolean().default(false),
});
export type Empreendimento = z.infer<typeof EmpreendimentoSchema>;
export type EmpreendimentoEntrada = z.input<typeof EmpreendimentoSchema>;

export const OrganizacaoSchema = z.object({
  id: z.string(),
  nome: z.string().min(2),
  nomesAlternativos: z.array(z.string()).default([]),
  cnpj: z.string().optional(),
  tipo: z.enum(TIPOS_ORGANIZACAO),
  setores: z.array(z.enum(SETORES)).default([]),
  site: z.string().optional(),
  ufSede: z.enum(UFS).optional(),
  grupoEconomico: z.string().optional(),
  observacoes: z.string().optional(),
  demo: z.boolean().default(false),
});
export type Organizacao = z.infer<typeof OrganizacaoSchema>;

export const FonteSchema = z.object({
  id: z.string(),
  nome: z.string(),
  orgao: z.string(),
  categoria: z.enum([
    'regulador', 'planejamento', 'operador', 'ministerio', 'camara_comercializacao', 'ambiental',
    'diario_oficial', 'empresa', 'imprensa', 'licitacoes', 'manual', 'demonstracao',
  ]),
  classe: z.enum(CLASSES_FONTE),
  metodoAcesso: z.enum(METODOS_ACESSO),
  url: z.string().optional(),
  frequencia: z.enum(FREQUENCIAS),
  statusIntegracao: z.enum(STATUS_INTEGRACAO),
  adaptador: z.string(),
  config: z.record(z.unknown()).default({}),
  /** Credenciais exigidas (nomes das variáveis de ambiente, nunca os valores). */
  credenciais: z.array(z.string()).default([]),
  limitacoes: z.array(z.string()).default([]),
  termosUso: z.string().optional(),
  ultimaColeta: DataHoraISO.optional(),
  ultimaColetaStatus: z.enum(['sucesso', 'parcial', 'erro']).optional(),
  ativo: z.boolean().default(true),
});
export type Fonte = z.infer<typeof FonteSchema>;

export const ColetaSchema = z.object({
  id: z.string(),
  fonteId: z.string(),
  disparo: z.enum(['agendado', 'manual', 'upload']),
  usuario: z.string().optional(),
  iniciadaEm: DataHoraISO,
  finalizadaEm: DataHoraISO.optional(),
  status: z.enum(['em_andamento', 'sucesso', 'parcial', 'erro']),
  registrosLidos: z.number().int().default(0),
  criados: z.number().int().default(0),
  atualizados: z.number().int().default(0),
  semMudanca: z.number().int().default(0),
  paraRevisao: z.number().int().default(0),
  conflitos: z.number().int().default(0),
  descartados: z.number().int().default(0),
  erros: z.array(z.string()).default([]),
  avisos: z.array(z.string()).default([]),
});
export type Coleta = z.infer<typeof ColetaSchema>;

export const DocumentoSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  tipo: z.enum(TIPOS_DOCUMENTO),
  fonteId: z.string().optional(),
  url: z.string().optional(),
  mime: z.string(),
  tamanhoBytes: z.number().int().nonnegative(),
  hash: z.string(),
  textoExtraido: z.string().optional(),
  paginas: z.number().int().optional(),
  dataPublicacao: DataISO.optional(),
  carregadoEm: DataHoraISO,
  carregadoPor: z.string(),
  empreendimentoIds: z.array(z.string()).default([]),
  analise: z.unknown().optional(),
});
export type Documento = z.infer<typeof DocumentoSchema>;

export const EventoMudancaSchema = z.object({
  id: z.string(),
  empreendimentoId: z.string(),
  tipo: z.enum(TIPOS_EVENTO),
  titulo: z.string(),
  descricao: z.string(),
  em: DataHoraISO,
  relevancia: z.enum(['alta', 'media', 'baixa']),
  dados: z.record(z.unknown()).default({}),
  evidenciaIds: z.array(z.string()).default([]),
  demo: z.boolean().default(false),
});
export type EventoMudanca = z.infer<typeof EventoMudancaSchema>;

export const AlertaRegraSchema = z.object({
  id: z.string(),
  nome: z.string().min(2),
  ativo: z.boolean().default(true),
  criadoPor: z.string(),
  filtros: z
    .object({
      empreendimentoIds: z.array(z.string()).optional(),
      organizacaoIds: z.array(z.string()).optional(),
      setores: z.array(z.enum(SETORES)).optional(),
      ufs: z.array(z.enum(UFS)).optional(),
      regioes: z.array(z.enum(['N', 'NE', 'CO', 'SE', 'S'])).optional(),
      tensaoMinKv: z.number().optional(),
      /** Só dispara se a janela de contratação (cenário base) estiver a até N meses. */
      janelaContratacaoMeses: z.number().int().positive().optional(),
      tiposEvento: z.array(z.enum(TIPOS_EVENTO)).optional(),
      relevanciaMinima: z.enum(['alta', 'media', 'baixa']).optional(),
    })
    .default({}),
  canais: z.array(z.enum(['app', 'email'])).default(['app']),
  emailDestino: z.string().optional(),
});
export type AlertaRegra = z.infer<typeof AlertaRegraSchema>;

export const AlertaNotificacaoSchema = z.object({
  id: z.string(),
  regraId: z.string(),
  eventoId: z.string(),
  empreendimentoId: z.string(),
  criadoEm: DataHoraISO,
  lido: z.boolean().default(false),
  canal: z.enum(['app', 'email']),
  entregue: z.boolean().default(true),
  erroEntrega: z.string().optional(),
});
export type AlertaNotificacao = z.infer<typeof AlertaNotificacaoSchema>;

export const OportunidadeComercialSchema = z.object({
  id: z.string(),
  empreendimentoId: z.string(),
  interesse: z.enum(INTERESSES).default('nao_avaliado'),
  responsavel: z.string().optional(),
  estrategia: z.string().optional(),
  statusProspeccao: z.enum(STATUS_PROSPECCAO).default('identificada'),
  pacotesInteresse: z.array(z.enum(PACOTES)).default([]),
  /** Valor qualificado pela área comercial (pode diferir da estimativa de mercado). */
  valorQualificadoBRL: z.number().nonnegative().optional(),
  decisao: z
    .object({
      decisao: z.enum(['participar', 'nao_participar', 'pendente']),
      justificativa: z.string().optional(),
      data: DataISO.optional(),
      por: z.string().optional(),
    })
    .default({ decisao: 'pendente' }),
  contatos: z
    .array(
      z.object({
        id: z.string(),
        nome: z.string(),
        cargo: z.string().optional(),
        organizacaoId: z.string().optional(),
        email: z.string().optional(),
        telefone: z.string().optional(),
        observacao: z.string().optional(),
      }),
    )
    .default([]),
  interacoes: z
    .array(
      z.object({
        id: z.string(),
        data: DataISO,
        tipo: z.enum(['reuniao', 'ligacao', 'email', 'visita', 'evento', 'outro']),
        resumo: z.string(),
        por: z.string(),
      }),
    )
    .default([]),
  proximosPassos: z
    .array(
      z.object({
        id: z.string(),
        descricao: z.string(),
        responsavel: z.string().optional(),
        prazo: DataISO.optional(),
        concluido: z.boolean().default(false),
      }),
    )
    .default([]),
  resultado: z
    .object({
      status: z.enum(['ganha', 'perdida', 'declinada']),
      data: DataISO,
      valorBRL: z.number().optional(),
      vencedor: z.string().optional(),
      motivo: z.string().optional(),
    })
    .optional(),
  criadoEm: DataHoraISO,
  atualizadoEm: DataHoraISO,
  demo: z.boolean().default(false),
});
export type OportunidadeComercial = z.infer<typeof OportunidadeComercialSchema>;

export const MatchCandidatoSchema = z.object({
  id: z.string(),
  coletaId: z.string().optional(),
  fonteId: z.string(),
  registro: z.unknown(),
  resumoRegistro: z.string(),
  candidatos: z.array(
    z.object({ empreendimentoId: z.string(), pontuacao: z.number(), motivos: z.array(z.string()) }),
  ),
  status: z.enum(['pendente', 'vinculado', 'novo', 'descartado']),
  decididoPor: z.string().optional(),
  decididoEm: DataHoraISO.optional(),
  criadoEm: DataHoraISO,
});
export type MatchCandidato = z.infer<typeof MatchCandidatoSchema>;

export const AuditLogSchema = z.object({
  id: z.string(),
  em: DataHoraISO,
  usuario: z.string(),
  acao: z.string(),
  entidade: z.string(),
  entidadeId: z.string().optional(),
  detalhes: z.record(z.unknown()).default({}),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export type Cenario = 'otimista' | 'base' | 'conservador';
export const CENARIOS: Cenario[] = ['otimista', 'base', 'conservador'];
