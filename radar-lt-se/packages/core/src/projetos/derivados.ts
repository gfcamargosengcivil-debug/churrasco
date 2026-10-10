import {
  ORDEM_FASE_CONTRATACAO, PACOTES_CONSTRUCAO, PAPEIS_CONTRATANTE, PAPEIS_EXECUCAO,
  type ClasseFonte, type Escopo, type FaseContratacao, type NaturezaMarco, type Papel, type Regiao, type TipoMarco,
} from '../constantes.js';
import { ETAPAS_PADRAO, type EtapaDef } from '../config/etapas.js';
import { regioesDasUFs } from '../normalizacao/index.js';
import { maxData } from '../util/datas.js';
import type { Empreendimento, Evidencia, Fonte, Marco, Ponto } from '../tipos.js';

export function tensoesKv(p: Empreendimento): number[] {
  const s = new Set<number>([
    ...p.tecnico.tensoesKv,
    ...p.trechosLT.map((t) => t.tensaoKv),
    ...p.subestacoes.flatMap((se) => se.tensoesKv),
  ]);
  return [...s].sort((a, b) => b - a);
}

export function tensaoMaxKv(p: Empreendimento): number | undefined {
  const t = tensoesKv(p);
  return t.length ? t[0] : undefined;
}

export function extensaoTotalKm(p: Empreendimento): number | undefined {
  const comKm = p.trechosLT.filter((t) => t.extensaoKm);
  if (comKm.length) return Math.round(comKm.reduce((s, t) => s + (t.extensaoKm ?? 0), 0) * 10) / 10;
  return p.tecnico.extensaoKm;
}

export function temLT(p: Empreendimento): boolean {
  return p.trechosLT.length > 0 || p.tipo === 'LT' || p.tipo === 'LT+SE' || (p.tecnico.extensaoKm ?? 0) > 0;
}

export function temSE(p: Empreendimento): boolean {
  return p.subestacoes.length > 0 || p.tipo === 'SE' || p.tipo === 'LT+SE' || (p.tecnico.qtdSubestacoes ?? 0) > 0;
}

export function regioes(p: Empreendimento): Regiao[] {
  return regioesDasUFs(p.localizacao.ufs);
}

/** Atende ao critério de escopo da plataforma (≥ 138 kV)? `undefined` = tensão desconhecida. */
export function dentroDoEscopoTensao(p: Empreendimento, minimoKv = 138): boolean | undefined {
  const t = tensaoMaxKv(p);
  return t === undefined ? undefined : t >= minimoKv;
}

export function etapaAtual(p: Empreendimento, etapas: EtapaDef[] = ETAPAS_PADRAO): EtapaDef | undefined {
  if (p.statusGeral === 'cancelado' || p.statusGeral === 'concluido') {
    return etapas.find((e) => e.id === 'encerrado');
  }
  const ordem = new Map(etapas.map((e) => [e.id, e]));
  let atual: EtapaDef | undefined;
  for (const st of p.etapas) {
    if (st.status !== 'em_andamento' && st.status !== 'concluida') continue;
    const def = ordem.get(st.etapaId);
    if (def && (!atual || def.ordem > atual.ordem)) atual = def;
  }
  return atual ?? (ordem.get(etapaInferida(p) ?? '') as EtapaDef | undefined);
}

/**
 * Etapa inferida do marco/situação mais avançado quando a fonte não registra o andamento por etapa
 * (ex.: cadastros oficiais com apenas outorga e prazos). Regra documentada na Metodologia.
 */
export function etapaInferida(p: Empreendimento): string | undefined {
  const real = (tipos: TipoMarco[]) => p.marcos.some((m) => tipos.includes(m.tipo) && m.natureza === 'realizado');
  if (p.situacaoObra === 'comissionamento' || real(['energizacao', 'operacao_comercial'])) return 'comissionamento';
  if (['mobilizacao', 'construcao'].includes(p.situacaoObra) || real(['mobilizacao', 'inicio_obras', 'ordem_inicio'])) return 'construcao';
  if (real(['rfq_publicada', 'propostas_recebidas', 'contrato_execucao_assinado'])) return 'contratacao_execucao';
  if (real(['contrato_concessao_assinado', 'autorizacao_publicada', 'vencedor_definido', 'leilao_realizado', 'decisao_final_investimento'])) return 'concessao';
  if (real(['edital_publicado', 'consulta_publica'])) return 'contratacao_regulatoria';
  if (real(['licenca_previa', 'licenca_instalacao'])) return 'licenciamento';
  if (['outorgada', 'autorizada'].includes(p.situacoes.regulatoria)) return 'concessao';
  if (['em_licitacao', 'em_consulta_publica'].includes(p.situacoes.regulatoria)) return 'contratacao_regulatoria';
  if (p.situacoes.regulatoria === 'em_planejamento' || p.marcos.some((m) => m.tipo === 'inclusao_planejamento')) return 'planejamento';
  if (real(['anuncio'])) return 'sinal_mercado';
  return undefined;
}

export function etapasEmAndamento(p: Empreendimento, etapas: EtapaDef[] = ETAPAS_PADRAO): EtapaDef[] {
  const ids = new Set(p.etapas.filter((e) => e.status === 'em_andamento').map((e) => e.etapaId));
  return etapas.filter((e) => ids.has(e.id));
}

