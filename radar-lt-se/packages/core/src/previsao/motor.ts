/**
 * Motor de previsão de janelas de contratação.
 *
 * Princípios (ver docs/METODOLOGIA.md):
 * 1. Eventos já observados (com evidência) prevalecem sobre qualquer cálculo.
 * 2. Datas divulgadas por fonte são usadas como tal no cenário base e marcadas como "divulgado".
 * 3. Na ausência delas, as datas são calculadas a partir do marco verificável mais avançado
 *    (âncora) + premissas explícitas por cenário (otimista/base/conservador).
 * 4. Quando há prazo de energização, calcula-se também a data-limite regressiva
 *    (energização − comissionamento − obra − mobilização − contratação) e, nos cenários
 *    otimista/base, a contratação não é prevista depois dessa data-limite.
 * 5. Sinais fracos (anúncio, inclusão em plano) geram datas "heurísticas".
 * Nenhuma data calculada é apresentada como compromisso do empreendedor.
 */
import { ROTULO_MARCO, ORDEM_FASE_CONTRATACAO, PACOTES_CONSTRUCAO, type Escopo, type TipoMarco } from '../constantes.js';
import { PARAMETROS_PREVISAO_PADRAO, type ParametrosPrevisao, type TriploMeses } from '../config/parametros.js';
import { extensaoTotalKm, faseContratacaoConstrucao, marcosDoTipo, temLT, temSE } from '../projetos/derivados.js';
import { diferencaMeses, formatarDataBR, hojeISO, maxData, minData, somarMeses } from '../util/datas.js';
import { hashCurto, jsonEstavel } from '../util/ids.js';
import type { Cenario, Empreendimento, Fonte, Marco } from '../tipos.js';
import { CENARIOS } from '../tipos.js';
import { avaliarConfianca } from './confianca.js';
import {
  EVENTOS_PREVISAO, ROTULO_EVENTO_PREVISAO,
  type AncoraPrevisao, type CenarioPrevisao, type ClasseNecessidade, type DataPrevista, type EventoPrevisao,
  type Janela, type NaturezaData, type PrevisaoEmpreendimento,
} from './tipos.js';

const INDICE: Record<Cenario, 0 | 1 | 2> = { otimista: 0, base: 1, conservador: 2 };
const ROTULO_CENARIO: Record<Cenario, string> = { otimista: 'otimista', base: 'base', conservador: 'conservador' };

type EscopoObra = 'LT' | 'SE';
type TipoAncora = 'outorga' | 'fid' | 'acesso';

const ROTULO_PARAMETRO: Partial<Record<keyof ParametrosPrevisao, string>> = {
  leilaoParaAssinatura: 'Leilão → assinatura do contrato de concessão',
  planejamentoParaOutorga: 'Inclusão em plano → outorga (leilão/autorização)',
  editalParaLeilao: 'Edital → leilão',
  outorgaParaRfqLT: 'Outorga → RFQ/RFP de LT',
  outorgaParaRfqSE: 'Outorga → RFQ/RFP de SE',
  outorgaParaLI: 'Outorga → Licença de Instalação',
  anuncioParaFID: 'Anúncio → decisão final de investimento',
  fidParaRfq: 'Decisão de investimento/contratação principal → RFQ dos pacotes de obra',
  acessoParaRfq: 'Parecer de acesso → RFQ das obras de conexão',
  preQualificacaoParaRfq: 'Pré-qualificação/RFI → RFQ/RFP',
  rfqParaContrato: 'RFQ/RFP → assinatura do contrato de execução',
  contratoParaMobilizacao: 'Contrato de execução → mobilização',
  liParaMobilizacao: 'Licença de Instalação → mobilização',
  liParaRfq: 'LI emitida sem RFQ identificada → RFQ (prazo máximo)',
  mobilizacaoParaObras: 'Mobilização → início das obras',
  comissionamento: 'Comissionamento até energização',
  ajusteEnergizacaoDivulgada: 'Ajuste sobre energização divulgada',
  ajusteDataDivulgada: 'Ajuste sobre data divulgada',
};

interface Ctx {
  p: Empreendimento;
  par: ParametrosPrevisao;
  hoje: string;
  cenario: Cenario;
  i: 0 | 1 | 2;
  premissas: Map<string, string>;
  avisos: Set<string>;
}

function meses(ctx: Ctx, chave: keyof ParametrosPrevisao): number {
  const valor = (ctx.par[chave] as TriploMeses)[ctx.i];
  const rotulo = ROTULO_PARAMETRO[chave] ?? chave;
  ctx.premissas.set(chave, `${rotulo}: ${valor >= 0 ? '+' : ''}${valor} ${Math.abs(valor) === 1 ? 'mês' : 'meses'}`);
  return valor;
}

