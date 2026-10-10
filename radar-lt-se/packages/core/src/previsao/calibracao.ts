/**
 * Calibração das premissas de prazo a partir de resultados observados na própria base.
 *
 * Para cada parâmetro calibrável, procura empreendimentos em que AMBOS os marcos do
 * intervalo foram realizados (com data) e mede o intervalo em meses. Com amostra
 * suficiente (n ≥ mínimo), propõe [P20, P50, P80] como [otimista, base, conservador].
 * A proposta nunca é aplicada automaticamente: é exibida para revisão em Configurações.
 */
import type { TipoMarco } from '../constantes.js';
import type { ParametrosPrevisao, TriploMeses } from '../config/parametros.js';
import { diferencaMeses } from '../util/datas.js';
import type { Empreendimento, OportunidadeComercial } from '../tipos.js';

type ParametroCalibravel = Extract<
  keyof ParametrosPrevisao,
  'leilaoParaAssinatura' | 'outorgaParaRfqLT' | 'outorgaParaRfqSE' | 'outorgaParaLI' | 'rfqParaContrato' | 'contratoParaMobilizacao' | 'liParaMobilizacao' | 'mobilizacaoParaObras' | 'editalParaLeilao' | 'anuncioParaFID' | 'fidParaRfq'
>;

const INTERVALOS: { parametro: ParametroCalibravel; de: TipoMarco[]; ate: TipoMarco[]; escopo?: 'LT' | 'SE' }[] = [
  { parametro: 'editalParaLeilao', de: ['edital_publicado'], ate: ['leilao_realizado'] },
  { parametro: 'leilaoParaAssinatura', de: ['leilao_realizado'], ate: ['contrato_concessao_assinado'] },
  { parametro: 'outorgaParaRfqLT', de: ['contrato_concessao_assinado', 'autorizacao_publicada'], ate: ['rfq_publicada'], escopo: 'LT' },
  { parametro: 'outorgaParaRfqSE', de: ['contrato_concessao_assinado', 'autorizacao_publicada'], ate: ['rfq_publicada'], escopo: 'SE' },
  { parametro: 'outorgaParaLI', de: ['contrato_concessao_assinado', 'autorizacao_publicada'], ate: ['licenca_instalacao'] },
  { parametro: 'anuncioParaFID', de: ['anuncio'], ate: ['decisao_final_investimento'] },
  { parametro: 'fidParaRfq', de: ['decisao_final_investimento'], ate: ['rfq_publicada'] },
  { parametro: 'rfqParaContrato', de: ['rfq_publicada'], ate: ['contrato_execucao_assinado'] },
  { parametro: 'contratoParaMobilizacao', de: ['contrato_execucao_assinado'], ate: ['mobilizacao'] },
  { parametro: 'liParaMobilizacao', de: ['licenca_instalacao'], ate: ['mobilizacao'] },
  { parametro: 'mobilizacaoParaObras', de: ['mobilizacao'], ate: ['inicio_obras'] },
];

export interface Observacao {
  parametro: ParametroCalibravel;
  empreendimentoId: string;
  meses: number;
}

export function extrairObservacoes(projetos: Empreendimento[], incluirDemo = false): Observacao[] {
  const obs: Observacao[] = [];
  for (const p of projetos) {
    if (p.demo && !incluirDemo) continue;
    for (const it of INTERVALOS) {
      const filtra = (tipos: TipoMarco[]) =>
        p.marcos
          .filter((m) => m.natureza === 'realizado' && tipos.includes(m.tipo))
          .filter((m) => !it.escopo || m.escopo === it.escopo || m.escopo === 'geral')
          .sort((a, b) => (a.data < b.data ? -1 : 1))[0];
      const a = filtra(it.de);
      const b = filtra(it.ate);
      if (a && b && b.data >= a.data) {
        obs.push({ parametro: it.parametro, empreendimentoId: p.id, meses: Math.round(diferencaMeses(a.data, b.data) * 10) / 10 });
      }
    }
  }
  return obs;
}

function quantil(ordenados: number[], q: number): number {
  const pos = (ordenados.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  const prox = ordenados[base + 1] ?? ordenados[base];
  return ordenados[base] + resto * (prox - ordenados[base]);
}

export interface PropostaCalibracao {
  parametro: ParametroCalibravel;
  amostra: number;
  atual: TriploMeses;
  proposto?: TriploMeses;
  situacao: 'calibravel' | 'amostra_insuficiente';
  observacao: string;
}

export function proporCalibracao(
  projetos: Empreendimento[],
  parametros: ParametrosPrevisao,
  opcoes: { amostraMinima?: number; incluirDemo?: boolean } = {},
): PropostaCalibracao[] {
  const minimo = opcoes.amostraMinima ?? 8;
  const obs = extrairObservacoes(projetos, opcoes.incluirDemo);
  return INTERVALOS.map(({ parametro }) => {
    const valores = obs.filter((o) => o.parametro === parametro).map((o) => o.meses).sort((a, b) => a - b);
    const atual = parametros[parametro] as TriploMeses;
    if (valores.length < minimo) {
      return {
        parametro,
        amostra: valores.length,
        atual,
        situacao: 'amostra_insuficiente' as const,
        observacao: `Amostra insuficiente (${valores.length} de ${minimo} observações mínimas). Mantidas as premissas atuais.`,
      };
    }
    const r = (x: number) => Math.round(x * 2) / 2;
    const proposto: TriploMeses = [r(quantil(valores, 0.2)), r(quantil(valores, 0.5)), r(quantil(valores, 0.8))];
    return {
      parametro,
      amostra: valores.length,
      atual,
      proposto,
      situacao: 'calibravel' as const,
      observacao: `P20/P50/P80 de ${valores.length} intervalos observados na base (empreendimentos não demonstrativos).`,
    };
  });
}

export interface AvaliacaoPriorizacao {
  faixa: 'alta' | 'media' | 'baixa';
  oportunidades: number;
  ganhas: number;
  perdidas: number;
  declinadas: number;
  taxaSucesso?: number;
}

/**
 * Compara a faixa de prioridade atribuída com o resultado comercial observado.
 * Serve para revisar pesos do score — não transforma o score em probabilidade.
 */
export function avaliarPriorizacao(
  oportunidades: OportunidadeComercial[],
  faixaPorEmpreendimento: Map<string, 'alta' | 'media' | 'baixa'>,
): { faixas: AvaliacaoPriorizacao[]; amostraSuficiente: boolean; observacao: string } {
  const faixas: AvaliacaoPriorizacao[] = (['alta', 'media', 'baixa'] as const).map((faixa) => {
    const ops = oportunidades.filter((o) => o.resultado && !o.demo && faixaPorEmpreendimento.get(o.empreendimentoId) === faixa);
    const ganhas = ops.filter((o) => o.resultado!.status === 'ganha').length;
    const perdidas = ops.filter((o) => o.resultado!.status === 'perdida').length;
    const declinadas = ops.filter((o) => o.resultado!.status === 'declinada').length;
    const disputadas = ganhas + perdidas;
    return { faixa, oportunidades: ops.length, ganhas, perdidas, declinadas, taxaSucesso: disputadas ? ganhas / disputadas : undefined };
  });
  const total = faixas.reduce((s, f) => s + f.ganhas + f.perdidas, 0);
  const amostraSuficiente = total >= 20;
  return {
    faixas,
    amostraSuficiente,
    observacao: amostraSuficiente
      ? 'Use a diferença de desempenho entre faixas para revisar pesos do índice.'
      : `Apenas ${total} oportunidades disputadas com resultado registrado; mínimo recomendado de 20 antes de recalibrar pesos.`,
  };
}
