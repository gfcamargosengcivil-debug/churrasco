/**
 * Vocabulário controlado da plataforma. Os rótulos em português são usados
 * pela interface e pelas exportações; os identificadores são estáveis e
 * usados no banco.
 */

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
export type UF = (typeof UFS)[number];

export const REGIOES = ['N', 'NE', 'CO', 'SE', 'S'] as const;
export type Regiao = (typeof REGIOES)[number];

export const ROTULO_REGIAO: Record<Regiao, string> = {
  N: 'Norte',
  NE: 'Nordeste',
  CO: 'Centro-Oeste',
  SE: 'Sudeste',
  S: 'Sul',
};

export const REGIAO_DA_UF: Record<UF, Regiao> = {
  AC: 'N', AP: 'N', AM: 'N', PA: 'N', RO: 'N', RR: 'N', TO: 'N',
  AL: 'NE', BA: 'NE', CE: 'NE', MA: 'NE', PB: 'NE', PE: 'NE', PI: 'NE', RN: 'NE', SE: 'NE',
  DF: 'CO', GO: 'CO', MT: 'CO', MS: 'CO',
  ES: 'SE', MG: 'SE', RJ: 'SE', SP: 'SE',
  PR: 'S', RS: 'S', SC: 'S',
};

export const TIPOS_EMPREENDIMENTO = [
  'LT', 'SE', 'LT+SE', 'conexao_geracao', 'expansao_industrial', 'infraestrutura_associada',
] as const;
export type TipoEmpreendimento = (typeof TIPOS_EMPREENDIMENTO)[number];
export const ROTULO_TIPO: Record<TipoEmpreendimento, string> = {
  LT: 'Linha de transmissão',
  SE: 'Subestação',
  'LT+SE': 'LT + SE',
  conexao_geracao: 'Conexão de geração',
  expansao_industrial: 'Expansão industrial',
  infraestrutura_associada: 'Infraestrutura associada',
};

export const SETORES = ['transmissao', 'geracao', 'mineracao', 'industria', 'distribuicao', 'outro'] as const;
export type Setor = (typeof SETORES)[number];
export const ROTULO_SETOR: Record<Setor, string> = {
  transmissao: 'Transmissão',
  geracao: 'Geração',
  mineracao: 'Mineração',
  industria: 'Indústria',
  distribuicao: 'Distribuição',
  outro: 'Outro',
};

export const SUBSETORES = [
  'transmissao_regulada', 'siderurgia', 'metalurgia', 'cimento', 'papel_celulose',
  'quimica_petroquimica', 'data_center', 'hidrogenio', 'combustiveis_sustentaveis',
  'eletromobilidade', 'eolica', 'solar', 'armazenamento', 'autoproducao', 'hidreletrica',
  'termeletrica', 'logistica', 'mineracao_ferro', 'mineracao_outros', 'distribuicao', 'outro',
] as const;
export type Subsetor = (typeof SUBSETORES)[number];
export const ROTULO_SUBSETOR: Record<Subsetor, string> = {
  transmissao_regulada: 'Transmissão regulada',
  siderurgia: 'Siderurgia',
  metalurgia: 'Metalurgia',
  cimento: 'Cimento',
  papel_celulose: 'Papel e celulose',
  quimica_petroquimica: 'Química e petroquímica',
  data_center: 'Data center',
  hidrogenio: 'Hidrogênio',
  combustiveis_sustentaveis: 'Combustíveis sustentáveis',
  eletromobilidade: 'Eletromobilidade industrial',
  eolica: 'Eólica',
  solar: 'Solar',
  armazenamento: 'Armazenamento',
  autoproducao: 'Autoprodução',
  hidreletrica: 'Hidrelétrica',
  termeletrica: 'Termelétrica',
  logistica: 'Logística',
  mineracao_ferro: 'Mineração de ferro',
  mineracao_outros: 'Mineração (outros)',
  distribuicao: 'Distribuição',
  outro: 'Outro',
};

export const TIPOS_ORGANIZACAO = [
  'concessionaria_transmissao', 'distribuidora', 'geradora', 'mineradora', 'siderurgica',
  'industria', 'data_center', 'epc', 'construtora', 'fornecedor', 'engenharia', 'investidor',
  'orgao_publico', 'outro',
] as const;
export type TipoOrganizacao = (typeof TIPOS_ORGANIZACAO)[number];
export const ROTULO_TIPO_ORGANIZACAO: Record<TipoOrganizacao, string> = {
  concessionaria_transmissao: 'Concessionária de transmissão',
  distribuidora: 'Distribuidora',
  geradora: 'Geradora',
  mineradora: 'Mineradora',
  siderurgica: 'Siderúrgica',
  industria: 'Indústria',
  data_center: 'Data center',
  epc: 'EPC',
  construtora: 'Construtora',
  fornecedor: 'Fornecedor',
  engenharia: 'Engenharia',
  investidor: 'Investidor',
  orgao_publico: 'Órgão público',
  outro: 'Outro',
};

