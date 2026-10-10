/**
 * DADOS DEMONSTRATIVOS FICTÍCIOS.
 *
 * Todos os empreendimentos, empresas, valores, documentos e contatos abaixo são INVENTADOS
 * para demonstrar a interface. Os nomes levam o prefixo "[DEMO]" / sufixo "(DEMO)", todas as
 * entidades têm `demo: true` e as URLs usam o domínio reservado `.invalid`.
 *
 * Localização: apenas municípios reais com coordenadas do CENTRO APROXIMADO do município
 * (precisão "municipio"); as linhas são desenhadas como RETAS ESQUEMÁTICAS entre extremidades
 * (natureza "esquematico"), não como traçados.
 *
 * As datas são relativas à data de carga, para que a demonstração continue coerente no tempo.
 */
import {
  EmpreendimentoSchema, detectarMudancas, hojeISO, novoId, somarMeses, type AlertaRegra, type Documento, type Empreendimento,
  type EmpreendimentoEntrada, type EventoMudanca, type Evidencia, type MatchCandidato, type OportunidadeComercial,
  type Organizacao, type Ponto, type TipoMarco, type UF,
} from '@radar/core';

type Classe = 'A' | 'B' | 'C';

const MUN: Record<string, { uf: UF; lat: number; lon: number }> = {
  'Montes Claros': { uf: 'MG', lat: -16.73, lon: -43.86 },
  'Bom Jesus da Lapa': { uf: 'BA', lat: -13.25, lon: -43.42 },
  Barreiras: { uf: 'BA', lat: -12.15, lon: -45.0 },
  'Rio Verde': { uf: 'GO', lat: -17.8, lon: -50.93 },
  Catalão: { uf: 'GO', lat: -18.17, lon: -47.94 },
  Parauapebas: { uf: 'PA', lat: -6.07, lon: -49.9 },
  Marabá: { uf: 'PA', lat: -5.37, lon: -49.12 },
  'Canaã dos Carajás': { uf: 'PA', lat: -6.5, lon: -49.88 },
  Imperatriz: { uf: 'MA', lat: -5.53, lon: -47.49 },
  Palmas: { uf: 'TO', lat: -10.18, lon: -48.33 },
  Gurupi: { uf: 'TO', lat: -11.73, lon: -49.07 },
  'São Raimundo Nonato': { uf: 'PI', lat: -9.01, lon: -42.7 },
  Picos: { uf: 'PI', lat: -7.08, lon: -41.47 },
  Teresina: { uf: 'PI', lat: -5.09, lon: -42.8 },
  'Ribeirão Preto': { uf: 'SP', lat: -21.18, lon: -47.81 },
  Campinas: { uf: 'SP', lat: -22.91, lon: -47.06 },
  'João Câmara': { uf: 'RN', lat: -5.54, lon: -35.82 },
  Mossoró: { uf: 'RN', lat: -5.19, lon: -37.34 },
  'Porto Velho': { uf: 'RO', lat: -8.76, lon: -63.9 },
  Candiota: { uf: 'RS', lat: -31.56, lon: -53.67 },
  'Santa Maria': { uf: 'RS', lat: -29.69, lon: -53.81 },
  Joinville: { uf: 'SC', lat: -26.3, lon: -48.85 },
  Macapá: { uf: 'AP', lat: 0.03, lon: -51.07 },
  Bacabal: { uf: 'MA', lat: -4.22, lon: -44.78 },
  Itabira: { uf: 'MG', lat: -19.62, lon: -43.23 },
  'Conselheiro Lafaiete': { uf: 'MG', lat: -20.66, lon: -43.79 },
  'Três Lagoas': { uf: 'MS', lat: -20.79, lon: -51.7 },
  'Santana de Parnaíba': { uf: 'SP', lat: -23.44, lon: -46.92 },
  Londrina: { uf: 'PR', lat: -23.31, lon: -51.16 },
  'São Gonçalo do Amarante': { uf: 'CE', lat: -3.61, lon: -38.97 },
  Serra: { uf: 'ES', lat: -20.13, lon: -40.31 },
  Uberlândia: { uf: 'MG', lat: -18.92, lon: -48.28 },
  Paracatu: { uf: 'MG', lat: -17.22, lon: -46.87 },
  Cuiabá: { uf: 'MT', lat: -15.6, lon: -56.1 },
  'Santa Vitória do Palmar': { uf: 'RS', lat: -33.52, lon: -53.37 },
};

const ponto = (m: string): Ponto => ({ lat: MUN[m].lat, lon: MUN[m].lon, precisao: 'municipio', fonte: 'Centro aproximado do município (demonstração)' });

const ORGS: Organizacao[] = [
  ['aurora', 'Transmissora Aurora S.A. (DEMO)', 'concessionaria_transmissao', ['transmissao']],
  ['cerrado', 'Linhas do Cerrado Transmissão S.A. (DEMO)', 'concessionaria_transmissao', ['transmissao']],
  ['sertao', 'Sertão Energia Transmissora S.A. (DEMO)', 'concessionaria_transmissao', ['transmissao']],
  ['valeazul', 'Vale Azul Mineração (DEMO)', 'mineradora', ['mineracao']],
  ['ferronorte', 'Ferro Norte Mineração (DEMO)', 'mineradora', ['mineracao']],
  ['planalto', 'Siderúrgica Planalto (DEMO)', 'siderurgica', ['industria']],
  ['rioclaro', 'Celulose Rio Claro (DEMO)', 'industria', ['industria']],
  ['nuvemsul', 'NuvemSul Data Centers (DEMO)', 'data_center', ['industria']],
  ['h2atl', 'Hidrogênio Atlântico (DEMO)', 'industria', ['industria']],
  ['ventos', 'Ventos do Agreste Eólica (DEMO)', 'geradora', ['geracao']],
  ['solar', 'Solar Chapada Energia (DEMO)', 'geradora', ['geracao']],
  ['distvale', 'Distribuidora Vale do Rio (DEMO)', 'distribuidora', ['distribuicao']],
  ['montagens', 'Montagens Integradas Ltda. (DEMO)', 'construtora', []],
  ['delta', 'Engenharia Delta (DEMO)', 'engenharia', []],
  ['fundo', 'Fundo Infra Brasil (DEMO)', 'investidor', []],
  ['cimento', 'Cimentos Serra Azul (DEMO)', 'industria', ['industria']],
  ['cobre', 'Jatobá Cobre Mineração (DEMO)', 'mineradora', ['mineracao']],
  ['reversivel', 'Hidro Reversível Planalto (DEMO)', 'geradora', ['geracao']],
  ['offshore', 'Ventos do Sul Offshore (DEMO)', 'geradora', ['geracao']],
].map(([id, nome, tipo, setores]) => ({
  id: `demo-org-${id}`,
  nome: nome as string,
  nomesAlternativos: [],
  tipo: tipo as Organizacao['tipo'],
  setores: setores as Organizacao['setores'],
  demo: true,
}));

const org = (id: string) => `demo-org-${id}`;