function fmtMeses(m: number): string {
  const r = Math.round(m * 10) / 10;
  return `${r >= 0 ? '+' : '−'} ${Math.abs(r)} ${Math.abs(r) === 1 ? 'mês' : 'meses'}`;
}

function marcoParaAncora(m: Marco, descricao?: string): AncoraPrevisao {
  return {
    descricao: descricao ?? ROTULO_MARCO[m.tipo],
    marcoTipo: m.tipo,
    data: m.data,
    natureza: m.natureza,
    evidenciaIds: m.evidenciaIds,
  };
}

function dataDeMarco(m: Marco, ctx: Ctx, rotulo: string, aplicarAjusteDivulgada = true): DataPrevista {
  if (m.natureza === 'realizado') {
    return {
      data: m.data,
      natureza: 'realizado',
      ancora: marcoParaAncora(m),
      calculo: `${rotulo}: ${ROTULO_MARCO[m.tipo]} realizado em ${formatarDataBR(m.data)}.`,
      evidenciaIds: m.evidenciaIds,
    };
  }
  const heuristica = m.natureza === 'previsto_estimado';
  const ajuste = aplicarAjusteDivulgada && !heuristica ? meses(ctx, 'ajusteDataDivulgada') : 0;
  const data = somarMeses(m.data, ajuste);
  return {
    data,
    natureza: heuristica ? 'heuristico' : ajuste === 0 ? 'divulgado' : 'calculado_de_marco',
    ancora: marcoParaAncora(m),
    calculo:
      `${rotulo}: ${heuristica ? 'estimativa interna registrada' : 'data divulgada'} ${formatarDataBR(m.data)}` +
      (ajuste ? ` ${fmtMeses(ajuste)} (ajuste do cenário ${ROTULO_CENARIO[ctx.cenario]}) = ${formatarDataBR(data)}.` : '.'),
    evidenciaIds: m.evidenciaIds,
  };
}

/** Prazo/data de energização: é uma data publicada (não um evento realizado). */
function dataDePrazo(m: Marco): DataPrevista {
  const heuristica = m.natureza === 'previsto_estimado';
  return {
    data: m.data,
    natureza: heuristica ? 'heuristico' : 'divulgado',
    ancora: marcoParaAncora(m),
    calculo: `${ROTULO_MARCO[m.tipo]}: ${heuristica ? 'estimativa interna' : 'data divulgada'} ${formatarDataBR(m.data)}.`,
    evidenciaIds: m.evidenciaIds,
  };
}

/** Deriva uma nova data a partir de outra somando meses, preservando a cadeia de evidências. */
function derivar(base: DataPrevista, deslocamento: number, rotuloPasso: string, rotuloEvento: string): DataPrevista {
  const data = somarMeses(base.data, deslocamento);
  const natureza: NaturezaData = base.natureza === 'heuristico' ? 'heuristico' : 'calculado_de_marco';
  return {
    data,
    natureza,
    ancora: base.ancora,
    calculo: `${rotuloEvento}: ${formatarDataBR(base.data)} ${fmtMeses(deslocamento)} (${rotuloPasso}) = ${formatarDataBR(data)}.`,
    evidenciaIds: base.evidenciaIds,
  };
}

function maisCedo(a?: DataPrevista, b?: DataPrevista): DataPrevista | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.data < a.data ? b : a;
}

function maisTarde(a?: DataPrevista, b?: DataPrevista): DataPrevista | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.data > a.data ? b : a;
}

interface CandidatoAncora {
  tipos: TipoMarco[];
  naturezas: Marco['natureza'][];
  offsets: (keyof ParametrosPrevisao)[];
  tipoAncora: TipoAncora;
  heuristica?: boolean;
  somenteFluxos?: string[];
}

function candidatosAncora(p: Empreendimento): CandidatoAncora[] {
  const privado = p.fluxoId === 'privado_industrial' || p.fluxoId === 'distribuicao';
  const outorga: TipoMarco[] = ['contrato_concessao_assinado', 'autorizacao_publicada'];
  return [
    { tipos: outorga, naturezas: ['realizado'], offsets: [], tipoAncora: 'outorga' },
    // Privados: contratação do EPC/obra principal é posterior (mais avançada) à decisão de investimento.
    ...(privado ? [{ tipos: ['vencedor_definido'] as TipoMarco[], naturezas: ['realizado'] as Marco['natureza'][], offsets: [], tipoAncora: 'fid' as const }] : []),
    { tipos: ['decisao_final_investimento'], naturezas: ['realizado'], offsets: [], tipoAncora: 'fid' },
    { tipos: ['parecer_acesso'], naturezas: ['realizado'], offsets: [], tipoAncora: 'acesso', somenteFluxos: ['conexao_geracao'] },
    { tipos: outorga, naturezas: ['previsto_oficial'], offsets: [], tipoAncora: 'outorga' },
    { tipos: ['decisao_final_investimento'], naturezas: ['previsto_oficial'], offsets: [], tipoAncora: 'fid' },
    { tipos: ['leilao_realizado', ...(privado ? [] : (['vencedor_definido'] as TipoMarco[]))], naturezas: ['realizado'], offsets: ['leilaoParaAssinatura'], tipoAncora: 'outorga' },
    { tipos: ['leilao_realizado'], naturezas: ['previsto_oficial'], offsets: ['leilaoParaAssinatura'], tipoAncora: 'outorga' },
    { tipos: ['edital_publicado'], naturezas: ['realizado'], offsets: ['editalParaLeilao', 'leilaoParaAssinatura'], tipoAncora: 'outorga' },
    { tipos: ['inclusao_planejamento', 'consulta_publica'], naturezas: ['realizado', 'previsto_oficial'], offsets: ['planejamentoParaOutorga'], tipoAncora: privado ? 'fid' : 'outorga', heuristica: true },
    { tipos: ['anuncio'], naturezas: ['realizado'], offsets: ['anuncioParaFID'], tipoAncora: 'fid', heuristica: true },
  ];
}

