/**
 * Detecção de mudanças relevantes entre duas versões de um empreendimento e
 * avaliação das regras de alerta configuradas pelos usuários.
 */
import {
  FASES_COTACAO_ABERTA, ORDEM_FASE_CONTRATACAO, PACOTES_CONSTRUCAO, PAPEIS_EXECUCAO, ROTULO_EVENTO,
  ROTULO_FASE_CONTRATACAO, ROTULO_MARCO, ROTULO_PACOTE, ROTULO_STATUS_GERAL, type TipoEvento, type TipoMarco,
} from '../constantes.js';
import { ETAPAS_PADRAO, type EtapaDef } from '../config/etapas.js';
import { regioesDasUFs } from '../normalizacao/index.js';
import { etapaAtual, tensaoMaxKv } from '../projetos/derivados.js';
import { diferencaDias, formatarDataBR } from '../util/datas.js';
import { novoId } from '../util/ids.js';
import type { AlertaRegra, Empreendimento, EventoMudanca } from '../tipos.js';
import type { PrevisaoEmpreendimento } from '../previsao/tipos.js';

const EVENTO_POR_MARCO: Partial<Record<TipoMarco, TipoEvento>> = {
  edital_publicado: 'edital_publicado',
  leilao_realizado: 'leilao_realizado',
  vencedor_definido: 'vencedor_definido',
  contrato_concessao_assinado: 'concessao_assinada',
  autorizacao_publicada: 'concessao_assinada',
  decisao_final_investimento: 'concessao_assinada',
  licenca_previa: 'licenca_emitida',
  licenca_instalacao: 'licenca_emitida',
  licenca_operacao: 'licenca_emitida',
  rfq_publicada: 'cotacao_aberta',
  propostas_recebidas: 'cotacao_aberta',
  contrato_execucao_assinado: 'contrato_execucao_assinado',
  suspensao: 'suspensao',
  cancelamento: 'cancelamento',
};

const RELEVANCIA: Record<TipoEvento, EventoMudanca['relevancia']> = {
  novo_empreendimento: 'media',
  edital_publicado: 'alta',
  leilao_realizado: 'alta',
  vencedor_definido: 'alta',
  concessao_assinada: 'alta',
  contrato_execucao_assinado: 'alta',
  licenca_emitida: 'alta',
  revisao_cronograma: 'media',
  atraso: 'alta',
  cotacao_aberta: 'alta',
  suspensao: 'alta',
  cancelamento: 'alta',
  mudanca_etapa: 'media',
  mudanca_valor: 'media',
  contratada_identificada: 'alta',
  conflito_fontes: 'baixa',
  janela_contratacao_proxima: 'alta',
};

/** Atraso (em dias) a partir do qual uma revisão de cronograma também gera evento de "atraso". */
export const LIMIAR_ATRASO_DIAS = 60;

