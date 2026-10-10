/**
 * Pipeline de ingestão: registros normalizados → validação → deduplicação → mescla
 * (com conflitos e histórico) → eventos de mudança. Independente da interface e do banco:
 * a persistência é feita pela "porta" implementada na API.
 */
import {
  compararIdentidades, identidadeDoTrecho, identidadesContidas, identidadesDoEmpreendimento, identidadesDoNome, identidadesDoRegistro, identidadesIguais,
  pontuarCorrespondencia,
  CONFIGURACAO_PADRAO, RegistroNormalizadoSchema, criarEmpreendimentoDeRegistro, decidirCorrespondencia, detectarMudancas,
  mesclarRegistro, novoId, resumoRegistro, type Coleta, type ConfiguracaoPlataforma, type ContextoMescla, type Empreendimento, type EventoMudanca,
  type Fonte, type IdentidadeLT, type MatchCandidato, type Organizacao, type RegistroNormalizado,
} from '@radar/core';
import type { Encerramento, SinalColetado } from './adaptadores/tipos.js';

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
 * documentado por outra fonte só acrescentam o que têm de próprio: evidência, traçado de trechos
 * correspondentes, participantes e marcos de tipos ainda sem registro. Nomes, identificadores e
 * investimento/RAP só quando o registro é exatamente a mesma instalação (mesmas LTs, tensões e
 * circuitos dos dois lados); UFs e localização só quando o registro é parte do empreendimento.
 * Extensão total, tipo e situações não são comparáveis entre parte e todo.
 *
 * `parcial`: o registro abrange vários empreendimentos (ex.: lote com várias LTs) e é ligado a cada
 * um deles; os identificadores do registro não são copiados, para não tornar as partes "iguais".
 */
export function reduzirParaComplemento(r: RegistroNormalizado, p: Empreendimento, opcoes: { parcial?: boolean } = {}): RegistroNormalizado {
  // Identidades do empreendimento só pelo nome oficial e trechos: apelidos podem ter vindo de complementos.
  const idsP = [...identidadesDoNome(p.nomeOficial), ...p.trechosLT.flatMap(identidadeDoTrecho)];
  const idsR = identidadesDoRegistro(r);
  // Igualdade por circuito ("C1 e C2" = trechos C1 + C2); sem circuito dos dois lados, pelas extremidades.
  const porCircuito = (ids: IdentidadeLT[]) => ids.flatMap((i) => (i.circuitos.length > 1 ? i.circuitos.map((c) => ({ ...i, circuitos: [c] })) : [i]));
  const igual = (a: IdentidadeLT, b: IdentidadeLT) =>
    identidadesIguais(a, b) || (!a.circuitos.length && !b.circuitos.length && compararIdentidades(a, b) === 'mesmas_extremidades');
  const [cR, cP] = [porCircuito(idsR), porCircuito(idsP)];
  const exato = !opcoes.parcial && cR.length > 0 && cP.length > 0 && cR.every((a) => cP.some((b) => igual(a, b))) && cP.every((b) => cR.some((a) => igual(a, b)));
  // Registro sem LT identificada (ex.: subestação) ou com todas as LTs dentro do empreendimento.
  const parte = !opcoes.parcial && (idsR.length === 0 || identidadesContidas(idsR, idsP));
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
    nome: exato ? r.nome : p.nomeOficial,
    nomesAlternativos: exato ? r.nomesAlternativos : undefined,
    identificadores: opcoes.parcial ? undefined : r.identificadores,
    organizacoes: r.organizacoes,
    ufs: parte || !p.localizacao.ufs.length ? r.ufs : undefined,
    ponto: parte && !p.localizacao.ponto ? r.ponto : undefined,
    trechosLT: trechos.length ? trechos : undefined,
    marcos: (r.marcos ?? []).filter((m) => !tiposComMarco.has(m.tipo) && !(temEnergizacao && ['energizacao', 'operacao_comercial', 'prazo_contratual_energizacao'].includes(m.tipo))),
    capexInfraEletricaBRL: exato ? r.capexInfraEletricaBRL : undefined,
    rapAnualBRL: exato ? r.rapAnualBRL : undefined,
    valoresMonetarios: exato ? r.valoresMonetarios : undefined,
    evidencia: r.evidencia,
    statusDado: r.statusDado,
  };
}

/**
 * Empreendimentos que são partes de um registro que abrange várias instalações (todas as LTs do
 * empreendimento estão no registro, mas não o contrário) e cuja correspondência é plausível.
 */