interface Ancora {
  data: DataPrevista;
  tipoAncora: TipoAncora;
}

/** Determina a âncora mais avançada disponível (outorga, decisão de investimento ou acesso). */
function determinarAncora(ctx: Ctx): Ancora | undefined {
  for (const cand of candidatosAncora(ctx.p)) {
    if (cand.somenteFluxos && !cand.somenteFluxos.includes(ctx.p.fluxoId)) continue;
    const m = marcosDoTipo(ctx.p, cand.tipos, cand.naturezas)[0];
    if (!m) continue;
    const rotuloAncora =
      cand.tipoAncora === 'outorga' ? 'Outorga (concessão/autorização)' : cand.tipoAncora === 'fid' ? 'Decisão de investimento / contratação principal' : 'Parecer de acesso';
    let atual = dataDeMarco(m, ctx, rotuloAncora, cand.offsets.length === 0);
    for (const off of cand.offsets) {
      atual = derivar(atual, meses(ctx, off), ROTULO_PARAMETRO[off] ?? off, rotuloAncora + ' (estimada)');
    }
    if (cand.heuristica) atual = { ...atual, natureza: 'heuristico' };
    return { data: atual, tipoAncora: cand.tipoAncora };
  }
  return undefined;
}

function duracaoObra(ctx: Ctx, escopo: EscopoObra): number {
  const { p, par, i } = ctx;
  if (escopo === 'LT') {
    let km = extensaoTotalKm(p);
    if (!km) {
      km = par.extensaoPadraoKm;
      ctx.avisos.add(`Extensão da LT não informada: assumidos ${km} km para estimar a duração da obra.`);
    }
    const d = par.duracaoObraLT.fixo[i] + (par.duracaoObraLT.por100km[i] * km) / 100;
    const res = Math.min(par.duracaoObraLT.maximo, Math.max(par.duracaoObraLT.minimo, d));
    ctx.premissas.set('duracaoObraLT', `Duração da obra de LT: ${par.duracaoObraLT.fixo[i]} meses + ${par.duracaoObraLT.por100km[i]} meses/100 km × ${km} km ≈ ${Math.round(res)} meses`);
    return res;
  }
  const naturezas = p.subestacoes.length ? p.subestacoes.map((s) => s.natureza) : (['nova'] as const);
  if (!p.subestacoes.length) ctx.avisos.add('Natureza das subestações não informada: assumida subestação nova para a duração da obra.');
  const res = Math.max(...naturezas.map((n) => par.duracaoObraSE[n][i]));
  ctx.premissas.set('duracaoObraSE', `Duração da obra de SE (${[...new Set(naturezas)].join(', ')}): ${res} meses`);
  return res;
}

/** Prazo/data de energização usado no cálculo regressivo. */
function prazoEnergizacao(ctx: Ctx, escopo?: EscopoObra): Marco | undefined {
  const esc: Escopo | undefined = escopo;
  return (
    marcosDoTipo(ctx.p, ['energizacao', 'operacao_comercial'], ['previsto_oficial'], esc).at(-1) ??
    marcosDoTipo(ctx.p, ['prazo_contratual_energizacao'], ['realizado', 'previsto_oficial'], esc)[0] ??
    marcosDoTipo(ctx.p, ['energizacao', 'operacao_comercial'], ['previsto_estimado'], esc).at(-1)
  );
}

