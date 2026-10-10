/**
 * Deduplicação: pontua a correspondência entre um registro de fonte e os empreendimentos
 * do cadastro mestre por identificadores oficiais, nome, empreendedor, localização,
 * tensão e extensão. Correspondências duvidosas vão para revisão manual.
 */
import { CONFIG_DEDUP_PADRAO, type ConfigDedup } from '../config/parametros.js';
import { distanciaKm } from '../geo/index.js';
import { normalizarNomeOrganizacao, normalizarTexto, similaridadeNomes } from '../normalizacao/index.js';
import { extensaoTotalKm, pontoRepresentativo, tensoesKv } from '../projetos/derivados.js';
import type { Empreendimento, Identificador, Organizacao } from '../tipos.js';
import {
  compararIdentidades, identidadeDoTrecho, identidadesCompativeis, identidadesDoNome, mesmaExtremidade, subestacoesDoNome, type IdentidadeLT,
} from './identidadeLT.js';
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

// Identidades calculadas uma vez por objeto (empreendimentos e registros são substituídos, não mutados, ao mesclar).
const cacheProj = new WeakMap<Empreendimento, { assinatura: string; ids: IdentidadeLT[] }>();
const cacheReg = new WeakMap<RegistroNormalizado, IdentidadeLT[]>();

/** Identidades de LT de um empreendimento (nome oficial, nomes alternativos e trechos). */
export function identidadesDoEmpreendimento(p: Empreendimento): IdentidadeLT[] {
  // Assinatura protege contra edição do objeto no lugar (nome, apelidos ou trechos alterados).
  const assinatura = `${p.nomeOficial}|${p.nomesAlternativos.length}|${p.trechosLT.map((t) => t.nome).join('|')}`;
  const c = cacheProj.get(p);
  if (c?.assinatura === assinatura) return c.ids;
  const ids = unicas([...[p.nomeOficial, ...p.nomesAlternativos].flatMap(identidadesDoNome), ...p.trechosLT.flatMap(identidadeDoTrecho)]);
  cacheProj.set(p, { assinatura, ids });
  return ids;
}

/** Identidades de LT de um registro (nome, nomes alternativos e trechos). */
export function identidadesDoRegistro(r: RegistroNormalizado): IdentidadeLT[] {
  let ids = cacheReg.get(r);
  if (!ids) {
    ids = unicas([...[r.nome, ...(r.nomesAlternativos ?? [])].flatMap(identidadesDoNome), ...(r.trechosLT ?? []).flatMap(identidadeDoTrecho)]);
    cacheReg.set(r, ids);
  }
  return ids;
}

const cacheSesProj = new WeakMap<Empreendimento, { assinatura: string; ses: string[] }>();
const cacheSesReg = new WeakMap<RegistroNormalizado, string[]>();
/** Subestações objeto do empreendimento (pelo nome oficial e apelidos). */
export function sesDoEmpreendimento(p: Empreendimento): string[] {
  const assinatura = `${p.nomeOficial}|${p.nomesAlternativos.length}`;
  const c = cacheSesProj.get(p);
  if (c?.assinatura === assinatura) return c.ses;
  const ses = [...new Set([p.nomeOficial, ...p.nomesAlternativos].flatMap(subestacoesDoNome))];
  cacheSesProj.set(p, { assinatura, ses });
  return ses;
}
export function sesDoRegistro(r: RegistroNormalizado): string[] {
  let ses = cacheSesReg.get(r);
  if (!ses) {
    ses = [...new Set([r.nome, ...(r.nomesAlternativos ?? [])].flatMap(subestacoesDoNome))];
    cacheSesReg.set(r, ses);
  }
  return ses;
}
export const sesContidas = (xs: string[], ys: string[]) => xs.length > 0 && xs.every((x) => ys.some((y) => mesmaExtremidade(x, y)));

/** Todas as identidades de xs têm correspondente idêntico (extremidades, tensão e circuito) em ys. */
export const identidadesContidas = (xs: IdentidadeLT[], ys: IdentidadeLT[]) =>
  xs.length > 0 && xs.every((a) => ys.some((b) => compararIdentidades(a, b) === 'mesma'));