interface Def {
  id: string;
  nome: string;
  tipo: Empreendimento['tipo'];
  setor: Empreendimento['setorOrigem'];
  subsetor?: Empreendimento['subsetor'];
  fluxo: string;
  identificado: number;
  municipios: string[];
  participantes: [string, Empreendimento['participantes'][number]['papel']][];
  lt?: { de: string; para: string; kv: number; km: number; cc?: boolean }[];
  se?: { nome: string; mun: string; natureza: 'nova' | 'ampliacao' | 'seccionamento' | 'adequacao'; kv: number[]; mva?: number }[];
  tecnico?: Partial<Empreendimento['tecnico']>;
  marcos: [TipoMarco, number, 'realizado' | 'previsto_oficial' | 'previsto_estimado', Classe, ('LT' | 'SE' | 'geral')?][];
  etapas: [string, 'em_andamento' | 'concluida' | 'nao_aplicavel', number?][];
  pacotes?: [Empreendimento['pacotes'][number]['pacote'], 'LT' | 'SE', Empreendimento['pacotes'][number]['faseContratacao'], number?, string?][];
  financeiro?: { capexTotal?: number; capexEletrico?: number; rap?: number; financiamento?: string };
  situacoes?: Partial<Empreendimento['situacoes']>;
  obra?: Empreendimento['situacaoObra'];
  status?: Empreendimento['statusGeral'];
  descricao?: string;
}

