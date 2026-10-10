/**
 * Resumo executivo de um empreendimento. Sempre há uma versão determinística (montada a partir
 * dos dados estruturados, com referências às evidências). Opcionalmente, um LLM redige o texto
 * a partir dos MESMOS fatos — e as evidências citadas são verificadas contra a lista fornecida.
 */
import {
  ROTULO_EVENTO_PREVISAO, ROTULO_FASE_CONTRATACAO, ROTULO_MARCO, ROTULO_NATUREZA_DATA, ROTULO_NECESSIDADE,
  ROTULO_NIVEL_CONFIANCA, ROTULO_SITUACAO_OBRA, formatarDataBR, justificativaPriorizacao,
  type Empreendimento, type Organizacao, type VisaoEmpreendimento,
} from '@radar/core';
import { resumirComLLM, type OpcoesLLM } from './llm.js';

export interface ResumoExecutivo {
  metodo: 'deterministico' | 'llm';
  modelo?: string;
  paragrafos: { texto: string; evidencias: string[] }[];
  acaoRecomendada?: { texto: string; evidencias: string[] };
  ressalvas: string[];
  geradoEm: string;
}

const brl = (v?: number) => (v === undefined ? 'n/d' : `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mi`);

/** Fatos estruturados com ids de evidência — base comum do resumo determinístico e do LLM. */
export function fatosDoEmpreendimento(p: Empreendimento, v: VisaoEmpreendimento, orgs: Map<string, Organizacao>): { linhas: string[]; idsValidos: Set<string> } {
  const linhas: string[] = [];
  const ids = new Set(p.evidencias.map((e) => e.id));
  linhas.push(`EMPREENDIMENTO: ${p.nomeOficial} (${p.codigo}); tipo ${p.tipo}; setor ${p.setorOrigem}; UF ${p.localizacao.ufs.join(', ') || 'n/d'}; status ${p.statusGeral}.`);
  linhas.push(`TÉCNICO: tensão máx. ${v.tensaoMaxKv ?? 'n/d'} kV; extensão ${v.extensaoKm ?? 'n/d'} km; subestações ${v.qtdSubestacoes}.`);
  for (const part of p.participantes) linhas.push(`PARTICIPANTE: ${orgs.get(part.organizacaoId)?.nome ?? part.organizacaoId} — ${part.papel} [${part.evidenciaIds.join(', ')}]`);
  for (const m of [...p.marcos].sort((a, b) => (a.data < b.data ? -1 : 1))) {
    linhas.push(`MARCO: ${ROTULO_MARCO[m.tipo]}${m.escopo !== 'geral' ? ` (${m.escopo})` : ''} — ${formatarDataBR(m.data)} — ${m.natureza} [${m.evidenciaIds.join(', ')}]`);
  }
  linhas.push(`CONTRATAÇÃO DE OBRA: LT ${ROTULO_FASE_CONTRATACAO[v.fase.LT]}; SE ${ROTULO_FASE_CONTRATACAO[v.fase.SE]}; executor identificado: ${v.executorIdentificado ? 'sim' : 'não'}; situação da obra: ${ROTULO_SITUACAO_OBRA[v.situacaoObra]}.`);
  const base = v.previsao.cenarios.base.datas;
  for (const k of ['rfq', 'assinaturaContrato', 'mobilizacao', 'energizacao'] as const) {
    const d = base[k];
    if (d) linhas.push(`ESTIMATIVA DA PLATAFORMA (cenário base): ${ROTULO_EVENTO_PREVISAO[k]} — ${formatarDataBR(d.data)} — ${ROTULO_NATUREZA_DATA[d.natureza]}${d.vencida ? ' (janela vencida sem evidência)' : ''} — janela ${formatarDataBR(v.previsao.janelas[k]?.inicio)} a ${formatarDataBR(v.previsao.janelas[k]?.fim)}`);
  }
  linhas.push(`NECESSIDADE COMERCIAL (estimativa): ${ROTULO_NECESSIDADE[v.previsao.necessidadeComercial.classe]} — ${v.previsao.necessidadeComercial.descricao}`);
  linhas.push(`CONFIANÇA DA PREVISÃO: ${ROTULO_NIVEL_CONFIANCA[v.previsao.confianca.nivel]} (${v.previsao.confianca.pontos}/${v.previsao.confianca.maximo}).`);
  linhas.push(`OPORTUNIDADE DE SERVIÇOS (estimativa, método ${v.mercado.metodo}): ${v.mercado.faixa ? `${brl(v.mercado.faixa[0])} a ${brl(v.mercado.faixa[1])}` : 'não estimável'}; CAPEX total declarado ${brl(v.mercado.capexTotalBRL)} (não endereçável).`);
  linhas.push(`PRIORIDADE (índice, não é probabilidade): ${v.score.indice}/100 — ${v.score.faixa}.`);
  for (const c of p.conflitos.filter((x) => x.status === 'aberto')) linhas.push(`CONFLITO ABERTO: campo ${c.campo}; valores ${c.valores.map((x) => JSON.stringify(x.valor)).join(' × ')}.`);
  for (const a of v.previsao.avisos) linhas.push(`AVISO: ${a}`);
  return { linhas, idsValidos: ids };
}