export const PAPEIS = [
  'empreendedor', 'proprietario', 'concessionaria', 'investidor', 'potencial_contratante',
  'epc', 'engenharia', 'fornecedor', 'executor_obra', 'financiador', 'orgao_licenciador', 'outro',
] as const;
export type Papel = (typeof PAPEIS)[number];
export const ROTULO_PAPEL: Record<Papel, string> = {
  empreendedor: 'Empreendedor',
  proprietario: 'Proprietário',
  concessionaria: 'Concessionária',
  investidor: 'Investidor',
  potencial_contratante: 'Potencial contratante',
  epc: 'EPC',
  engenharia: 'Engenharia',
  fornecedor: 'Fornecedor',
  executor_obra: 'Executor da obra',
  financiador: 'Financiador',
  orgao_licenciador: 'Órgão licenciador',
  outro: 'Outro',
};
/** Papéis que indicam quem contrata a obra. */
export const PAPEIS_CONTRATANTE: Papel[] = ['potencial_contratante', 'empreendedor', 'concessionaria', 'proprietario'];
/** Papéis que indicam que a execução/EPC já está com alguém. */
export const PAPEIS_EXECUCAO: Papel[] = ['epc', 'executor_obra'];

export const STATUS_DADO = ['confirmado', 'estimado', 'inferido', 'pendente'] as const;
export type StatusDado = (typeof STATUS_DADO)[number];
export const ROTULO_STATUS_DADO: Record<StatusDado, string> = {
  confirmado: 'Confirmado',
  estimado: 'Estimado',
  inferido: 'Inferido',
  pendente: 'Pendente',
};
export const DESCRICAO_STATUS_DADO: Record<StatusDado, string> = {
  confirmado: 'Declarado em fonte primária/oficial (classe A ou B).',
  estimado: 'Calculado pela plataforma ou estimado por premissa explícita.',
  inferido: 'Obtido de fonte secundária, extração automática ou dedução; requer confirmação.',
  pendente: 'Informação necessária ainda não obtida ou aguardando verificação.',
};

/** Classe de confiabilidade da fonte. A = documento oficial regulatório/legal. */
export const CLASSES_FONTE = ['A', 'B', 'C', 'D'] as const;
export type ClasseFonte = (typeof CLASSES_FONTE)[number];
export const DESCRICAO_CLASSE_FONTE: Record<ClasseFonte, string> = {
  A: 'Documento oficial aplicável (ANEEL, MME, EPE, ONS, órgão ambiental, Diário Oficial, contrato).',
  B: 'Comunicação oficial do empreendedor (RI, fato relevante, relatório de sustentabilidade, site oficial).',
  C: 'Imprensa setorial ou terceiros com citação de fonte.',
  D: 'Informação informal/comercial não verificada.',
};
export const PESO_CLASSE: Record<ClasseFonte, number> = { A: 3, B: 2, C: 1, D: 0 };

export const TIPOS_DOCUMENTO = [
  'ato_regulatorio', 'edital', 'contrato', 'licenca', 'relatorio_planejamento', 'cronograma',
  'comunicado_empresa', 'relatorio_ri', 'noticia', 'planilha', 'registro_manual', 'outro',
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export const ROTULO_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  ato_regulatorio: 'Ato regulatório',
  edital: 'Edital',
  contrato: 'Contrato',
  licenca: 'Licença ambiental',
  relatorio_planejamento: 'Relatório de planejamento',
  cronograma: 'Cronograma',
  comunicado_empresa: 'Comunicado da empresa',
  relatorio_ri: 'Relatório de RI',
  noticia: 'Notícia',
  planilha: 'Planilha',
  registro_manual: 'Registro manual',
  outro: 'Outro',
};