/** Data em que um evento realizado ocorreu, a partir de marco, contrato ou pacote. */
function dataContratoRealizado(ctx: Ctx, escopo: EscopoObra): DataPrevista | undefined {
  const { p } = ctx;
  const fase = faseContratacaoConstrucao(p, escopo);
  // Obra iniciada implica contratação, exceto quando há pacote deste escopo ainda em fase anterior.
  const pacoteEscopoPendente = p.pacotes.some(
    (x) => PACOTES_CONSTRUCAO.includes(x.pacote) && x.escopo === escopo && ORDEM_FASE_CONTRATACAO[x.faseContratacao] < ORDEM_FASE_CONTRATACAO.adjudicada,
  );
  const obraIniciada = ['mobilizacao', 'construcao', 'comissionamento', 'concluida'].includes(p.situacaoObra) && !pacoteEscopoPendente;
  if (ORDEM_FASE_CONTRATACAO[fase] < ORDEM_FASE_CONTRATACAO.adjudicada && !obraIniciada) return undefined;
  const m = marcosDoTipo(p, ['contrato_execucao_assinado'], ['realizado'], escopo)[0];
  if (m) return dataDeMarco(m, ctx, `Contrato de execução (${escopo})`);
  const c = p.contratos
    .filter((x) => (x.escopo === escopo || x.escopo === 'geral') && x.dataAssinatura && x.pacotes.some((pc) => PACOTES_CONSTRUCAO.includes(pc)))
    .sort((a, b) => (a.dataAssinatura! < b.dataAssinatura! ? -1 : 1))[0];
  if (c?.dataAssinatura) {
    return { data: c.dataAssinatura, natureza: 'realizado', calculo: `Contrato "${c.objeto}" assinado em ${formatarDataBR(c.dataAssinatura)}.`, evidenciaIds: c.evidenciaIds };
  }
  const pk = p.pacotes.find(
    (x) => PACOTES_CONSTRUCAO.includes(x.pacote) && (x.escopo === escopo || x.escopo === 'geral') && ORDEM_FASE_CONTRATACAO[x.faseContratacao] >= ORDEM_FASE_CONTRATACAO.adjudicada && x.dataEvento,
  );
  if (pk?.dataEvento) {
    return { data: pk.dataEvento, natureza: 'realizado', calculo: `Pacote de ${pk.pacote.replace(/_/g, ' ')} ${pk.faseContratacao} em ${formatarDataBR(pk.dataEvento)}.`, evidenciaIds: pk.evidenciaIds };
  }
  return {
    data: ctx.hoje,
    natureza: 'realizado',
    dataDesconhecida: true,
    calculo: `Contratação de ${escopo} identificada (fase "${fase}"${obraIniciada ? ', obra iniciada' : ''}) sem data registrada.`,
    evidenciaIds: [],
  };
}

