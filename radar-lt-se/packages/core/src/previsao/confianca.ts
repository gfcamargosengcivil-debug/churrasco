/**
 * Indicador de confiança da previsão — rubrica documentada (docs/METODOLOGIA.md):
 *
 * | Critério                    | Pontos | Regra                                                        |
 * |-----------------------------|--------|--------------------------------------------------------------|
 * | Qualidade da fonte da âncora| 0–3    | classe A=3, B=2, C=1, D/sem evidência=0                      |
 * | Atualidade                  | 0–2    | última confirmação ≤ 90 dias = 2; ≤ 365 = 1; mais antiga = 0 |
 * | Evidências independentes    | 0–2    | fontes distintas sustentando marcos: ≥3 = 2; 2 = 1; ≤1 = 0  |
 * | Consistência dos marcos     | 0–2    | sem problemas = 2; marco previsto vencido = 1; ordem          |
 * |                             |        | impossível ou conflito de datas aberto = 0                   |
 * | Método                      | 0–2    | realizado/divulgado = 2; calculado de marco = 1; heurístico=0|
 *
 * Nível: ≥ 9 alta; ≥ 6 média; ≥ 3 baixa; < 3 muito baixa.
 * Limitadores: método heurístico → no máximo "baixa"; inconsistência grave → no máximo "média";
 * nenhuma evidência → "muito baixa". Não é uma probabilidade.
 */
import { CLASSES_FONTE, PESO_CLASSE, ROTULO_MARCO, type ClasseFonte, type TipoMarco } from '../constantes.js';
import { classeEvidencia, dataReferenciaEvidencia, evidenciasPorIds, ultimaConfirmacao } from '../projetos/derivados.js';
import { diferencaDias, formatarDataBR, hojeISO } from '../util/datas.js';
import type { Empreendimento, Fonte } from '../tipos.js';
import type { CenarioPrevisao, ComponenteConfianca, ConfiancaPrevisao, NivelConfianca } from './tipos.js';

/** Pares de marcos que, quando ambos realizados, devem respeitar a ordem (a ≤ b). */
export const ORDEM_MARCOS: [TipoMarco, TipoMarco][] = [
  ['edital_publicado', 'leilao_realizado'],
  ['leilao_realizado', 'contrato_concessao_assinado'],
  ['licenca_previa', 'licenca_instalacao'],
  ['licenca_instalacao', 'licenca_operacao'],
  ['rfq_publicada', 'contrato_execucao_assinado'],
  ['contrato_execucao_assinado', 'mobilizacao'],
  ['mobilizacao', 'inicio_obras'],
  ['inicio_obras', 'energizacao'],
  ['contrato_concessao_assinado', 'energizacao'],
  ['energizacao', 'operacao_comercial'],
];

export interface ProblemaConsistencia {
  gravidade: 'grave' | 'moderada';
  descricao: string;
}

export function verificarConsistenciaMarcos(p: Empreendimento, hoje: string = hojeISO()): ProblemaConsistencia[] {
  const problemas: ProblemaConsistencia[] = [];
  const realizados = p.marcos.filter((m) => m.natureza === 'realizado');
  for (const [a, b] of ORDEM_MARCOS) {
    for (const ma of realizados.filter((m) => m.tipo === a)) {
      for (const mb of realizados.filter((m) => m.tipo === b && (m.escopo === ma.escopo || m.escopo === 'geral' || ma.escopo === 'geral'))) {
        if (ma.data > mb.data) {
          problemas.push({
            gravidade: 'grave',
            descricao: `${ROTULO_MARCO[a]} (${formatarDataBR(ma.data)}) registrado depois de ${ROTULO_MARCO[b]} (${formatarDataBR(mb.data)}).`,
          });
        }
      }
    }
  }
  for (const m of realizados) {
    if (m.data > hoje) problemas.push({ gravidade: 'grave', descricao: `${ROTULO_MARCO[m.tipo]} marcado como realizado com data futura (${formatarDataBR(m.data)}).` });
  }
  for (const m of p.marcos.filter((x) => x.natureza !== 'realizado' && x.data < hoje)) {
    const jaOcorreu = realizados.some((r) => r.tipo === m.tipo && r.escopo === m.escopo);
    if (!jaOcorreu) {
      problemas.push({
        gravidade: 'moderada',
        descricao: `${ROTULO_MARCO[m.tipo]} previsto para ${formatarDataBR(m.data)} já passou sem confirmação de ocorrência (cronograma desatualizado).`,
      });
    }
  }
  for (const c of p.conflitos) {
    if (c.status === 'aberto' && /^(marcos|datas|energizacao|cronograma)/.test(c.campo)) {
      problemas.push({ gravidade: 'grave', descricao: `Conflito aberto entre fontes no campo "${c.campo}".` });
    }
  }
  return problemas;
}

