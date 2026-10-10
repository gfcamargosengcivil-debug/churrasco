import type { VisaoEmpreendimento } from '@radar/core';
import type { FilaJobs } from '../jobs/fila.js';
import type { Servicos } from '../servicos/dominio.js';
import type { ServicoIngestao } from '../servicos/ingestao.js';

export interface ContextoRotas {
  s: Servicos;
  ing: ServicoIngestao;
  fila: FilaJobs;
}

/** Versão compacta da visão para listas (radar, mapa, funil): sem memórias de cálculo detalhadas. */
export function visaoResumida(v: VisaoEmpreendimento, nomeContratante?: string) {
  const base = v.previsao.cenarios.base.datas;
  return {
    id: v.id,
    codigo: v.codigo,
    nome: v.nome,
    tipo: v.tipo,
    setor: v.setor,
    subsetor: v.subsetor,
    ufs: v.ufs,
    regioes: v.regioes,
    municipios: v.municipios,
    ponto: v.ponto,
    tensaoMaxKv: v.tensaoMaxKv,
    extensaoKm: v.extensaoKm,
    qtdSubestacoes: v.qtdSubestacoes,
    statusGeral: v.statusGeral,
    situacaoObra: v.situacaoObra,
    etapa: v.etapa ? { id: v.etapa.id, nome: v.etapa.nome, ordem: v.etapa.ordem } : undefined,
    fase: v.fase,
    contratanteId: v.contratanteId,
    contratante: nomeContratante,
    executorIdentificado: v.executorIdentificado,
    previsao: {
      janelas: v.previsao.janelas,
      base: Object.fromEntries(Object.entries(base).map(([k, d]) => [k, { data: d!.data, natureza: d!.natureza, vencida: d!.vencida, dataDesconhecida: d!.dataDesconhecida }])),
      necessidade: v.previsao.necessidadeComercial,
      confianca: v.previsao.confianca.nivel,
      proximoMarco: v.previsao.proximoMarco,
      avisos: v.previsao.avisos.length,
    },
    dataDemandaBase: v.dataDemandaBase,
    mercado: { metodo: v.mercado.metodo, faixa: v.mercado.faixa, central: v.mercado.central, capexTotalBRL: v.mercado.capexTotalBRL, capexInfraEletricaBRL: v.mercado.capexInfraEletricaBRL, premissaIlustrativa: v.mercado.premissaIlustrativa },
    score: { indice: v.score.indice, faixa: v.score.faixa, foraDoEscopo: v.score.foraDoEscopo },
    qualidade: { completude: v.qualidade.completude, conflitosAbertos: v.qualidade.conflitosAbertos, desatualizado: v.qualidade.desatualizado },
    confiancaDados: v.confiancaDados,
    ultimaAtualizacao: v.ultimaAtualizacao,
    ultimaConfirmacao: v.ultimaConfirmacao,
    oportunidadeComercialId: v.oportunidadeComercialId,
    demo: v.demo,
  };
}
export type VisaoResumida = ReturnType<typeof visaoResumida>;
