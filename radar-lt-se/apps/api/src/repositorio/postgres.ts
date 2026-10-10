/**
 * Repositório PostgreSQL/PostGIS. O agregado Empreendimento é persistido de forma normalizada
 * (tabelas filhas com geometria) em transação; o histórico é somente-inclusão.
 */
import pg from 'pg';
import {
  EmpreendimentoSchema, etapaAtual, extensaoTotalKm, regioes, tensaoMaxKv,
  type AlertaNotificacao, type AlertaRegra, type AuditLog, type Coleta, type ConfiguracaoPlataforma, type Documento,
  type Empreendimento, type EventoMudanca, type Fonte, type MatchCandidato, type OportunidadeComercial, type Organizacao,
} from '@radar/core';
import type { ConfigAmbiente } from '../config.js';
import type { FiltroDocumentos, FiltroEventos, Repositorio } from './tipos.js';

export function criarPool(amb: Pick<ConfigAmbiente, 'DATABASE_URL' | 'DATABASE_SSL'>): pg.Pool {
  // Datas (DATE) como texto ISO, sem conversão de fuso.
  pg.types.setTypeParser(1082, (v) => v);
  pg.types.setTypeParser(1700, (v) => Number(v));
  pg.types.setTypeParser(20, (v) => Number(v));
  return new pg.Pool({ connectionString: amb.DATABASE_URL, ssl: amb.DATABASE_SSL ? { rejectUnauthorized: false } : undefined, max: 10 });
}

type Linha = Record<string, any>;
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : (d as string | undefined) ?? undefined);
const semNulos = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as T;
const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

function agrupar(linhas: Linha[]): Map<string, Linha[]> {
  const m = new Map<string, Linha[]>();
  for (const l of linhas) m.set(l.empreendimento_id, [...(m.get(l.empreendimento_id) ?? []), l]);
  return m;
}

export class PgRepository implements Repositorio {
  readonly tipo = 'postgres' as const;
  constructor(private pool: pg.Pool) {}