export function detectarMudancas(
  antes: Empreendimento | null,
  depois: Empreendimento,
  opcoes: { agora?: string; etapas?: EtapaDef[]; nomeOrganizacao?: (id: string) => string | undefined } = {},
): EventoMudanca[] {
  const agora = opcoes.agora ?? new Date().toISOString();
  const eventos: EventoMudanca[] = [];
  const add = (tipo: TipoEvento, titulo: string, descricao: string, dados: Record<string, unknown> = {}, evidenciaIds: string[] = []) =>
    eventos.push({
      id: novoId('evt'),
      empreendimentoId: depois.id,
      tipo,
      titulo,
      descricao,
      em: agora,
      relevancia: RELEVANCIA[tipo],
      dados,
      evidenciaIds,
      demo: depois.demo,
    });

  if (!antes) {
    add('novo_empreendimento', `Novo empreendimento: ${depois.nomeOficial}`, `Empreendimento identificado e incluído no cadastro mestre.`, {}, depois.evidencias.slice(0, 3).map((e) => e.id));
  }
  const marcosAntes = antes?.marcos ?? [];

  for (const m of depois.marcos) {
    const anterior = marcosAntes.find((x) => x.tipo === m.tipo && x.escopo === m.escopo);
    const tipoEv = EVENTO_POR_MARCO[m.tipo];
    if (m.natureza === 'realizado' && tipoEv && (!anterior || anterior.natureza !== 'realizado')) {
      if (antes) {
        add(tipoEv, `${ROTULO_MARCO[m.tipo]} — ${depois.nomeOficial}`, `${ROTULO_MARCO[m.tipo]}${m.escopo !== 'geral' ? ` (${m.escopo})` : ''} em ${formatarDataBR(m.data)}.`, { marco: m.tipo, data: m.data }, m.evidenciaIds);
      }
      continue;
    }
    if (anterior && anterior.natureza !== 'realizado' && m.natureza !== 'realizado' && anterior.data !== m.data) {
      const delta = diferencaDias(anterior.data, m.data);
      add(
        'revisao_cronograma',
        `Revisão de cronograma — ${depois.nomeOficial}`,
        `${ROTULO_MARCO[m.tipo]}: ${formatarDataBR(anterior.data)} → ${formatarDataBR(m.data)} (${delta > 0 ? '+' : ''}${delta} dias).`,
        { marco: m.tipo, de: anterior.data, para: m.data, deltaDias: delta },
        m.evidenciaIds,
      );
      if (delta >= LIMIAR_ATRASO_DIAS) {
        add('atraso', `Atraso — ${depois.nomeOficial}`, `${ROTULO_MARCO[m.tipo]} adiado em ${delta} dias.`, { marco: m.tipo, deltaDias: delta }, m.evidenciaIds);
      }
    }
  }

  if (antes) {
    // Pacotes de contratação
    for (const pk of depois.pacotes) {
      const ant = antes.pacotes.find((x) => x.pacote === pk.pacote && x.escopo === pk.escopo);
      if (ant?.faseContratacao === pk.faseContratacao) continue;
      const construcao = PACOTES_CONSTRUCAO.includes(pk.pacote);
      const desc = `${ROTULO_PACOTE[pk.pacote]} (${pk.escopo}): ${ant ? ROTULO_FASE_CONTRATACAO[ant.faseContratacao] + ' → ' : ''}${ROTULO_FASE_CONTRATACAO[pk.faseContratacao]}.`;
      if (FASES_COTACAO_ABERTA.includes(pk.faseContratacao) && (!ant || !FASES_COTACAO_ABERTA.includes(ant.faseContratacao))) {
        add('cotacao_aberta', `Cotação aberta — ${depois.nomeOficial}`, desc, { pacote: pk.pacote, escopo: pk.escopo }, pk.evidenciaIds);
      } else if (construcao && ORDEM_FASE_CONTRATACAO[pk.faseContratacao] >= ORDEM_FASE_CONTRATACAO.adjudicada && (!ant || ORDEM_FASE_CONTRATACAO[ant.faseContratacao] < ORDEM_FASE_CONTRATACAO.adjudicada)) {
        add('contrato_execucao_assinado', `Contratação de obra — ${depois.nomeOficial}`, desc, { pacote: pk.pacote, escopo: pk.escopo }, pk.evidenciaIds);
      }
    }
    // Executor/EPC identificado
    for (const part of depois.participantes.filter((x) => PAPEIS_EXECUCAO.includes(x.papel))) {
      if (!antes.participantes.some((x) => x.organizacaoId === part.organizacaoId && x.papel === part.papel)) {
        const nome = opcoes.nomeOrganizacao?.(part.organizacaoId) ?? part.organizacaoId;
        add('contratada_identificada', `EPC/executor identificado — ${depois.nomeOficial}`, `${nome} identificado como ${part.papel.replace('_', ' ')}.`, { organizacaoId: part.organizacaoId }, part.evidenciaIds);
      }
    }
    // Status geral
    if (antes.statusGeral !== depois.statusGeral) {
      const tipo: TipoEvento | undefined = depois.statusGeral === 'suspenso' || depois.statusGeral === 'adiado' ? 'suspensao' : depois.statusGeral === 'cancelado' ? 'cancelamento' : undefined;
      if (tipo) {
        add(tipo, `${ROTULO_STATUS_GERAL[depois.statusGeral]} — ${depois.nomeOficial}`, `Status: ${ROTULO_STATUS_GERAL[antes.statusGeral]} → ${ROTULO_STATUS_GERAL[depois.statusGeral]}.`);
      } else {
        add('mudanca_etapa', `Status alterado — ${depois.nomeOficial}`, `Status: ${ROTULO_STATUS_GERAL[antes.statusGeral]} → ${ROTULO_STATUS_GERAL[depois.statusGeral]}.`);
      }
    }
    // Etapa de maturidade
    const etapas = opcoes.etapas ?? ETAPAS_PADRAO;
    const eA = etapaAtual(antes, etapas);
    const eD = etapaAtual(depois, etapas);
    if (eD && eA?.id !== eD.id) {
      add('mudanca_etapa', `Mudança de etapa — ${depois.nomeOficial}`, `${eA ? eA.nome : 'Sem etapa'} → ${eD.nome}.`, { de: eA?.id, para: eD.id });
    }
    // Valores
    const vA = antes.financeiro.capexInfraEletrica?.valorBRL ?? antes.financeiro.capexTotal?.valorBRL;
    const vD = depois.financeiro.capexInfraEletrica?.valorBRL ?? depois.financeiro.capexTotal?.valorBRL;
    if (vA && vD && Math.abs(vA - vD) / vA > 0.1) {
      add('mudanca_valor', `Mudança de investimento — ${depois.nomeOficial}`, `Investimento de referência alterado em ${Math.round(((vD - vA) / vA) * 100)}%.`, { de: vA, para: vD });
    }
    // Conflitos novos
    const novosConflitos = depois.conflitos.filter((c) => c.status === 'aberto' && !antes.conflitos.some((x) => x.id === c.id));
    if (novosConflitos.length) {
      add('conflito_fontes', `Divergência entre fontes — ${depois.nomeOficial}`, `Campos: ${novosConflitos.map((c) => c.campo).join(', ')}.`, { conflitos: novosConflitos.map((c) => c.id) });
    }
  }
  return eventos;
}