function preverRfq(ctx: Ctx, escopo: EscopoObra, ancora: Ancora | undefined): DataPrevista | undefined {
  const { p } = ctx;
  const rotulo = `RFQ/RFP ${escopo}`;
  const real = marcosDoTipo(p, ['rfq_publicada', 'propostas_recebidas'], ['realizado'], escopo)[0];
  if (real) return dataDeMarco(real, ctx, rotulo);
  const pacotesEscopo = p.pacotes.filter((x) => PACOTES_CONSTRUCAO.includes(x.pacote) && (x.escopo === escopo || x.escopo === 'geral'));
  const emCotacao = pacotesEscopo.find((x) => ORDEM_FASE_CONTRATACAO[x.faseContratacao] >= ORDEM_FASE_CONTRATACAO.rfq_rfp);
  if (emCotacao) {
    return emCotacao.dataEvento
      ? { data: emCotacao.dataEvento, natureza: 'realizado', calculo: `${rotulo}: processo identificado (${emCotacao.faseContratacao}) em ${formatarDataBR(emCotacao.dataEvento)}.`, evidenciaIds: emCotacao.evidenciaIds }
      : { data: ctx.hoje, natureza: 'realizado', dataDesconhecida: true, calculo: `${rotulo}: processo de cotação identificado sem data registrada.`, evidenciaIds: emCotacao.evidenciaIds };
  }
  const divulgada = marcosDoTipo(p, ['rfq_publicada'], ['previsto_oficial'], escopo)[0];
  if (divulgada) return dataDeMarco(divulgada, ctx, rotulo);

  const preQ = pacotesEscopo.find((x) => x.faseContratacao === 'pre_qualificacao' || x.faseContratacao === 'rfi');
  let prevista: DataPrevista | undefined;
  if (preQ) {
    const base: DataPrevista = preQ.dataEvento
      ? { data: preQ.dataEvento, natureza: 'realizado', calculo: '', evidenciaIds: preQ.evidenciaIds, ancora: { descricao: 'Pré-qualificação/RFI identificada', data: preQ.dataEvento, natureza: 'realizado', evidenciaIds: preQ.evidenciaIds } }
      : { data: ctx.hoje, natureza: 'realizado', calculo: '', evidenciaIds: preQ.evidenciaIds, ancora: { descricao: 'Pré-qualificação/RFI identificada (sem data)', data: ctx.hoje, natureza: 'realizado', evidenciaIds: preQ.evidenciaIds } };
    prevista = derivar(base, meses(ctx, 'preQualificacaoParaRfq'), ROTULO_PARAMETRO.preQualificacaoParaRfq!, rotulo);
  } else if (ancora) {
    const chave: keyof ParametrosPrevisao =
      ancora.tipoAncora === 'outorga' ? (escopo === 'LT' ? 'outorgaParaRfqLT' : 'outorgaParaRfqSE') : ancora.tipoAncora === 'fid' ? 'fidParaRfq' : 'acessoParaRfq';
    prevista = derivar(ancora.data, meses(ctx, chave), ROTULO_PARAMETRO[chave]!, rotulo);
  }

  // Data-limite regressiva a partir do prazo de energização.
  const prazo = prazoEnergizacao(ctx, escopo);
  let limite: DataPrevista | undefined;
  if (prazo) {
    const total =
      meses(ctx, 'comissionamento') + duracaoObra(ctx, escopo) + meses(ctx, 'mobilizacaoParaObras') +
      meses(ctx, 'contratoParaMobilizacao') + meses(ctx, 'rfqParaContrato');
    const baseDivulgada = dataDePrazo(prazo);
    limite = {
      ...derivar(baseDivulgada, -total, 'cálculo regressivo: comissionamento + obra + mobilização + contratação', `${rotulo} (data-limite)`),
      natureza: baseDivulgada.natureza === 'heuristico' ? 'heuristico' : 'calculado_de_marco',
    };
  }
  // Licença de Instalação emitida sem RFQ identificada: a contratação tende a ser iminente.
  const li = marcosDoTipo(p, ['licenca_instalacao'], ['realizado'], escopo)[0];
  let limiteLI: DataPrevista | undefined;
  if (li) {
    limiteLI = derivar(dataDeMarco(li, ctx, 'LI'), meses(ctx, 'liParaRfq'), ROTULO_PARAMETRO.liParaRfq!, `${rotulo} (limite pela LI)`);
  }

  if (!prevista) {
    // Sem âncora: usa a data-limite (se houver) como melhor estimativa disponível.
    return maisCedo(limite, limiteLI);
  }
  if (ctx.cenario !== 'conservador') {
    const teto = maisCedo(limite, limiteLI);
    if (teto && teto.data < prevista.data) {
      ctx.avisos.add(
        `${rotulo}: a estimativa pela âncora (${formatarDataBR(prevista.data)}) é posterior à data-limite compatível com o prazo de energização/LI (${formatarDataBR(teto.data)}); usada a data-limite nos cenários otimista/base — cronograma apertado.`,
      );
      return { ...teto, calculo: `${teto.calculo} Limitada pela data-limite (estimativa pela âncora: ${formatarDataBR(prevista.data)}).` };
    }
  }
  return prevista;
}

function preverContrato(ctx: Ctx, escopo: EscopoObra, rfq: DataPrevista | undefined): DataPrevista | undefined {
  const real = dataContratoRealizado(ctx, escopo);
  if (real) return real;
  const divulgada = marcosDoTipo(ctx.p, ['contrato_execucao_assinado'], ['previsto_oficial', 'previsto_estimado'], escopo)[0];
  if (divulgada) return dataDeMarco(divulgada, ctx, `Contratação ${escopo}`);
  if (!rfq) return undefined;
  return derivar(rfq, meses(ctx, 'rfqParaContrato'), ROTULO_PARAMETRO.rfqParaContrato!, `Contratação dos serviços de ${escopo}`);
}

function estimarLI(ctx: Ctx, ancora: Ancora | undefined): DataPrevista | undefined {
  const m = marcosDoTipo(ctx.p, ['licenca_instalacao'], ['realizado', 'previsto_oficial', 'previsto_estimado'])[0];
  if (m) return dataDeMarco(m, ctx, 'Licença de Instalação');
  if (ctx.p.situacoes.ambiental === 'li_emitida' || ctx.p.situacoes.ambiental === 'lo_emitida' || ctx.p.situacoes.ambiental === 'dispensada') return undefined;
  if (ancora?.tipoAncora === 'outorga') {
    return derivar(ancora.data, meses(ctx, 'outorgaParaLI'), ROTULO_PARAMETRO.outorgaParaLI!, 'Licença de Instalação (estimada)');
  }
  return undefined;
}

function realizadoOuDivulgado(ctx: Ctx, tipos: TipoMarco[], rotulo: string, ajustar = true): DataPrevista | undefined {
  const real = marcosDoTipo(ctx.p, tipos, ['realizado'])[0];
  if (real) return dataDeMarco(real, ctx, rotulo);
  const div = marcosDoTipo(ctx.p, tipos, ['previsto_oficial'])[0];
  if (div) return dataDeMarco(div, ctx, rotulo, ajustar);
  return undefined;
}

