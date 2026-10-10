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

const chaveIdentificador = (i: Pick<Identificador, 'tipo' | 'valor'>) => `${i.tipo}:${normalizarTexto(i.valor).replace(/[^a-z0-9]/g, '')}`;

export function pontuarCorrespondencia(
  r: RegistroNormalizado,
  p: Empreendimento,
  organizacoes: Map<string, Organizacao>,
  cfg: ConfigDedup = CONFIG_DEDUP_PADRAO,
): Correspondencia {
  const motivos: string[] = [];
  // Identificador oficial coincidente é decisivo.
  const idsProj = new Set(p.identificadores.map(chaveIdentificador));
  const idComum = r.identificadores?.find((i) => idsProj.has(chaveIdentificador(i)));
  if (idComum) {
    return { empreendimentoId: p.id, pontuacao: 1, motivos: [`Identificador oficial coincidente (${idComum.tipo}: ${idComum.valor}).`] };
  }

  let score = 0;
  const nomesReg = [r.nome, ...(r.nomesAlternativos ?? [])];
  const nomesProj = [p.nomeOficial, ...p.nomesAlternativos];
  let simNome = 0;
  for (const a of nomesReg) for (const b of nomesProj) simNome = Math.max(simNome, similaridadeNomes(a, b));
  score += 0.45 * simNome;
  motivos.push(`Similaridade de nome ${Math.round(simNome * 100)}%.`);

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