  private async transacao<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      const r = await fn(c);
      await c.query('commit');
      return r;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }

  // ---------------- Empreendimentos ----------------
  private async carregar(ids?: string[]): Promise<Empreendimento[]> {
    const filtro = ids ? 'where empreendimento_id = any($1)' : '';
    const filtroEmp = ids ? 'where id = any($1)' : '';
    const p = ids ? [ids] : [];
    const q = (sql: string) => this.pool.query(sql, p).then((r) => r.rows as Linha[]);
    const [emp, part, lotes, trechos, ses, contratos, pacotes, etapas, marcos, evid, prov, conf, hist] = await Promise.all([
      q(`select *, st_y(ponto) as lat, st_x(ponto) as lon from empreendimento ${filtroEmp} order by codigo`),
      q(`select * from participacao ${filtro}`),
      q(`select * from lote ${filtro}`),
      q(`select *, st_asgeojson(tracado)::json as tracado_geo from trecho_lt ${filtro} order by id`),
      q(`select *, st_y(ponto) as lat, st_x(ponto) as lon from subestacao ${filtro} order by id`),
      q(`select * from contrato ${filtro}`),
      q(`select * from pacote_servico ${filtro}`),
      q(`select * from etapa_status ${filtro}`),
      q(`select * from marco ${filtro} order by data`),
      q(`select * from evidencia ${filtro}`),
      q(`select * from proveniencia_campo ${filtro}`),
      q(`select * from conflito ${filtro}`),
      q(`select * from historico_alteracao ${filtro} order by em`),
    ]);
    const g = {
      part: agrupar(part), lotes: agrupar(lotes), trechos: agrupar(trechos), ses: agrupar(ses), contratos: agrupar(contratos), pacotes: agrupar(pacotes),
      etapas: agrupar(etapas), marcos: agrupar(marcos), evid: agrupar(evid), prov: agrupar(prov), conf: agrupar(conf), hist: agrupar(hist),
    };
    return emp.map((e) => {
      const id = e.id as string;
      const valor = (v: Linha | null) => v ?? undefined;
      return EmpreendimentoSchema.parse({
        id, codigo: e.codigo, nomeOficial: e.nome_oficial, nomesAlternativos: e.nomes_alternativos, identificadores: e.identificadores,
        tipo: e.tipo, setorOrigem: e.setor_origem, subsetor: e.subsetor ?? undefined, descricao: e.descricao ?? undefined, fluxoId: e.fluxo_id,
        statusGeral: e.status_geral, situacaoObra: e.situacao_obra,
        situacoes: { regulatoria: e.situacao_regulatoria, ambiental: e.situacao_ambiental, fundiaria: e.situacao_fundiaria, engenharia: e.situacao_engenharia },
        localizacao: {
          municipios: e.municipios, ufs: e.ufs,
          ponto: e.lat !== null && e.lat !== undefined ? semNulos({ lat: e.lat, lon: e.lon, precisao: e.ponto_precisao, fonte: e.ponto_fonte }) : undefined,
        },
        tecnico: semNulos({ tensoesKv: (e.tensoes_kv ?? []).map(Number), extensaoKm: e.extensao_km, circuitos: e.circuitos, capacidadeMva: e.capacidade_mva, qtdSubestacoes: e.qtd_subestacoes, potenciaMw: e.potencia_mw, caracteristicas: e.caracteristicas }),
        financeiro: semNulos({ capexTotal: valor(e.capex_total), capexInfraEletrica: valor(e.capex_infra_eletrica), rapAnual: valor(e.rap_anual), fonteFinanciamento: e.fonte_financiamento }),
        participantes: (g.part.get(id) ?? []).map((x) => semNulos({ organizacaoId: x.organizacao_id, papel: x.papel, escopo: x.escopo, evidenciaIds: x.evidencia_ids })),
        lotes: (g.lotes.get(id) ?? []).map((x) => semNulos({ id: x.id, nome: x.nome, leilao: x.leilao, evidenciaIds: x.evidencia_ids })),
        trechosLT: (g.trechos.get(id) ?? []).map((x) =>
          semNulos({
            id: x.id, loteId: x.lote_id, nome: x.nome, tensaoKv: x.tensao_kv, corrente: x.corrente, extensaoKm: x.extensao_km, circuitos: x.circuitos, cabo: x.cabo, estruturas: x.estruturas,
            origem: x.origem, destino: x.destino, evidenciaIds: x.evidencia_ids,
            tracado: x.tracado_geo ? semNulos({ coordenadas: x.tracado_geo.coordinates, natureza: x.tracado_natureza, evidenciaId: x.tracado_evidencia_id, observacao: x.tracado_observacao }) : undefined,
          }),
        ),
        subestacoes: (g.ses.get(id) ?? []).map((x) =>
          semNulos({
            id: x.id, loteId: x.lote_id, nome: x.nome, natureza: x.natureza, tensoesKv: (x.tensoes_kv ?? []).map(Number), capacidadeMva: x.capacidade_mva, transformadores: x.transformadores,
            isolamento: x.isolamento, municipio: x.municipio, uf: x.uf, evidenciaIds: x.evidencia_ids,
            ponto: x.lat !== null && x.lat !== undefined ? semNulos({ lat: x.lat, lon: x.lon, precisao: x.ponto_precisao, fonte: x.ponto_fonte }) : undefined,
          }),
        ),
        contratos: (g.contratos.get(id) ?? []).map((x) => semNulos({ id: x.id, objeto: x.objeto, pacotes: x.pacotes, escopo: x.escopo, contratanteId: x.contratante_id, contratadaId: x.contratada_id, valorBRL: x.valor_brl, dataAssinatura: x.data_assinatura, status: x.status, evidenciaIds: x.evidencia_ids })),
        pacotes: (g.pacotes.get(id) ?? []).map((x) => semNulos({ pacote: x.pacote, escopo: x.escopo, faseContratacao: x.fase_contratacao, contratadaId: x.contratada_id, dataEvento: x.data_evento, evidenciaIds: x.evidencia_ids, observacao: x.observacao })),
        etapas: (g.etapas.get(id) ?? []).map((x) => semNulos({ etapaId: x.etapa_id, status: x.status, dataInicio: x.data_inicio, dataFim: x.data_fim, evidenciaIds: x.evidencia_ids, observacao: x.observacao })),
        marcos: (g.marcos.get(id) ?? []).map((x) => semNulos({ id: x.id, tipo: x.tipo, data: x.data, natureza: x.natureza, escopo: x.escopo, descricao: x.descricao, evidenciaIds: x.evidencia_ids })),
        evidencias: (g.evid.get(id) ?? []).map((x) =>
          semNulos({
            id: x.id, fonteId: x.fonte_id, titulo: x.titulo, url: x.url, documentoId: x.documento_id, trecho: x.trecho, pagina: x.pagina, tipoDocumento: x.tipo_documento,
            dataPublicacao: x.data_publicacao, dataColeta: x.data_coleta, validoAte: x.valido_ate, ultimaConfirmacao: x.ultima_confirmacao, classe: x.classe, coletaId: x.coleta_id,
          }),
        ),
        proveniencia: Object.fromEntries((g.prov.get(id) ?? []).map((x) => [x.campo, semNulos({ status: x.status, evidenciaIds: x.evidencia_ids, observacao: x.observacao, emConflito: x.em_conflito || undefined, atualizadoEm: x.atualizado_em })])),
        conflitos: (g.conf.get(id) ?? []).map((x) => semNulos({ id: x.id, campo: x.campo, valores: x.valores, valorAdotado: x.valor_adotado, criterioAdocao: x.criterio_adocao, status: x.status, resolucao: x.resolucao, abertoEm: x.aberto_em })),
        historico: (g.hist.get(id) ?? []).map((x) => semNulos({ id: x.id, em: iso(x.em), por: x.por, origem: x.origem, campo: x.campo, de: x.de, para: x.para, evidenciaId: x.evidencia_id, coletaId: x.coleta_id, observacao: x.observacao })),
        responsavelInterno: e.responsavel_interno ?? undefined, observacoes: e.observacoes ?? undefined, tags: e.tags,
        identificadoEm: e.identificado_em, criadoEm: iso(e.criado_em), atualizadoEm: iso(e.atualizado_em), demo: e.demo,
      });
    });
  }

  async listarEmpreendimentos() { return this.carregar(); }
  async obterEmpreendimento(id: string) { return (await this.carregar([id]))[0]; }

  async salvarEmpreendimento(p: Empreendimento) {
    await this.transacao(async (c) => {
      const pt = p.localizacao.ponto;
      await c.query(
        `insert into empreendimento (id, codigo, nome_oficial, nomes_alternativos, identificadores, tipo, setor_origem, subsetor, descricao, fluxo_id,
           status_geral, situacao_obra, situacao_regulatoria, situacao_ambiental, situacao_fundiaria, situacao_engenharia, municipios, ufs,
           ponto, ponto_precisao, ponto_fonte, tensoes_kv, extensao_km, circuitos, capacidade_mva, qtd_subestacoes, potencia_mw, caracteristicas,
           capex_total, capex_infra_eletrica, rap_anual, fonte_financiamento, responsavel_interno, observacoes, tags, identificado_em, criado_em,
           atualizado_em, demo, tensao_max_kv, extensao_total_km, regioes, etapa_atual)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
           case when $19::float8 is null then null else st_setsrid(st_makepoint($20::float8, $19::float8), 4326) end,
           $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44)
         on conflict (id) do update set codigo = excluded.codigo, nome_oficial = excluded.nome_oficial, nomes_alternativos = excluded.nomes_alternativos,
           identificadores = excluded.identificadores, tipo = excluded.tipo, setor_origem = excluded.setor_origem, subsetor = excluded.subsetor,
           descricao = excluded.descricao, fluxo_id = excluded.fluxo_id, status_geral = excluded.status_geral, situacao_obra = excluded.situacao_obra,
           situacao_regulatoria = excluded.situacao_regulatoria, situacao_ambiental = excluded.situacao_ambiental, situacao_fundiaria = excluded.situacao_fundiaria,
           situacao_engenharia = excluded.situacao_engenharia, municipios = excluded.municipios, ufs = excluded.ufs, ponto = excluded.ponto,
           ponto_precisao = excluded.ponto_precisao, ponto_fonte = excluded.ponto_fonte, tensoes_kv = excluded.tensoes_kv, extensao_km = excluded.extensao_km,
           circuitos = excluded.circuitos, capacidade_mva = excluded.capacidade_mva, qtd_subestacoes = excluded.qtd_subestacoes, potencia_mw = excluded.potencia_mw,
           caracteristicas = excluded.caracteristicas, capex_total = excluded.capex_total, capex_infra_eletrica = excluded.capex_infra_eletrica,
           rap_anual = excluded.rap_anual, fonte_financiamento = excluded.fonte_financiamento, responsavel_interno = excluded.responsavel_interno,
           observacoes = excluded.observacoes, tags = excluded.tags, atualizado_em = excluded.atualizado_em, demo = excluded.demo,
           tensao_max_kv = excluded.tensao_max_kv, extensao_total_km = excluded.extensao_total_km, regioes = excluded.regioes, etapa_atual = excluded.etapa_atual`,
        [
          p.id, p.codigo, p.nomeOficial, p.nomesAlternativos, json(p.identificadores), p.tipo, p.setorOrigem, p.subsetor ?? null, p.descricao ?? null, p.fluxoId,
          p.statusGeral, p.situacaoObra, p.situacoes.regulatoria, p.situacoes.ambiental, p.situacoes.fundiaria, p.situacoes.engenharia, json(p.localizacao.municipios), p.localizacao.ufs,
          pt?.lat ?? null, pt?.lon ?? null, pt?.precisao ?? null, pt?.fonte ?? null, p.tecnico.tensoesKv, p.tecnico.extensaoKm ?? null, p.tecnico.circuitos ?? null,
          p.tecnico.capacidadeMva ?? null, p.tecnico.qtdSubestacoes ?? null, p.tecnico.potenciaMw ?? null, p.tecnico.caracteristicas ?? null,
          json(p.financeiro.capexTotal), json(p.financeiro.capexInfraEletrica), json(p.financeiro.rapAnual), p.financeiro.fonteFinanciamento ?? null,
          p.responsavelInterno ?? null, p.observacoes ?? null, p.tags, p.identificadoEm, p.criadoEm, p.atualizadoEm, p.demo,
          tensaoMaxKv(p) ?? null, extensaoTotalKm(p) ?? null, regioes(p), etapaAtual(p)?.id ?? null,
        ],
      );
      for (const t of ['participacao', 'lote', 'trecho_lt', 'subestacao', 'contrato', 'pacote_servico', 'etapa_status', 'marco', 'evidencia', 'proveniencia_campo', 'conflito']) {
        await c.query(`delete from ${t} where empreendimento_id = $1`, [p.id]);
      }
      for (const x of p.participantes) {
        await c.query('insert into participacao values ($1,$2,$3,$4,$5) on conflict do nothing', [p.id, x.organizacaoId, x.papel, x.escopo ?? null, x.evidenciaIds]);
      }
      for (const x of p.lotes) await c.query('insert into lote values ($1,$2,$3,$4,$5)', [x.id, p.id, x.nome, x.leilao ?? null, x.evidenciaIds]);
      for (const x of p.trechosLT) {
        await c.query(
          `insert into trecho_lt (id, empreendimento_id, lote_id, nome, tensao_kv, corrente, extensao_km, circuitos, cabo, estruturas, origem, destino,
             tracado, tracado_natureza, tracado_evidencia_id, tracado_observacao, evidencia_ids)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, case when $13::text is null then null else st_setsrid(st_geomfromgeojson($13), 4326) end, $14,$15,$16,$17)`,
          [x.id, p.id, x.loteId ?? null, x.nome, x.tensaoKv, x.corrente, x.extensaoKm ?? null, x.circuitos ?? null, x.cabo ?? null, x.estruturas ?? null, x.origem ?? null, x.destino ?? null,
            x.tracado ? JSON.stringify({ type: 'LineString', coordinates: x.tracado.coordenadas }) : null, x.tracado?.natureza ?? null, x.tracado?.evidenciaId ?? null, x.tracado?.observacao ?? null, x.evidenciaIds],
        );
      }
      for (const x of p.subestacoes) {
        await c.query(
          `insert into subestacao (id, empreendimento_id, lote_id, nome, natureza, tensoes_kv, capacidade_mva, transformadores, isolamento, municipio, uf, ponto, ponto_precisao, ponto_fonte, evidencia_ids)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, case when $12::float8 is null then null else st_setsrid(st_makepoint($13::float8, $12::float8), 4326) end, $14,$15,$16)`,
          [x.id, p.id, x.loteId ?? null, x.nome, x.natureza, x.tensoesKv, x.capacidadeMva ?? null, x.transformadores ?? null, x.isolamento ?? null, x.municipio ?? null, x.uf ?? null,
            x.ponto?.lat ?? null, x.ponto?.lon ?? null, x.ponto?.precisao ?? null, x.ponto?.fonte ?? null, x.evidenciaIds],
        );
      }
      for (const x of p.contratos) {
        await c.query('insert into contrato values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [x.id, p.id, x.objeto, x.pacotes, x.escopo, x.contratanteId ?? null, x.contratadaId ?? null, x.valorBRL ?? null, x.dataAssinatura ?? null, x.status, x.evidenciaIds]);
      }
      for (const x of p.pacotes) {
        await c.query('insert into pacote_servico values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing', [p.id, x.pacote, x.escopo, x.faseContratacao, x.contratadaId ?? null, x.dataEvento ?? null, x.evidenciaIds, x.observacao ?? null]);
      }
      for (const x of p.etapas) {
        await c.query('insert into etapa_status values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing', [p.id, x.etapaId, x.status, x.dataInicio ?? null, x.dataFim ?? null, x.evidenciaIds, x.observacao ?? null]);
      }
      for (const x of p.marcos) {
        await c.query('insert into marco values ($1,$2,$3,$4,$5,$6,$7,$8)', [x.id, p.id, x.tipo, x.data, x.natureza, x.escopo, x.descricao ?? null, x.evidenciaIds]);
      }
      for (const x of p.evidencias) {
        await c.query('insert into evidencia values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)', [
          x.id, p.id, x.fonteId, x.titulo, x.url ?? null, x.documentoId ?? null, x.trecho ?? null, x.pagina ?? null, x.tipoDocumento, x.dataPublicacao ?? null,
          x.dataColeta, x.validoAte ?? null, x.ultimaConfirmacao ?? null, x.classe ?? null, x.coletaId ?? null,
        ]);
      }
      for (const [campo, x] of Object.entries(p.proveniencia)) {
        await c.query('insert into proveniencia_campo values ($1,$2,$3,$4,$5,$6,$7)', [p.id, campo, x.status, x.evidenciaIds, x.observacao ?? null, !!x.emConflito, x.atualizadoEm]);
      }
      for (const x of p.conflitos) {
        await c.query('insert into conflito values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [x.id, p.id, x.campo, json(x.valores), json(x.valorAdotado), x.criterioAdocao, x.status, json(x.resolucao), x.abertoEm]);
      }
      for (const x of p.historico) {
        await c.query('insert into historico_alteracao values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (id) do nothing', [
          x.id, p.id, x.em, x.por, x.origem, x.campo, json(x.de), json(x.para), x.evidenciaId ?? null, x.coletaId ?? null, x.observacao ?? null,
        ]);
      }
    });
  }

  async excluirEmpreendimento(id: string) {
    await this.pool.query('delete from empreendimento where id = $1', [id]);
  }

  async proximoSequencial() {
    // Mantém a sequência à frente do maior código existente (ex.: após importação) e reserva o próximo.
    await this.pool.query(
      `select setval('empreendimento_codigo_seq', greatest((select last_value from empreendimento_codigo_seq),
         (select coalesce(max(nullif(regexp_replace(codigo, '\\D', '', 'g'), '')::bigint), 0) from empreendimento), 1), true)`,
    );
    const r = await this.pool.query(`select nextval('empreendimento_codigo_seq') as v`);
    return Number(r.rows[0].v);
  }

  // ---------------- Organizações ----------------
  private org(x: Linha): Organizacao {
    return semNulos({ id: x.id, nome: x.nome, nomesAlternativos: x.nomes_alternativos, cnpj: x.cnpj, tipo: x.tipo, setores: x.setores, site: x.site, ufSede: x.uf_sede, grupoEconomico: x.grupo_economico, observacoes: x.observacoes, demo: x.demo }) as Organizacao;
  }
  async listarOrganizacoes() { return (await this.pool.query('select * from organizacao order by nome')).rows.map((x) => this.org(x)); }
  async obterOrganizacao(id: string) { const r = await this.pool.query('select * from organizacao where id = $1', [id]); return r.rows[0] ? this.org(r.rows[0]) : undefined; }
  async salvarOrganizacao(o: Organizacao) {
    await this.pool.query(
      `insert into organizacao (id, nome, nomes_alternativos, cnpj, tipo, setores, site, uf_sede, grupo_economico, observacoes, demo, atualizado_em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       on conflict (id) do update set nome = excluded.nome, nomes_alternativos = excluded.nomes_alternativos, cnpj = excluded.cnpj, tipo = excluded.tipo,
         setores = excluded.setores, site = excluded.site, uf_sede = excluded.uf_sede, grupo_economico = excluded.grupo_economico, observacoes = excluded.observacoes, atualizado_em = now()`,
      [o.id, o.nome, o.nomesAlternativos, o.cnpj ?? null, o.tipo, o.setores, o.site ?? null, o.ufSede ?? null, o.grupoEconomico ?? null, o.observacoes ?? null, o.demo],
    );
  }

  // ---------------- Fontes e coletas ----------------
  private fonte(x: Linha): Fonte {
    return semNulos({
      id: x.id, nome: x.nome, orgao: x.orgao, categoria: x.categoria, classe: x.classe, metodoAcesso: x.metodo_acesso, url: x.url, frequencia: x.frequencia,
      statusIntegracao: x.status_integracao, adaptador: x.adaptador, config: x.config, credenciais: x.credenciais, limitacoes: x.limitacoes, termosUso: x.termos_uso,
      ultimaColeta: iso(x.ultima_coleta), ultimaColetaStatus: x.ultima_coleta_status, ativo: x.ativo,
    }) as Fonte;
  }
  async listarFontes() { return (await this.pool.query('select * from fonte order by id')).rows.map((x) => this.fonte(x)); }
  async obterFonte(id: string) { const r = await this.pool.query('select * from fonte where id = $1', [id]); return r.rows[0] ? this.fonte(r.rows[0]) : undefined; }
  async salvarFonte(f: Fonte) {
    await this.pool.query(
      `insert into fonte values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (id) do update set nome = excluded.nome, orgao = excluded.orgao, categoria = excluded.categoria, classe = excluded.classe,
         metodo_acesso = excluded.metodo_acesso, url = excluded.url, frequencia = excluded.frequencia, status_integracao = excluded.status_integracao,
         adaptador = excluded.adaptador, config = excluded.config, credenciais = excluded.credenciais, limitacoes = excluded.limitacoes,
         termos_uso = excluded.termos_uso, ultima_coleta = excluded.ultima_coleta, ultima_coleta_status = excluded.ultima_coleta_status, ativo = excluded.ativo`,
      [f.id, f.nome, f.orgao, f.categoria, f.classe, f.metodoAcesso, f.url ?? null, f.frequencia, f.statusIntegracao, f.adaptador, json(f.config), f.credenciais, f.limitacoes, f.termosUso ?? null, f.ultimaColeta ?? null, f.ultimaColetaStatus ?? null, f.ativo],
    );
  }

  async salvarColeta(c: Coleta) {
    await this.pool.query(
      `insert into coleta values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (id) do update set finalizada_em = excluded.finalizada_em, status = excluded.status, registros_lidos = excluded.registros_lidos,
         criados = excluded.criados, atualizados = excluded.atualizados, sem_mudanca = excluded.sem_mudanca, para_revisao = excluded.para_revisao,
         conflitos = excluded.conflitos, descartados = excluded.descartados, erros = excluded.erros, avisos = excluded.avisos`,
      [c.id, c.fonteId, c.disparo, c.usuario ?? null, c.iniciadaEm, c.finalizadaEm ?? null, c.status, c.registrosLidos, c.criados, c.atualizados, c.semMudanca, c.paraRevisao, c.conflitos, c.descartados, c.erros, c.avisos],
    );
  }
  async listarColetas(f: { fonteId?: string; limite?: number } = {}) {
    const r = await this.pool.query('select * from coleta where ($1::text is null or fonte_id = $1) order by iniciada_em desc limit $2', [f.fonteId ?? null, f.limite ?? 100]);
    return r.rows.map((x) => semNulos({
      id: x.id, fonteId: x.fonte_id, disparo: x.disparo, usuario: x.usuario, iniciadaEm: iso(x.iniciada_em), finalizadaEm: iso(x.finalizada_em), status: x.status,
      registrosLidos: x.registros_lidos, criados: x.criados, atualizados: x.atualizados, semMudanca: x.sem_mudanca, paraRevisao: x.para_revisao, conflitos: x.conflitos,
      descartados: x.descartados, erros: x.erros, avisos: x.avisos,
    }) as Coleta);
  }

  // ---------------- Documentos ----------------
  private doc(x: Linha, completo = true): Documento {
    const texto: string | undefined = x.texto_extraido ?? undefined;
    return semNulos({
      id: x.id, titulo: x.titulo, tipo: x.tipo, fonteId: x.fonte_id, url: x.url, mime: x.mime, tamanhoBytes: x.tamanho_bytes, hash: x.hash,
      textoExtraido: completo || !texto || texto.length <= 2000 ? texto : texto.slice(0, 2000) + '…', paginas: x.paginas, dataPublicacao: x.data_publicacao,
      carregadoEm: iso(x.carregado_em), carregadoPor: x.carregado_por, empreendimentoIds: x.empreendimento_ids, analise: x.analise,
    }) as Documento;
  }
  async salvarDocumento(d: Documento) {
    await this.pool.query(
      `insert into documento values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (id) do update set titulo = excluded.titulo, tipo = excluded.tipo, fonte_id = excluded.fonte_id, url = excluded.url,
         texto_extraido = excluded.texto_extraido, data_publicacao = excluded.data_publicacao, empreendimento_ids = excluded.empreendimento_ids, analise = excluded.analise`,
      [d.id, d.titulo, d.tipo, d.fonteId ?? null, d.url ?? null, d.mime, d.tamanhoBytes, d.hash, d.textoExtraido ?? null, d.paginas ?? null, d.dataPublicacao ?? null, d.carregadoEm, d.carregadoPor, d.empreendimentoIds, json(d.analise)],
    );
  }
  async obterDocumento(id: string) { const r = await this.pool.query('select * from documento where id = $1', [id]); return r.rows[0] ? this.doc(r.rows[0]) : undefined; }
  async obterDocumentoPorHash(hash: string) { const r = await this.pool.query('select * from documento where hash = $1', [hash]); return r.rows[0] ? this.doc(r.rows[0]) : undefined; }
  async listarDocumentos(f: FiltroDocumentos = {}) {
    const r = await this.pool.query(
      'select * from documento where ($1::text is null or tipo = $1) and ($2::text is null or $2 = any(empreendimento_ids)) order by carregado_em desc limit $3',
      [f.tipo ?? null, f.empreendimentoId ?? null, f.limite ?? 200],
    );
    return r.rows.map((x) => this.doc(x, false));
  }

  // ---------------- Correspondências ----------------
  private match(x: Linha): MatchCandidato {
    return semNulos({ id: x.id, coletaId: x.coleta_id, fonteId: x.fonte_id, registro: x.registro, resumoRegistro: x.resumo_registro, candidatos: x.candidatos, status: x.status, decididoPor: x.decidido_por, decididoEm: iso(x.decidido_em), criadoEm: iso(x.criado_em) }) as MatchCandidato;
  }
  async salvarMatch(m: MatchCandidato) {
    await this.pool.query(
      `insert into match_candidato values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (id) do update set status = excluded.status, decidido_por = excluded.decidido_por, decidido_em = excluded.decidido_em, candidatos = excluded.candidatos`,
      [m.id, m.coletaId ?? null, m.fonteId, json(m.registro), m.resumoRegistro, json(m.candidatos), m.status, m.decididoPor ?? null, m.decididoEm ?? null, m.criadoEm],
    );
  }
  async obterMatch(id: string) { const r = await this.pool.query('select * from match_candidato where id = $1', [id]); return r.rows[0] ? this.match(r.rows[0]) : undefined; }
  async listarMatches(status?: MatchCandidato['status']) {
    const r = await this.pool.query('select * from match_candidato where ($1::text is null or status = $1) order by criado_em desc', [status ?? null]);
    return r.rows.map((x) => this.match(x));
  }

  // ---------------- Eventos e alertas ----------------
  async salvarEventos(e: EventoMudanca[]) {
    for (const x of e) {
      await this.pool.query('insert into evento_mudanca values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (id) do nothing', [x.id, x.empreendimentoId, x.tipo, x.titulo, x.descricao, x.em, x.relevancia, json(x.dados), x.evidenciaIds, x.demo]);
    }
  }
  async listarEventos(f: FiltroEventos = {}) {
    const r = await this.pool.query(
      'select * from evento_mudanca where ($1::timestamptz is null or em >= $1) and ($2::text is null or empreendimento_id = $2) order by em desc limit $3',
      [f.desde ?? null, f.empreendimentoId ?? null, f.limite ?? 500],
    );
    return r.rows.map((x) => ({ id: x.id, empreendimentoId: x.empreendimento_id, tipo: x.tipo, titulo: x.titulo, descricao: x.descricao, em: iso(x.em)!, relevancia: x.relevancia, dados: x.dados, evidenciaIds: x.evidencia_ids, demo: x.demo }));
  }
  async listarRegras() {
    const r = await this.pool.query('select * from alerta_regra order by nome');
    return r.rows.map((x) => semNulos({ id: x.id, nome: x.nome, ativo: x.ativo, criadoPor: x.criado_por, filtros: x.filtros, canais: x.canais, emailDestino: x.email_destino }) as AlertaRegra);
  }
  async salvarRegra(x: AlertaRegra) {
    await this.pool.query(
      `insert into alerta_regra values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update set nome = excluded.nome, ativo = excluded.ativo, filtros = excluded.filtros, canais = excluded.canais, email_destino = excluded.email_destino`,
      [x.id, x.nome, x.ativo, x.criadoPor, json(x.filtros), x.canais, x.emailDestino ?? null],
    );
  }
  async excluirRegra(id: string) { await this.pool.query('delete from alerta_regra where id = $1', [id]); }
  async salvarNotificacoes(n: AlertaNotificacao[]) {
    for (const x of n) {
      await this.pool.query('insert into alerta_notificacao values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing', [x.id, x.regraId, x.eventoId, x.empreendimentoId, x.criadoEm, x.lido, x.canal, x.entregue, x.erroEntrega ?? null]);
    }
  }
  async listarNotificacoes(f: { lido?: boolean; limite?: number } = {}) {
    const r = await this.pool.query('select * from alerta_notificacao where ($1::boolean is null or lido = $1) order by criado_em desc limit $2', [f.lido ?? null, f.limite ?? 300]);
    return r.rows.map((x) => semNulos({ id: x.id, regraId: x.regra_id, eventoId: x.evento_id, empreendimentoId: x.empreendimento_id, criadoEm: iso(x.criado_em), lido: x.lido, canal: x.canal, entregue: x.entregue, erroEntrega: x.erro_entrega }) as AlertaNotificacao);
  }
  async marcarNotificacao(id: string, lido: boolean) { await this.pool.query('update alerta_notificacao set lido = $2 where id = $1', [id, lido]); }

  // ---------------- Comercial ----------------
  private op(x: Linha): OportunidadeComercial {
    return semNulos({
      id: x.id, empreendimentoId: x.empreendimento_id, interesse: x.interesse, responsavel: x.responsavel, estrategia: x.estrategia, statusProspeccao: x.status_prospeccao,
      pacotesInteresse: x.pacotes_interesse, valorQualificadoBRL: x.valor_qualificado_brl, decisao: x.decisao, contatos: x.contatos, interacoes: x.interacoes,
      proximosPassos: x.proximos_passos, resultado: x.resultado, criadoEm: iso(x.criado_em), atualizadoEm: iso(x.atualizado_em), demo: x.demo,
    }) as OportunidadeComercial;
  }
  async listarOportunidades() { return (await this.pool.query('select * from oportunidade_comercial')).rows.map((x) => this.op(x)); }
  async obterOportunidade(id: string) { const r = await this.pool.query('select * from oportunidade_comercial where id = $1', [id]); return r.rows[0] ? this.op(r.rows[0]) : undefined; }
  async salvarOportunidade(o: OportunidadeComercial) {
    await this.pool.query(
      `insert into oportunidade_comercial values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (empreendimento_id) do update set interesse = excluded.interesse, responsavel = excluded.responsavel, estrategia = excluded.estrategia,
         status_prospeccao = excluded.status_prospeccao, pacotes_interesse = excluded.pacotes_interesse, valor_qualificado_brl = excluded.valor_qualificado_brl,
         decisao = excluded.decisao, contatos = excluded.contatos, interacoes = excluded.interacoes, proximos_passos = excluded.proximos_passos,
         resultado = excluded.resultado, atualizado_em = excluded.atualizado_em`,
      [o.id, o.empreendimentoId, o.interesse, o.responsavel ?? null, o.estrategia ?? null, o.statusProspeccao, o.pacotesInteresse, o.valorQualificadoBRL ?? null, json(o.decisao), json(o.contatos), json(o.interacoes), json(o.proximosPassos), json(o.resultado), o.criadoEm, o.atualizadoEm, o.demo],
    );
  }

  // ---------------- Configuração, auditoria, snapshots ----------------
  async obterConfiguracao() {
    const r = await this.pool.query(`select valor from configuracao where chave = 'plataforma'`);
    return (r.rows[0]?.valor as Partial<ConfiguracaoPlataforma>) ?? null;
  }
  async salvarConfiguracao(c: ConfiguracaoPlataforma, por: string) {
    await this.pool.query(
      `insert into configuracao values ('plataforma', $1, now(), $2) on conflict (chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
      [json(c), por],
    );
  }
  async registrarAuditoria(a: AuditLog) {
    await this.pool.query('insert into audit_log values ($1,$2,$3,$4,$5,$6,$7)', [a.id, a.em, a.usuario, a.acao, a.entidade, a.entidadeId ?? null, json(a.detalhes)]);
  }
  async listarAuditoria(limite = 300) {
    const r = await this.pool.query('select * from audit_log order by em desc limit $1', [limite]);
    return r.rows.map((x) => semNulos({ id: x.id, em: iso(x.em), usuario: x.usuario, acao: x.acao, entidade: x.entidade, entidadeId: x.entidade_id, detalhes: x.detalhes }) as AuditLog);
  }
  async salvarSnapshot(data: string, dados: unknown) {
    await this.pool.query('insert into snapshot_pipeline values ($1,$2) on conflict (data) do update set dados = excluded.dados', [data, json(dados)]);
  }
  async listarSnapshots() { return (await this.pool.query('select * from snapshot_pipeline order by data')).rows.map((x) => ({ data: x.data, dados: x.dados })); }

  async removerDemo() {
    return this.transacao(async (c) => {
      const e = await c.query('delete from empreendimento where demo returning id');
      await c.query(`delete from match_candidato where fonte_id = 'demo'`);
      await c.query(`delete from documento where fonte_id = 'demo'`);
      await c.query(`delete from alerta_regra where criado_por = 'demo'`);
      const o = await c.query('delete from organizacao o where demo and not exists (select 1 from participacao p where p.organizacao_id = o.id) returning id');
      return { empreendimentos: e.rowCount ?? 0, organizacoes: o.rowCount ?? 0 };
    });
  }

  async fechar() { await this.pool.end(); }
}
