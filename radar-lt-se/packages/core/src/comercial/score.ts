/**
 * Índice de priorização de oportunidades (0–100).
 * Cada critério recebe nota 0–5 por regra explícita e justificativa; o índice é a média
 * ponderada normalizada. É um instrumento de ORDENAÇÃO configurável — não é probabilidade.
 */
import { STATUS_PIPELINE_QUALIFICADO } from '../constantes.js';
import {
  CONFIG_SCORE_PADRAO, CRITERIOS_SCORE, PORTFOLIO_PADRAO, ROTULO_CRITERIO,
  type ConfigScore, type CriterioScore, type PortfolioEmpresa,
} from '../config/parametros.js';
import { ETAPAS_PADRAO, type EtapaDef } from '../config/etapas.js';
import { distanciaKm } from '../geo/index.js';
import {
  conflitosAbertos, contratantePrincipalId, etapaAtual, executorIdentificado, extensaoTotalKm,
  marcoRealizado, pontoRepresentativo, tensaoMaxKv, tensoesKv, temLT, temSE,
} from '../projetos/derivados.js';
import { diferencaDias, hojeISO } from '../util/datas.js';
import type { Empreendimento, OportunidadeComercial } from '../tipos.js';
import type { PrevisaoEmpreendimento } from '../previsao/tipos.js';
import type { EstimativaMercado } from './mercado.js';

export type FaixaPrioridade = 'alta' | 'media' | 'baixa';
export const ROTULO_FAIXA: Record<FaixaPrioridade, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export interface NotaCriterio {
  criterio: CriterioScore;
  rotulo: string;
  nota: number;
  peso: number;
  justificativa: string;
}

export interface ResultadoScore {
  indice: number;
  faixa: FaixaPrioridade;
  notas: NotaCriterio[];
  foraDoEscopo?: string;
  aviso: string;
}

export interface ContextoScore {
  previsao: PrevisaoEmpreendimento;
  mercado: EstimativaMercado;
  oportunidade?: OportunidadeComercial;
  portfolio?: PortfolioEmpresa;
  config?: ConfigScore;
  etapas?: EtapaDef[];
  hoje?: string;
}

const brlMi = (v: number) => `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mi`;

function aderenciaTecnica(p: Empreendimento, port: PortfolioEmpresa): [number, string, string?] {
  const kv = tensaoMaxKv(p);
  if (kv === undefined) return [2, 'Tensão não identificada — nota neutra até confirmação.'];
  if (kv < port.tensaoMinimaKv) return [0, `Tensão máxima ${kv} kV abaixo do mínimo de ${port.tensaoMinimaKv} kV.`, `Fora do escopo: ${kv} kV < ${port.tensaoMinimaKv} kV`];
  const cc = p.trechosLT.some((t) => t.corrente === 'CC');
  if (cc && !port.executaCC) return [1, 'Empreendimento em corrente contínua (HVDC), fora da experiência configurada.'];
  const lt = temLT(p);
  const se = temSE(p);
  const atende = (lt && port.executaLT) || (se && port.executaSE);
  if (!atende) return [0, 'Escopo (LT/SE) não executado pela empresa.'];
  const experiencia = tensoesKv(p).some((t) => port.tensoesExperienciaKv.some((e) => Math.abs(e - t) / e <= 0.1));
  let nota = experiencia ? 4 : 3;
  const motivos = [experiencia ? `Tensão ${kv} kV dentro da experiência da empresa` : `Tensão ${kv} kV ≥ ${port.tensaoMinimaKv} kV, sem experiência registrada nessa classe`];
  if (lt && se && port.executaLT && port.executaSE) {
    nota += 1;
    motivos.push('escopo combinado LT + SE');
  }
  return [Math.min(5, nota), motivos.join('; ') + '.'];
}

