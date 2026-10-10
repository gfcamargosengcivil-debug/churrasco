import type { Setor, TipoEmpreendimento } from '../constantes.js';

export interface EtapaDef {
  id: string;
  ordem: number;
  nome: string;
  descricao: string;
}

/** Esteira padrão de maturidade (configurável). */
export const ETAPAS_PADRAO: EtapaDef[] = [
  { id: 'sinal_mercado', ordem: 1, nome: 'Sinal de mercado', descricao: 'Anúncio, intenção de investimento ou necessidade identificada.' },
  { id: 'planejamento', ordem: 2, nome: 'Planejamento', descricao: 'Estudos, planejamento setorial, conexão ou definição de escopo.' },
  { id: 'licenciamento', ordem: 3, nome: 'Licenciamento e viabilidade', descricao: 'Estudos ambientais, licenciamento, autorizações e viabilidade.' },
  { id: 'engenharia', ordem: 4, nome: 'Desenvolvimento e engenharia', descricao: 'Estudos detalhados, projeto básico, projeto executivo e definição técnica.' },
  { id: 'contratacao_regulatoria', ordem: 5, nome: 'Contratação regulatória ou comercial', descricao: 'Consulta pública, edital, leilão, processo competitivo ou negociação.' },
  { id: 'concessao', ordem: 6, nome: 'Concessão ou contratação principal', descricao: 'Vencedor definido, contrato adjudicado ou assinado.' },
  { id: 'contratacao_execucao', ordem: 7, nome: 'Contratação de execução', descricao: 'RFQ, RFP, concorrência de fornecedores, cotação ou negociação de pacotes de obra.' },
  { id: 'construcao', ordem: 8, nome: 'Mobilização e construção', descricao: 'Contratação executada, equipes mobilizadas e obras em andamento.' },
  { id: 'comissionamento', ordem: 9, nome: 'Comissionamento e energização', descricao: 'Testes, integração e entrada em operação.' },
  { id: 'encerrado', ordem: 10, nome: 'Concluído ou cancelado', descricao: 'Empreendimento finalizado, suspenso, adiado ou cancelado.' },
];

export interface FluxoDef {
  id: string;
  nome: string;
  descricao: string;
  /** Setores/tipos para os quais o fluxo é sugerido automaticamente. */
  sugeridoPara: { setores?: Setor[]; tipos?: TipoEmpreendimento[] };
  /** Etapas aplicáveis, na ordem típica. Etapas ausentes são "não aplicáveis" neste fluxo. */
  etapas: string[];
  /** Grupos de etapas que normalmente correm em paralelo. */
  paralelas: string[][];
}

/**
 * Fluxos típicos. Não são sequências obrigatórias: o status de cada etapa é
 * registrado individualmente, com evidências, e etapas podem correr em paralelo.
 */
export const FLUXOS_PADRAO: FluxoDef[] = [
  {
    id: 'transmissao_leilao',
    nome: 'Transmissão — concessão por leilão',
    descricao:
      'Empreendimento da Rede Básica planejado (EPE/MME), licitado em leilão ANEEL. Após a assinatura do contrato de concessão, licenciamento, engenharia e contratação de execução correm em paralelo.',
    sugeridoPara: { setores: ['transmissao'] },
    etapas: ['planejamento', 'contratacao_regulatoria', 'concessao', 'licenciamento', 'engenharia', 'contratacao_execucao', 'construcao', 'comissionamento', 'encerrado'],
    paralelas: [['licenciamento', 'engenharia', 'contratacao_execucao']],
  },
  {
    id: 'transmissao_autorizacao',
    nome: 'Transmissão — reforço/melhoria autorizado (REA)',
    descricao:
      'Reforço ou melhoria em instalação existente, autorizado por Resolução Autorizativa a concessionária já existente (sem leilão).',
    sugeridoPara: {},
    etapas: ['planejamento', 'concessao', 'licenciamento', 'engenharia', 'contratacao_execucao', 'construcao', 'comissionamento', 'encerrado'],
    paralelas: [['licenciamento', 'engenharia', 'contratacao_execucao']],
  },
  {
    id: 'privado_industrial',
    nome: 'Privado — mineração/indústria/grande consumidor',
    descricao:
      'Infraestrutura elétrica de projeto privado (mina, planta, data center). Normalmente sem leilão; a "contratação principal" é a do EPC/obra principal após a decisão de investimento.',
    sugeridoPara: { setores: ['mineracao', 'industria', 'outro'], tipos: ['expansao_industrial', 'infraestrutura_associada'] },
    etapas: ['sinal_mercado', 'planejamento', 'licenciamento', 'engenharia', 'concessao', 'contratacao_execucao', 'construcao', 'comissionamento', 'encerrado'],
    paralelas: [['licenciamento', 'engenharia']],
  },
  {
    id: 'conexao_geracao',
    nome: 'Conexão de geração',
    descricao:
      'Instalações de conexão (LT/SE) de usina eólica, solar, hidrelétrica ou térmica; marcos ligados à outorga, parecer de acesso e contrato de uso/conexão.',
    sugeridoPara: { setores: ['geracao'], tipos: ['conexao_geracao'] },
    etapas: ['sinal_mercado', 'planejamento', 'contratacao_regulatoria', 'licenciamento', 'engenharia', 'concessao', 'contratacao_execucao', 'construcao', 'comissionamento', 'encerrado'],
    paralelas: [['licenciamento', 'engenharia']],
  },
  {
    id: 'distribuicao',
    nome: 'Distribuição (alta tensão)',
    descricao: 'Obras de 138 kV de distribuidoras (plano de obras/PDD), normalmente contratadas por licitação própria.',
    sugeridoPara: { setores: ['distribuicao'] },
    etapas: ['planejamento', 'licenciamento', 'engenharia', 'contratacao_execucao', 'construcao', 'comissionamento', 'encerrado'],
    paralelas: [['licenciamento', 'engenharia']],
  },
];

export function sugerirFluxo(setor: Setor, tipo: TipoEmpreendimento, fluxos: FluxoDef[] = FLUXOS_PADRAO): FluxoDef {
  return (
    fluxos.find((f) => f.sugeridoPara.tipos?.includes(tipo)) ??
    fluxos.find((f) => f.sugeridoPara.setores?.includes(setor)) ??
    fluxos.find((f) => f.id === 'privado_industrial') ??
    fluxos[0]
  );
}
