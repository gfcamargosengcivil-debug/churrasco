/**
 * Pipeline de ingestão: registros normalizados → validação → deduplicação → mescla
 * (com conflitos e histórico) → eventos de mudança. Independente da interface e do banco:
 * a persistência é feita pela "porta" implementada na API.
 */
import {
  compararIdentidades, identidadeDoTrecho, identidadesDoNome,
  CONFIGURACAO_PADRAO, RegistroNormalizadoSchema, criarEmpreendimentoDeRegistro, decidirCorrespondencia, detectarMudancas,
  mesclarRegistro, novoId, resumoRegistro, type Coleta, type ConfiguracaoPlataforma, type ContextoMescla, type Empreendimento, type EventoMudanca,
  type Fonte, type MatchCandidato, type Organizacao, type RegistroNormalizado,
} from '@radar/core';
import type { SinalColetado } from './adaptadores/tipos.js';

export interface PortaIngestao {
  listarEmpreendimentos(): Promise<Empreendimento[]>;
  listarOrganizacoes(): Promise<Organizacao[]>;
  salvarEmpreendimento(p: Empreendimento, antes: Empreendimento | null): Promise<void>;
  salvarOrganizacao(o: Organizacao): Promise<void>;
  salvarMatchCandidato(m: MatchCandidato): Promise<void>;
  registrarEventos(eventos: EventoMudanca[]): Promise<void>;
  proximoCodigo(): Promise<string>;
  registrarSinais?(sinais: SinalColetado[], coletaId: string): Promise<number>;
}

export interface OpcoesProcessamento {
  porta: PortaIngestao;
  fonte: Fonte;
  coleta: Coleta;
  config?: ConfiguracaoPlataforma;
  por: string;
  origem?: 'ingestao' | 'manual' | 'ia';
  agora?: string;
  /** Descartar registros com tensão conhecida abaixo do mínimo do escopo (padrão: true). */
  filtrarTensao?: boolean;
  /** Força vínculo a um empreendimento (revisão manual decidida pelo usuário). */
  vincularA?: string;
  /**
   * Execução sem revisor (publicação automática): correspondências incertas viram empreendimentos
   * novos em vez de ficarem pendentes; os pares semelhantes continuam visíveis em "Possíveis duplicidades".
   */
  semRevisaoManual?: boolean;
}

/**
 * Fontes "complementares" (planejamento, lotes de leilão) ao se ligarem a um empreendimento já
 * documentado por outra fonte só acrescentam o que têm de próprio: identificadores, nomes,
 * evidência, traçado de trechos correspondentes, localização ausente, participantes, marcos de
 * tipos ainda sem registro e — quando o registro corresponde inteiramente ao empreendimento —
 * investimento declarado. Extensão total, tipo e situações não são comparáveis entre parte e todo.
 */
export function reduzirParaComplemento(r: RegistroNormalizado, p: Empreendimento): RegistroNormalizado {
  const idsP = [...[p.nomeOficial, ...p.nomesAlternativos].flatMap(identidadesDoNome), ...p.trechosLT.flatMap(identidadeDoTrecho)];
  const idsR = [...[r.nome, ...(r.nomesAlternativos ?? [])].flatMap(identidadesDoNome), ...(r.trechosLT ?? []).flatMap(identidadeDoTrecho)];
  const corresponde = idsR.length > 0 && idsR.every((a) => idsP.some((b) => compararIdentidades(a, b) === 'mesma'));
  const trechos: NonNullable<RegistroNormalizado['trechosLT']> = [];
  for (const t of r.trechosLT ?? []) {
    if (!t.tracado) continue;
    const [it] = identidadeDoTrecho(t);
    const alvo = it && p.trechosLT.find((x) => !x.tracado && identidadeDoTrecho(x).some((b) => ['mesma', 'mesmas_extremidades'].includes(compararIdentidades(it, b))));
    if (alvo) trechos.push({ nome: alvo.nome, tensaoKv: alvo.tensaoKv, corrente: alvo.corrente, tracado: t.tracado });
  }
  const tiposComMarco = new Set(p.marcos.map((m) => m.tipo));
  const temEnergizacao = p.marcos.some((m) => ['energizacao', 'operacao_comercial', 'prazo_contratual_energizacao'].includes(m.tipo));
  return {
    fonteId: r.fonteId,
    chaveExterna: r.chaveExterna,
    nome: r.nome,
    nomesAlternativos: r.nomesAlternativos,
    identificadores: r.identificadores,
    organizacoes: r.organizacoes,
    ufs: r.ufs,
    ponto: p.localizacao.ponto ? undefined : r.ponto,
    trechosLT: trechos.length ? trechos : undefined,
    marcos: (r.marcos ?? []).filter((m) => !tiposComMarco.has(m.tipo) && !(temEnergizacao && ['energizacao', 'operacao_comercial', 'prazo_contratual_energizacao'].includes(m.tipo))),
    capexInfraEletricaBRL: corresponde ? r.capexInfraEletricaBRL : undefined,
    rapAnualBRL: corresponde ? r.rapAnualBRL : undefined,
    evidencia: r.evidencia,
    statusDado: r.statusDado,
  };
}