function nivelPorPontos(pontos: number): NivelConfianca {
  if (pontos >= 9) return 'alta';
  if (pontos >= 6) return 'media';
  if (pontos >= 3) return 'baixa';
  return 'muito_baixa';
}

const ORDEM_NIVEL: NivelConfianca[] = ['muito_baixa', 'baixa', 'media', 'alta'];
function limitar(nivel: NivelConfianca, teto: NivelConfianca): NivelConfianca {
  return ORDEM_NIVEL.indexOf(nivel) > ORDEM_NIVEL.indexOf(teto) ? teto : nivel;
}

export interface OpcoesConfianca {
  hoje?: string;
  fontes?: Map<string, Fonte> | Record<string, Fonte>;
}

export function avaliarConfianca(p: Empreendimento, base: CenarioPrevisao, opcoes: OpcoesConfianca = {}): ConfiancaPrevisao {
  const hoje = opcoes.hoje ?? hojeISO();
  const componentes: ComponenteConfianca[] = [];
  const limitadores: string[] = [];

  // 1. Qualidade da fonte da âncora
  const referencia = base.datas.rfq ?? base.datas.assinaturaContrato ?? base.datas.energizacao;
  const idsAncora = [...new Set([...(referencia?.ancora?.evidenciaIds ?? []), ...(referencia?.evidenciaIds ?? [])])];
  const evAncora = evidenciasPorIds(p, idsAncora);
  let melhorClasse: ClasseFonte | undefined;
  for (const e of evAncora) {
    const c = classeEvidencia(e, opcoes.fontes);
    if (!melhorClasse || PESO_CLASSE[c] > PESO_CLASSE[melhorClasse]) melhorClasse = c;
  }
  let ptsFonte = melhorClasse ? PESO_CLASSE[melhorClasse] : 0;
  let justFonte = melhorClasse
    ? `Melhor evidência do marco de referência é de classe ${melhorClasse}.`
    : 'Marco de referência sem evidência vinculada.';
  if (!melhorClasse && p.evidencias.length) {
    const melhorGeral = p.evidencias
      .map((e) => classeEvidencia(e, opcoes.fontes))
      .sort((a, b) => CLASSES_FONTE.indexOf(a) - CLASSES_FONTE.indexOf(b))[0];
    ptsFonte = Math.min(1, PESO_CLASSE[melhorGeral]);
    justFonte = `Evidências não vinculadas ao marco de referência (melhor classe geral: ${melhorGeral}); pontuação limitada a 1.`;
  }
  componentes.push({ criterio: 'qualidade_fonte', rotulo: 'Qualidade da fonte', pontos: ptsFonte, maximo: 3, justificativa: justFonte });

  // 2. Atualidade
  const ultima = ultimaConfirmacao(p);
  const dias = ultima ? diferencaDias(ultima, hoje) : undefined;
  const ptsAtual = dias === undefined ? 0 : dias <= 90 ? 2 : dias <= 365 ? 1 : 0;
  componentes.push({
    criterio: 'atualidade',
    rotulo: 'Atualidade da informação',
    pontos: ptsAtual,
    maximo: 2,
    justificativa: ultima ? `Última confirmação/coleta em ${formatarDataBR(ultima)} (${dias} dias).` : 'Sem data de coleta/confirmação.',
  });

  // 3. Evidências independentes (fontes distintas que sustentam marcos)
  const idsMarcos = new Set(p.marcos.flatMap((m) => m.evidenciaIds));
  const evMarcos = p.evidencias.filter((e) => idsMarcos.has(e.id));
  const fontesDistintas = new Set((evMarcos.length ? evMarcos : p.evidencias).map((e) => e.fonteId));
  const ptsIndep = fontesDistintas.size >= 3 ? 2 : fontesDistintas.size === 2 ? 1 : 0;
  componentes.push({
    criterio: 'evidencias_independentes',
    rotulo: 'Evidências independentes',
    pontos: ptsIndep,
    maximo: 2,
    justificativa: `${fontesDistintas.size} fonte(s) distinta(s) sustentando os marcos.`,
  });

  // 4. Consistência dos marcos
  const problemas = verificarConsistenciaMarcos(p, hoje);
  const graves = problemas.filter((x) => x.gravidade === 'grave');
  const ptsCons = graves.length ? 0 : problemas.length ? 1 : 2;
  componentes.push({
    criterio: 'consistencia_marcos',
    rotulo: 'Consistência dos marcos',
    pontos: ptsCons,
    maximo: 2,
    justificativa: problemas.length ? problemas.map((x) => x.descricao).join(' ') : 'Marcos em ordem cronológica, sem conflitos abertos.',
  });

  // 5. Método
  const nat = referencia?.natureza;
  const ptsMetodo = nat === 'realizado' || nat === 'divulgado' ? 2 : nat === 'calculado_de_marco' ? 1 : 0;
  componentes.push({
    criterio: 'metodo',
    rotulo: 'Método de estimativa',
    pontos: ptsMetodo,
    maximo: 2,
    justificativa:
      nat === 'realizado' ? 'Evento já observado.'
        : nat === 'divulgado' ? 'Data divulgada por fonte.'
          : nat === 'calculado_de_marco' ? 'Calculada a partir de marco verificável + premissas.'
            : nat === 'heuristico' ? 'Estimativa heurística a partir de sinal fraco (anúncio/plano).'
              : 'Sem data de referência.',
  });

  const pontos = componentes.reduce((s, c) => s + c.pontos, 0);
  const maximo = componentes.reduce((s, c) => s + c.maximo, 0);
  let nivel = nivelPorPontos(pontos);
  if (!p.evidencias.length) {
    nivel = 'muito_baixa';
    limitadores.push('Nenhuma evidência registrada.');
  }
  if (nat === 'heuristico' || !nat) {
    const novo = limitar(nivel, 'baixa');
    if (novo !== nivel) limitadores.push('Método heurístico limita a confiança a "baixa".');
    nivel = novo;
  }
  if (graves.length) {
    const novo = limitar(nivel, 'media');
    if (novo !== nivel) limitadores.push('Inconsistência grave nos marcos limita a confiança a "média".');
    nivel = novo;
  }
  return { nivel, pontos, maximo, componentes, limitadores };
}

/** Confiança dos dados cadastrais (independente da previsão): usada em filtros do radar. */
export function confiancaDados(p: Empreendimento, opcoes: OpcoesConfianca = {}): NivelConfianca {
  const hoje = opcoes.hoje ?? hojeISO();
  if (!p.evidencias.length) return 'muito_baixa';
  const classes = p.evidencias.map((e) => classeEvidencia(e, opcoes.fontes));
  const melhor = Math.max(...classes.map((c) => PESO_CLASSE[c]));
  const recente = Math.max(...p.evidencias.map((e) => -diferencaDias(dataReferenciaEvidencia(e), hoje)));
  const dias = -recente;
  const fontes = new Set(p.evidencias.map((e) => e.fonteId)).size;
  const pts = melhor + (dias <= 180 ? 2 : dias <= 365 ? 1 : 0) + (fontes >= 2 ? 1 : 0) - (p.conflitos.some((c) => c.status === 'aberto') ? 1 : 0);
  return pts >= 5 ? 'alta' : pts >= 3 ? 'media' : pts >= 1 ? 'baixa' : 'muito_baixa';
}