export const TIPOS_MARCO = [
  'anuncio', 'inclusao_planejamento', 'parecer_acesso', 'consulta_publica', 'edital_publicado',
  'leilao_realizado', 'vencedor_definido', 'contrato_concessao_assinado', 'autorizacao_publicada',
  'decisao_final_investimento', 'licenca_previa', 'licenca_instalacao', 'licenca_operacao',
  'projeto_basico_aprovado', 'dup_publicada', 'financiamento_aprovado',
  'equipamentos_criticos_contratados', 'rfq_publicada', 'propostas_recebidas',
  'contrato_execucao_assinado', 'ordem_inicio', 'mobilizacao', 'inicio_obras',
  'prazo_contratual_energizacao', 'energizacao', 'operacao_comercial', 'suspensao',
  'cancelamento', 'outro',
] as const;
export type TipoMarco = (typeof TIPOS_MARCO)[number];
export const ROTULO_MARCO: Record<TipoMarco, string> = {
  anuncio: 'Anúncio / intenção de investimento',
  inclusao_planejamento: 'Inclusão em plano (PDE/PET/POTEE/PAR)',
  parecer_acesso: 'Parecer de acesso / conexão',
  consulta_publica: 'Consulta pública',
  edital_publicado: 'Edital publicado',
  leilao_realizado: 'Leilão realizado',
  vencedor_definido: 'Vencedor definido',
  contrato_concessao_assinado: 'Contrato de concessão assinado',
  autorizacao_publicada: 'Autorização (REA) publicada',
  decisao_final_investimento: 'Decisão final de investimento (FID)',
  licenca_previa: 'Licença Prévia (LP)',
  licenca_instalacao: 'Licença de Instalação (LI)',
  licenca_operacao: 'Licença de Operação (LO)',
  projeto_basico_aprovado: 'Projeto básico aprovado',
  dup_publicada: 'DUP publicada (fundiário)',
  financiamento_aprovado: 'Financiamento aprovado',
  equipamentos_criticos_contratados: 'Equipamentos críticos contratados',
  rfq_publicada: 'RFQ/RFP publicada',
  propostas_recebidas: 'Propostas recebidas',
  contrato_execucao_assinado: 'Contrato de execução assinado',
  ordem_inicio: 'Ordem de início',
  mobilizacao: 'Mobilização',
  inicio_obras: 'Início das obras',
  prazo_contratual_energizacao: 'Prazo contratual de energização',
  energizacao: 'Energização',
  operacao_comercial: 'Operação comercial',
  suspensao: 'Suspensão',
  cancelamento: 'Cancelamento',
  outro: 'Outro',
};

export const NATUREZAS_MARCO = ['realizado', 'previsto_oficial', 'previsto_estimado'] as const;
export type NaturezaMarco = (typeof NATUREZAS_MARCO)[number];
export const ROTULO_NATUREZA_MARCO: Record<NaturezaMarco, string> = {
  realizado: 'Realizado',
  previsto_oficial: 'Previsto (divulgado)',
  previsto_estimado: 'Previsto (estimativa interna)',
};

export const ESCOPOS = ['LT', 'SE', 'geral'] as const;
export type Escopo = (typeof ESCOPOS)[number];

export const PACOTES = [
  'projeto_executivo', 'fornecimento', 'montagem_eletromecanica', 'construcao_civil',
  'lancamento_cabos', 'montagem_estruturas', 'comissionamento', 'energizacao',
] as const;
export type Pacote = (typeof PACOTES)[number];
export const ROTULO_PACOTE: Record<Pacote, string> = {
  projeto_executivo: 'Projeto executivo',
  fornecimento: 'Fornecimento',
  montagem_eletromecanica: 'Montagem eletromecânica',
  construcao_civil: 'Construção civil',
  lancamento_cabos: 'Lançamento de cabos',
  montagem_estruturas: 'Montagem de estruturas',
  comissionamento: 'Comissionamento',
  energizacao: 'Energização',
};
/** Pacotes que compõem a obra de construção/montagem endereçável à construtora. */
export const PACOTES_CONSTRUCAO: Pacote[] = [
  'montagem_eletromecanica', 'construcao_civil', 'lancamento_cabos', 'montagem_estruturas', 'comissionamento',
];

export const FASES_CONTRATACAO = [
  'nao_identificada', 'prevista', 'pre_qualificacao', 'rfi', 'rfq_rfp', 'propostas',
  'negociacao', 'adjudicada', 'contratada', 'nao_aplicavel',
] as const;
export type FaseContratacao = (typeof FASES_CONTRATACAO)[number];
export const ROTULO_FASE_CONTRATACAO: Record<FaseContratacao, string> = {
  nao_identificada: 'Não identificada',
  prevista: 'Prevista',
  pre_qualificacao: 'Pré-qualificação',
  rfi: 'RFI',
  rfq_rfp: 'RFQ/RFP publicada',
  propostas: 'Propostas em análise',
  negociacao: 'Negociação',
  adjudicada: 'Adjudicada',
  contratada: 'Contratada',
  nao_aplicavel: 'Não aplicável',
};
/** Ordem de avanço (maior = mais avançado). */
export const ORDEM_FASE_CONTRATACAO: Record<FaseContratacao, number> = {
  nao_aplicavel: -1,
  nao_identificada: 0,
  prevista: 1,
  pre_qualificacao: 2,
  rfi: 3,
  rfq_rfp: 4,
  propostas: 5,
  negociacao: 6,
  adjudicada: 7,
  contratada: 8,
};
export const FASES_COTACAO_ABERTA: FaseContratacao[] = ['pre_qualificacao', 'rfi', 'rfq_rfp', 'propostas', 'negociacao'];