/** Tensões citadas pelo registro (declaradas, dos trechos e das subestações). */
function tensoesDoRegistro(r: RegistroNormalizado): number[] {
  return [...new Set([...(r.tensoesKv ?? []), ...(r.trechosLT ?? []).map((t) => t.tensaoKv), ...(r.subestacoes ?? []).flatMap((s) => s.tensoesKv ?? [])])];
}

export function pontuarCorrespondencia(
  r: RegistroNormalizado,
  p: Empreendimento,
  organizacoes: Map<string, Organizacao>,
  cfg: ConfigDedup = CONFIG_DEDUP_PADRAO,
): Correspondencia {
  const motivos: string[] = [];
  const idsProj = new Set(p.identificadores.map(chaveIdentificador));
  // A chave do item na própria fonte reconhece o mesmo registro em coletas seguintes, mesmo que o
  // empreendimento tenha acumulado identificadores de outros registros.
  const chavePropria = r.identificadores?.find((i) => i.tipo === 'chave_fonte' && idsProj.has(chaveIdentificador(i)));
  if (chavePropria) {
    return { empreendimentoId: p.id, pontuacao: 1, motivos: [`Mesmo registro da fonte (${chavePropria.valor}).`] };
  }
  // Identificadores exclusivos diferentes do mesmo tipo provam que são empreendimentos distintos.
  const idConflitante = r.identificadores?.find(
    (i) => TIPOS_EXCLUSIVOS.includes(i.tipo) && p.identificadores.some((x) => x.tipo === i.tipo && chaveIdentificador(x) !== chaveIdentificador(i)),
  );
  if (idConflitante) {
    return { empreendimentoId: p.id, pontuacao: 0, motivos: [`Identificadores oficiais distintos do mesmo tipo (${idConflitante.tipo}).`] };
  }
  // Identificador oficial do próprio empreendimento coincidente é decisivo.
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
  const ltsReg = identidadesDoRegistro(r);
  const ltsProj = identidadesDoEmpreendimento(p);
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
  // Contido em qualquer sentido: o registro é parte do empreendimento ou o empreendimento é parte do
  // registro (ex.: lote de leilão que reúne o empreendimento e outras instalações).
  const todasIguais = identidadesContidas(ltsReg, ltsProj) || identidadesContidas(ltsProj, ltsReg);
  // Contidas sem o circuito em um dos lados ("Seccionamento da LT A - B na SE C" × "SECC LT A - B, C1, na SE C").
  const compativeis = (xs: IdentidadeLT[], ys: IdentidadeLT[]) => xs.length > 0 && xs.every((a) => ys.some((b) => identidadesCompativeis(a, b)));
  const todasCompativeis = !todasIguais && !circuitoDiferente && (compativeis(ltsReg, ltsProj) || compativeis(ltsProj, ltsReg));
  if (todasIguais) {
    score = Math.max(score + 0.25, 0.9);
    motivos.push('Mesma(s) LT(s): extremidades, tensão e circuito coincidentes.');
  } else if (todasCompativeis) {
    score += 0.2;
    motivos.push('Mesma(s) LT(s): extremidades e tensão coincidentes (circuito não informado em um dos lados).');
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
  } else if (ltsReg.length && ltsProj.length && !mesma && !extremidades && !circuitoDiferente) {
    score -= 0.15;
    motivos.push('LTs com extremidades distintas.');
  }

  // Subestações objeto do empreendimento ("SE X ..."), não as citadas como local de obra.
  const sesReg = sesDoRegistro(r);
  const sesProj = sesDoEmpreendimento(p);
  let mesmaSE = false;
  if (sesReg.length && sesProj.length) {
    if (sesContidas(sesReg, sesProj) || sesContidas(sesProj, sesReg)) {
      mesmaSE = true;
      score += 0.2;
      motivos.push('Mesma(s) SE(s) objeto do empreendimento.');
    } else if (sesReg.some((x) => sesProj.some((y) => mesmaExtremidade(x, y)))) {
      score += 0.1;
      motivos.push('Ao menos uma SE objeto em comum.');
    } else if (!ltsReg.length || !ltsProj.length) {
      score -= 0.15;
      motivos.push('Subestações distintas.');
    }
  }

  // Tensão: a maior tensão de um lado presente no conjunto de tensões do outro (parte × todo,
  // ex.: SE 500/230 kV × LT 230 kV que chega a ela). LT idêntica dispensa a comparação.
  const kvsReg = tensoesDoRegistro(r);
  const kvsProj = tensoesKv(p);
  if (kvsReg.length && kvsProj.length) {
    const maxReg = Math.max(...kvsReg);
    const maxProj = Math.max(...kvsProj);
    if (maxReg === maxProj) {
      score += 0.15;
      motivos.push(`Mesma tensão máxima (${maxReg} kV).`);
    } else if (kvsProj.includes(maxReg) || kvsReg.includes(maxProj)) {
      score += 0.05;
      motivos.push(`Tensão compatível (${maxReg} × ${maxProj} kV máx.).`);
    } else if (!mesma) {
      score -= 0.2;
      motivos.push(`Tensões diferentes (${maxReg} × ${maxProj} kV).`);
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
  // O mesmo vale para a SE objeto quando um dos lados não tem LT identificada (ex.: lote "SE X" × "SE X e seccionamento ...").
  const forte = todasIguais || todasCompativeis || (mesmaSE && (!ltsReg.length || !ltsProj.length));
  if (forte && !circuitoDiferente && !motivos.some((m) => m.startsWith('Tensões diferentes') || m === 'Nenhuma UF em comum.')) {
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

/** Registro sintético com tudo o que o empreendimento tem, para comparar dois empreendimentos do cadastro. */
function registroDoEmpreendimento(a: Empreendimento, organizacoes: Map<string, Organizacao>): RegistroNormalizado {
  return {
    fonteId: 'interno',
    nome: a.nomeOficial,
    nomesAlternativos: a.nomesAlternativos,
    identificadores: a.identificadores,
    tensoesKv: tensoesKv(a),
    extensaoKm: extensaoTotalKm(a),
    trechosLT: a.trechosLT.map(({ id: _id, evidenciaIds: _ev, ...t }) => t),
    ufs: a.localizacao.ufs,
    ponto: pontoRepresentativo(a),
    organizacoes: a.participantes
      .map((x) => organizacoes.get(x.organizacaoId))
      .filter((o): o is Organizacao => !!o)
      .map((o) => ({ nome: o.nome, cnpj: o.cnpj, papel: 'empreendedor' as const })),
    evidencia: { titulo: 'interno', tipoDocumento: 'registro_manual' },
  };
}

/**
 * Possíveis duplicidades já existentes no cadastro (para a tela de qualidade). Compara apenas pares
 * com UF em comum (ou sem UF em um dos lados): sem UF comum a pontuação já é penalizada.
 */
export function possiveisDuplicidades(
  projetos: Empreendimento[],
  organizacoes: Map<string, Organizacao>,
  cfg: ConfigDedup = CONFIG_DEDUP_PADRAO,
  /** Pontuação mínima para listar o par (abaixo disso são, em geral, empreendimentos distintos de nome parecido). */
  minimo = 0.7,
): { a: string; b: string; pontuacao: number; motivos: string[] }[] {
  const res: { a: string; b: string; pontuacao: number; motivos: string[] }[] = [];
  const limiar = Math.max(minimo, cfg.limiarRevisao);
  const porUf = new Map<string, number[]>();
  const semUf: number[] = [];
  projetos.forEach((p, i) => {
    if (!p.localizacao.ufs.length) semUf.push(i);
    for (const uf of p.localizacao.ufs) porUf.set(uf, [...(porUf.get(uf) ?? []), i]);
  });
  for (let i = 0; i < projetos.length; i++) {
    const a = projetos[i];
    const candidatos = new Set<number>(a.localizacao.ufs.length ? [...a.localizacao.ufs.flatMap((u) => porUf.get(u) ?? []), ...semUf] : projetos.keys());
    const regA = registroDoEmpreendimento(a, organizacoes);
    for (const j of [...candidatos].filter((j) => j > i).sort((x, y) => x - y)) {
      const c = pontuarCorrespondencia(regA, projetos[j], organizacoes, cfg);
      if (c.pontuacao >= limiar) res.push({ a: a.id, b: projetos[j].id, pontuacao: c.pontuacao, motivos: c.motivos });
    }
  }
  return res.sort((x, y) => y.pontuacao - x.pontuacao);
}
