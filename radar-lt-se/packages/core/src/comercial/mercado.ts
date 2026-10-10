/**
 * Mercado endereçável — oportunidade estimada de SERVIÇOS DE CONSTRUÇÃO/MONTAGEM.
 *
 * Distingue sempre três grandezas:
 *  - CAPEX total do empreendimento (ex.: mina, planta, usina inteira) — NÃO é endereçável;
 *  - investimento em infraestrutura elétrica (LT/SE) — declarado ou estimado;
 *  - oportunidade de serviços de construção — fração do investimento elétrico que
 *    corresponde a montagem, obras civis, lançamento de cabos, estruturas e comissionamento.
 *
 * O resultado é sempre uma FAIXA com método e premissas explícitos.
 */
import { ROTULO_FASE_CONTRATACAO } from '../constantes.js';
import { PARAMETROS_MERCADO_PADRAO, type Faixa, type ParametrosMercado } from '../config/parametros.js';
import { extensaoTotalKm, faseContratacaoConstrucao, tensaoMaxKv, temLT, temSE } from '../projetos/derivados.js';
import type { Empreendimento } from '../tipos.js';

export type MetodoMercado = 'contratado' | 'percentual_capex_eletrico' | 'parametrico_fisico' | 'nao_estimavel';

export const ROTULO_METODO_MERCADO: Record<MetodoMercado, string> = {
  contratado: 'Serviços já contratados',
  percentual_capex_eletrico: '% do investimento elétrico declarado',
  parametrico_fisico: 'Paramétrico (km de LT e subestações)',
  nao_estimavel: 'Não estimável com os dados disponíveis',
};

export interface EstimativaMercado {
  metodo: MetodoMercado;
  /** Faixa de oportunidade de serviços de construção ainda não contratados (R$). */
  faixa?: Faixa;
  central?: number;
  porEscopo: { LT?: Faixa; SE?: Faixa };
  jaContratado: { LT: boolean; SE: boolean };
  capexTotalBRL?: number;
  capexInfraEletricaBRL?: number;
  memoria: string[];
  premissas: string[];
  avisos: string[];
  premissaIlustrativa: boolean;
}