const DEFS: Def[] = [
  {
    id: 'aurora', nome: '[DEMO] LT 500 kV Montes Claros Demo – Bom Jesus da Lapa Demo e SEs associadas', tipo: 'LT+SE', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -16,
    municipios: ['Montes Claros', 'Bom Jesus da Lapa'], participantes: [['aurora', 'concessionaria'], ['fundo', 'investidor']],
    lt: [{ de: 'Montes Claros', para: 'Bom Jesus da Lapa', kv: 500, km: 380 }],
    se: [{ nome: 'SE Bom Jesus da Lapa Demo 500/230 kV', mun: 'Bom Jesus da Lapa', natureza: 'nova', kv: [500, 230], mva: 900 }, { nome: 'SE Montes Claros Demo 500 kV', mun: 'Montes Claros', natureza: 'ampliacao', kv: [500] }],
    marcos: [['inclusao_planejamento', -30, 'realizado', 'A'], ['edital_publicado', -11, 'realizado', 'A'], ['leilao_realizado', -9, 'realizado', 'A'], ['contrato_concessao_assinado', -6, 'realizado', 'A'], ['licenca_previa', -1, 'realizado', 'A'], ['prazo_contratual_energizacao', 54, 'previsto_oficial', 'A']],
    etapas: [['planejamento', 'concluida', -30], ['contratacao_regulatoria', 'concluida', -11], ['concessao', 'concluida', -6], ['licenciamento', 'em_andamento', -5], ['engenharia', 'em_andamento', -5]],
    pacotes: [['montagem_eletromecanica', 'LT', 'prevista'], ['construcao_civil', 'SE', 'nao_identificada']],
    financeiro: { capexEletrico: 2_100_000_000, rap: 235_000_000, financiamento: 'Debêntures de infraestrutura (fictício)' },
    situacoes: { regulatoria: 'outorgada', ambiental: 'lp_emitida', fundiaria: 'em_negociacao', engenharia: 'projeto_basico' },
  },
  {
    id: 'cerrado1', nome: '[DEMO] LT 230 kV Rio Verde Demo – Catalão Demo', tipo: 'LT+SE', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -18,
    municipios: ['Rio Verde', 'Catalão'], participantes: [['cerrado', 'concessionaria']],
    lt: [{ de: 'Rio Verde', para: 'Catalão', kv: 230, km: 310 }], se: [{ nome: 'SE Catalão Demo 230 kV', mun: 'Catalão', natureza: 'ampliacao', kv: [230, 138] }],
    marcos: [['leilao_realizado', -17, 'realizado', 'A'], ['contrato_concessao_assinado', -14, 'realizado', 'A'], ['licenca_previa', -8, 'realizado', 'A'], ['licenca_instalacao', -2, 'realizado', 'A'], ['prazo_contratual_energizacao', 28, 'previsto_oficial', 'A']],
    etapas: [['contratacao_regulatoria', 'concluida', -17], ['concessao', 'concluida', -14], ['licenciamento', 'concluida', -12], ['engenharia', 'em_andamento', -12], ['contratacao_execucao', 'em_andamento', -1]],
    pacotes: [['montagem_eletromecanica', 'LT', 'rfq_rfp', -1], ['construcao_civil', 'SE', 'prevista']],
    financeiro: { capexEletrico: 640_000_000, rap: 72_000_000 },
    situacoes: { regulatoria: 'outorgada', ambiental: 'li_emitida', fundiaria: 'dup_emitida', engenharia: 'projeto_executivo' },
  },
  {
    id: 'carajas', nome: '[DEMO] SE 500/138 kV Carajás Leste Demo (nova) e seccionamentos', tipo: 'LT+SE', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -7,
    municipios: ['Parauapebas'], participantes: [['sertao', 'concessionaria']],
    lt: [{ de: 'Parauapebas', para: 'Canaã dos Carajás', kv: 500, km: 24 }], se: [{ nome: 'SE Carajás Leste Demo 500/138 kV', mun: 'Parauapebas', natureza: 'nova', kv: [500, 138], mva: 600 }],
    marcos: [['leilao_realizado', -6, 'realizado', 'A'], ['contrato_concessao_assinado', -3, 'realizado', 'A'], ['prazo_contratual_energizacao', 42, 'previsto_oficial', 'A']],
    etapas: [['contratacao_regulatoria', 'concluida', -6], ['concessao', 'concluida', -3], ['licenciamento', 'em_andamento', -2], ['engenharia', 'em_andamento', -2]],
    financeiro: { capexEletrico: 480_000_000, rap: 54_000_000 },
    situacoes: { regulatoria: 'outorgada', ambiental: 'em_estudo' },
  },
  {
    id: 'tocantins', nome: '[DEMO] LT 500 kV Palmas Demo – Gurupi Demo C2', tipo: 'LT', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -12,
    municipios: ['Palmas', 'Gurupi'], participantes: [],
    lt: [{ de: 'Palmas', para: 'Gurupi', kv: 500, km: 205 }],
    marcos: [['inclusao_planejamento', -20, 'realizado', 'A'], ['edital_publicado', -1, 'realizado', 'A'], ['leilao_realizado', 2, 'previsto_oficial', 'A']],
    etapas: [['planejamento', 'concluida', -20], ['contratacao_regulatoria', 'em_andamento', -1]],
    financeiro: { capexEletrico: 820_000_000 },
    situacoes: { regulatoria: 'em_licitacao' },
  },
  {
    id: 'piaui', nome: '[DEMO] LT 230 kV São Raimundo Nonato Demo – Picos Demo', tipo: 'LT', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -10,
    municipios: ['São Raimundo Nonato', 'Picos'], participantes: [],
    lt: [{ de: 'São Raimundo Nonato', para: 'Picos', kv: 230, km: 260 }],
    marcos: [['inclusao_planejamento', -10, 'realizado', 'A']],
    etapas: [['planejamento', 'em_andamento', -10]],
    situacoes: { regulatoria: 'em_planejamento' },
  },
  {
    id: 'teresina', nome: '[DEMO] Reforço SE 230/138 kV Teresina Norte Demo (REA)', tipo: 'SE', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_autorizacao', identificado: -3,
    municipios: ['Teresina'], participantes: [['sertao', 'concessionaria']],
    se: [{ nome: 'SE Teresina Norte Demo 230/138 kV', mun: 'Teresina', natureza: 'ampliacao', kv: [230, 138], mva: 150 }],
    marcos: [['autorizacao_publicada', -2, 'realizado', 'A'], ['energizacao', 20, 'previsto_oficial', 'A']],
    etapas: [['planejamento', 'concluida', -8], ['concessao', 'concluida', -2], ['engenharia', 'em_andamento', -2]],
    financeiro: { capexEletrico: 58_000_000 },
    situacoes: { regulatoria: 'autorizada', ambiental: 'dispensada' },
  },
  {
    id: 'paulista', nome: '[DEMO] LT 345 kV Ribeirão Preto Demo – Campinas Demo', tipo: 'LT+SE', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -20,
    municipios: ['Ribeirão Preto', 'Campinas'], participantes: [['cerrado', 'concessionaria'], ['montagens', 'executor_obra']],
    lt: [{ de: 'Ribeirão Preto', para: 'Campinas', kv: 345, km: 220 }], se: [{ nome: 'SE Campinas Demo 345 kV', mun: 'Campinas', natureza: 'seccionamento', kv: [345] }],
    marcos: [['leilao_realizado', -20, 'realizado', 'A'], ['contrato_concessao_assinado', -17, 'realizado', 'A'], ['licenca_instalacao', -4, 'realizado', 'A'], ['contrato_execucao_assinado', -3, 'realizado', 'B', 'LT'], ['mobilizacao', -1, 'realizado', 'B'], ['prazo_contratual_energizacao', 19, 'previsto_oficial', 'A']],
    etapas: [['concessao', 'concluida', -17], ['licenciamento', 'concluida', -15], ['engenharia', 'concluida', -15], ['contratacao_execucao', 'em_andamento', -6], ['construcao', 'em_andamento', -1]],
    pacotes: [['montagem_eletromecanica', 'LT', 'contratada', -3, 'montagens'], ['construcao_civil', 'SE', 'negociacao', -1]],
    financeiro: { capexEletrico: 910_000_000, rap: 98_000_000 },
    situacoes: { regulatoria: 'outorgada', ambiental: 'li_emitida', fundiaria: 'liberada', engenharia: 'projeto_executivo' },
    obra: 'mobilizacao',
  },
  {
    id: 'potiguar', nome: '[DEMO] LT 500 kV João Câmara Demo – Mossoró Demo', tipo: 'LT', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -22,
    municipios: ['João Câmara', 'Mossoró'], participantes: [['aurora', 'concessionaria']],
    lt: [{ de: 'João Câmara', para: 'Mossoró', kv: 500, km: 235 }],
    marcos: [['leilao_realizado', -23, 'realizado', 'A'], ['contrato_concessao_assinado', -20, 'realizado', 'A'], ['licenca_previa', -9, 'realizado', 'A'], ['licenca_instalacao', -2, 'previsto_oficial', 'B'], ['prazo_contratual_energizacao', 26, 'previsto_oficial', 'A']],
    etapas: [['concessao', 'concluida', -20], ['licenciamento', 'em_andamento', -18], ['engenharia', 'em_andamento', -18]],
    pacotes: [['montagem_eletromecanica', 'LT', 'pre_qualificacao', -1]],
    financeiro: { capexEletrico: 1_150_000_000, rap: 128_000_000 },
    situacoes: { regulatoria: 'outorgada', ambiental: 'li_requerida', fundiaria: 'em_negociacao' },
  },
  {
    id: 'madeira', nome: '[DEMO] LT 230 kV Porto Velho Demo – Ramal Norte Demo', tipo: 'LT', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -14,
    municipios: ['Porto Velho'], participantes: [['sertao', 'concessionaria']],
    lt: [{ de: 'Porto Velho', para: 'Porto Velho', kv: 230, km: 140 }],
    marcos: [['contrato_concessao_assinado', -15, 'realizado', 'A'], ['suspensao', -2, 'realizado', 'A'], ['prazo_contratual_energizacao', 30, 'previsto_oficial', 'A']],
    etapas: [['concessao', 'concluida', -15], ['licenciamento', 'em_andamento', -13]],
    financeiro: { capexEletrico: 390_000_000 },
    situacoes: { regulatoria: 'outorgada', ambiental: 'em_estudo', fundiaria: 'em_disputa' },
    status: 'suspenso', descricao: 'Licenciamento suspenso por decisão judicial (fictício).',
  },
  {
    id: 'pampa', nome: '[DEMO] LT 500 kV Candiota Demo – Santa Maria Demo', tipo: 'LT+SE', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -24,
    municipios: ['Candiota', 'Santa Maria'], participantes: [['aurora', 'concessionaria'], ['montagens', 'epc']],
    lt: [{ de: 'Candiota', para: 'Santa Maria', kv: 500, km: 250 }], se: [{ nome: 'SE Santa Maria Demo 500 kV', mun: 'Santa Maria', natureza: 'ampliacao', kv: [500, 230] }],
    marcos: [['contrato_concessao_assinado', -28, 'realizado', 'A'], ['licenca_instalacao', -16, 'realizado', 'A'], ['contrato_execucao_assinado', -15, 'realizado', 'B'], ['mobilizacao', -13, 'realizado', 'B'], ['inicio_obras', -12, 'realizado', 'B'], ['energizacao', 5, 'previsto_oficial', 'B']],
    etapas: [['concessao', 'concluida', -28], ['licenciamento', 'concluida', -26], ['contratacao_execucao', 'concluida', -16], ['construcao', 'em_andamento', -13]],
    pacotes: [['montagem_eletromecanica', 'LT', 'contratada', -15, 'montagens'], ['construcao_civil', 'SE', 'contratada', -15, 'montagens']],
    financeiro: { capexEletrico: 1_300_000_000 }, situacoes: { regulatoria: 'outorgada', ambiental: 'li_emitida', fundiaria: 'liberada', engenharia: 'concluida' },
    obra: 'construcao',
  },
  {
    id: 'joinville', nome: '[DEMO] SE 230 kV Joinville Industrial Demo (ampliação)', tipo: 'SE', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_autorizacao', identificado: -24,
    municipios: ['Joinville'], participantes: [['cerrado', 'concessionaria']],
    se: [{ nome: 'SE Joinville Industrial Demo 230 kV', mun: 'Joinville', natureza: 'ampliacao', kv: [230, 138] }],
    marcos: [['autorizacao_publicada', -26, 'realizado', 'A'], ['contrato_execucao_assinado', -18, 'realizado', 'B'], ['energizacao', -2, 'realizado', 'A']],
    etapas: [['concessao', 'concluida', -26], ['construcao', 'concluida', -16], ['comissionamento', 'concluida', -3]],
    pacotes: [['construcao_civil', 'SE', 'contratada', -18]], financeiro: { capexEletrico: 75_000_000 }, obra: 'concluida', status: 'concluido',
  },
  {
    id: 'amapa', nome: '[DEMO] LT 138 kV Macapá Demo – Interligação Local', tipo: 'LT', setor: 'distribuicao', subsetor: 'distribuicao', fluxo: 'distribuicao', identificado: -5,
    municipios: ['Macapá'], participantes: [['distvale', 'empreendedor']],
    lt: [{ de: 'Macapá', para: 'Macapá', kv: 138, km: 48 }],
    marcos: [['anuncio', -5, 'realizado', 'B'], ['rfq_publicada', 4, 'previsto_oficial', 'B']],
    etapas: [['planejamento', 'concluida', -5], ['engenharia', 'em_andamento', -3]],
    situacoes: { engenharia: 'projeto_basico' },
  },
  {
    id: 'ramal69', nome: '[DEMO] LT 69 kV Ramal Rural Bacabal Demo', tipo: 'LT', setor: 'distribuicao', subsetor: 'distribuicao', fluxo: 'distribuicao', identificado: -4,
    municipios: ['Bacabal'], participantes: [['distvale', 'empreendedor']], lt: [{ de: 'Bacabal', para: 'Bacabal', kv: 69, km: 35 }],
    marcos: [['anuncio', -4, 'realizado', 'C']], etapas: [['planejamento', 'em_andamento', -4]],
    descricao: 'Exemplo fora do escopo (< 138 kV) para demonstrar o filtro de aderência.',
  },
  {
    id: 'serravermelha', nome: '[DEMO] Expansão Mina Serra Vermelha Demo — SE 230/34,5 kV e LT 230 kV', tipo: 'infraestrutura_associada', setor: 'mineracao', subsetor: 'mineracao_ferro', fluxo: 'privado_industrial', identificado: -8,
    municipios: ['Canaã dos Carajás'], participantes: [['valeazul', 'empreendedor'], ['valeazul', 'potencial_contratante']],
    lt: [{ de: 'Canaã dos Carajás', para: 'Parauapebas', kv: 230, km: 85 }], se: [{ nome: 'SE Serra Vermelha Demo 230/34,5 kV', mun: 'Canaã dos Carajás', natureza: 'nova', kv: [230, 34.5], mva: 300 }],
    marcos: [['anuncio', -8, 'realizado', 'B'], ['licenca_previa', -2, 'realizado', 'A'], ['decisao_final_investimento', 4, 'previsto_oficial', 'B'], ['operacao_comercial', 34, 'previsto_oficial', 'B']],
    etapas: [['sinal_mercado', 'concluida', -8], ['planejamento', 'concluida', -6], ['licenciamento', 'em_andamento', -6], ['engenharia', 'em_andamento', -4]],
    financeiro: { capexTotal: 9_000_000_000 }, situacoes: { ambiental: 'lp_emitida', engenharia: 'projeto_basico' },
  },
  {
    id: 'pelotizacao', nome: '[DEMO] Nova planta de pelotização Itabira Demo — SE 345 kV', tipo: 'expansao_industrial', setor: 'mineracao', subsetor: 'mineracao_ferro', fluxo: 'privado_industrial', identificado: -11,
    municipios: ['Itabira'], participantes: [['ferronorte', 'empreendedor'], ['delta', 'engenharia']],
    lt: [{ de: 'Itabira', para: 'Itabira', kv: 345, km: 18 }], se: [{ nome: 'SE Pelotização Demo 345/13,8 kV', mun: 'Itabira', natureza: 'nova', kv: [345, 13.8], mva: 400 }],
    marcos: [['anuncio', -11, 'realizado', 'B'], ['decisao_final_investimento', -3, 'realizado', 'B'], ['licenca_instalacao', -1, 'realizado', 'A']],
    etapas: [['sinal_mercado', 'concluida', -11], ['licenciamento', 'concluida', -9], ['engenharia', 'em_andamento', -6], ['concessao', 'concluida', -3]],
    pacotes: [['projeto_executivo', 'SE', 'contratada', -2, 'delta'], ['montagem_eletromecanica', 'SE', 'prevista'], ['montagem_eletromecanica', 'LT', 'prevista']],
    financeiro: { capexTotal: 4_500_000_000, capexEletrico: 320_000_000 }, situacoes: { ambiental: 'li_emitida', engenharia: 'projeto_executivo' },
  },
  {
    id: 'siderurgica', nome: '[DEMO] Siderúrgica Planalto — Alto-forno 3 — LT 230 kV e SE', tipo: 'expansao_industrial', setor: 'industria', subsetor: 'siderurgia', fluxo: 'privado_industrial', identificado: -15,
    municipios: ['Conselheiro Lafaiete'], participantes: [['planalto', 'empreendedor']],
    lt: [{ de: 'Conselheiro Lafaiete', para: 'Conselheiro Lafaiete', kv: 230, km: 40 }], se: [{ nome: 'SE Alto-forno 3 Demo 230 kV', mun: 'Conselheiro Lafaiete', natureza: 'nova', kv: [230] }],
    marcos: [['anuncio', -15, 'realizado', 'B']], etapas: [['sinal_mercado', 'concluida', -15], ['planejamento', 'em_andamento', -12]],
    financeiro: { capexTotal: 6_000_000_000 }, status: 'adiado', descricao: 'Empresa adiou o investimento (fictício).',
  },
  {
    id: 'celulose', nome: '[DEMO] Celulose Rio Claro — Linha 2 — SE 440 kV e LT 440 kV', tipo: 'expansao_industrial', setor: 'industria', subsetor: 'papel_celulose', fluxo: 'privado_industrial', identificado: -13,
    municipios: ['Três Lagoas'], participantes: [['rioclaro', 'empreendedor'], ['montagens', 'epc']],
    lt: [{ de: 'Três Lagoas', para: 'Três Lagoas', kv: 440, km: 60 }], se: [{ nome: 'SE Celulose L2 Demo 440 kV', mun: 'Três Lagoas', natureza: 'nova', kv: [440, 138] }],
    marcos: [['anuncio', -13, 'realizado', 'B'], ['decisao_final_investimento', -10, 'realizado', 'B'], ['vencedor_definido', -7, 'realizado', 'B'], ['licenca_instalacao', -1, 'realizado', 'A']],
    etapas: [['sinal_mercado', 'concluida', -13], ['licenciamento', 'concluida', -10], ['concessao', 'concluida', -7], ['contratacao_execucao', 'em_andamento', -2]],
    pacotes: [['montagem_eletromecanica', 'LT', 'rfq_rfp', -1], ['montagem_eletromecanica', 'SE', 'prevista']],
    financeiro: { capexTotal: 22_000_000_000, capexEletrico: 450_000_000 }, situacoes: { ambiental: 'li_emitida', engenharia: 'projeto_executivo' },
  },
  {
    id: 'datacenter1', nome: '[DEMO] NuvemSul — Campus de data centers Santana de Parnaíba Demo — SE 345/138 kV', tipo: 'expansao_industrial', setor: 'industria', subsetor: 'data_center', fluxo: 'privado_industrial', identificado: -5,
    municipios: ['Santana de Parnaíba'], participantes: [['nuvemsul', 'empreendedor']],
    se: [{ nome: 'SE Campus NuvemSul Demo 345/138 kV', mun: 'Santana de Parnaíba', natureza: 'nova', kv: [345, 138], mva: 600 }],
    tecnico: { potenciaMw: 300 },
    marcos: [['anuncio', -5, 'realizado', 'B'], ['parecer_acesso', -1, 'realizado', 'A'], ['operacao_comercial', 30, 'previsto_oficial', 'B']],
    etapas: [['sinal_mercado', 'concluida', -5], ['planejamento', 'em_andamento', -4], ['engenharia', 'em_andamento', -2]],
    financeiro: { capexTotal: 7_500_000_000 },
  },
  {
    id: 'datacenter2', nome: '[DEMO] NuvemSul — Campus Londrina Demo — SE 230 kV', tipo: 'expansao_industrial', setor: 'industria', subsetor: 'data_center', fluxo: 'privado_industrial', identificado: -2,
    municipios: ['Londrina'], participantes: [['nuvemsul', 'empreendedor']], tecnico: { tensoesKv: [230], qtdSubestacoes: 1, potenciaMw: 120 },
    marcos: [['anuncio', -2, 'realizado', 'C']], etapas: [['sinal_mercado', 'em_andamento', -2]],
  },
  {
    id: 'hidrogenio', nome: '[DEMO] Hidrogênio Atlântico — Fase 1 — SE 500 kV e LT 500 kV', tipo: 'expansao_industrial', setor: 'industria', subsetor: 'hidrogenio', fluxo: 'privado_industrial', identificado: -19,
    municipios: ['São Gonçalo do Amarante'], participantes: [['h2atl', 'empreendedor'], ['fundo', 'investidor']],
    lt: [{ de: 'São Gonçalo do Amarante', para: 'São Gonçalo do Amarante', kv: 500, km: 25 }], se: [{ nome: 'SE Eletrolisadores Demo 500 kV', mun: 'São Gonçalo do Amarante', natureza: 'nova', kv: [500, 230], mva: 1200 }],
    tecnico: { potenciaMw: 1200 },
    marcos: [['anuncio', -19, 'realizado', 'B'], ['licenca_previa', -6, 'realizado', 'A'], ['decisao_final_investimento', 8, 'previsto_oficial', 'B']],
    etapas: [['sinal_mercado', 'concluida', -19], ['planejamento', 'concluida', -14], ['licenciamento', 'em_andamento', -12], ['engenharia', 'em_andamento', -8]],
    financeiro: { capexTotal: 18_000_000_000, financiamento: 'Banco de fomento (fictício)' }, situacoes: { ambiental: 'lp_emitida' },
  },
  {
    id: 'cobre', nome: '[DEMO] Projeto Jatobá Cobre — LT 230 kV Marabá Demo', tipo: 'infraestrutura_associada', setor: 'mineracao', subsetor: 'mineracao_outros', fluxo: 'privado_industrial', identificado: -1,
    municipios: ['Marabá'], participantes: [['cobre', 'empreendedor']], lt: [{ de: 'Marabá', para: 'Marabá', kv: 230, km: 120 }],
    marcos: [['anuncio', -1, 'realizado', 'C']], etapas: [['sinal_mercado', 'em_andamento', -1]], financeiro: { capexTotal: 3_000_000_000 },
  },
  {
    id: 'cimento', nome: '[DEMO] Cimentos Serra Azul — nova moagem Serra Demo — SE 138 kV', tipo: 'expansao_industrial', setor: 'industria', subsetor: 'cimento', fluxo: 'privado_industrial', identificado: -4,
    municipios: ['Serra'], participantes: [['cimento', 'empreendedor']], se: [{ nome: 'SE Moagem Demo 138 kV', mun: 'Serra', natureza: 'nova', kv: [138, 13.8], mva: 60 }],
    marcos: [['anuncio', -4, 'realizado', 'B'], ['decisao_final_investimento', -1, 'realizado', 'B']],
    etapas: [['sinal_mercado', 'concluida', -4], ['concessao', 'concluida', -1], ['engenharia', 'em_andamento', -1]],
    pacotes: [['construcao_civil', 'SE', 'prevista']], financeiro: { capexTotal: 900_000_000, capexEletrico: 42_000_000 },
  },
  {
    id: 'eolica', nome: '[DEMO] Complexo Eólico Ventos do Agreste — SE coletora 500 kV e LT 500 kV', tipo: 'conexao_geracao', setor: 'geracao', subsetor: 'eolica', fluxo: 'conexao_geracao', identificado: -9,
    municipios: ['João Câmara'], participantes: [['ventos', 'empreendedor']],
    lt: [{ de: 'João Câmara', para: 'Mossoró', kv: 500, km: 95 }], se: [{ nome: 'SE Coletora Agreste Demo 500/34,5 kV', mun: 'João Câmara', natureza: 'nova', kv: [500, 34.5], mva: 650 }],
    tecnico: { potenciaMw: 600 },
    marcos: [['anuncio', -9, 'realizado', 'B'], ['parecer_acesso', -5, 'realizado', 'A'], ['operacao_comercial', 36, 'previsto_oficial', 'B']],
    etapas: [['sinal_mercado', 'concluida', -9], ['planejamento', 'concluida', -5], ['licenciamento', 'em_andamento', -4], ['engenharia', 'em_andamento', -4]],
    financeiro: { capexTotal: 3_200_000_000 },
  },
  {
    id: 'solar', nome: '[DEMO] Solar Chapada — conexão 230 kV Barreiras Demo', tipo: 'conexao_geracao', setor: 'geracao', subsetor: 'solar', fluxo: 'conexao_geracao', identificado: -16,
    municipios: ['Barreiras'], participantes: [['solar', 'empreendedor'], ['montagens', 'executor_obra']],
    lt: [{ de: 'Barreiras', para: 'Barreiras', kv: 230, km: 45 }], se: [{ nome: 'SE Elevadora Chapada Demo 230 kV', mun: 'Barreiras', natureza: 'nova', kv: [230, 34.5] }],
    marcos: [['parecer_acesso', -12, 'realizado', 'A'], ['licenca_instalacao', -4, 'realizado', 'A'], ['contrato_execucao_assinado', -2, 'realizado', 'B'], ['operacao_comercial', 14, 'previsto_oficial', 'B']],
    etapas: [['planejamento', 'concluida', -12], ['licenciamento', 'concluida', -6], ['contratacao_execucao', 'concluida', -2], ['construcao', 'em_andamento', -1]],
    pacotes: [['montagem_eletromecanica', 'LT', 'contratada', -2, 'montagens'], ['construcao_civil', 'SE', 'contratada', -2, 'montagens']],
    financeiro: { capexTotal: 1_400_000_000 }, obra: 'mobilizacao',
  },
  {
    id: 'reversivel', nome: '[DEMO] Usina reversível Planalto Demo — conexão 500 kV', tipo: 'conexao_geracao', setor: 'geracao', subsetor: 'armazenamento', fluxo: 'conexao_geracao', identificado: -6,
    municipios: ['Catalão'], participantes: [['reversivel', 'empreendedor']], tecnico: { tensoesKv: [500], extensaoKm: 70, qtdSubestacoes: 1 },
    marcos: [['anuncio', -6, 'realizado', 'C']], etapas: [['sinal_mercado', 'em_andamento', -6]], financeiro: { capexTotal: 5_000_000_000 },
  },
  {
    id: 'offshore', nome: '[DEMO] Eólica offshore Ventos do Sul — conexão em estudo', tipo: 'conexao_geracao', setor: 'geracao', subsetor: 'eolica', fluxo: 'conexao_geracao', identificado: -3,
    municipios: ['Santa Vitória do Palmar'], participantes: [['offshore', 'empreendedor']], marcos: [['anuncio', -3, 'realizado', 'C']], etapas: [['sinal_mercado', 'em_andamento', -3]],
    descricao: 'Escopo elétrico ainda indefinido (exemplo de dado incompleto).',
  },
  {
    id: 'maraba', nome: '[DEMO] LT 500 kV Marabá Demo – Carajás Leste Demo C1', tipo: 'LT', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -6,
    municipios: ['Marabá', 'Parauapebas'], participantes: [['sertao', 'concessionaria']], lt: [{ de: 'Marabá', para: 'Parauapebas', kv: 500, km: 150 }],
    marcos: [['leilao_realizado', -5, 'realizado', 'A'], ['contrato_concessao_assinado', -1, 'realizado', 'A'], ['prazo_contratual_energizacao', 47, 'previsto_oficial', 'A']],
    etapas: [['contratacao_regulatoria', 'concluida', -5], ['concessao', 'concluida', -1]], financeiro: { capexEletrico: 610_000_000 }, situacoes: { regulatoria: 'outorgada' },
  },
  {
    id: 'imperatriz', nome: '[DEMO] LT 230 kV Imperatriz Demo – Marabá Demo', tipo: 'LT', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -8,
    municipios: ['Imperatriz', 'Marabá'], participantes: [['cerrado', 'concessionaria']], lt: [{ de: 'Imperatriz', para: 'Marabá', kv: 230, km: 230 }],
    marcos: [['leilao_realizado', -2, 'realizado', 'A'], ['contrato_concessao_assinado', 1, 'previsto_oficial', 'A'], ['prazo_contratual_energizacao', 49, 'previsto_oficial', 'A']],
    etapas: [['contratacao_regulatoria', 'concluida', -2], ['concessao', 'em_andamento', -2]], financeiro: { capexEletrico: 520_000_000 },
  },
  {
    id: 'barreiras', nome: '[DEMO] SE 500 kV Barreiras Demo (nova) e LT 500 kV Barreiras Demo – Bom Jesus da Lapa Demo', tipo: 'LT+SE', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -9,
    municipios: ['Barreiras', 'Bom Jesus da Lapa'], participantes: [['aurora', 'concessionaria']],
    lt: [{ de: 'Barreiras', para: 'Bom Jesus da Lapa', kv: 500, km: 210 }], se: [{ nome: 'SE Barreiras Demo 500/230 kV', mun: 'Barreiras', natureza: 'nova', kv: [500, 230], mva: 1200 }],
    marcos: [['leilao_realizado', -8, 'realizado', 'A'], ['contrato_concessao_assinado', -5, 'realizado', 'A'], ['prazo_contratual_energizacao', 55, 'previsto_oficial', 'A']],
    etapas: [['contratacao_regulatoria', 'concluida', -8], ['concessao', 'concluida', -5], ['licenciamento', 'em_andamento', -4], ['engenharia', 'em_andamento', -4]],
    financeiro: { capexEletrico: 1_350_000_000, rap: 150_000_000 },
  },
  {
    id: 'triangulo', nome: '[DEMO] LT 230 kV Uberlândia Demo – Paracatu Demo (reforço autorizado)', tipo: 'LT', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_autorizacao', identificado: -7,
    municipios: ['Uberlândia', 'Paracatu'], participantes: [['cerrado', 'concessionaria']], lt: [{ de: 'Uberlândia', para: 'Paracatu', kv: 230, km: 190 }],
    marcos: [['autorizacao_publicada', -6, 'realizado', 'A'], ['energizacao', 26, 'previsto_oficial', 'A']],
    etapas: [['concessao', 'concluida', -6], ['licenciamento', 'em_andamento', -5], ['engenharia', 'em_andamento', -5], ['contratacao_execucao', 'em_andamento', -1]],
    pacotes: [['montagem_eletromecanica', 'LT', 'pre_qualificacao', 0]], financeiro: { capexEletrico: 380_000_000 },
  },
  {
    id: 'cuiaba', nome: '[DEMO] LT 500 kV Rio Verde Demo – Cuiabá Demo', tipo: 'LT', setor: 'transmissao', subsetor: 'transmissao_regulada', fluxo: 'transmissao_leilao', identificado: -4,
    municipios: ['Rio Verde', 'Cuiabá'], participantes: [], lt: [{ de: 'Rio Verde', para: 'Cuiabá', kv: 500, km: 450 }],
    marcos: [['inclusao_planejamento', -14, 'realizado', 'A'], ['consulta_publica', -1, 'realizado', 'A'], ['leilao_realizado', 10, 'previsto_oficial', 'A']],
    etapas: [['planejamento', 'concluida', -14], ['contratacao_regulatoria', 'em_andamento', -1]], financeiro: { capexEletrico: 2_400_000_000 },
  },
];