export function partesDoRegistro(r: RegistroNormalizado, projetos: Empreendimento[], organizacoes: Map<string, Organizacao>, cfg: ConfiguracaoPlataforma['dedup']): Empreendimento[] {
  const idsR = identidadesDoRegistro(r);
  if (idsR.length < 2) return [];
  return projetos.filter((p) => {
    if (p.statusGeral === 'cancelado') return false;
    const idsP = identidadesDoEmpreendimento(p);
    if (!identidadesContidas(idsP, idsR) || identidadesContidas(idsR, idsP)) return false;
    return pontuarCorrespondencia(r, p, organizacoes, cfg).pontuacao >= cfg.limiarAutomatico;
  });
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
  let vinculosMultiplos = 0;
  const complementar = (op.fonte.config as { papelMescla?: string }).papelMescla === 'complementar';

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
      // Registro complementar que abrange vários empreendimentos (ex.: lote com várias LTs já
      // acompanhadas individualmente): liga-se a cada parte, sem criar um empreendimento sobreposto.
      const partes = !op.vincularA && complementar ? partesDoRegistro(r, projetos, orgMap, cfg.dedup) : [];
      if (partes.length >= 2) {
        let mudou = false;
        for (const parte of partes) {
          const idx = projetos.findIndex((p) => p.id === parte.id);
          const res = mesclarRegistro(parte, reduzirParaComplemento(r, parte, { parcial: true }), ctx);
          projetos[idx] = res.projeto;
          for (const o of res.organizacoesNovas) {
            await op.porta.salvarOrganizacao(o);
            orgMap.set(o.id, o);
          }
          await op.porta.salvarEmpreendimento(res.projeto, parte);
          if (!res.mudou) continue;
          mudou = true;
          coleta.conflitos += res.conflitosNovos.length;
          afetados.add(res.projeto.id);
          eventos.push(...detectarMudancas(parte, res.projeto, { agora, etapas: cfg.etapas, nomeOrganizacao: nomeOrg }));
        }
        if (mudou) coleta.atualizados++;
        else coleta.semMudanca++;
        vinculosMultiplos++;
        continue;
      }
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
        resultado = mesclarRegistro(antes, complementar && outraFonte ? reduzirParaComplemento(r, antes) : r, ctx);
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
  if (vinculosMultiplos) {
    coleta.avisos.push(`${vinculosMultiplos} registro(s) abrangendo vários empreendimentos já acompanhados vinculado(s) a cada parte (sem investimento atribuído).`);
  }
  if (incertosSemRevisao) {
    coleta.avisos.push(`${incertosSemRevisao} registro(s) com correspondência incerta cadastrados como novos (execução sem revisor) — conferir em Qualidade → Possíveis duplicidades.`);
  }
  if (eventos.length) await op.porta.registrarEventos(eventos);
  return { coleta, eventos, empreendimentosAfetados: [...afetados] };
}

/** Aplica encerramentos informados pela fonte aos empreendimentos ativos acompanhados (pela chave da fonte). */
export async function aplicarEncerramentos(encerramentos: Encerramento[], op: Omit<OpcoesProcessamento, 'vincularA'>): Promise<number> {
  if (!encerramentos.length) return 0;
  const projetos = await op.porta.listarEmpreendimentos();
  const porChave = new Map<string, Empreendimento>();
  for (const p of projetos) {
    if (p.statusGeral !== 'ativo') continue;
    for (const i of p.identificadores) if (i.tipo === 'chave_fonte' && i.valor.startsWith(`${op.fonte.id}|`)) porChave.set(i.valor.slice(op.fonte.id.length + 1), p);
  }
  let n = 0;
  for (const e of encerramentos) {
    const p = porChave.get(e.chaveExterna);
    if (!p) continue;
    const r: RegistroNormalizado = {
      fonteId: op.fonte.id,
      chaveExterna: e.chaveExterna,
      nome: p.nomeOficial,
      statusGeral: e.statusGeral,
      situacaoObra: e.statusGeral === 'concluido' ? 'concluida' : undefined,
      marcos: e.marcos,
      evidencia: { ...e.evidencia, trecho: `${e.motivo}. ${e.evidencia.trecho ?? ''}`.trim() },
    };
    await processarRegistros([r], { ...op, vincularA: p.id, filtrarTensao: false });
    n++;
  }
  if (n) op.coleta.avisos.push(`${n} empreendimento(s) acompanhado(s) encerrado(s) pela fonte (operação ou revogação).`);
  return n;
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