export const SITUACOES_OBRA = ['nao_iniciada', 'mobilizacao', 'construcao', 'comissionamento', 'concluida', 'paralisada'] as const;
export type SituacaoObra = (typeof SITUACOES_OBRA)[number];
export const ROTULO_SITUACAO_OBRA: Record<SituacaoObra, string> = {
  nao_iniciada: 'Não iniciada',
  mobilizacao: 'Mobilização',
  construcao: 'Construção',
  comissionamento: 'Comissionamento',
  concluida: 'Concluída',
  paralisada: 'Paralisada',
};

export const STATUS_GERAL = ['ativo', 'suspenso', 'adiado', 'cancelado', 'concluido'] as const;
export type StatusGeral = (typeof STATUS_GERAL)[number];
export const ROTULO_STATUS_GERAL: Record<StatusGeral, string> = {
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  adiado: 'Adiado',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
};

export const SITUACAO_REGULATORIA = [
  'indefinida', 'nao_aplicavel', 'em_planejamento', 'em_consulta_publica', 'em_licitacao', 'outorgada', 'autorizada',
] as const;
export const SITUACAO_AMBIENTAL = [
  'indefinida', 'nao_iniciada', 'em_estudo', 'lp_requerida', 'lp_emitida', 'li_requerida', 'li_emitida', 'lo_emitida', 'dispensada',
] as const;
export const SITUACAO_FUNDIARIA = ['indefinida', 'nao_iniciada', 'em_negociacao', 'dup_emitida', 'liberada', 'em_disputa'] as const;
export const SITUACAO_ENGENHARIA = ['indefinida', 'conceitual', 'projeto_basico', 'projeto_executivo', 'concluida'] as const;
export type SituacaoRegulatoria = (typeof SITUACAO_REGULATORIA)[number];
export type SituacaoAmbiental = (typeof SITUACAO_AMBIENTAL)[number];
export type SituacaoFundiaria = (typeof SITUACAO_FUNDIARIA)[number];
export type SituacaoEngenharia = (typeof SITUACAO_ENGENHARIA)[number];
export const ROTULO_SITUACAO: Record<string, string> = {
  indefinida: 'Indefinida',
  nao_aplicavel: 'Não aplicável',
  em_planejamento: 'Em planejamento',
  em_consulta_publica: 'Em consulta pública',
  em_licitacao: 'Em leilão/licitação',
  outorgada: 'Outorgada',
  autorizada: 'Autorizada',
  nao_iniciada: 'Não iniciada',
  em_estudo: 'Em estudo',
  lp_requerida: 'LP requerida',
  lp_emitida: 'LP emitida',
  li_requerida: 'LI requerida',
  li_emitida: 'LI emitida',
  lo_emitida: 'LO emitida',
  dispensada: 'Dispensada',
  em_negociacao: 'Em negociação',
  dup_emitida: 'DUP emitida',
  liberada: 'Liberada',
  em_disputa: 'Em disputa',
  conceitual: 'Conceitual',
  projeto_basico: 'Projeto básico',
  projeto_executivo: 'Projeto executivo',
  concluida: 'Concluída',
};

export const STATUS_ETAPA = ['nao_iniciada', 'em_andamento', 'concluida', 'nao_aplicavel'] as const;
export type StatusEtapa = (typeof STATUS_ETAPA)[number];

export const FREQUENCIAS = ['diaria', 'semanal', 'quinzenal', 'mensal', 'trimestral', 'anual', 'eventual', 'manual'] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];
export const ROTULO_FREQUENCIA: Record<Frequencia, string> = {
  diaria: 'Diária', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', trimestral: 'Trimestral',
  anual: 'Anual', eventual: 'Eventual (por publicação)', manual: 'Manual',
};
export const DIAS_FREQUENCIA: Record<Frequencia, number | null> = {
  diaria: 1, semanal: 7, quinzenal: 15, mensal: 30, trimestral: 90, anual: 365, eventual: null, manual: null,
};