function potencialReceita(m: EstimativaMercado, cfg: ConfigScore): [number, string] {
  if (m.metodo === 'contratado') return [0, 'Serviços de construção já contratados.'];
  if (m.central === undefined) return [2, 'Oportunidade não estimável com os dados disponíveis — nota neutra.'];
  const [l1, l2, l3, l4] = cfg.limitesReceita;
  const v = m.central;
  const nota = v < l1 ? 1 : v < l2 ? 2 : v < l3 ? 3 : v < l4 ? 4 : 5;
  return [nota, `Oportunidade central estimada ${brlMi(v)} (faixa ${brlMi(m.faixa![0])}–${brlMi(m.faixa![1])}).`];
}

function proximidadeJanela(prev: PrevisaoEmpreendimento): [number, string] {
  const n = prev.necessidadeComercial;
  switch (n.classe) {
    case 'encerrada':
    case 'suspensa':
    case 'ja_contratada':
      return [0, n.descricao];
    case 'indefinida':
      return [1, n.descricao];
    case 'verificar':
      return [3, n.descricao];
    default: {
      const m = n.mesesAteDemanda ?? 99;
      const nota = m <= 6 ? 5 : m <= 12 ? 4 : m <= 24 ? 3 : m <= 36 ? 2 : 1;
      return [nota, `${n.descricao} (${Math.round(m)} meses).`];
    }
  }
}

function probabilidadeExecucao(p: Empreendimento): [number, string] {
  if (p.statusGeral === 'cancelado') return [0, 'Empreendimento cancelado.'];
  if (p.statusGeral === 'suspenso' || p.statusGeral === 'adiado') return [1, `Empreendimento ${p.statusGeral}.`];
  const outorga = marcoRealizado(p, ['contrato_concessao_assinado', 'autorizacao_publicada', 'decisao_final_investimento']);
  const li = marcoRealizado(p, ['licenca_instalacao']) || ['li_emitida', 'lo_emitida'].includes(p.situacoes.ambiental);
  if (outorga && li) return [5, 'Outorga/decisão de investimento e Licença de Instalação obtidas.'];
  if (outorga) return [4, 'Outorga (concessão/autorização) ou decisão final de investimento realizada.'];
  if (marcoRealizado(p, ['leilao_realizado', 'vencedor_definido', 'edital_publicado', 'financiamento_aprovado', 'licenca_previa'])) {
    return [3, 'Edital/leilão, financiamento ou LP já ocorridos.'];
  }
  if (marcoRealizado(p, ['inclusao_planejamento', 'parecer_acesso', 'consulta_publica'])) return [2, 'Incluído em planejamento setorial ou com parecer de acesso.'];
  return [1, 'Apenas sinal de mercado (anúncio/intenção).'];
}

const NOTA_MATURIDADE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 3, 6: 4, 7: 5, 8: 5, 9: 5, 10: 0 };
function maturidade(p: Empreendimento, etapas: EtapaDef[]): [number, string] {
  const e = etapaAtual(p, etapas);
  if (!e) return [1, 'Etapa de maturidade não registrada.'];
  return [NOTA_MATURIDADE[e.ordem] ?? 2, `Etapa atual: ${e.ordem}. ${e.nome}.`];
}

function visibilidade(p: Empreendimento, op: OportunidadeComercial | undefined, hoje: string): [number, string] {
  const motivos: string[] = [];
  let nota = 0;
  if (contratantePrincipalId(p)) {
    nota += 2;
    motivos.push('contratante identificado');
  } else motivos.push('contratante não identificado');
  if (op?.contatos.length) {
    nota += 1;
    motivos.push(`${op.contatos.length} contato(s) registrado(s)`);
  }
  if (op?.interacoes.some((i) => diferencaDias(i.data, hoje) <= 180)) {
    nota += 1;
    motivos.push('interação comercial nos últimos 180 dias');
  }
  if (op && STATUS_PIPELINE_QUALIFICADO.includes(op.statusProspeccao) && op.statusProspeccao !== 'qualificada') {
    nota += 1;
    motivos.push(`prospecção em "${op.statusProspeccao.replace(/_/g, ' ')}"`);
  }
  return [Math.min(5, nota), motivos.join('; ') + '.'];
}

