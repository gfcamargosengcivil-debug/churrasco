import {
  FASES_COTACAO_ABERTA, ORDEM_FASE_CONTRATACAO, ROTULO_FASE_CONTRATACAO, ROTULO_REGIAO, ROTULO_SETOR,
  STATUS_PIPELINE_QUALIFICADO, type FaseContratacao,
} from '../constantes.js';
import { ETAPAS_PADRAO, type EtapaDef } from '../config/etapas.js';
import type { Faixa } from '../config/parametros.js';
import { ROTULO_METODO_MERCADO, type MetodoMercado } from '../comercial/mercado.js';
import { marcoRealizado } from '../projetos/derivados.js';
import { EVENTOS_PREVISAO, ROTULO_EVENTO_PREVISAO, type EventoPrevisao } from '../previsao/tipos.js';
import { diferencaMeses, fimDoMes, hojeISO, mesChave, somarMeses } from '../util/datas.js';
import type { Cenario, Empreendimento, EventoMudanca, OportunidadeComercial } from '../tipos.js';
import { classeTensaoPainel, type VisaoEmpreendimento } from './visao.js';

const somaFaixa = (vs: VisaoEmpreendimento[]): Faixa =>
  vs.reduce<Faixa>((acc, v) => [acc[0] + (v.mercado.faixa?.[0] ?? 0), acc[1] + (v.mercado.faixa?.[1] ?? 0)], [0, 0]);
const somaCentral = (vs: VisaoEmpreendimento[]) => vs.reduce((s, v) => s + (v.mercado.central ?? 0), 0);

export const HORIZONTES_MESES = [3, 6, 12, 24] as const;

function ativo(v: VisaoEmpreendimento) {
  return v.statusGeral !== 'cancelado' && v.statusGeral !== 'concluido';
}

export interface PainelExecutivo {
  geradoEm: string;
  totais: {
    mapeados: number;
    ativos: number;
    suspensos: number;
    encerrados: number;
    demo: number;
    foraDoEscopo: number;
  };
  mercado: {
    faixa: Faixa;
    central: number;
    estimaveis: number;
    naoEstimaveis: number;
    porMetodo: { metodo: MetodoMercado; rotulo: string; quantidade: number; central: number }[];
    premissaIlustrativa: boolean;
    metodologia: string[];
  };
  pipelinePorEtapa: { etapaId: string; nome: string; ordem: number; quantidade: number; central: number }[];
  horizontes: { meses: number; quantidade: number; faixa: Faixa; central: number; ids: string[] }[];
  emCotacao: number;
  verificar: number;
  distribuicao: {
    setor: { chave: string; rotulo: string; quantidade: number; central: number }[];
    regiao: { chave: string; rotulo: string; quantidade: number; central: number }[];
    tensao: { chave: string; rotulo: string; quantidade: number; central: number }[];
  };
  prioridade: { alta: number; media: number; baixa: number; top: string[] };
}

