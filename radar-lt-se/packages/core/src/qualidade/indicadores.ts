import { PAPEIS_CONTRATANTE, PESO_CLASSE } from '../constantes.js';
import { verificarConsistenciaMarcos } from '../previsao/confianca.js';
import {
  classeEvidencia, conflitosAbertos, extensaoTotalKm, pontoRepresentativo, tensaoMaxKv, temLT, temSE, ultimaConfirmacao,
} from '../projetos/derivados.js';
import { diferencaDias, hojeISO } from '../util/datas.js';
import type { Empreendimento, Fonte } from '../tipos.js';

export interface IndicadorQualidade {
  empreendimentoId: string;
  completude: number;
  faltantes: string[];
  diasSemConfirmacao?: number;
  desatualizado: boolean;
  conflitosAbertos: number;
  evidencias: number;
  fontesDistintas: number;
  temFonteOficial: boolean;
  precisaoLocalizacao: string;
  problemasMarcos: number;
  camposInferidos: number;
  camposPendentes: number;
}

const CHECKLIST: { rotulo: string; ok: (p: Empreendimento) => boolean }[] = [
  { rotulo: 'Tensão', ok: (p) => tensaoMaxKv(p) !== undefined },
  { rotulo: 'UF', ok: (p) => p.localizacao.ufs.length > 0 },
  { rotulo: 'Município', ok: (p) => p.localizacao.municipios.length > 0 },
  { rotulo: 'Coordenadas', ok: (p) => !!pontoRepresentativo(p) },
  { rotulo: 'Empreendedor/contratante', ok: (p) => p.participantes.some((x) => PAPEIS_CONTRATANTE.includes(x.papel)) },
  { rotulo: 'Extensão da LT', ok: (p) => !temLT(p) || !!extensaoTotalKm(p) },
  { rotulo: 'Subestações detalhadas', ok: (p) => !temSE(p) || p.subestacoes.length > 0 },
  { rotulo: 'Etapa de maturidade', ok: (p) => p.etapas.some((e) => e.status === 'em_andamento' || e.status === 'concluida') },
  { rotulo: 'Marco de referência', ok: (p) => p.marcos.some((m) => m.natureza === 'realizado') },
  { rotulo: 'Prazo/data de energização', ok: (p) => p.marcos.some((m) => ['prazo_contratual_energizacao', 'energizacao', 'operacao_comercial'].includes(m.tipo)) },
  { rotulo: 'Investimento elétrico', ok: (p) => !!p.financeiro.capexInfraEletrica },
  { rotulo: 'Situação ambiental', ok: (p) => p.situacoes.ambiental !== 'indefinida' },
  { rotulo: 'Evidência documental', ok: (p) => p.evidencias.length > 0 },
];

export function avaliarQualidade(
  p: Empreendimento,
  opcoes: { hoje?: string; diasDesatualizacao?: number; fontes?: Map<string, Fonte> } = {},
): IndicadorQualidade {
  const hoje = opcoes.hoje ?? hojeISO();
  const limite = opcoes.diasDesatualizacao ?? 180;
  const faltantes = CHECKLIST.filter((c) => !c.ok(p)).map((c) => c.rotulo);
  const ultima = ultimaConfirmacao(p);
  const dias = ultima ? diferencaDias(ultima, hoje) : undefined;
  const pt = pontoRepresentativo(p);
  const provs = Object.values(p.proveniencia);
  return {
    empreendimentoId: p.id,
    completude: Math.round(((CHECKLIST.length - faltantes.length) / CHECKLIST.length) * 100),
    faltantes,
    diasSemConfirmacao: dias,
    desatualizado: dias === undefined || dias > limite,
    conflitosAbertos: conflitosAbertos(p).length,
    evidencias: p.evidencias.length,
    fontesDistintas: new Set(p.evidencias.map((e) => e.fonteId)).size,
    temFonteOficial: p.evidencias.some((e) => PESO_CLASSE[classeEvidencia(e, opcoes.fontes)] >= PESO_CLASSE.A),
    precisaoLocalizacao: pt?.precisao ?? 'sem_localizacao',
    problemasMarcos: verificarConsistenciaMarcos(p, hoje).length,
    camposInferidos: provs.filter((x) => x.status === 'inferido').length,
    camposPendentes: provs.filter((x) => x.status === 'pendente').length,
  };
}

export function resumoQualidade(indicadores: IndicadorQualidade[]) {
  const n = indicadores.length || 1;
  return {
    empreendimentos: indicadores.length,
    completudeMedia: Math.round(indicadores.reduce((s, i) => s + i.completude, 0) / n),
    desatualizados: indicadores.filter((i) => i.desatualizado).length,
    comConflito: indicadores.filter((i) => i.conflitosAbertos > 0).length,
    semFonteOficial: indicadores.filter((i) => !i.temFonteOficial).length,
    semLocalizacao: indicadores.filter((i) => i.precisaoLocalizacao === 'sem_localizacao').length,
    comProblemasMarcos: indicadores.filter((i) => i.problemasMarcos > 0).length,
    camposInferidos: indicadores.reduce((s, i) => s + i.camposInferidos, 0),
  };
}