function atratividadeGeografica(p: Empreendimento, port: PortfolioEmpresa): [number, string] {
  const ufs = p.localizacao.ufs;
  if (ufs.some((u) => port.ufsPrioritarias.includes(u))) return [5, `UF prioritária (${ufs.filter((u) => port.ufsPrioritarias.includes(u)).join(', ')}).`];
  if (ufs.some((u) => port.ufsAtuacao.includes(u))) return [4, `UF de atuação atual (${ufs.filter((u) => port.ufsAtuacao.includes(u)).join(', ')}).`];
  const pt = pontoRepresentativo(p);
  if (pt && port.bases.length) {
    const d = Math.min(...port.bases.map((b) => distanciaKm(b, pt)));
    const nota = d <= 500 ? 3 : d <= 1000 ? 2 : 1;
    return [nota, `Distância até a base mais próxima ≈ ${Math.round(d)} km${pt.precisao !== 'exata' && pt.precisao !== 'subestacao' ? ' (localização aproximada)' : ''}.`];
  }
  return [2, 'Localização não identificada — nota neutra.'];
}

function capacidadeExecucao(p: Empreendimento, m: EstimativaMercado, port: PortfolioEmpresa): [number, string] {
  if (m.central === undefined || m.metodo === 'contratado') return [3, 'Porte não estimável — nota neutra.'];
  let nota: number;
  let motivo: string;
  if (m.central < port.porteMinimoBRL) {
    nota = 2;
    motivo = `Porte (${brlMi(m.central)}) abaixo do mínimo de interesse (${brlMi(port.porteMinimoBRL)})`;
  } else if (m.central > port.porteMaximoBRL) {
    nota = 2;
    motivo = `Porte (${brlMi(m.central)}) acima da capacidade configurada (${brlMi(port.porteMaximoBRL)}) — avaliar consórcio/lotes`;
  } else {
    nota = 5;
    motivo = `Porte (${brlMi(m.central)}) dentro da faixa executável`;
  }
  const km = extensaoTotalKm(p);
  if (km && km > port.capacidadeKmAno * 1.5) {
    nota = Math.max(1, nota - 1);
    motivo += `; extensão (${km} km) acima de 1,5× a capacidade anual (${port.capacidadeKmAno} km)`;
  }
  return [nota, motivo + '.'];
}

function competitividade(p: Empreendimento, m: EstimativaMercado, op?: OportunidadeComercial): [number, string] {
  if (m.metodo === 'contratado') return [0, 'Pacotes de construção já adjudicados/contratados.'];
  if (op?.decisao.decisao === 'nao_participar') return [1, 'Decisão registrada de não participar.'];
  if (m.jaContratado.LT || m.jaContratado.SE) return [3, 'Parte do escopo já contratada; restante em aberto.'];
  if (executorIdentificado(p)) return [3, 'EPC/executor principal identificado — oportunidade via subcontratação/pacotes.'];
  return [5, 'Nenhum contrato de execução identificado.'];
}

function risco(p: Empreendimento, prev: PrevisaoEmpreendimento, hoje: string): [number, string] {
  let nota = 5;
  const motivos: string[] = [];
  if (p.statusGeral !== 'ativo') {
    nota -= 2;
    motivos.push(`status ${p.statusGeral}`);
  }
  const conf = conflitosAbertos(p).length;
  if (conf) {
    nota -= Math.min(2, conf);
    motivos.push(`${conf} conflito(s) de fonte em aberto`);
  }
  const revisoes = p.historico.filter(
    (h) => h.campo.startsWith('marcos') && diferencaDias(h.em.slice(0, 10), hoje) <= 365 && typeof h.de === 'string' && typeof h.para === 'string' && h.para > h.de,
  ).length;
  if (revisoes) {
    nota -= 1;
    motivos.push(`${revisoes} adiamento(s) de cronograma em 12 meses`);
  }
  if (tensaoMaxKv(p) === undefined || (!extensaoTotalKm(p) && !p.subestacoes.length)) {
    nota -= 1;
    motivos.push('escopo técnico indefinido');
  }
  if (p.situacoes.fundiaria === 'em_disputa') {
    nota -= 1;
    motivos.push('questão fundiária em disputa');
  }
  if (prev.confianca.nivel === 'muito_baixa') {
    nota -= 1;
    motivos.push('previsão de confiança muito baixa');
  }
  nota = Math.max(0, Math.min(5, nota));
  return [nota, motivos.length ? `Riscos: ${motivos.join('; ')}.` : 'Sem riscos relevantes identificados.'];
}

