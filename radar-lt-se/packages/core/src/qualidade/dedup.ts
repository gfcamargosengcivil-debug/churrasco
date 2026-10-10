/**
 * Deduplicação: pontua a correspondência entre um registro de fonte e os empreendimentos
 * do cadastro mestre por identificadores oficiais, nome, empreendedor, localização,
 * tensão e extensão. Correspondências duvidosas vão para revisão manual.
 */
import { CONFIG_DEDUP_PADRAO, type ConfigDedup } from '../config/parametros.js';
import { distanciaKm } from '../geo/index.js';
import { normalizarNomeOrganizacao, normalizarTexto, similaridadeNomes } from '../normalizacao/index.js';
import { extensaoTotalKm, pontoRepresentativo, tensaoMaxKv } from '../projetos/derivados.js';
import type { Empreendimento, Identificador, Organizacao } from '../tipos.js';
import { compararIdentidades, identidadeDoTrecho, identidadesDoNome, type IdentidadeLT } from './identidadeLT.js';
import type { RegistroNormalizado } from './registro.js';

export interface Correspondencia {
  empreendimentoId: string;
  pontuacao: number;
  motivos: string[];
}

export type DecisaoCorrespondencia =
  | { acao: 'vincular'; empreendimentoId: string; candidatos: Correspondencia[] }
  | { acao: 'revisar'; candidatos: Correspondencia[] }
  | { acao: 'novo'; candidatos: Correspondencia[] };

/**
 * Identificadores que um empreendimento tem no máximo uma vez: valores diferentes do mesmo tipo
 * provam que são empreendimentos distintos (ex.: dois reforços na mesma SE com códigos SIGET próprios).
 */
const TIPOS_EXCLUSIVOS: Identificador['tipo'][] = ['aneel_siget_empreendimento', 'ons_empreendimento', 'aneel_leilao_lote', 'aneel_ceg'];
/**
 * Coincidência decisiva só para identificadores do próprio empreendimento. Contrato de concessão,
 * resolução autorizativa e códigos de plano costumam abranger vários empreendimentos: somam pontos
 * na correspondência, mas não a decidem sozinhos.
 */
const TIPOS_DECISIVOS: Identificador['tipo'][] = [...TIPOS_EXCLUSIVOS, 'chave_fonte', 'licenca_ambiental', 'processo_ambiental', 'interno'];

const chaveIdentificador = (i: Pick<Identificador, 'tipo' | 'valor'>) => `${i.tipo}:${normalizarTexto(i.valor).replace(/[^a-z0-9]/g, '')}`;