/**
 * Fase de contratação mais avançada entre os pacotes de construção/montagem
 * (opcionalmente filtrando por escopo LT/SE). Considera também contratos assinados.
 */
export function faseContratacaoConstrucao(p: Empreendimento, escopo?: Exclude<Escopo, 'geral'>): FaseContratacao {
  let melhor: FaseContratacao = 'nao_identificada';
  const considerar = (fase: FaseContratacao) => {
    if (ORDEM_FASE_CONTRATACAO[fase] > ORDEM_FASE_CONTRATACAO[melhor]) melhor = fase;
  };
  for (const pk of p.pacotes) {
    if (!PACOTES_CONSTRUCAO.includes(pk.pacote)) continue;
    if (escopo && pk.escopo !== escopo && pk.escopo !== 'geral') continue;
    considerar(pk.faseContratacao);
  }
  for (const c of p.contratos) {
    if (!c.pacotes.some((pc) => PACOTES_CONSTRUCAO.includes(pc))) continue;
    if (escopo && c.escopo !== escopo && c.escopo !== 'geral') continue;
    if (c.status === 'assinado' || c.status === 'encerrado') considerar('contratada');
    else if (c.status === 'em_negociacao') considerar('negociacao');
  }
  if (melhor === 'nao_identificada') {
    const aplicavel = escopo === 'LT' ? temLT(p) : escopo === 'SE' ? temSE(p) : true;
    if (!aplicavel) return 'nao_aplicavel';
  }
  return melhor;
}

export function idsOrganizacoesPorPapel(p: Empreendimento, papeis: Papel[]): string[] {
  return [...new Set(p.participantes.filter((x) => papeis.includes(x.papel)).map((x) => x.organizacaoId))];
}

/** Quem provavelmente contratará a obra (potencial contratante > empreendedor > concessionária > proprietário). */
export function contratantePrincipalId(p: Empreendimento): string | undefined {
  for (const papel of PAPEIS_CONTRATANTE) {
    const part = p.participantes.find((x) => x.papel === papel);
    if (part) return part.organizacaoId;
  }
  return undefined;
}

/** Há executor/EPC de obra identificado? */
export function executorIdentificado(p: Empreendimento): boolean {
  return (
    p.participantes.some((x) => PAPEIS_EXECUCAO.includes(x.papel)) ||
    p.contratos.some(
      (c) => (c.status === 'assinado' || c.status === 'encerrado') && c.pacotes.some((pc) => PACOTES_CONSTRUCAO.includes(pc)),
    )
  );
}

export function marcosDoTipo(
  p: Empreendimento,
  tipos: TipoMarco[],
  naturezas?: NaturezaMarco[],
  escopo?: Escopo,
): Marco[] {
  return p.marcos
    .filter((m) => tipos.includes(m.tipo))
    .filter((m) => !naturezas || naturezas.includes(m.natureza))
    .filter((m) => !escopo || m.escopo === escopo || m.escopo === 'geral')
    .sort((a, b) => (a.data < b.data ? -1 : 1));
}

/** Primeiro marco realizado dos tipos indicados. */
export function marcoRealizado(p: Empreendimento, tipos: TipoMarco[], escopo?: Escopo): Marco | undefined {
  return marcosDoTipo(p, tipos, ['realizado'], escopo)[0];
}

/** Ponto representativo do empreendimento para o mapa (nunca inventado: só usa coordenadas registradas). */
export function pontoRepresentativo(p: Empreendimento): Ponto | undefined {
  if (p.localizacao.ponto) return p.localizacao.ponto;
  const se = p.subestacoes.find((s) => s.ponto);
  if (se?.ponto) return se.ponto;
  const tr = p.trechosLT.find((t) => t.tracado);
  if (tr?.tracado) {
    const c = tr.tracado.coordenadas;
    const meio = c[Math.floor(c.length / 2)];
    return { lon: meio[0], lat: meio[1], precisao: 'aproximada', fonte: 'ponto médio do traçado registrado' };
  }
  return undefined;
}

export function dataReferenciaEvidencia(e: Evidencia): string {
  return e.ultimaConfirmacao ?? e.dataColeta ?? e.dataPublicacao ?? '1900-01-01';
}

/** Data mais recente em que alguma informação do empreendimento foi confirmada/coletada. */
export function ultimaConfirmacao(p: Empreendimento): string | undefined {
  return maxData(...p.evidencias.map(dataReferenciaEvidencia));
}

export function classeEvidencia(e: Evidencia, fontes?: Map<string, Fonte> | Record<string, Fonte>): ClasseFonte {
  if (e.classe) return e.classe;
  const f = fontes instanceof Map ? fontes.get(e.fonteId) : fontes?.[e.fonteId];
  return f?.classe ?? 'D';
}

export function evidenciasPorIds(p: Empreendimento, ids: string[]): Evidencia[] {
  const s = new Set(ids);
  return p.evidencias.filter((e) => s.has(e.id));
}

export function conflitosAbertos(p: Empreendimento) {
  return p.conflitos.filter((c) => c.status === 'aberto');
}

export function gerarCodigo(sequencial: number): string {
  return `RLT-${String(sequencial).padStart(6, '0')}`;
}