function preverCenario(p: Empreendimento, par: ParametrosPrevisao, hoje: string, cenario: Cenario, avisos: Set<string>): CenarioPrevisao {
  const ctx: Ctx = { p, par, hoje, cenario, i: INDICE[cenario], premissas: new Map(), avisos };
  const datas: Partial<Record<EventoPrevisao, DataPrevista>> = {};
  const ancora = determinarAncora(ctx);
  const escopos: EscopoObra[] = [];
  if (temLT(p)) escopos.push('LT');
  if (temSE(p)) escopos.push('SE');

  const rfqPorEscopo: CenarioPrevisao['rfqPorEscopo'] = {};
  const porEscopo = escopos.map((e) => {
    const rfqE = preverRfq(ctx, e, ancora);
    const contratoE = preverContrato(ctx, e, rfqE);
    if (contratoE) datas[e === 'LT' ? 'contratacaoLT' : 'contratacaoSE'] = contratoE;
    if (rfqE) rfqPorEscopo[e] = rfqE;
    return { e, rfqE, contratoE };
  });
  // Janela de RFQ/contrato do empreendimento = escopos ainda não contratados (ou todos, se já contratados).
  const pendentes = porEscopo.filter((x) => x.contratoE?.natureza !== 'realizado');
  const referencia = pendentes.length ? pendentes : porEscopo;
  const rfq = referencia.reduce<DataPrevista | undefined>((acc, x) => maisCedo(acc, x.rfqE), undefined);
  const contratoJanela = referencia.reduce<DataPrevista | undefined>((acc, x) => maisCedo(acc, x.contratoE), undefined);
  const contrato = porEscopo.reduce<DataPrevista | undefined>((acc, x) => maisCedo(acc, x.contratoE), undefined);
  if (rfq) datas.rfq = rfq;
  if (contratoJanela) datas.assinaturaContrato = contratoJanela;

  // Mobilização
  let mobilizacao = realizadoOuDivulgado(ctx, ['mobilizacao', 'ordem_inicio'], 'Mobilização');
  if (!mobilizacao && ['mobilizacao', 'construcao', 'comissionamento', 'concluida'].includes(p.situacaoObra)) {
    mobilizacao = { data: hoje, natureza: 'realizado', dataDesconhecida: true, calculo: 'Mobilização já ocorrida (situação da obra) sem data registrada.', evidenciaIds: [] };
  }
  if (!mobilizacao && contrato) {
    const porContrato = derivar(contrato, meses(ctx, 'contratoParaMobilizacao'), ROTULO_PARAMETRO.contratoParaMobilizacao!, 'Mobilização');
    const li = estimarLI(ctx, ancora);
    const porLI = li ? derivar(li, meses(ctx, 'liParaMobilizacao'), ROTULO_PARAMETRO.liParaMobilizacao!, 'Mobilização (após LI)') : undefined;
    mobilizacao = maisTarde(porContrato, porLI);
  }
  if (mobilizacao) datas.mobilizacao = mobilizacao;

  // Início das obras
  let inicio = realizadoOuDivulgado(ctx, ['inicio_obras'], 'Início das obras');
  if (!inicio && ['construcao', 'comissionamento', 'concluida'].includes(p.situacaoObra)) {
    inicio = { data: hoje, natureza: 'realizado', dataDesconhecida: true, calculo: 'Obras já iniciadas (situação da obra) sem data registrada.', evidenciaIds: [] };
  }
  if (!inicio && mobilizacao) {
    inicio = derivar(mobilizacao, meses(ctx, 'mobilizacaoParaObras'), ROTULO_PARAMETRO.mobilizacaoParaObras!, 'Início das obras');
  }
  if (inicio) datas.inicioObras = inicio;

  // Energização
  const energReal = marcosDoTipo(p, ['energizacao', 'operacao_comercial'], ['realizado'])[0];
  if (energReal) {
    datas.energizacao = dataDeMarco(energReal, ctx, 'Energização');
  } else {
    const duracao = escopos.length ? Math.max(...escopos.map((e) => duracaoObra(ctx, e))) : undefined;
    const fisica = inicio && duracao !== undefined
      ? derivar(inicio, duracao + meses(ctx, 'comissionamento'), 'duração da obra + comissionamento', 'Energização (pela obra)')
      : undefined;
    const prazo = prazoEnergizacao(ctx);
    if (prazo) {
      const div = dataDePrazo(prazo);
      const aj = meses(ctx, 'ajusteEnergizacaoDivulgada');
      let porPrazo = aj === 0 ? div : derivar(div, aj, ROTULO_PARAMETRO.ajusteEnergizacaoDivulgada!, 'Energização');
      if (div.natureza === 'heuristico') porPrazo = { ...porPrazo, natureza: 'heuristico' };
      if (fisica && fisica.data > porPrazo.data) {
        const folga = diferencaMeses(porPrazo.data, fisica.data);
        if (cenario === 'conservador' || folga > 3) {
          if (cenario !== 'conservador') {
            avisos.add(`A data de energização divulgada (${formatarDataBR(prazo.data)}) parece incompatível com as premissas de obra (estimativa ${formatarDataBR(fisica.data)} no cenário ${cenario}).`);
          }
          porPrazo = { ...fisica, calculo: `${fisica.calculo} Posterior à data divulgada (${formatarDataBR(prazo.data)}).` };
        }
      }
      datas.energizacao = porPrazo;
    } else if (fisica) {
      datas.energizacao = fisica;
    }
  }

  for (const d of [...EVENTOS_PREVISAO.map((k) => datas[k]), ...Object.values(rfqPorEscopo)]) {
    if (d && d.natureza !== 'realizado' && d.data < hoje) d.vencida = true;
  }

  const premissas = [...ctx.premissas.values()];
  if (ancora) premissas.unshift(`Âncora: ${ancora.data.ancora?.descricao ?? 'marco'} — ${ancora.data.calculo}`);
  else premissas.unshift('Sem marco de referência (outorga, decisão de investimento, leilão, plano ou anúncio) — datas dependentes de prazo de energização, se houver.');
  return { cenario, premissas, datas, rfqPorEscopo };
}