function unicas(ids: IdentidadeLT[]): IdentidadeLT[] {
  const vistas = new Set<string>();
  return ids.filter((i) => {
    const k = `${i.tipo}|${i.kv ?? ''}|${i.a}|${i.b}|${i.circuitos.join(',')}|${i.se ?? ''}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

export function pontuarCorrespondencia(
  r: RegistroNormalizado,
  p: Empreendimento,
  organizacoes: Map<string, Organizacao>,
  cfg: ConfigDedup = CONFIG_DEDUP_PADRAO,
): Correspondencia {
  const motivos: string[] = [];
  // Identificadores exclusivos diferentes do mesmo tipo provam que são empreendimentos distintos.
  const idConflitante = r.identificadores?.find(
    (i) => TIPOS_EXCLUSIVOS.includes(i.tipo) && p.identificadores.some((x) => x.tipo === i.tipo && chaveIdentificador(x) !== chaveIdentificador(i)),
  );
  if (idConflitante) {
    return { empreendimentoId: p.id, pontuacao: 0, motivos: [`Identificadores oficiais distintos do mesmo tipo (${idConflitante.tipo}).`] };
  }
  // Identificador oficial do próprio empreendimento coincidente é decisivo.
  const idsProj = new Set(p.identificadores.map(chaveIdentificador));
  const comuns = (r.identificadores ?? []).filter((i) => idsProj.has(chaveIdentificador(i)));
  const idDecisivo = comuns.find((i) => TIPOS_DECISIVOS.includes(i.tipo));
  if (idDecisivo) {
    return { empreendimentoId: p.id, pontuacao: 1, motivos: [`Identificador oficial coincidente (${idDecisivo.tipo}: ${idDecisivo.valor}).`] };
  }

  let score = 0;
  const nomesReg = [r.nome, ...(r.nomesAlternativos ?? [])];
  const nomesProj = [p.nomeOficial, ...p.nomesAlternativos];
  let simNome = 0;
  for (const a of nomesReg) for (const b of nomesProj) simNome = Math.max(simNome, similaridadeNomes(a, b));
  score += 0.45 * simNome;
  motivos.push(`Similaridade de nome ${Math.round(simNome * 100)}%.`);
  if (comuns.length) {
    score += 0.1;
    motivos.push(`Identificador compartilhado (${comuns.map((i) => `${i.tipo}: ${i.valor}`).join(', ')}) — pode abranger vários empreendimentos.`);
  }

  // Identidade estrutural das LTs (extremidades + tensão + circuito).
  const ltsReg = unicas([...nomesReg.flatMap(identidadesDoNome), ...(r.trechosLT ?? []).flatMap(identidadeDoTrecho)]);
  const ltsProj = unicas([...nomesProj.flatMap(identidadesDoNome), ...p.trechosLT.flatMap(identidadeDoTrecho)]);
  let mesma = false;
  let extremidades = false;
  let circuitoDiferente = false;
  for (const a of ltsReg) {
    for (const b of ltsProj) {
      const c = compararIdentidades(a, b);
      if (c === 'mesma') mesma = true;
      else if (c === 'mesmas_extremidades') extremidades = true;
      else if (c === 'circuito_diferente') circuitoDiferente = true;
    }
  }
  const todasIguais = ltsReg.length > 0 && ltsReg.every((a) => ltsProj.some((b) => compararIdentidades(a, b) === 'mesma'));
  if (todasIguais) {
    score = Math.max(score + 0.25, 0.9);
    motivos.push('Mesma(s) LT(s): extremidades, tensão e circuito coincidentes.');
  } else if (mesma) {
    score += 0.2;
    motivos.push('Ao menos uma LT idêntica (extremidades, tensão e circuito).');
  } else if (extremidades) {
    score += 0.1;
    motivos.push('Mesmas extremidades e tensão de LT (circuito não informado em um dos lados).');
  }
  if (circuitoDiferente && !mesma) {
    score -= 0.35;
    motivos.push('Mesmas extremidades com circuitos diferentes: instalações distintas.');
  }

  const kvReg = r.tensoesKv?.length ? Math.max(...r.tensoesKv) : r.trechosLT?.length ? Math.max(...r.trechosLT.map((t) => t.tensaoKv)) : undefined;
  const kvProj = tensaoMaxKv(p);
  if (kvReg !== undefined && kvProj !== undefined) {
    if (kvReg === kvProj) {
      score += 0.15;
      motivos.push(`Mesma tensão máxima (${kvReg} kV).`);
    } else {
      score -= 0.2;
      motivos.push(`Tensões diferentes (${kvReg} × ${kvProj} kV).`);
    }
  }

  const ufsReg = new Set([...(r.ufs ?? []), ...(r.municipios ?? []).map((m) => m.uf)]);
  const ufsProj = new Set(p.localizacao.ufs);
  if (ufsReg.size && ufsProj.size) {
    const comum = [...ufsReg].filter((u) => ufsProj.has(u));
    if (comum.length) {
      score += 0.1;
      motivos.push(`UF em comum (${comum.join(', ')}).`);
    } else {
      score -= 0.25;
      motivos.push('Nenhuma UF em comum.');
    }
  }

  const orgsProj = p.participantes
    .map((x) => organizacoes.get(x.organizacaoId))
    .filter((o): o is Organizacao => !!o);
  const nomesOrgProj = new Set(orgsProj.flatMap((o) => [o.nome, ...o.nomesAlternativos].map(normalizarNomeOrganizacao)));
  const cnpjsProj = new Set(orgsProj.map((o) => o.cnpj).filter(Boolean));
  const orgComum = r.organizacoes?.find((o) => (o.cnpj && cnpjsProj.has(o.cnpj.replace(/\D/g, ''))) || nomesOrgProj.has(normalizarNomeOrganizacao(o.nome)));
  if (orgComum) {
    score += 0.15;
    motivos.push(`Mesmo empreendedor/participante (${orgComum.nome}).`);
  }

  const ptProj = pontoRepresentativo(p);
  const ptReg = r.ponto ?? r.subestacoes?.find((s) => s.ponto)?.ponto;
  if (ptProj && ptReg && ptProj.precisao !== 'uf' && ptReg.precisao !== 'uf') {
    const d = distanciaKm(ptProj, ptReg);
    if (d <= cfg.distanciaMaxKm) {
      score += 0.1;
      motivos.push(`Localizações próximas (${Math.round(d)} km).`);
    } else if (d > cfg.distanciaMaxKm * 3) {
      score -= 0.15;
      motivos.push(`Localizações distantes (${Math.round(d)} km).`);
    }
  }

  const kmReg = r.extensaoKm ?? (r.trechosLT?.reduce((s, t) => s + (t.extensaoKm ?? 0), 0) || undefined);
  const kmProj = extensaoTotalKm(p);
  if (kmReg && kmProj) {
    const dif = Math.abs(kmReg - kmProj) / Math.max(kmReg, kmProj);
    if (dif <= 0.15) {
      score += 0.05;
      motivos.push(`Extensões compatíveis (${kmReg} × ${kmProj} km).`);
    } else if (dif > 0.5) {
      score -= 0.1;
      motivos.push(`Extensões muito diferentes (${kmReg} × ${kmProj} km).`);
    }
  }

  // Identidade estrutural forte prevalece sobre diferenças de localização/extensão (geometrias e
  // extensões de planejamento são indicativas), mas não sobre tensão ou UF incompatíveis.
  if (todasIguais && !circuitoDiferente && !motivos.some((m) => m.startsWith('Tensões diferentes') || m === 'Nenhuma UF em comum.')) {
    score = Math.max(score, 0.86);
  }
  return { empreendimentoId: p.id, pontuacao: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)), motivos };
}

export function decidirCorrespondencia(
  r: RegistroNormalizado,
  projetos: Empreendimento[],
  organizacoes: Map<string, Organizacao>,
  cfg: ConfigDedup = CONFIG_DEDUP_PADRAO,
): DecisaoCorrespondencia {
  const candidatos = projetos
    .map((p) => pontuarCorrespondencia(r, p, organizacoes, cfg))
    .filter((c) => c.pontuacao >= 0.3)
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, 5);
  const [primeiro, segundo] = candidatos;
  if (primeiro && primeiro.pontuacao >= cfg.limiarAutomatico) {
    const ambiguo = segundo && segundo.pontuacao >= cfg.limiarAutomatico - 0.1 && primeiro.pontuacao < 1;
    if (!ambiguo) return { acao: 'vincular', empreendimentoId: primeiro.empreendimentoId, candidatos };
  }
  if (primeiro && primeiro.pontuacao >= cfg.limiarRevisao) return { acao: 'revisar', candidatos };
  return { acao: 'novo', candidatos };
}

/** Possíveis duplicidades já existentes no cadastro (para a tela de qualidade). */
export function possiveisDuplicidades(
  projetos: Empreendimento[],
  organizacoes: Map<string, Organizacao>,
  cfg: ConfigDedup = CONFIG_DEDUP_PADRAO,
): { a: string; b: string; pontuacao: number; motivos: string[] }[] {
  const res: { a: string; b: string; pontuacao: number; motivos: string[] }[] = [];
  for (let i = 0; i < projetos.length; i++) {
    const a = projetos[i];
    const regA: RegistroNormalizado = {
      fonteId: 'interno',
      nome: a.nomeOficial,
      nomesAlternativos: a.nomesAlternativos,
      identificadores: a.identificadores,
      tensoesKv: tensaoMaxKv(a) ? [tensaoMaxKv(a)!] : undefined,
      extensaoKm: extensaoTotalKm(a),
      ufs: a.localizacao.ufs,
      ponto: pontoRepresentativo(a),
      organizacoes: a.participantes
        .map((x) => organizacoes.get(x.organizacaoId))
        .filter((o): o is Organizacao => !!o)
        .map((o) => ({ nome: o.nome, cnpj: o.cnpj, papel: 'empreendedor' as const })),
      evidencia: { titulo: 'interno', tipoDocumento: 'registro_manual' },
    };
    for (let j = i + 1; j < projetos.length; j++) {
      const c = pontuarCorrespondencia(regA, projetos[j], organizacoes, cfg);
      if (c.pontuacao >= cfg.limiarRevisao) res.push({ a: a.id, b: projetos[j].id, pontuacao: c.pontuacao, motivos: c.motivos });
    }
  }
  return res.sort((x, y) => y.pontuacao - x.pontuacao);
}