const brl = (v: number) =>
  v >= 1e9 ? `R$ ${(v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`
    : v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
      : `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function classeTensaoLT(kv: number, corrente: 'CA' | 'CC' = 'CA'): string {
  if (corrente === 'CC') return kv <= 650 ? '600CC' : '800CC';
  if (kv <= 150) return '138';
  if (kv <= 260) return '230';
  if (kv <= 380) return '345';
  if (kv <= 470) return '440';
  if (kv <= 510) return '500';
  return '525';
}

export function classeTensaoSE(kv: number): string {
  const c = classeTensaoLT(kv);
  return c === '525' ? '500' : c;
}

function somar(a: Faixa | undefined, b: Faixa): Faixa {
  return a ? [a[0] + b[0], a[1] + b[1]] : b;
}

function parametricoLT(p: Empreendimento, par: ParametrosMercado, memoria: string[], avisos: string[]): Faixa | undefined {
  const trechos = p.trechosLT.filter((t) => t.extensaoKm);
  let total: Faixa | undefined;
  if (trechos.length) {
    for (const t of trechos) {
      const classe = classeTensaoLT(t.tensaoKv, t.corrente);
      const ref = par.servicosLTporKm[classe];
      if (!ref) {
        avisos.push(`Sem referência paramétrica para LT classe ${classe}.`);
        continue;
      }
      const f: Faixa = [t.extensaoKm! * ref[0], t.extensaoKm! * ref[1]];
      memoria.push(`LT ${t.nome}: ${t.extensaoKm} km × ${brl(ref[0])}–${brl(ref[1])}/km (classe ${classe}) = ${brl(f[0])}–${brl(f[1])}`);
      total = somar(total, f);
    }
    return total;
  }
  const km = extensaoTotalKm(p);
  const kv = tensaoMaxKv(p);
  if (km && kv) {
    const classe = classeTensaoLT(kv);
    const ref = par.servicosLTporKm[classe];
    if (ref) {
      const f: Faixa = [km * ref[0], km * ref[1]];
      memoria.push(`LT (resumo): ${km} km × ${brl(ref[0])}–${brl(ref[1])}/km (classe ${classe}) = ${brl(f[0])}–${brl(f[1])}`);
      return f;
    }
  }
  avisos.push('LT sem extensão e/ou tensão informadas: parcela de LT não estimada.');
  return undefined;
}

function parametricoSE(p: Empreendimento, par: ParametrosMercado, memoria: string[], avisos: string[]): Faixa | undefined {
  let total: Faixa | undefined;
  if (p.subestacoes.length) {
    for (const se of p.subestacoes) {
      const classe = classeTensaoSE(Math.max(...se.tensoesKv));
      const ref = par.servicosSE[se.natureza]?.[classe];
      if (!ref) {
        avisos.push(`Sem referência paramétrica para SE ${se.natureza} classe ${classe}.`);
        continue;
      }
      memoria.push(`SE ${se.nome} (${se.natureza}, ${classe} kV): ${brl(ref[0])}–${brl(ref[1])}`);
      total = somar(total, ref);
    }
    return total;
  }
  const qtd = p.tecnico.qtdSubestacoes;
  const kv = tensaoMaxKv(p);
  if (qtd && kv) {
    const classe = classeTensaoSE(kv);
    const ref = par.servicosSE.nova[classe];
    if (ref) {
      const f: Faixa = [qtd * ref[0], qtd * ref[1]];
      memoria.push(`SE (resumo): ${qtd} × ${brl(ref[0])}–${brl(ref[1])} (assumidas novas, classe ${classe} kV) = ${brl(f[0])}–${brl(f[1])}`);
      avisos.push('Natureza das subestações não informada: assumidas subestações novas (tende a superestimar ampliações).');
      return f;
    }
  }
  avisos.push('Subestações sem tensão/quantidade informadas: parcela de SE não estimada.');
  return undefined;
}

export function estimarMercado(p: Empreendimento, par: ParametrosMercado = PARAMETROS_MERCADO_PADRAO): EstimativaMercado {
  const memoria: string[] = [];
  const premissas: string[] = [];
  const avisos: string[] = [];
  const aplicavel = { LT: temLT(p), SE: temSE(p) };
  const faseLT = faseContratacaoConstrucao(p, 'LT');
  const faseSE = faseContratacaoConstrucao(p, 'SE');
  const jaContratado = {
    LT: aplicavel.LT && (faseLT === 'contratada' || faseLT === 'adjudicada'),
    SE: aplicavel.SE && (faseSE === 'contratada' || faseSE === 'adjudicada'),
  };
  const capexTotalBRL = p.financeiro.capexTotal?.valorBRL;
  const capexInfraEletricaBRL = p.financeiro.capexInfraEletrica?.valorBRL;
  const base = { jaContratado, capexTotalBRL, capexInfraEletricaBRL, premissaIlustrativa: par.premissaIlustrativa };

  if (capexTotalBRL && !capexInfraEletricaBRL) {
    memoria.push(`CAPEX total declarado (${brl(capexTotalBRL)}) refere-se ao empreendimento inteiro e não é usado como mercado endereçável.`);
  }
  const pendentes = (['LT', 'SE'] as const).filter((e) => aplicavel[e] && !jaContratado[e]);
  if (!aplicavel.LT && !aplicavel.SE) {
    return { ...base, metodo: 'nao_estimavel', porEscopo: {}, memoria, premissas, avisos: ['Escopo elétrico (LT/SE) não identificado.'] };
  }
  if (!pendentes.length) {
    memoria.push(`Construção já contratada (LT: ${ROTULO_FASE_CONTRATACAO[faseLT]}; SE: ${ROTULO_FASE_CONTRATACAO[faseSE]}).`);
    return { ...base, metodo: 'contratado', faixa: [0, 0], central: 0, porEscopo: {}, memoria, premissas, avisos };
  }

  // Referência física (usada como método principal ou para dividir o CAPEX elétrico entre LT e SE)
  const memFis: string[] = [];
  const avFis: string[] = [];
  const fisLT = aplicavel.LT ? parametricoLT(p, par, memFis, avFis) : undefined;
  const fisSE = aplicavel.SE ? parametricoSE(p, par, memFis, avFis) : undefined;

  const porEscopo: EstimativaMercado['porEscopo'] = {};
  let metodo: MetodoMercado;
  if (capexInfraEletricaBRL) {
    metodo = 'percentual_capex_eletrico';
    premissas.push(
      `Participação de serviços de construção: LT ${pct(par.participacaoServicosLT[0])}–${pct(par.participacaoServicosLT[1])}; SE ${pct(par.participacaoServicosSE[0])}–${pct(par.participacaoServicosSE[1])} do investimento elétrico.`,
    );
    let pesoLT = aplicavel.LT ? 1 : 0;
    let pesoSE = aplicavel.SE ? 1 : 0;
    if (aplicavel.LT && aplicavel.SE) {
      if (fisLT && fisSE) {
        const mLT = (fisLT[0] + fisLT[1]) / 2;
        const mSE = (fisSE[0] + fisSE[1]) / 2;
        pesoLT = mLT / (mLT + mSE);
        pesoSE = 1 - pesoLT;
        premissas.push(`Divisão do investimento elétrico entre LT (${pct(pesoLT)}) e SE (${pct(pesoSE)}) proporcional à referência paramétrica.`);
      } else {
        pesoLT = pesoSE = 0.5;
        avisos.push('Divisão LT/SE do investimento elétrico desconhecida: assumido 50%/50% (faixa larga).');
      }
    }
    memoria.push(`Investimento em infraestrutura elétrica declarado: ${brl(capexInfraEletricaBRL)}.`);
    if (pendentes.includes('LT') && pesoLT) {
      porEscopo.LT = [capexInfraEletricaBRL * pesoLT * par.participacaoServicosLT[0], capexInfraEletricaBRL * pesoLT * par.participacaoServicosLT[1]];
      memoria.push(`LT: ${brl(capexInfraEletricaBRL)} × ${pct(pesoLT)} × ${pct(par.participacaoServicosLT[0])}–${pct(par.participacaoServicosLT[1])} = ${brl(porEscopo.LT[0])}–${brl(porEscopo.LT[1])}`);
    }
    if (pendentes.includes('SE') && pesoSE) {
      porEscopo.SE = [capexInfraEletricaBRL * pesoSE * par.participacaoServicosSE[0], capexInfraEletricaBRL * pesoSE * par.participacaoServicosSE[1]];
      memoria.push(`SE: ${brl(capexInfraEletricaBRL)} × ${pct(pesoSE)} × ${pct(par.participacaoServicosSE[0])}–${pct(par.participacaoServicosSE[1])} = ${brl(porEscopo.SE[0])}–${brl(porEscopo.SE[1])}`);
    }
  } else if ((pendentes.includes('LT') && fisLT) || (pendentes.includes('SE') && fisSE)) {
    metodo = 'parametrico_fisico';
    premissas.push('Referências paramétricas de serviços de construção por km de LT e por subestação (Configurações → Mercado).');
    memoria.push(...memFis);
    avisos.push(...avFis);
    if (pendentes.includes('LT') && fisLT) porEscopo.LT = fisLT;
    if (pendentes.includes('SE') && fisSE) porEscopo.SE = fisSE;
  } else {
    avisos.push(...avFis);
    return { ...base, metodo: 'nao_estimavel', porEscopo: {}, memoria, premissas, avisos };
  }

  for (const e of ['LT', 'SE'] as const) {
    if (jaContratado[e]) memoria.push(`${e}: serviços de construção já contratados — excluídos da oportunidade.`);
  }
  const faixa: Faixa = [(porEscopo.LT?.[0] ?? 0) + (porEscopo.SE?.[0] ?? 0), (porEscopo.LT?.[1] ?? 0) + (porEscopo.SE?.[1] ?? 0)];
  if (par.premissaIlustrativa) {
    avisos.push('Parâmetros de mercado ilustrativos (padrão da plataforma): substituir pela base de custos da empresa.');
  }
  return { ...base, metodo, faixa, central: (faixa[0] + faixa[1]) / 2, porEscopo, memoria, premissas, avisos };
}