export async function processarRegistros(registros: RegistroNormalizado[], op: OpcoesProcessamento): Promise<{ coleta: Coleta; eventos: EventoMudanca[]; empreendimentosAfetados: string[] }> {
  const cfg = op.config ?? CONFIGURACAO_PADRAO;
  const agora = op.agora ?? new Date().toISOString();
  const coleta = op.coleta;
  const eventos: EventoMudanca[] = [];
  const afetados = new Set<string>();
  const projetos = await op.porta.listarEmpreendimentos();
  const organizacoes = await op.porta.listarOrganizacoes();
  const orgMap = new Map(organizacoes.map((o) => [o.id, o]));
  const nomeOrg = (id: string) => orgMap.get(id)?.nome;
  let incertosSemRevisao = 0;

  for (const bruto of registros) {
    coleta.registrosLidos++;
    const parsed = RegistroNormalizadoSchema.safeParse(bruto);
    if (!parsed.success) {
      coleta.descartados++;
      coleta.erros.push(`Registro "${(bruto as { nome?: string }).nome ?? '?'}" inválido: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      continue;
    }
    const r = parsed.data;
    // A chave do item na fonte identifica o mesmo registro nas coletas seguintes.
    if (r.chaveExterna) {
      const chave = { tipo: 'chave_fonte' as const, valor: `${op.fonte.id}|${r.chaveExterna}` };
      if (!r.identificadores?.some((i) => i.tipo === chave.tipo && i.valor === chave.valor)) r.identificadores = [...(r.identificadores ?? []), chave];
    }
    const kv = r.tensoesKv?.length ? Math.max(...r.tensoesKv) : r.trechosLT?.length ? Math.max(...r.trechosLT.map((t) => t.tensaoKv)) : undefined;
    if ((op.filtrarTensao ?? true) && kv !== undefined && kv < cfg.portfolio.tensaoMinimaKv) {
      coleta.descartados++;
      coleta.avisos.push(`"${r.nome}" descartado: ${kv} kV abaixo do escopo (${cfg.portfolio.tensaoMinimaKv} kV).`);
      continue;
    }
    try {
      const ctx: ContextoMescla = { fonte: op.fonte, organizacoes: [...orgMap.values()], por: op.por, origem: op.origem ?? 'ingestao', coletaId: coleta.id, agora, fluxos: cfg.fluxos };
      const decisao = op.vincularA
        ? { acao: 'vincular' as const, empreendimentoId: op.vincularA, candidatos: [] }
        : decidirCorrespondencia(r, projetos, orgMap, cfg.dedup);
      if (decisao.acao === 'revisar' && op.semRevisaoManual) {
        incertosSemRevisao++;
      } else if (decisao.acao === 'revisar') {
        await op.porta.salvarMatchCandidato({
          id: novoId('mt'),
          coletaId: coleta.id,
          fonteId: op.fonte.id,
          registro: r,
          resumoRegistro: resumoRegistro(r),
          candidatos: decisao.candidatos,
          status: 'pendente',
          criadoEm: agora,
        });
        coleta.paraRevisao++;
        continue;
      }
      let resultado;
      let antes: Empreendimento | null = null;
      if (decisao.acao === 'vincular') {
        const idx = projetos.findIndex((p) => p.id === decisao.empreendimentoId);
        if (idx < 0) throw new Error(`Empreendimento ${decisao.empreendimentoId} não encontrado`);
        antes = projetos[idx];
        const outraFonte = antes.evidencias.some((e) => e.fonteId !== op.fonte.id);
        const complementar = (op.fonte.config as { papelMescla?: string }).papelMescla === 'complementar' && outraFonte;
        resultado = mesclarRegistro(antes, complementar ? reduzirParaComplemento(r, antes) : r, ctx);
        if (!resultado.mudou) {
          // Mesmo sem mudança de dados, a confirmação (última confirmação da evidência) é registrada.
          await op.porta.salvarEmpreendimento(resultado.projeto, antes);
          projetos[idx] = resultado.projeto;
          coleta.semMudanca++;
          continue;
        }
        projetos[idx] = resultado.projeto;
        coleta.atualizados++;
      } else {
        resultado = criarEmpreendimentoDeRegistro(r, ctx, await op.porta.proximoCodigo());
        projetos.push(resultado.projeto);
        coleta.criados++;
      }
      for (const o of resultado.organizacoesNovas) {
        await op.porta.salvarOrganizacao(o);
        orgMap.set(o.id, o);
      }
      coleta.conflitos += resultado.conflitosNovos.length;
      await op.porta.salvarEmpreendimento(resultado.projeto, antes);
      afetados.add(resultado.projeto.id);
      eventos.push(...detectarMudancas(antes, resultado.projeto, { agora, etapas: cfg.etapas, nomeOrganizacao: nomeOrg }));
    } catch (e) {
      coleta.erros.push(`"${r.nome}": ${(e as Error).message}`);
    }
  }
  if (incertosSemRevisao) {
    coleta.avisos.push(`${incertosSemRevisao} registro(s) com correspondência incerta cadastrados como novos (execução sem revisor) — conferir em Qualidade → Possíveis duplicidades.`);
  }
  if (eventos.length) await op.porta.registrarEventos(eventos);
  return { coleta, eventos, empreendimentosAfetados: [...afetados] };
}

export function novaColeta(fonteId: string, disparo: Coleta['disparo'], usuario?: string): Coleta {
  return {
    id: novoId('col'),
    fonteId,
    disparo,
    usuario,
    iniciadaEm: new Date().toISOString(),
    status: 'em_andamento',
    registrosLidos: 0,
    criados: 0,
    atualizados: 0,
    semMudanca: 0,
    paraRevisao: 0,
    conflitos: 0,
    descartados: 0,
    erros: [],
    avisos: [],
  };
}

export function finalizarColeta(c: Coleta): Coleta {
  c.finalizadaEm = new Date().toISOString();
  const algumSucesso = c.criados + c.atualizados + c.semMudanca + c.paraRevisao > 0;
  c.status = c.erros.length === 0 ? 'sucesso' : algumSucesso ? 'parcial' : 'erro';
  return c;
}