const ORDEM_RELEVANCIA = { baixa: 0, media: 1, alta: 2 } as const;

/** Verifica se uma regra de alerta se aplica a um evento. */
export function regraAplica(
  regra: AlertaRegra,
  evento: EventoMudanca,
  projeto: Empreendimento,
  previsao?: PrevisaoEmpreendimento,
  hoje: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (!regra.ativo) return false;
  const f = regra.filtros;
  if (f.tiposEvento?.length && !f.tiposEvento.includes(evento.tipo)) return false;
  if (f.relevanciaMinima && ORDEM_RELEVANCIA[evento.relevancia] < ORDEM_RELEVANCIA[f.relevanciaMinima]) return false;
  if (f.empreendimentoIds?.length && !f.empreendimentoIds.includes(projeto.id)) return false;
  if (f.organizacaoIds?.length && !projeto.participantes.some((x) => f.organizacaoIds!.includes(x.organizacaoId))) return false;
  if (f.setores?.length && !f.setores.includes(projeto.setorOrigem)) return false;
  if (f.ufs?.length && !projeto.localizacao.ufs.some((u) => f.ufs!.includes(u))) return false;
  if (f.regioes?.length && !regioesDasUFs(projeto.localizacao.ufs).some((r) => f.regioes!.includes(r))) return false;
  if (f.tensaoMinKv !== undefined) {
    const kv = tensaoMaxKv(projeto);
    if (kv === undefined || kv < f.tensaoMinKv) return false;
  }
  if (f.janelaContratacaoMeses !== undefined) {
    const rfq = previsao?.cenarios.base.datas.rfq;
    if (!rfq || rfq.natureza === 'realizado') {
      if (!(rfq?.natureza === 'realizado' && previsao?.necessidadeComercial.classe === 'imediata')) return false;
    } else if (diferencaDias(hoje, rfq.data) / 30.44 > f.janelaContratacaoMeses) return false;
  }
  return true;
}

/**
 * Evento sintético "janela de contratação próxima": gerado quando a janela base de RFQ entra
 * no horizonte informado (útil para a rotina diária de alertas).
 */
export function eventoJanelaProxima(projeto: Empreendimento, previsao: PrevisaoEmpreendimento, horizonteMeses: number, agora: string): EventoMudanca | undefined {
  const rfq = previsao.cenarios.base.datas.rfq;
  if (!rfq || rfq.natureza === 'realizado' || rfq.vencida) return undefined;
  const meses = diferencaDias(agora.slice(0, 10), rfq.data) / 30.44;
  if (meses < 0 || meses > horizonteMeses) return undefined;
  return {
    id: novoId('evt'),
    empreendimentoId: projeto.id,
    tipo: 'janela_contratacao_proxima',
    titulo: `${ROTULO_EVENTO.janela_contratacao_proxima} — ${projeto.nomeOficial}`,
    descricao: `RFQ/RFP estimada para ${formatarDataBR(rfq.data)} (cenário base, ${rfq.natureza === 'divulgado' ? 'data divulgada' : 'estimativa'}).`,
    em: agora,
    relevancia: 'alta',
    dados: { data: rfq.data, natureza: rfq.natureza, horizonteMeses },
    evidenciaIds: rfq.evidenciaIds,
    demo: projeto.demo,
  };
}