function classificarNecessidade(p: Empreendimento, base: CenarioPrevisao, hoje: string, aplicavel: { LT: boolean; SE: boolean }): PrevisaoEmpreendimento['necessidadeComercial'] {
  if (p.statusGeral === 'cancelado' || p.statusGeral === 'concluido') {
    return { classe: 'encerrada', descricao: 'Empreendimento encerrado (concluído ou cancelado).' };
  }
  if (p.statusGeral === 'suspenso' || p.statusGeral === 'adiado') {
    return { classe: 'suspensa', descricao: `Empreendimento ${p.statusGeral}: janelas não devem orientar ações até retomada.` };
  }
  const escopos = (['LT', 'SE'] as const).filter((e) => aplicavel[e]);
  const contratacoes = escopos.map((e) => base.datas[e === 'LT' ? 'contratacaoLT' : 'contratacaoSE']);
  if (escopos.length && contratacoes.every((c) => c?.natureza === 'realizado')) {
    return { classe: 'ja_contratada', descricao: 'Contratação de construção já identificada para todos os escopos.' };
  }
  // Escopos ainda não contratados, com a RFQ correspondente.
  const pendentes = escopos
    .filter((e) => base.datas[e === 'LT' ? 'contratacaoLT' : 'contratacaoSE']?.natureza !== 'realizado')
    .map((e) => ({ e, rfq: base.rfqPorEscopo[e] }));
  const emCotacao = pendentes.filter((x) => x.rfq?.natureza === 'realizado');
  if (emCotacao.length) {
    return { classe: 'imediata', mesesAteDemanda: 0, descricao: `Processo de cotação/RFQ em andamento (${emCotacao.map((x) => x.e).join(' e ')}).` };
  }
  const vencidas = pendentes.filter((x) => x.rfq?.vencida);
  if (vencidas.length) {
    return {
      classe: 'verificar',
      mesesAteDemanda: 0,
      descricao: `Janela estimada de RFQ de ${vencidas.map((x) => `${x.e} (${formatarDataBR(x.rfq!.data)})`).join(' e ')} já passou sem evidência de contratação — verificar se houve contratação não identificada ou atraso.`,
    };
  }
  const rfq = pendentes.map((x) => x.rfq).filter((d): d is DataPrevista => !!d).sort((a, b) => (a.data < b.data ? -1 : 1))[0] ?? base.datas.rfq;
  if (!rfq) return { classe: 'indefinida', descricao: 'Sem marco que permita estimar a demanda; monitorar.' };
  const m = Math.max(0, diferencaMeses(hoje, rfq.data));
  const classe: ClasseNecessidade = m <= 3 ? 'imediata' : m <= 12 ? 'curto_prazo' : m <= 24 ? 'medio_prazo' : 'longo_prazo';
  return { classe, mesesAteDemanda: Math.round(m * 10) / 10, descricao: `RFQ/RFP estimada (cenário base) em ${formatarDataBR(rfq.data)}.` };
}