const TITULOS_CLASSE: Record<Classe, string> = {
  A: 'documento fictício simulando ato oficial (ANEEL/EPE/órgão ambiental)',
  B: 'documento fictício simulando comunicado do empreendedor',
  C: 'documento fictício simulando notícia setorial',
};

export interface PacoteDemo {
  organizacoes: Organizacao[];
  empreendimentos: Empreendimento[];
  oportunidades: OportunidadeComercial[];
  regras: AlertaRegra[];
  eventos: EventoMudanca[];
  documentos: Documento[];
  matches: MatchCandidato[];
}

export function gerarDemo(hoje: string = hojeISO(), sequencialInicial = 0): PacoteDemo {
  const mes = (n: number) => somarMeses(hoje, n);
  let seq = sequencialInicial;
  const empreendimentos: Empreendimento[] = [];
  const eventos: EventoMudanca[] = [];

  for (const d of DEFS) {
    const evid: Evidencia[] = [];
    const nova = (classe: Classe, titulo: string, data: string, trecho?: string): string => {
      const id = `demo-ev-${d.id}-${evid.length + 1}`;
      const pub = data <= hoje ? data : mes(-1);
      evid.push({
        id, fonteId: 'demo', classe, titulo: `[FICTÍCIO] ${titulo} — ${TITULOS_CLASSE[classe]}`,
        url: `https://exemplo.invalid/demo/${d.id}/${evid.length + 1}`, tipoDocumento: classe === 'A' ? 'ato_regulatorio' : classe === 'B' ? 'comunicado_empresa' : 'noticia',
        dataPublicacao: pub, dataColeta: pub, ultimaConfirmacao: mes(-(evid.length % 3)), trecho,
      });
      return id;
    };
    const evGeral = nova(d.marcos[0]?.[3] ?? 'B', `Ficha do empreendimento ${d.nome.replace('[DEMO] ', '')}`, mes(d.identificado), 'Texto fictício de demonstração.');
    const marcos = d.marcos.map(([tipo, off, natureza, classe, escopo]) => ({
      id: `demo-mc-${d.id}-${tipo}-${escopo ?? 'geral'}`,
      tipo, data: mes(off), natureza, escopo: escopo ?? 'geral',
      evidenciaIds: [nova(classe, tipo.replace(/_/g, ' '), mes(Math.min(off, 0)))],
    }));
    const trechosLT = (d.lt ?? []).map((t, i) => {
      const a = MUN[t.de];
      const b = MUN[t.para];
      const mesmo = t.de === t.para;
      return {
        id: `demo-lt-${d.id}-${i}`,
        nome: mesmo ? `LT ${t.kv} kV ${t.de} Demo (trecho ${i + 1})` : `LT ${t.kv} kV ${t.de} Demo – ${t.para} Demo`,
        tensaoKv: t.kv, corrente: (t.cc ? 'CC' : 'CA') as 'CA' | 'CC', extensaoKm: t.km, circuitos: 1,
        origem: mesmo ? undefined : `SE ${t.de} Demo`, destino: mesmo ? undefined : `SE ${t.para} Demo`,
        tracado: mesmo ? undefined : { coordenadas: [[a.lon, a.lat], [b.lon, b.lat]] as [number, number][], natureza: 'esquematico' as const, observacao: 'Reta esquemática entre os municípios das extremidades — NÃO é traçado.' },
        evidenciaIds: [evGeral],
      };
    });
    const subestacoes = (d.se ?? []).map((s, i) => ({
      id: `demo-se-${d.id}-${i}`, nome: s.nome, natureza: s.natureza, tensoesKv: s.kv, capacidadeMva: s.mva, municipio: s.mun, uf: MUN[s.mun].uf,
      ponto: ponto(s.mun), evidenciaIds: [evGeral],
    }));
    const contrPacote = (sigla?: string) => (sigla ? org(sigla) : undefined);
    const fin = d.financeiro ?? {};
    const valor = (v?: number) => (v ? { valorBRL: v, natureza: 'declarado' as const, dataBase: mes(d.identificado) } : undefined);
    const entrada: EmpreendimentoEntrada = {
      id: `demo-emp-${d.id}`,
      codigo: `RLT-${String(++seq).padStart(6, '0')}`,
      nomeOficial: d.nome,
      tipo: d.tipo,
      setorOrigem: d.setor,
      subsetor: d.subsetor,
      descricao: d.descricao ?? 'Empreendimento FICTÍCIO para demonstração da plataforma.',
      fluxoId: d.fluxo,
      etapas: d.etapas.map(([etapaId, status, off]) => ({ etapaId, status, dataInicio: off !== undefined ? mes(off) : undefined, evidenciaIds: [evGeral] })),
      statusGeral: d.status ?? 'ativo',
      situacaoObra: d.obra ?? 'nao_iniciada',
      situacoes: { regulatoria: 'indefinida', ambiental: 'indefinida', fundiaria: 'indefinida', engenharia: 'indefinida', ...d.situacoes },
      participantes: d.participantes.map(([o, papel]) => ({ organizacaoId: org(o), papel, evidenciaIds: [evGeral] })),
      localizacao: {
        municipios: [...new Set(d.municipios)].map((m) => ({ nome: m, uf: MUN[m].uf })),
        ufs: [...new Set(d.municipios.map((m) => MUN[m].uf))],
        ponto: ponto(d.municipios[0]),
      },
      tecnico: { tensoesKv: [], ...d.tecnico },
      trechosLT,
      subestacoes,
      pacotes: (d.pacotes ?? []).map(([pacote, escopo, fase, off, contratada]) => ({
        pacote, escopo, faseContratacao: fase, dataEvento: off !== undefined ? mes(off) : undefined, contratadaId: contrPacote(contratada), evidenciaIds: [evGeral],
      })),
      contratos: (d.pacotes ?? [])
        .filter(([, , fase, , contratada]) => fase === 'contratada' && contratada)
        .map(([pacote, escopo, , off, contratada], i) => ({
          id: `demo-ct-${d.id}-${i}`, objeto: `[FICTÍCIO] ${pacote.replace(/_/g, ' ')} (${escopo})`, pacotes: [pacote], escopo,
          contratadaId: contrPacote(contratada), contratanteId: org(d.participantes[0]?.[0] ?? 'aurora'), dataAssinatura: off !== undefined ? mes(off) : undefined, status: 'assinado' as const, evidenciaIds: [evGeral],
        })),
      financeiro: { capexTotal: valor(fin.capexTotal), capexInfraEletrica: valor(fin.capexEletrico), rapAnual: valor(fin.rap), fonteFinanciamento: fin.financiamento },
      marcos,
      evidencias: evid,
      proveniencia: {
        nomeOficial: { status: 'confirmado', evidenciaIds: [evGeral], atualizadoEm: mes(d.identificado) },
        ...(trechosLT.length ? { 'tecnico.extensaoKm': { status: 'confirmado' as const, evidenciaIds: [evGeral], atualizadoEm: mes(d.identificado) } } : {}),
        'localizacao.ponto': { status: 'estimado', evidenciaIds: [], observacao: 'Centro aproximado do município', atualizadoEm: mes(d.identificado) },
      },
      historico: [{ id: `demo-alt-${d.id}-0`, em: `${mes(d.identificado)}T12:00:00.000Z`, por: 'demo', origem: 'sistema', campo: 'empreendimento', para: 'criado', observacao: 'Carga de dados demonstrativos' }],
      responsavelInterno: undefined,
      tags: ['demo'],
      identificadoEm: mes(d.identificado),
      criadoEm: `${mes(d.identificado)}T12:00:00.000Z`,
      atualizadoEm: `${hoje}T08:00:00.000Z`,
      demo: true,
    };
    const p = EmpreendimentoSchema.parse(entrada);
    empreendimentos.push(p);

    // Eventos históricos: criação e marcos realizados após a identificação.
    const [novo] = detectarMudancas(null, p, { agora: `${mes(d.identificado)}T12:00:00.000Z` });
    eventos.push({ ...novo, id: `demo-evt-${d.id}-novo` });
    for (const m of p.marcos.filter((x) => x.natureza === 'realizado' && x.data > p.identificadoEm)) {
      const antes = { ...p, marcos: p.marcos.filter((x) => x.id !== m.id) };
      for (const e of detectarMudancas(antes, p, { agora: `${m.data}T12:00:00.000Z` })) {
        if (e.tipo !== 'mudanca_etapa') eventos.push({ ...e, id: `demo-evt-${d.id}-${m.tipo}` });
      }
    }
  }

  // Revisão de cronograma e conflito entre fontes (exemplos).
  const potiguar = empreendimentos.find((p) => p.id === 'demo-emp-potiguar')!;
  const prazo = potiguar.marcos.find((m) => m.tipo === 'prazo_contratual_energizacao')!;
  const prazoAntigo = somarMeses(prazo.data, -8);
  potiguar.historico.push({ id: 'demo-alt-potiguar-rev', em: `${mes(-2)}T10:00:00.000Z`, por: 'demo', origem: 'ingestao', campo: 'marcos.prazo_contratual_energizacao.geral', de: prazoAntigo, para: prazo.data, observacao: 'Revisão de cronograma (fictícia)' });
  eventos.push(
    { id: 'demo-evt-potiguar-rev', empreendimentoId: potiguar.id, tipo: 'revisao_cronograma', titulo: `Revisão de cronograma — ${potiguar.nomeOficial}`, descricao: `Prazo contratual de energização: ${prazoAntigo} → ${prazo.data} (+240 dias, fictício).`, em: `${mes(-2)}T10:00:00.000Z`, relevancia: 'media', dados: { de: prazoAntigo, para: prazo.data }, evidenciaIds: prazo.evidenciaIds, demo: true },
    { id: 'demo-evt-potiguar-atraso', empreendimentoId: potiguar.id, tipo: 'atraso', titulo: `Atraso — ${potiguar.nomeOficial}`, descricao: 'Prazo contratual de energização adiado em 240 dias (fictício).', em: `${mes(-2)}T10:00:00.000Z`, relevancia: 'alta', dados: { deltaDias: 240 }, evidenciaIds: prazo.evidenciaIds, demo: true },
  );

  const aurora = empreendimentos.find((p) => p.id === 'demo-emp-aurora')!;
  const evImprensa = { id: 'demo-ev-aurora-imprensa', fonteId: 'demo', classe: 'C' as const, titulo: '[FICTÍCIO] Notícia setorial simulada com extensão divergente', url: 'https://exemplo.invalid/demo/aurora/noticia', tipoDocumento: 'noticia' as const, dataPublicacao: mes(-2), dataColeta: mes(-2), trecho: '"...a linha terá cerca de 410 km..." (texto fictício)' };
  aurora.evidencias.push(evImprensa);
  aurora.conflitos.push({
    id: 'demo-cf-aurora-km', campo: 'trechosLT.demo-lt-aurora-0.extensaoKm',
    valores: [
      { valor: 380, evidenciaId: aurora.evidencias[0].id, fonteId: 'demo', classe: 'A', dataPublicacao: aurora.evidencias[0].dataPublicacao, registradoEm: mes(-6) },
      { valor: 410, evidenciaId: evImprensa.id, fonteId: 'demo', classe: 'C', dataPublicacao: mes(-2), registradoEm: mes(-2) },
    ],
    valorAdotado: 380, criterioAdocao: 'Adotado valor da fonte de maior classe (A); divergência mantida para revisão.', status: 'aberto', abertoEm: mes(-2),
  });
  aurora.proveniencia['trechosLT.demo-lt-aurora-0.extensaoKm'] = { status: 'confirmado', evidenciaIds: [aurora.evidencias[0].id], emConflito: true, atualizadoEm: mes(-2) };
  eventos.push({ id: 'demo-evt-aurora-conflito', empreendimentoId: aurora.id, tipo: 'conflito_fontes', titulo: `Divergência entre fontes — ${aurora.nomeOficial}`, descricao: 'Extensão da LT: 380 km (fonte classe A) × 410 km (classe C). Fictício.', em: `${mes(-2)}T09:00:00.000Z`, relevancia: 'baixa', dados: {}, evidenciaIds: [evImprensa.id], demo: true });

  const agora = `${hoje}T08:00:00.000Z`;
  const op = (empId: string, o: Partial<OportunidadeComercial>): OportunidadeComercial => ({
    id: `demo-op-${empId}`, empreendimentoId: `demo-emp-${empId}`, interesse: 'nao_avaliado', statusProspeccao: 'identificada', pacotesInteresse: [],
    decisao: { decisao: 'pendente' }, contatos: [], interacoes: [], proximosPassos: [], criadoEm: agora, atualizadoEm: agora, demo: true, ...o,
  });
  const oportunidades: OportunidadeComercial[] = [
    op('aurora', {
      interesse: 'interessado', statusProspeccao: 'em_contato', responsavel: 'Gerente Comercial (exemplo)', pacotesInteresse: ['montagem_eletromecanica', 'lancamento_cabos', 'montagem_estruturas'],
      estrategia: 'Apresentar experiência em LT 500 kV no Nordeste e propor frentes paralelas (fictício).',
      contatos: [{ id: 'demo-ct-1', nome: 'Contato Fictício A', cargo: 'Gerente de Implantação', organizacaoId: org('aurora') }],
      interacoes: [{ id: 'demo-int-1', data: mes(-1), tipo: 'reuniao', resumo: 'Reunião de apresentação institucional (fictício).', por: 'demo' }, { id: 'demo-int-2', data: somarMeses(hoje, 0), tipo: 'email', resumo: 'Envio de portfólio e atestados (fictício).', por: 'demo' }],
      proximosPassos: [{ id: 'demo-pp-1', descricao: 'Solicitar inclusão no cadastro de fornecedores', responsavel: 'Comercial', prazo: somarMeses(hoje, 1), concluido: false }],
    }),
    op('cerrado1', { interesse: 'interessado', statusProspeccao: 'proposta_em_preparacao', responsavel: 'Gerente Comercial (exemplo)', pacotesInteresse: ['montagem_eletromecanica'], decisao: { decisao: 'participar', justificativa: 'Aderência técnica e região de atuação (fictício).', data: mes(-1), por: 'demo' }, valorQualificadoBRL: 150_000_000, proximosPassos: [{ id: 'demo-pp-2', descricao: 'Visita técnica ao traçado', prazo: somarMeses(hoje, 0.5), concluido: false }] }),
    op('paulista', { interesse: 'interessado', statusProspeccao: 'perdida', resultado: { status: 'perdida', data: mes(-3), vencedor: 'Montagens Integradas Ltda. (DEMO)', motivo: 'Preço (fictício)' } }),
    op('serravermelha', { interesse: 'interessado', statusProspeccao: 'qualificada', responsavel: 'Diretor de Novos Negócios (exemplo)', estrategia: 'Aproximação via área de engenharia do cliente antes da FID (fictício).' }),
    op('celulose', { interesse: 'interessado', statusProspeccao: 'reuniao_realizada', interacoes: [{ id: 'demo-int-3', data: mes(-1), tipo: 'reuniao', resumo: 'Reunião com o EPC principal sobre subcontratação da LT (fictício).', por: 'demo' }] }),
    op('hidrogenio', { interesse: 'monitorar', statusProspeccao: 'identificada' }),
    op('solar', { interesse: 'sem_interesse', statusProspeccao: 'declinada', decisao: { decisao: 'nao_participar', justificativa: 'Porte abaixo do mínimo e prazo incompatível (fictício).', data: mes(-4), por: 'demo' } }),
    op('tocantins', { interesse: 'monitorar', statusProspeccao: 'identificada', proximosPassos: [{ id: 'demo-pp-3', descricao: 'Acompanhar resultado do leilão e contatar vencedor', prazo: somarMeses(hoje, 3), concluido: false }] }),
  ];

  const regras: AlertaRegra[] = [
    { id: 'demo-regra-1', nome: '[DEMO] Janela de contratação ≤ 6 meses — ≥ 345 kV', ativo: true, criadoPor: 'demo', filtros: { tensaoMinKv: 345, janelaContratacaoMeses: 6 }, canais: ['app'] },
    { id: 'demo-regra-2', nome: '[DEMO] Norte/Nordeste — novos, licenças e cotações', ativo: true, criadoPor: 'demo', filtros: { regioes: ['N', 'NE'], tiposEvento: ['novo_empreendimento', 'licenca_emitida', 'cotacao_aberta', 'vencedor_definido'] }, canais: ['app'] },
  ];

  const documentos: Documento[] = [
    {
      id: 'demo-doc-1', titulo: '[FICTÍCIO] Notícia: mineradora avalia nova subestação no Pará', tipo: 'noticia', fonteId: 'demo', url: 'https://exemplo.invalid/demo/noticia-1', mime: 'text/plain', tamanhoBytes: 600, hash: 'demo-hash-1',
      textoExtraido: '[FICTÍCIO] A Jatobá Cobre Mineração (DEMO) informou que pretende iniciar em 2027 a contratação de uma linha de transmissão de 230 kV com cerca de 120 km para atender o projeto Jatobá, em Marabá (PA). A empresa prevê publicar RFP para a montagem eletromecânica no segundo semestre. O investimento total do projeto é estimado em R$ 3 bilhões.',
      dataPublicacao: mes(-1), carregadoEm: agora, carregadoPor: 'demo', empreendimentoIds: ['demo-emp-cobre'],
    },
    {
      id: 'demo-doc-2', titulo: '[FICTÍCIO] Comunicado: transmissora conclui pré-qualificação de montadoras', tipo: 'comunicado_empresa', fonteId: 'demo', url: 'https://exemplo.invalid/demo/comunicado-2', mime: 'text/plain', tamanhoBytes: 500, hash: 'demo-hash-2',
      textoExtraido: '[FICTÍCIO] A Transmissora Aurora S.A. (DEMO) concluiu a pré-qualificação de empresas para a montagem eletromecânica da LT 500 kV João Câmara Demo – Mossoró Demo. O pedido de cotação (RFQ) deve ser emitido após a emissão da Licença de Instalação.',
      dataPublicacao: mes(-1), carregadoEm: agora, carregadoPor: 'demo', empreendimentoIds: ['demo-emp-potiguar'],
    },
  ];

  const matches: MatchCandidato[] = [
    {
      id: 'demo-match-1', fonteId: 'demo', status: 'pendente', criadoEm: agora,
      resumoRegistro: '[FICTÍCIO] Linha de Transmissão Bom Jesus da Lapa Demo - Montes Claros Demo · 500 kV · BA',
      registro: { fonteId: 'demo', nome: 'Linha de Transmissão Bom Jesus da Lapa Demo - Montes Claros Demo', tensoesKv: [500], ufs: ['BA'], evidencia: { titulo: '[FICTÍCIO] Notícia simulada', tipoDocumento: 'noticia', url: 'https://exemplo.invalid/demo/match' }, demo: true },
      candidatos: [{ empreendimentoId: 'demo-emp-aurora', pontuacao: 0.7, motivos: ['Similaridade de nome 100%.', 'Mesma tensão máxima (500 kV).', 'UF em comum (BA).'] }],
    },
  ];

  return { organizacoes: ORGS, empreendimentos, oportunidades, regras, eventos, documentos, matches };
}
