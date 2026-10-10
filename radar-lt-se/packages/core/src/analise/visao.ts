import { ORDEM_FASE_CONTRATACAO, type FaseContratacao, type Regiao } from '../constantes.js';
import { CONFIGURACAO_PADRAO, type ConfiguracaoPlataforma } from '../config/parametros.js';
import type { EtapaDef } from '../config/etapas.js';
import { estimarMercado, type EstimativaMercado } from '../comercial/mercado.js';
import { calcularScore, type ResultadoScore } from '../comercial/score.js';
import { confiancaDados } from '../previsao/confianca.js';
import { dataDemanda, preverEmpreendimento } from '../previsao/motor.js';
import type { NivelConfianca, PrevisaoEmpreendimento } from '../previsao/tipos.js';
import {
  contratantePrincipalId, etapaAtual, executorIdentificado, extensaoTotalKm, faseContratacaoConstrucao,
  pontoRepresentativo, regioes, tensaoMaxKv, ultimaConfirmacao,
} from '../projetos/derivados.js';
import { avaliarQualidade, type IndicadorQualidade } from '../qualidade/indicadores.js';
import { hojeISO } from '../util/datas.js';
import type { Empreendimento, Fonte, OportunidadeComercial, Ponto } from '../tipos.js';

/** Visão consolidada e calculada de um empreendimento (o que a interface consome). */
export interface VisaoEmpreendimento {
  id: string;
  codigo: string;
  nome: string;
  tipo: Empreendimento['tipo'];
  setor: Empreendimento['setorOrigem'];
  subsetor?: Empreendimento['subsetor'];
  ufs: string[];
  regioes: Regiao[];
  municipios: string[];
  ponto?: Ponto;
  tensaoMaxKv?: number;
  extensaoKm?: number;
  qtdSubestacoes: number;
  statusGeral: Empreendimento['statusGeral'];
  situacaoObra: Empreendimento['situacaoObra'];
  etapa?: EtapaDef;
  fase: { LT: FaseContratacao; SE: FaseContratacao; geral: FaseContratacao };
  contratanteId?: string;
  executorIdentificado: boolean;
  previsao: PrevisaoEmpreendimento;
  dataDemandaBase?: string;
  mercado: EstimativaMercado;
  score: ResultadoScore;
  qualidade: IndicadorQualidade;
  confiancaDados: NivelConfianca;
  ultimaAtualizacao: string;
  ultimaConfirmacao?: string;
  oportunidadeComercialId?: string;
  demo: boolean;
}

export interface ContextoAvaliacao {
  config?: ConfiguracaoPlataforma;
  fontes?: Map<string, Fonte>;
  oportunidades?: Map<string, OportunidadeComercial>;
  hoje?: string;
}

export function faseGeral(lt: FaseContratacao, se: FaseContratacao): FaseContratacao {
  const aplicaveis = [lt, se].filter((f) => f !== 'nao_aplicavel');
  if (!aplicaveis.length) return 'nao_identificada';
  return aplicaveis.reduce((a, b) => (ORDEM_FASE_CONTRATACAO[b] > ORDEM_FASE_CONTRATACAO[a] ? b : a));
}

export function avaliarEmpreendimento(p: Empreendimento, ctx: ContextoAvaliacao = {}): VisaoEmpreendimento {
  const cfg = ctx.config ?? CONFIGURACAO_PADRAO;
  const hoje = ctx.hoje ?? hojeISO();
  const previsao = preverEmpreendimento(p, { parametros: cfg.previsao, hoje, fontes: ctx.fontes });
  const mercado = estimarMercado(p, cfg.mercado);
  const oportunidade = ctx.oportunidades?.get(p.id);
  const score = calcularScore(p, { previsao, mercado, oportunidade, portfolio: cfg.portfolio, config: cfg.score, etapas: cfg.etapas, hoje });
  const lt = faseContratacaoConstrucao(p, 'LT');
  const se = faseContratacaoConstrucao(p, 'SE');
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nomeOficial,
    tipo: p.tipo,
    setor: p.setorOrigem,
    subsetor: p.subsetor,
    ufs: p.localizacao.ufs,
    regioes: regioes(p),
    municipios: p.localizacao.municipios.map((m) => `${m.nome}/${m.uf}`),
    ponto: pontoRepresentativo(p),
    tensaoMaxKv: tensaoMaxKv(p),
    extensaoKm: extensaoTotalKm(p),
    qtdSubestacoes: p.subestacoes.length || p.tecnico.qtdSubestacoes || 0,
    statusGeral: p.statusGeral,
    situacaoObra: p.situacaoObra,
    etapa: etapaAtual(p, cfg.etapas),
    fase: { LT: lt, SE: se, geral: faseGeral(lt, se) },
    contratanteId: contratantePrincipalId(p),
    executorIdentificado: executorIdentificado(p),
    previsao,
    dataDemandaBase: dataDemanda(previsao)?.data,
    mercado,
    score,
    qualidade: avaliarQualidade(p, { hoje, diasDesatualizacao: cfg.diasDesatualizacao, fontes: ctx.fontes }),
    confiancaDados: confiancaDados(p, { hoje, fontes: ctx.fontes }),
    ultimaAtualizacao: p.atualizadoEm,
    ultimaConfirmacao: ultimaConfirmacao(p),
    oportunidadeComercialId: oportunidade?.id,
    demo: p.demo,
  };
}

export function classeTensaoPainel(kv?: number): string {
  if (kv === undefined) return 'Não informada';
  if (kv < 138) return '< 138 kV';
  if (kv <= 150) return '138 kV';
  if (kv <= 260) return '230 kV';
  if (kv <= 380) return '345 kV';
  if (kv <= 470) return '440 kV';
  if (kv <= 550) return '500/525 kV';
  return '≥ 600 kV / CC';
}