function proximoMarco(p: Empreendimento, base: CenarioPrevisao, hoje: string): PrevisaoEmpreendimento['proximoMarco'] {
  type Cand = NonNullable<PrevisaoEmpreendimento['proximoMarco']>;
  const cands: Cand[] = [];
  for (const m of p.marcos) {
    if (m.natureza === 'realizado' || m.data < hoje) continue;
    cands.push({ descricao: ROTULO_MARCO[m.tipo], data: m.data, natureza: m.natureza as Cand['natureza'], evidenciaIds: m.evidenciaIds });
  }
  for (const k of EVENTOS_PREVISAO) {
    const d = base.datas[k];
    if (!d || d.natureza === 'realizado' || d.data < hoje) continue;
    cands.push({
      descricao: `${ROTULO_EVENTO_PREVISAO[k]} (${d.natureza === 'divulgado' ? 'divulgada' : 'estimada'})`,
      data: d.data,
      natureza: d.natureza === 'divulgado' ? 'previsto_oficial' : 'calculado',
      evidenciaIds: d.evidenciaIds,
    });
  }
  cands.sort((a, b) => (a.data === b.data ? (a.natureza === 'previsto_oficial' ? -1 : 1) : a.data < b.data ? -1 : 1));
  return cands[0];
}

/** Assinatura dos dados relevantes para a previsão (para saber quando recalcular). */
export function assinaturaEntradaPrevisao(p: Empreendimento, par: ParametrosPrevisao): string {
  return hashCurto(
    jsonEstavel({
      par: par.versao,
      parametros: par,
      tipo: p.tipo,
      fluxo: p.fluxoId,
      status: p.statusGeral,
      obra: p.situacaoObra,
      amb: p.situacoes.ambiental,
      marcos: p.marcos.map((m) => [m.tipo, m.data, m.natureza, m.escopo]).sort(),
      pacotes: p.pacotes.map((x) => [x.pacote, x.escopo, x.faseContratacao, x.dataEvento]).sort(),
      contratos: p.contratos.map((c) => [c.status, c.escopo, c.dataAssinatura, c.pacotes]).sort(),
      km: extensaoTotalKm(p),
      ses: p.subestacoes.map((s) => s.natureza).sort(),
      tec: [p.tecnico.extensaoKm, p.tecnico.qtdSubestacoes],
    }),
  );
}

export interface OpcoesPrevisao {
  parametros?: ParametrosPrevisao;
  hoje?: string;
  fontes?: Map<string, Fonte> | Record<string, Fonte>;
}

export function preverEmpreendimento(p: Empreendimento, opcoes: OpcoesPrevisao = {}): PrevisaoEmpreendimento {
  const par = opcoes.parametros ?? PARAMETROS_PREVISAO_PADRAO;
  const hoje = opcoes.hoje ?? hojeISO();
  const avisos = new Set<string>();
  const aplicavel = { LT: temLT(p), SE: temSE(p) };
  if (!aplicavel.LT && !aplicavel.SE) {
    avisos.add('Escopo elétrico (LT/SE) ainda não identificado: previsão limitada.');
  }
  if (p.statusGeral === 'suspenso' || p.statusGeral === 'adiado') {
    avisos.add(`Empreendimento ${p.statusGeral}: as datas abaixo pressupõem retomada e têm validade reduzida.`);
  }

  const encerrado = p.statusGeral === 'cancelado';
  const cenarios = Object.fromEntries(
    CENARIOS.map((c) => [c, encerrado ? { cenario: c, premissas: ['Empreendimento cancelado — sem previsão.'], datas: {}, rfqPorEscopo: {} } : preverCenario(p, par, hoje, c, avisos)]),
  ) as Record<Cenario, CenarioPrevisao>;

  const janelas: Partial<Record<EventoPrevisao, Janela>> = {};
  for (const k of EVENTOS_PREVISAO) {
    const o = cenarios.otimista.datas[k];
    const b = cenarios.base.datas[k];
    const c = cenarios.conservador.datas[k];
    if (!b) continue;
    const inicio = minData(o?.data, b.data, c?.data)!;
    const fim = maxData(o?.data, b.data, c?.data)!;
    janelas[k] = { inicio, base: b.data, fim, natureza: b.natureza, vencida: !!b.vencida };
  }

  const confianca = avaliarConfianca(p, cenarios.base, { hoje, fontes: opcoes.fontes });
  return {
    empreendimentoId: p.id,
    calculadoEm: hoje,
    parametrosVersao: par.versao,
    assinaturaEntrada: assinaturaEntradaPrevisao(p, par),
    aplicavel,
    cenarios,
    janelas,
    proximoMarco: proximoMarco(p, cenarios.base, hoje),
    necessidadeComercial: classificarNecessidade(p, cenarios.base, hoje, aplicavel),
    confianca,
    avisos: [...avisos],
  };
}

/** Data de demanda (início da janela de contratação, cenário escolhido) para agregações por horizonte. */
export function dataDemanda(prev: PrevisaoEmpreendimento, cenario: Cenario = 'base'): DataPrevista | undefined {
  const d = prev.cenarios[cenario].datas;
  if (d.assinaturaContrato?.natureza === 'realizado') return undefined;
  return d.rfq ?? d.assinaturaContrato;
}