export function resumoDeterministico(p: Empreendimento, v: VisaoEmpreendimento, orgs: Map<string, Organizacao>): ResumoExecutivo {
  const contratante = v.contratanteId ? orgs.get(v.contratanteId)?.nome : undefined;
  const base = v.previsao.cenarios.base.datas;
  const marcoRef = base.rfq?.ancora;
  const paragrafos: ResumoExecutivo['paragrafos'] = [
    {
      texto: `${p.nomeOficial}: ${p.tipo}, ${v.tensaoMaxKv ? `${v.tensaoMaxKv} kV` : 'tensão não informada'}${v.extensaoKm ? `, ${v.extensaoKm} km` : ''}, em ${p.localizacao.ufs.join('/') || 'UF não informada'}. Contratante provável: ${contratante ?? 'não identificado'}.`,
      evidencias: [...new Set(p.participantes.flatMap((x) => x.evidenciaIds))].slice(0, 3),
    },
    {
      texto: base.rfq
        ? `Janela de RFQ/RFP ${base.rfq.natureza === 'realizado' ? 'observada' : 'estimada pela plataforma'} em ${formatarDataBR(base.rfq.data)} (cenário base; janela ${formatarDataBR(v.previsao.janelas.rfq?.inicio)}–${formatarDataBR(v.previsao.janelas.rfq?.fim)}), a partir de ${marcoRef ? `${marcoRef.descricao} em ${formatarDataBR(marcoRef.data)}` : 'premissas'}. Confiança ${ROTULO_NIVEL_CONFIANCA[v.previsao.confianca.nivel].toLowerCase()}.`
        : 'Não há marco que permita estimar a janela de contratação.',
      evidencias: [...new Set(marcoRef?.evidenciaIds ?? [])],
    },
    {
      texto: `Oportunidade de serviços de construção estimada: ${v.mercado.faixa ? `${brl(v.mercado.faixa[0])} a ${brl(v.mercado.faixa[1])}` : 'não estimável'}. ${justificativaPriorizacao(v.score)}`,
      evidencias: [],
    },
  ];
  const n = v.previsao.necessidadeComercial;
  const acao =
    n.classe === 'imediata' ? 'Agir agora: confirmar processo de cotação e solicitar inclusão como proponente.'
      : n.classe === 'verificar' ? 'Verificar com o contratante se a contratação já ocorreu ou foi adiada.'
        : n.classe === 'curto_prazo' ? 'Iniciar relacionamento técnico-comercial e cadastro de fornecedor antes da RFQ.'
          : n.classe === 'medio_prazo' ? 'Monitorar marcos (licenciamento, financiamento) e mapear decisores.'
            : n.classe === 'ja_contratada' ? 'Avaliar subcontratação/pacotes remanescentes com a contratada.'
              : 'Monitorar.';
  return {
    metodo: 'deterministico',
    paragrafos,
    acaoRecomendada: { texto: acao, evidencias: [] },
    ressalvas: [
      ...v.previsao.avisos,
      ...(p.conflitos.some((c) => c.status === 'aberto') ? ['Há divergências entre fontes em aberto.'] : []),
      ...(v.mercado.premissaIlustrativa ? ['Valores de mercado usam parâmetros ilustrativos.'] : []),
      ...(p.demo ? ['DADOS FICTÍCIOS de demonstração.'] : []),
    ],
    geradoEm: new Date().toISOString(),
  };
}

export async function resumoExecutivo(
  p: Empreendimento,
  v: VisaoEmpreendimento,
  orgs: Map<string, Organizacao>,
  llm?: OpcoesLLM & { habilitado: boolean },
): Promise<ResumoExecutivo & { avisos: string[] }> {
  const det = resumoDeterministico(p, v, orgs);
  if (!llm?.habilitado) return { ...det, avisos: ['Resumo determinístico (IA generativa não configurada).'] };
  const { linhas, idsValidos } = fatosDoEmpreendimento(p, v, orgs);
  try {
    const { saida, modelo } = await resumirComLLM(linhas.join('\n'), llm);
    const filtrar = (ids: string[]) => [...new Set(ids)].filter((i) => idsValidos.has(i));
    const invalidos = [...saida.paragrafos.flatMap((x) => x.evidencias), ...saida.acaoRecomendada.evidencias].filter((i) => !idsValidos.has(i));
    return {
      metodo: 'llm',
      modelo,
      paragrafos: saida.paragrafos.map((x) => ({ texto: x.texto, evidencias: filtrar(x.evidencias) })),
      acaoRecomendada: { texto: saida.acaoRecomendada.texto, evidencias: filtrar(saida.acaoRecomendada.evidencias) },
      ressalvas: [...saida.ressalvas, ...(p.demo ? ['DADOS FICTÍCIOS de demonstração.'] : [])],
      geradoEm: new Date().toISOString(),
      avisos: invalidos.length ? [`${invalidos.length} referência(s) de evidência inexistente(s) removida(s) da resposta da IA.`] : [],
    };
  } catch (e) {
    return { ...det, avisos: [`IA indisponível (${(e as Error).message}); exibido resumo determinístico.`] };
  }
}
