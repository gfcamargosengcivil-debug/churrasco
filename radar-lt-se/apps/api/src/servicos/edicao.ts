import { z } from 'zod';
import { DataISO, jsonEstavel, novoId, type Empreendimento, type Fonte, type StatusDado } from '@radar/core';

export const AlteracaoManualSchema = z.object({
  fonteId: z.string().default('manual'),
  titulo: z.string().min(3, 'Informe o documento/fonte que justifica a alteração'),
  url: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  trecho: z.string().optional(),
  dataPublicacao: DataISO.optional(),
  observacao: z.string().optional(),
});
export type AlteracaoManual = z.infer<typeof AlteracaoManualSchema>;

const CAMPOS_ESCALARES = [
  'nomeOficial', 'tipo', 'setorOrigem', 'subsetor', 'descricao', 'fluxoId', 'statusGeral', 'situacaoObra',
  'situacoes.regulatoria', 'situacoes.ambiental', 'situacoes.fundiaria', 'situacoes.engenharia',
  'tecnico.tensoesKv', 'tecnico.extensaoKm', 'tecnico.circuitos', 'tecnico.capacidadeMva', 'tecnico.qtdSubestacoes', 'tecnico.potenciaMw', 'tecnico.caracteristicas',
  'financeiro.capexTotal', 'financeiro.capexInfraEletrica', 'financeiro.rapAnual', 'financeiro.fonteFinanciamento',
  'localizacao.ufs', 'localizacao.municipios', 'localizacao.ponto', 'responsavelInterno', 'observacoes', 'tags', 'identificadores', 'nomesAlternativos',
];
const COLECOES = ['marcos', 'pacotes', 'etapas', 'participantes', 'trechosLT', 'subestacoes', 'contratos', 'lotes'] as const;

function obter(obj: unknown, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/**
 * Aplica uma edição manual: registra evidência da alteração, histórico campo a campo e
 * proveniência dos campos alterados. Campos de rastreabilidade (evidências, conflitos,
 * histórico) não podem ser alterados por esta via.
 */
export function aplicarEdicaoManual(antes: Empreendimento, editado: Empreendimento, alt: AlteracaoManual, fonte: Fonte, usuario: string, agora = new Date().toISOString()): { projeto: Empreendimento; campos: string[] } {
  const hoje = agora.slice(0, 10);
  const depois: Empreendimento = {
    ...editado,
    id: antes.id,
    codigo: antes.codigo,
    evidencias: antes.evidencias,
    conflitos: antes.conflitos,
    historico: [...antes.historico],
    proveniencia: { ...antes.proveniencia },
    criadoEm: antes.criadoEm,
    identificadoEm: antes.identificadoEm,
    demo: antes.demo,
    atualizadoEm: agora,
  };
  const alterados: string[] = [];
  for (const c of CAMPOS_ESCALARES) {
    if (jsonEstavel(obter(antes, c)) !== jsonEstavel(obter(depois, c))) alterados.push(c);
  }
  for (const c of COLECOES) {
    if (jsonEstavel(antes[c]) !== jsonEstavel(depois[c])) alterados.push(c);
  }
  if (!alterados.length) return { projeto: antes, campos: [] };
  const evidencia = {
    id: novoId('ev'),
    fonteId: fonte.id,
    titulo: alt.titulo,
    url: alt.url,
    trecho: alt.trecho,
    tipoDocumento: 'registro_manual' as const,
    dataPublicacao: alt.dataPublicacao,
    dataColeta: hoje,
    ultimaConfirmacao: hoje,
    classe: fonte.classe,
  };
  depois.evidencias = [...antes.evidencias, evidencia];
  const status: StatusDado = fonte.classe === 'A' || fonte.classe === 'B' ? 'confirmado' : 'inferido';
  for (const campo of alterados) {
    depois.historico.push({
      id: novoId('alt'), em: agora, por: usuario, origem: 'manual', campo,
      de: (COLECOES as readonly string[]).includes(campo) ? `${(obter(antes, campo) as unknown[] | undefined)?.length ?? 0} item(ns)` : obter(antes, campo),
      para: (COLECOES as readonly string[]).includes(campo) ? `${(obter(depois, campo) as unknown[] | undefined)?.length ?? 0} item(ns)` : obter(depois, campo),
      evidenciaId: evidencia.id, observacao: alt.observacao,
    });
    if (!(COLECOES as readonly string[]).includes(campo)) {
      depois.proveniencia[campo] = { status, evidenciaIds: [evidencia.id], atualizadoEm: hoje, emConflito: antes.proveniencia[campo]?.emConflito };
    }
  }
  // Marcos/pacotes novos ou alterados sem evidência recebem a evidência desta alteração.
  for (const m of depois.marcos) if (!m.evidenciaIds.length || !jsonEstavel(antes.marcos).includes(jsonEstavel(m))) m.evidenciaIds = [...new Set([...m.evidenciaIds, evidencia.id])];
  for (const pk of depois.pacotes) if (!pk.evidenciaIds.length) pk.evidenciaIds = [evidencia.id];
  for (const e of depois.etapas) if (!e.evidenciaIds.length) e.evidenciaIds = [evidencia.id];
  for (const pt of depois.participantes) if (!pt.evidenciaIds.length) pt.evidenciaIds = [evidencia.id];
  return { projeto: depois, campos: alterados };
}