export function calcularScore(p: Empreendimento, ctx: ContextoScore): ResultadoScore {
  const port = ctx.portfolio ?? PORTFOLIO_PADRAO;
  const cfg = ctx.config ?? CONFIG_SCORE_PADRAO;
  const hoje = ctx.hoje ?? hojeISO();
  const [notaAder, justAder, fora] = aderenciaTecnica(p, port);
  const brutas: Record<CriterioScore, [number, string]> = {
    aderenciaTecnica: [notaAder, justAder],
    potencialReceita: potencialReceita(ctx.mercado, cfg),
    proximidadeJanela: proximidadeJanela(ctx.previsao),
    probabilidadeExecucao: probabilidadeExecucao(p),
    maturidade: maturidade(p, ctx.etapas ?? ETAPAS_PADRAO),
    visibilidadeContratante: visibilidade(p, ctx.oportunidade, hoje),
    atratividadeGeografica: atratividadeGeografica(p, port),
    capacidadeExecucao: capacidadeExecucao(p, ctx.mercado, port),
    competitividade: competitividade(p, ctx.mercado, ctx.oportunidade),
    risco: risco(p, ctx.previsao, hoje),
  };
  const notas: NotaCriterio[] = CRITERIOS_SCORE.map((c) => ({
    criterio: c,
    rotulo: ROTULO_CRITERIO[c],
    nota: brutas[c][0],
    peso: cfg.pesos[c] ?? 0,
    justificativa: brutas[c][1],
  }));
  const somaPesos = notas.reduce((s, n) => s + n.peso, 0) || 1;
  let indice = Math.round((notas.reduce((s, n) => s + (n.nota / 5) * n.peso, 0) / somaPesos) * 100);
  // Fora do escopo, encerrados e suspensos/adiados não entram nas faixas alta/média.
  const inativo = ['cancelado', 'concluido', 'suspenso', 'adiado'].includes(p.statusGeral);
  if (fora || inativo) indice = Math.min(indice, cfg.faixas.media - 1);
  const faixa: FaixaPrioridade = indice >= cfg.faixas.alta ? 'alta' : indice >= cfg.faixas.media ? 'media' : 'baixa';
  return {
    indice,
    faixa,
    notas,
    foraDoEscopo: fora,
    aviso: 'Índice de priorização para ordenação comercial; não representa probabilidade estatística.',
  };
}

/** Justificativa textual de priorização baseada nas notas (determinística, rastreável). */
export function justificativaPriorizacao(r: ResultadoScore): string {
  const ordenadas = [...r.notas].sort((a, b) => b.nota * b.peso - a.nota * a.peso);
  const fortes = ordenadas.filter((n) => n.nota >= 4).slice(0, 3);
  const fracos = [...r.notas].filter((n) => n.nota <= 1 && n.peso > 0).slice(0, 3);
  const partes = [`Prioridade ${ROTULO_FAIXA[r.faixa].toLowerCase()} (índice ${r.indice}/100).`];
  if (r.foraDoEscopo) partes.push(r.foraDoEscopo + '.');
  if (fortes.length) partes.push(`Pontos fortes: ${fortes.map((n) => `${n.rotulo.toLowerCase()} — ${n.justificativa}`).join(' ')}`);
  if (fracos.length) partes.push(`Pontos de atenção: ${fracos.map((n) => `${n.rotulo.toLowerCase()} — ${n.justificativa}`).join(' ')}`);
  return partes.join(' ');
}