function agrupar(vs: VisaoEmpreendimento[], chave: (v: VisaoEmpreendimento) => string[], rotulo: (k: string) => string) {
  const m = new Map<string, VisaoEmpreendimento[]>();
  for (const v of vs) for (const k of chave(v)) m.set(k, [...(m.get(k) ?? []), v]);
  return [...m.entries()]
    .map(([k, lista]) => ({ chave: k, rotulo: rotulo(k), quantidade: lista.length, central: somaCentral(lista) }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

export function painelExecutivo(visoes: VisaoEmpreendimento[], opcoes: { hoje?: string; etapas?: EtapaDef[]; topN?: number } = {}): PainelExecutivo {
  const hoje = opcoes.hoje ?? hojeISO();
  const etapas = opcoes.etapas ?? ETAPAS_PADRAO;
  const ativos = visoes.filter(ativo);
  const noEscopo = ativos.filter((v) => !v.score.foraDoEscopo);
  const estimaveis = noEscopo.filter((v) => v.mercado.central !== undefined);
  const porMetodo = (['percentual_capex_eletrico', 'parametrico_fisico', 'contratado', 'nao_estimavel'] as MetodoMercado[]).map((m) => {
    const l = noEscopo.filter((v) => v.mercado.metodo === m);
    return { metodo: m, rotulo: ROTULO_METODO_MERCADO[m], quantidade: l.length, central: somaCentral(l) };
  });
  const horizontes = HORIZONTES_MESES.map((meses) => {
    const limite = somarMeses(hoje, meses);
    const lista = noEscopo.filter((v) => {
      const d = v.dataDemandaBase;
      const rfq = v.previsao.cenarios.base.datas.rfq;
      if (rfq?.natureza === 'realizado' && v.previsao.necessidadeComercial.classe === 'imediata') return true;
      return !!d && d >= hoje && d <= limite;
    });
    return { meses, quantidade: lista.length, faixa: somaFaixa(lista), central: somaCentral(lista), ids: lista.map((v) => v.id) };
  });
  return {
    geradoEm: hoje,
    totais: {
      mapeados: visoes.length,
      ativos: ativos.length,
      suspensos: visoes.filter((v) => v.statusGeral === 'suspenso' || v.statusGeral === 'adiado').length,
      encerrados: visoes.length - ativos.length,
      demo: visoes.filter((v) => v.demo).length,
      foraDoEscopo: ativos.filter((v) => v.score.foraDoEscopo).length,
    },
    mercado: {
      faixa: somaFaixa(estimaveis),
      central: somaCentral(estimaveis),
      estimaveis: estimaveis.filter((v) => v.mercado.metodo !== 'contratado').length,
      naoEstimaveis: noEscopo.filter((v) => v.mercado.metodo === 'nao_estimavel').length,
      porMetodo,
      premissaIlustrativa: noEscopo.some((v) => v.mercado.premissaIlustrativa),
      metodologia: [
        'Soma da oportunidade de SERVIÇOS DE CONSTRUÇÃO/MONTAGEM ainda não contratados (não é CAPEX total nem investimento elétrico total).',
        'Por empreendimento: % do investimento elétrico declarado (quando disponível) ou referência paramétrica por km de LT e por subestação.',
        'Empreendimentos sem dados suficientes ficam fora da soma e são contados como "não estimáveis".',
        'Faixas mínimo–máximo; o valor central é o ponto médio da faixa.',
      ],
    },
    pipelinePorEtapa: etapas.map((e) => {
      const l = ativos.filter((v) => v.etapa?.id === e.id);
      return { etapaId: e.id, nome: e.nome, ordem: e.ordem, quantidade: l.length, central: somaCentral(l) };
    }),
    horizontes,
    emCotacao: noEscopo.filter((v) => FASES_COTACAO_ABERTA.includes(v.fase.geral)).length,
    verificar: noEscopo.filter((v) => v.previsao.necessidadeComercial.classe === 'verificar').length,
    distribuicao: {
      setor: agrupar(ativos, (v) => [v.setor], (k) => ROTULO_SETOR[k as keyof typeof ROTULO_SETOR] ?? k),
      regiao: agrupar(ativos, (v) => (v.regioes.length ? v.regioes : ['ND']), (k) => ROTULO_REGIAO[k as keyof typeof ROTULO_REGIAO] ?? 'Não informada'),
      tensao: agrupar(ativos, (v) => [classeTensaoPainel(v.tensaoMaxKv)], (k) => k),
    },
    prioridade: {
      alta: ativos.filter((v) => v.score.faixa === 'alta').length,
      media: ativos.filter((v) => v.score.faixa === 'media').length,
      baixa: ativos.filter((v) => v.score.faixa === 'baixa').length,
      top: [...noEscopo].sort((a, b) => b.score.indice - a.score.indice).slice(0, opcoes.topN ?? 10).map((v) => v.id),
    },
  };
}

/** Evolução mensal do pipeline reconstruída a partir das datas de identificação e de início das etapas. */
export function evolucaoPipeline(
  projetos: Empreendimento[],
  visoes: Map<string, VisaoEmpreendimento>,
  opcoes: { meses?: number; hoje?: string; etapas?: EtapaDef[] } = {},
) {
  const hoje = opcoes.hoje ?? hojeISO();
  const n = opcoes.meses ?? 18;
  const etapas = opcoes.etapas ?? ETAPAS_PADRAO;
  const ordem = new Map(etapas.map((e) => [e.id, e.ordem]));
  const serie: { mes: string; total: number; central: number; porEtapa: Record<string, number> }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const fim = fimDoMes(somarMeses(hoje, -i));
    const porEtapa: Record<string, number> = {};
    let total = 0;
    let central = 0;
    for (const p of projetos) {
      if (p.identificadoEm > fim) continue;
      const cancelamento = p.historico.find((h) => h.campo === 'statusGeral' && (h.para === 'cancelado' || h.para === 'concluido'));
      if (cancelamento && cancelamento.em.slice(0, 10) <= fim) continue;
      let etapaNoMes: string | undefined;
      for (const st of p.etapas) {
        if (!st.dataInicio || st.dataInicio > fim) continue;
        if (!etapaNoMes || (ordem.get(st.etapaId) ?? 0) > (ordem.get(etapaNoMes) ?? 0)) etapaNoMes = st.etapaId;
      }
      etapaNoMes ??= visoes.get(p.id)?.etapa?.id ?? 'sem_etapa';
      porEtapa[etapaNoMes] = (porEtapa[etapaNoMes] ?? 0) + 1;
      total++;
      central += visoes.get(p.id)?.mercado.central ?? 0;
    }
    serie.push({ mes: mesChave(fim), total, central, porEtapa });
  }
  return {
    serie,
    observacao:
      'Reconstruída a partir da data de identificação e das datas de início de etapa registradas; o potencial usa a estimativa atual de cada empreendimento (não reconstrói estimativas passadas).',
  };
}

export interface EstagioFunil {
  id: string;
  rotulo: string;
  fases: FaseContratacao[];
  quantidade: number;
  central: number;
  faixa: Faixa;
  primeiraData?: string;
  ultimaData?: string;
  ids: string[];
}

const ESTAGIOS_FUNIL: { id: string; rotulo: string; fases: FaseContratacao[] }[] = [
  { id: 'sem_contratacao', rotulo: 'Contratação não identificada', fases: ['nao_identificada'] },
  { id: 'prevista', rotulo: 'Contratação prevista', fases: ['prevista'] },
  { id: 'pre_qualificacao', rotulo: 'Pré-qualificação / RFI', fases: ['pre_qualificacao', 'rfi'] },
  { id: 'cotacao', rotulo: 'RFQ/RFP, propostas e negociação', fases: ['rfq_rfp', 'propostas', 'negociacao'] },
  { id: 'contratada', rotulo: 'Adjudicada / contratada', fases: ['adjudicada', 'contratada'] },
];

export function funilContratacao(visoes: VisaoEmpreendimento[], projetos: Map<string, Empreendimento>) {
  const ativos = visoes.filter((v) => ativo(v) && !v.score.foraDoEscopo);
  const estagios: EstagioFunil[] = ESTAGIOS_FUNIL.map((e) => {
    const l = ativos.filter((v) => e.fases.includes(v.fase.geral));
    const datas = l.map((v) => v.dataDemandaBase).filter((d): d is string => !!d).sort();
    return { ...e, quantidade: l.length, central: somaCentral(l), faixa: somaFaixa(l), primeiraData: datas[0], ultimaData: datas.at(-1), ids: l.map((v) => v.id) };
  });
  // Destaque: contratante definido e outorga/decisão realizada, mas contratação de obra não identificada.
  const destaque = ativos
    .filter((v) => ORDEM_FASE_CONTRATACAO[v.fase.geral] <= ORDEM_FASE_CONTRATACAO.prevista && v.contratanteId)
    .filter((v) => {
      const p = projetos.get(v.id);
      return !!p && !!marcoRealizado(p, ['contrato_concessao_assinado', 'autorizacao_publicada', 'decisao_final_investimento', 'vencedor_definido']);
    })
    .sort((a, b) => (a.dataDemandaBase ?? '9999') < (b.dataDemandaBase ?? '9999') ? -1 : 1)
    .map((v) => v.id);
  return { estagios, empreendedorDefinidoSemContratacao: destaque, rotulosFase: ROTULO_FASE_CONTRATACAO };
}

export interface ItemLinhaDoTempo {
  id: string;
  nome: string;
  eventos: Partial<Record<EventoPrevisao, { data: string; natureza: string; vencida?: boolean }>>;
  janelaContratacao?: { inicio: string; fim: string };
  central?: number;
  prioridade: string;
}

/** Demanda prevista por mês (cenário selecionado) e linha do tempo por empreendimento. */
export function demandaPrevista(visoes: VisaoEmpreendimento[], cenario: Cenario = 'base', opcoes: { hoje?: string; meses?: number } = {}) {
  const hoje = opcoes.hoje ?? hojeISO();
  const n = opcoes.meses ?? 36;
  const ativos = visoes.filter((v) => ativo(v) && !v.score.foraDoEscopo);
  const meses: string[] = [];
  for (let i = 0; i < n; i++) meses.push(mesChave(somarMeses(hoje, i)));
  const eventosContados: EventoPrevisao[] = ['rfq', 'assinaturaContrato', 'mobilizacao', 'energizacao'];
  const porMes = meses.map((mes) => ({ mes, ...Object.fromEntries(eventosContados.map((e) => [e, 0])), central: 0, ids: [] as string[] })) as ({
    mes: string;
    central: number;
    ids: string[];
  } & Record<EventoPrevisao, number>)[];
  const idx = new Map(meses.map((m, i) => [m, i]));
  const linha: ItemLinhaDoTempo[] = [];
  for (const v of ativos) {
    const datas = v.previsao.cenarios[cenario].datas;
    for (const e of eventosContados) {
      const d = datas[e];
      if (!d || d.natureza === 'realizado') continue;
      const i = idx.get(mesChave(d.data));
      if (i === undefined) continue;
      porMes[i][e]++;
      if (e === 'rfq') {
        porMes[i].central += v.mercado.central ?? 0;
        porMes[i].ids.push(v.id);
      }
    }
    const rfq = datas.rfq;
    const ctr = datas.assinaturaContrato;
    linha.push({
      id: v.id,
      nome: v.nome,
      eventos: Object.fromEntries(
        EVENTOS_PREVISAO.filter((e) => datas[e]).map((e) => [e, { data: datas[e]!.data, natureza: datas[e]!.natureza, vencida: datas[e]!.vencida }]),
      ),
      janelaContratacao: rfq && ctr ? { inicio: rfq.data, fim: ctr.data } : undefined,
      central: v.mercado.central,
      prioridade: v.score.faixa,
    });
  }
  // Concentração: meses cuja contagem de RFQ é ≥ 1,5× a média dos meses com demanda.
  const comDemanda = porMes.filter((m) => m.rfq > 0);
  const media = comDemanda.length ? comDemanda.reduce((s, m) => s + m.rfq, 0) / comDemanda.length : 0;
  const concentracao = porMes.filter((m) => m.rfq >= 2 && m.rfq >= media * 1.5).map((m) => m.mes);
  linha.sort((a, b) => ((a.eventos.rfq?.data ?? '9999') < (b.eventos.rfq?.data ?? '9999') ? -1 : 1));
  return { cenario, porMes, linhaDoTempo: linha, concentracao, rotulosEventos: ROTULO_EVENTO_PREVISAO };
}

/** Pipeline de mercado (identificado) × pipeline comercial (qualificado pela empresa). */
export function pipelines(visoes: VisaoEmpreendimento[], oportunidades: OportunidadeComercial[]) {
  const ativos = visoes.filter((v) => ativo(v) && !v.score.foraDoEscopo);
  const porId = new Map(visoes.map((v) => [v.id, v]));
  const qualificadas = oportunidades.filter((o) => STATUS_PIPELINE_QUALIFICADO.includes(o.statusProspeccao) && o.interesse === 'interessado');
  const valorQualificado = qualificadas.reduce((s, o) => s + (o.valorQualificadoBRL ?? porId.get(o.empreendimentoId)?.mercado.central ?? 0), 0);
  return {
    mercado: { quantidade: ativos.length, central: somaCentral(ativos), faixa: somaFaixa(ativos) },
    qualificado: {
      quantidade: qualificadas.length,
      valor: valorQualificado,
      porStatus: STATUS_PIPELINE_QUALIFICADO.map((s) => {
        const l = qualificadas.filter((o) => o.statusProspeccao === s);
        return { status: s, quantidade: l.length, valor: l.reduce((acc, o) => acc + (o.valorQualificadoBRL ?? porId.get(o.empreendimentoId)?.mercado.central ?? 0), 0) };
      }),
    },
    resultados: {
      ganhas: oportunidades.filter((o) => o.resultado?.status === 'ganha').length,
      perdidas: oportunidades.filter((o) => o.resultado?.status === 'perdida').length,
      declinadas: oportunidades.filter((o) => o.resultado?.status === 'declinada').length,
    },
    naoAvaliadas: ativos.filter((v) => !oportunidades.some((o) => o.empreendimentoId === v.id && o.interesse !== 'nao_avaliado')).length,
  };
}

/** Principais riscos: eventos recentes de atraso/suspensão/cancelamento e janelas vencidas. */
export function principaisRiscos(visoes: VisaoEmpreendimento[], eventos: EventoMudanca[], opcoes: { hoje?: string; dias?: number } = {}) {
  const hoje = opcoes.hoje ?? hojeISO();
  const dias = opcoes.dias ?? 120;
  const recentes = eventos
    .filter((e) => ['atraso', 'revisao_cronograma', 'suspensao', 'cancelamento', 'conflito_fontes'].includes(e.tipo))
    .filter((e) => diferencaMeses(e.em.slice(0, 10), hoje) * 30.44 <= dias)
    .sort((a, b) => (a.em < b.em ? 1 : -1))
    .slice(0, 15);
  const janelasVencidas = visoes.filter((v) => v.previsao.necessidadeComercial.classe === 'verificar').map((v) => v.id);
  const cronogramaApertado = visoes.filter((v) => v.previsao.avisos.some((a) => a.includes('cronograma apertado'))).map((v) => v.id);
  return { eventos: recentes, janelasVencidas, cronogramaApertado };
}