export const METODOS_ACESSO = [
  'api_ckan', 'api_arcgis', 'api_rest', 'download_arquivo', 'rss', 'pdf', 'html', 'manual',
] as const;
export type MetodoAcesso = (typeof METODOS_ACESSO)[number];
export const ROTULO_METODO_ACESSO: Record<MetodoAcesso, string> = {
  api_ckan: 'API CKAN (dados abertos)',
  api_arcgis: 'API ArcGIS REST',
  api_rest: 'API REST',
  download_arquivo: 'Download de arquivo (CSV/XLSX)',
  rss: 'RSS/Atom',
  pdf: 'Documento PDF',
  html: 'Página HTML',
  manual: 'Importação/registro manual',
};

export const STATUS_INTEGRACAO = [
  'implementado', 'implementado_nao_validado', 'adaptador_preparado', 'importacao_manual', 'desativado',
] as const;
export type StatusIntegracao = (typeof STATUS_INTEGRACAO)[number];
export const ROTULO_STATUS_INTEGRACAO: Record<StatusIntegracao, string> = {
  implementado: 'Implementado e validado',
  implementado_nao_validado: 'Implementado — não validado contra o endpoint real',
  adaptador_preparado: 'Adaptador preparado (requer configuração/credencial)',
  importacao_manual: 'Importação manual',
  desativado: 'Desativado',
};

export const TIPOS_EVENTO = [
  'novo_empreendimento', 'edital_publicado', 'leilao_realizado', 'vencedor_definido',
  'concessao_assinada', 'contrato_execucao_assinado', 'licenca_emitida', 'revisao_cronograma',
  'atraso', 'cotacao_aberta', 'suspensao', 'cancelamento', 'mudanca_etapa', 'mudanca_valor',
  'contratada_identificada', 'conflito_fontes', 'janela_contratacao_proxima',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];
export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  novo_empreendimento: 'Novo empreendimento',
  edital_publicado: 'Edital publicado',
  leilao_realizado: 'Leilão realizado',
  vencedor_definido: 'Vencedor definido',
  concessao_assinada: 'Concessão/autorização assinada',
  contrato_execucao_assinado: 'Contrato de execução assinado',
  licenca_emitida: 'Licença emitida',
  revisao_cronograma: 'Revisão de cronograma',
  atraso: 'Atraso',
  cotacao_aberta: 'Processo de cotação aberto',
  suspensao: 'Suspensão',
  cancelamento: 'Cancelamento',
  mudanca_etapa: 'Mudança de etapa',
  mudanca_valor: 'Mudança de valor',
  contratada_identificada: 'Contratada/EPC identificada',
  conflito_fontes: 'Conflito entre fontes',
  janela_contratacao_proxima: 'Janela de contratação próxima',
};

export const STATUS_PROSPECCAO = [
  'identificada', 'qualificada', 'em_contato', 'reuniao_realizada', 'proposta_em_preparacao',
  'proposta_enviada', 'negociacao', 'ganha', 'perdida', 'declinada',
] as const;
export type StatusProspeccao = (typeof STATUS_PROSPECCAO)[number];
export const ROTULO_STATUS_PROSPECCAO: Record<StatusProspeccao, string> = {
  identificada: 'Identificada',
  qualificada: 'Qualificada',
  em_contato: 'Em contato',
  reuniao_realizada: 'Reunião realizada',
  proposta_em_preparacao: 'Proposta em preparação',
  proposta_enviada: 'Proposta enviada',
  negociacao: 'Negociação',
  ganha: 'Ganha',
  perdida: 'Perdida',
  declinada: 'Declinada',
};
/** Status que caracterizam o pipeline comercial qualificado pela empresa. */
export const STATUS_PIPELINE_QUALIFICADO: StatusProspeccao[] = [
  'qualificada', 'em_contato', 'reuniao_realizada', 'proposta_em_preparacao', 'proposta_enviada', 'negociacao',
];

export const INTERESSES = ['nao_avaliado', 'monitorar', 'interessado', 'sem_interesse'] as const;
export type Interesse = (typeof INTERESSES)[number];
export const ROTULO_INTERESSE: Record<Interesse, string> = {
  nao_avaliado: 'Não avaliado',
  monitorar: 'Monitorar',
  interessado: 'Interessado',
  sem_interesse: 'Sem interesse',
};

export const PAPEIS_USUARIO = ['admin', 'analista', 'comercial', 'leitor'] as const;
export type PapelUsuario = (typeof PAPEIS_USUARIO)[number];
