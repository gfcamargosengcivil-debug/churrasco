/**
 * Mescla de um registro de fonte com o cadastro mestre, preservando rastreabilidade:
 * - cada valor novo ganha proveniência (status + evidências);
 * - valor igual a um existente reforça a proveniência (nova evidência / última confirmação);
 * - valor divergente gera CONFLITO visível: nada é escolhido em silêncio. O valor adotado
 *   segue critério explícito (classe da fonte, depois data de publicação) e fica registrado;
 * - toda alteração gera entrada no histórico (append-only).
 */
import {
  ORDEM_FASE_CONTRATACAO, PESO_CLASSE, SITUACAO_AMBIENTAL, SITUACAO_ENGENHARIA, SITUACAO_FUNDIARIA,
  SITUACAO_REGULATORIA, SITUACOES_OBRA, type ClasseFonte, type Escopo, type StatusDado,
} from '../constantes.js';
import { FLUXOS_PADRAO, sugerirFluxo, type FluxoDef } from '../config/etapas.js';
import { normalizarCNPJ, normalizarNomeEmpreendimento, normalizarNomeOrganizacao, normalizarTexto } from '../normalizacao/index.js';
import { classeEvidencia } from '../projetos/derivados.js';
import { hojeISO } from '../util/datas.js';
import { jsonEstavel, novoId } from '../util/ids.js';
import type {
  Alteracao, Conflito, Empreendimento, Evidencia, Fonte, Marco, Organizacao, ProvenienciaCampo, Subestacao, TrechoLT,
} from '../tipos.js';
import { EmpreendimentoSchema } from '../tipos.js';
import type { RegistroNormalizado } from './registro.js';

export interface ContextoMescla {
  fonte: Fonte;
  organizacoes: Organizacao[];
  por: string;
  origem: 'ingestao' | 'manual' | 'ia';
  coletaId?: string;
  agora?: string;
  fluxos?: FluxoDef[];
}

export interface ResultadoMescla {
  projeto: Empreendimento;
  alteracoes: Alteracao[];
  conflitosNovos: Conflito[];
  evidencia: Evidencia;
  organizacoesNovas: Organizacao[];
  mudou: boolean;
}

const PRECISAO_ORDEM = { uf: 0, aproximada: 1, municipio: 2, subestacao: 3, exata: 4 } as const;

function clonar<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function iguais(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    const m = Math.max(Math.abs(a), Math.abs(b));
    return m === 0 ? true : Math.abs(a - b) / m <= 0.02;
  }
  if (typeof a === 'string' && typeof b === 'string') return normalizarTexto(a) === normalizarTexto(b);
  return jsonEstavel(a) === jsonEstavel(b);
}

class Mesclador {
  p: Empreendimento;
  alteracoes: Alteracao[] = [];
  conflitosNovos: Conflito[] = [];
  organizacoesNovas: Organizacao[] = [];
  evidencia!: Evidencia;
  classe: ClasseFonte;
  status: StatusDado;
  hoje: string;
  agora: string;

  constructor(p: Empreendimento, private r: RegistroNormalizado, private ctx: ContextoMescla) {
    this.p = clonar(p);
    this.agora = ctx.agora ?? new Date().toISOString();
    this.hoje = this.agora.slice(0, 10);
    this.classe = ctx.fonte.classe;
    this.status = r.statusDado ?? (ctx.origem === 'ia' ? 'inferido' : this.classe === 'A' || this.classe === 'B' ? 'confirmado' : 'inferido');
  }

  registrarEvidencia() {
    const ev = this.r.evidencia;
    const existente = this.p.evidencias.find(
      (e) => e.fonteId === this.r.fonteId && (e.url ?? '') === (ev.url ?? '') && (e.trecho ?? '') === (ev.trecho ?? '') && e.titulo === ev.titulo,
    );
    if (existente) {
      existente.ultimaConfirmacao = this.hoje;
      this.evidencia = existente;
      return;
    }
    this.evidencia = {
      id: novoId('ev'),
      fonteId: this.r.fonteId,
      titulo: ev.titulo,
      url: ev.url,
      documentoId: ev.documentoId,
      trecho: ev.trecho,
      pagina: ev.pagina,
      tipoDocumento: ev.tipoDocumento,
      dataPublicacao: ev.dataPublicacao,
      dataColeta: ev.dataColeta ?? this.hoje,
      validoAte: ev.validoAte,
      ultimaConfirmacao: this.hoje,
      classe: this.classe,
      coletaId: this.ctx.coletaId,
    };
    this.p.evidencias.push(this.evidencia);
  }

  historico(campo: string, de: unknown, para: unknown, observacao?: string) {
    const alt: Alteracao = {
      id: novoId('alt'),
      em: this.agora,
      por: this.ctx.por,
      origem: this.ctx.origem,
      campo,
      de,
      para,
      evidenciaId: this.evidencia.id,
      coletaId: this.ctx.coletaId,
      observacao,
    };
    this.alteracoes.push(alt);
    this.p.historico.push(alt);
  }

  proveniencia(campo: string, modo: 'definir' | 'reforcar', status: StatusDado = this.status) {
    const atual = this.p.proveniencia[campo];
    if (modo === 'reforcar' && atual) {
      if (!atual.evidenciaIds.includes(this.evidencia.id)) atual.evidenciaIds.push(this.evidencia.id);
      // Reforço por fonte de maior classe pode promover inferido → confirmado.
      if (atual.status !== 'confirmado' && status === 'confirmado') atual.status = 'confirmado';
      atual.atualizadoEm = this.hoje;
      return;
    }
    const nova: ProvenienciaCampo = { status, evidenciaIds: [this.evidencia.id], atualizadoEm: this.hoje };
    if (atual?.emConflito) nova.emConflito = true;
    this.p.proveniencia[campo] = nova;
  }

  /** Classe e data de publicação da melhor evidência do valor atual de um campo. */
  suporteAtual(campo: string): { classe: ClasseFonte; dataPublicacao?: string } {
    const ids = this.p.proveniencia[campo]?.evidenciaIds ?? [];
    let melhor: { classe: ClasseFonte; dataPublicacao?: string } = { classe: 'D' };
    for (const e of this.p.evidencias.filter((x) => ids.includes(x.id))) {
      const c = classeEvidencia(e);
      if (PESO_CLASSE[c] > PESO_CLASSE[melhor.classe] || (c === melhor.classe && (e.dataPublicacao ?? '') > (melhor.dataPublicacao ?? ''))) {
        melhor = { classe: c, dataPublicacao: e.dataPublicacao };
      }
    }
    return melhor;
  }

  /**
   * Registra divergência. Retorna true se o valor novo deve ser adotado.
   * Critério: maior classe de fonte; empate → publicação mais recente; empate → mantém o atual.
   */
  conflito(campo: string, valorAtual: unknown, valorNovo: unknown): boolean {
    const sup = this.suporteAtual(campo);
    const pubNova = this.evidencia.dataPublicacao;
    let adotarNovo: boolean;
    let criterio: string;
    if (PESO_CLASSE[this.classe] !== PESO_CLASSE[sup.classe]) {
      adotarNovo = PESO_CLASSE[this.classe] > PESO_CLASSE[sup.classe];
      criterio = `Adotado valor da fonte de maior classe (${adotarNovo ? this.classe : sup.classe}); divergência mantida para revisão.`;
    } else if (pubNova && sup.dataPublicacao && pubNova !== sup.dataPublicacao) {
      adotarNovo = pubNova > sup.dataPublicacao;
      criterio = `Mesma classe de fonte (${this.classe}); adotado o valor publicado mais recentemente; divergência mantida para revisão.`;
    } else {
      adotarNovo = false;
      criterio = 'Mesma classe de fonte e sem data de publicação que desempate: mantido o valor atual até revisão manual.';
    }
    const idsAtuais = this.p.proveniencia[campo]?.evidenciaIds ?? [];
    const evAtual = this.p.evidencias.find((e) => idsAtuais.includes(e.id));
    let c = this.p.conflitos.find((x) => x.campo === campo && x.status === 'aberto');
    if (!c) {
      c = {
        id: novoId('cf'),
        campo,
        valores: [
          { valor: valorAtual, evidenciaId: evAtual?.id, fonteId: evAtual?.fonteId, classe: sup.classe, dataPublicacao: sup.dataPublicacao, registradoEm: this.hoje },
        ],
        criterioAdocao: criterio,
        status: 'aberto',
        abertoEm: this.hoje,
      };
      this.p.conflitos.push(c);
      this.conflitosNovos.push(c);
    }
    if (!c.valores.some((v) => iguais(v.valor, valorNovo))) {
      c.valores.push({
        valor: valorNovo,
        evidenciaId: this.evidencia.id,
        fonteId: this.r.fonteId,
        classe: this.classe,
        dataPublicacao: pubNova,
        registradoEm: this.hoje,
      });
    }
    c.criterioAdocao = criterio;
    c.valorAdotado = adotarNovo ? valorNovo : valorAtual;
    const prov = this.p.proveniencia[campo];
    if (prov) prov.emConflito = true;
    return adotarNovo;
  }

  /** Mescla genérica de campo escalar via getter/setter. */
  escalar<T>(campo: string, novo: T | undefined, obter: () => T | undefined, definir: (v: T) => void) {
    if (novo === undefined || novo === null || (typeof novo === 'string' && !novo.trim())) return;
    const atual = obter();
    if (atual === undefined || atual === null || (Array.isArray(atual) && !atual.length)) {
      definir(novo);
      this.historico(campo, atual, novo);
      this.proveniencia(campo, 'definir');
      return;
    }
    if (iguais(atual, novo)) {
      this.proveniencia(campo, 'reforcar');
      return;
    }
    if (this.conflito(campo, atual, novo)) {
      definir(novo);
      this.historico(campo, atual, novo, 'Valor substituído por fonte prioritária; conflito registrado.');
      this.proveniencia(campo, 'definir');
      this.p.proveniencia[campo].emConflito = true;
    }
  }

  /** Campos de situação com ordem de avanço: avanço atualiza; retrocesso gera conflito. */
  situacao<T extends string>(campo: string, ordem: readonly T[], novo: T | undefined, obter: () => T, definir: (v: T) => void) {
    if (!novo || novo === 'indefinida') return;
    const atual = obter();
    if (atual === novo) return this.proveniencia(campo, 'reforcar');
    if (atual === 'indefinida' || ordem.indexOf(novo) > ordem.indexOf(atual)) {
      definir(novo);
      this.historico(campo, atual, novo);
      this.proveniencia(campo, 'definir');
      return;
    }
    if (this.conflito(campo, atual, novo)) {
      definir(novo);
      this.historico(campo, atual, novo, 'Retrocesso informado por fonte prioritária; conflito registrado.');
      this.proveniencia(campo, 'definir');
    }
  }

  resolverOrganizacao(nome: string, cnpj: string | undefined, tipo: Organizacao['tipo'] | undefined): Organizacao {
    const todas = [...this.ctx.organizacoes, ...this.organizacoesNovas];
    const cnpjN = normalizarCNPJ(cnpj);
    const nomeN = normalizarNomeOrganizacao(nome);
    const achada =
      (cnpjN && todas.find((o) => o.cnpj === cnpjN)) ||
      todas.find((o) => [o.nome, ...o.nomesAlternativos].some((n) => normalizarNomeOrganizacao(n) === nomeN));
    if (achada) return achada;
    const nova: Organizacao = {
      id: novoId('org'),
      nome: nome.trim(),
      nomesAlternativos: [],
      cnpj: cnpjN,
      tipo: tipo ?? 'outro',
      setores: this.p.setorOrigem ? [this.p.setorOrigem] : [],
      demo: !!this.r.demo,
    };
    this.organizacoesNovas.push(nova);
    return nova;
  }

  marcos() {
    for (const m of this.r.marcos ?? []) {
      const escopo: Escopo = m.escopo ?? 'geral';
      const campo = `marcos.${m.tipo}.${escopo}`;
      const existentes = this.p.marcos.filter((x) => x.tipo === m.tipo && x.escopo === escopo);
      const realizado = existentes.find((x) => x.natureza === 'realizado');
      const previsto = existentes.find((x) => x.natureza !== 'realizado');
      const novo: Marco = {
        id: novoId('mc'),
        tipo: m.tipo,
        data: m.data,
        natureza: m.natureza,
        escopo,
        descricao: m.descricao,
        evidenciaIds: [this.evidencia.id],
      };
      if (m.natureza === 'realizado') {
        if (realizado) {
          if (realizado.data === m.data) {
            if (!realizado.evidenciaIds.includes(this.evidencia.id)) realizado.evidenciaIds.push(this.evidencia.id);
            this.proveniencia(campo, 'reforcar');
          } else if (this.conflito(campo, realizado.data, m.data)) {
            this.historico(campo, realizado.data, m.data, 'Data de marco realizado substituída por fonte prioritária; conflito registrado.');
            realizado.data = m.data;
            realizado.evidenciaIds.push(this.evidencia.id);
          }
        } else {
          if (previsto) this.p.marcos = this.p.marcos.filter((x) => x !== previsto);
          this.p.marcos.push(novo);
          this.historico(campo, previsto ? { natureza: previsto.natureza, data: previsto.data } : undefined, { natureza: 'realizado', data: m.data });
          this.proveniencia(campo, 'definir');
        }
        continue;
      }
      if (realizado) continue; // fonte com previsão antiga de evento já ocorrido: ignorada
      if (!previsto) {
        this.p.marcos.push(novo);
        this.historico(campo, undefined, m.data);
        this.proveniencia(campo, 'definir', m.natureza === 'previsto_estimado' ? 'estimado' : this.status);
        continue;
      }
      if (previsto.data === m.data) {
        if (!previsto.evidenciaIds.includes(this.evidencia.id)) previsto.evidenciaIds.push(this.evidencia.id);
        this.proveniencia(campo, 'reforcar');
        continue;
      }
      // Revisão de cronograma: aceita quando a fonte é de classe igual/maior ou mais recente.
      const sup = this.suporteAtual(campo);
      const maisRecente = !!this.evidencia.dataPublicacao && (!sup.dataPublicacao || this.evidencia.dataPublicacao >= sup.dataPublicacao);
      if (PESO_CLASSE[this.classe] > PESO_CLASSE[sup.classe] || (PESO_CLASSE[this.classe] === PESO_CLASSE[sup.classe] && maisRecente)) {
        this.historico(campo, previsto.data, m.data, 'Revisão de cronograma');
        previsto.data = m.data;
        previsto.natureza = m.natureza;
        previsto.evidenciaIds = [...new Set([...previsto.evidenciaIds, this.evidencia.id])];
        this.proveniencia(campo, 'definir');
      } else {
        this.conflito(campo, previsto.data, m.data);
      }
    }
  }

  pacotes() {
    for (const pk of this.r.pacotes ?? []) {
      const campo = `pacotes.${pk.pacote}.${pk.escopo}`;
      let contratadaId: string | undefined;
      if (pk.contratada) {
        const org = this.resolverOrganizacao(pk.contratada, undefined, 'construtora');
        contratadaId = org.id;
        if (ORDEM_FASE_CONTRATACAO[pk.faseContratacao] >= ORDEM_FASE_CONTRATACAO.adjudicada) {
          this.participante(org.id, 'executor_obra', pk.pacote);
        }
      }
      const atual = this.p.pacotes.find((x) => x.pacote === pk.pacote && x.escopo === pk.escopo);
      if (!atual) {
        this.p.pacotes.push({ pacote: pk.pacote, escopo: pk.escopo, faseContratacao: pk.faseContratacao, contratadaId, dataEvento: pk.dataEvento, evidenciaIds: [this.evidencia.id] });
        this.historico(campo, undefined, pk.faseContratacao);
        this.proveniencia(campo, 'definir');
      } else if (atual.faseContratacao === pk.faseContratacao) {
        if (!atual.evidenciaIds.includes(this.evidencia.id)) atual.evidenciaIds.push(this.evidencia.id);
        if (contratadaId && !atual.contratadaId) atual.contratadaId = contratadaId;
        this.proveniencia(campo, 'reforcar');
      } else if (ORDEM_FASE_CONTRATACAO[pk.faseContratacao] > ORDEM_FASE_CONTRATACAO[atual.faseContratacao]) {
        this.historico(campo, atual.faseContratacao, pk.faseContratacao);
        atual.faseContratacao = pk.faseContratacao;
        atual.dataEvento = pk.dataEvento ?? atual.dataEvento;
        atual.contratadaId = contratadaId ?? atual.contratadaId;
        atual.evidenciaIds.push(this.evidencia.id);
        this.proveniencia(campo, 'definir');
      } else {
        this.conflito(campo, atual.faseContratacao, pk.faseContratacao);
      }
    }
  }

  participante(organizacaoId: string, papel: Empreendimento['participantes'][number]['papel'], escopo?: string) {
    const ex = this.p.participantes.find((x) => x.organizacaoId === organizacaoId && x.papel === papel);
    if (ex) {
      if (!ex.evidenciaIds.includes(this.evidencia.id)) ex.evidenciaIds.push(this.evidencia.id);
      return;
    }
    this.p.participantes.push({ organizacaoId, papel, escopo, evidenciaIds: [this.evidencia.id] });
    this.historico(`participantes.${papel}`, undefined, organizacaoId);
  }

  trechos() {
    for (const t of this.r.trechosLT ?? []) {
      const nomeN = normalizarNomeEmpreendimento(t.nome);
      const ex = this.p.trechosLT.find((x) => normalizarNomeEmpreendimento(x.nome) === nomeN);
      if (!ex) {
        const novo: TrechoLT = { ...t, corrente: t.corrente ?? 'CA', id: novoId('lt'), evidenciaIds: [this.evidencia.id] };
        this.p.trechosLT.push(novo);
        this.historico(`trechosLT.${novo.id}`, undefined, { nome: t.nome, tensaoKv: t.tensaoKv, extensaoKm: t.extensaoKm });
        this.proveniencia(`trechosLT.${novo.id}`, 'definir');
        continue;
      }
      if (!ex.evidenciaIds.includes(this.evidencia.id)) ex.evidenciaIds.push(this.evidencia.id);
      this.escalar(`trechosLT.${ex.id}.extensaoKm`, t.extensaoKm, () => ex.extensaoKm, (v) => (ex.extensaoKm = v));
      this.escalar(`trechosLT.${ex.id}.tensaoKv`, t.tensaoKv, () => ex.tensaoKv, (v) => (ex.tensaoKv = v));
      this.escalar(`trechosLT.${ex.id}.circuitos`, t.circuitos, () => ex.circuitos, (v) => (ex.circuitos = v));
      if (t.tracado && (!ex.tracado || (ex.tracado.natureza !== 'oficial' && t.tracado.natureza === 'oficial'))) {
        this.historico(`trechosLT.${ex.id}.tracado`, ex.tracado?.natureza, t.tracado.natureza);
        ex.tracado = { ...t.tracado, evidenciaId: this.evidencia.id };
      }
    }
  }

  subestacoes() {
    for (const s of this.r.subestacoes ?? []) {
      const nomeN = normalizarNomeEmpreendimento(s.nome);
      const ex = this.p.subestacoes.find((x) => normalizarNomeEmpreendimento(x.nome) === nomeN);
      if (!ex) {
        const nova: Subestacao = { ...s, id: novoId('se'), evidenciaIds: [this.evidencia.id] };
        this.p.subestacoes.push(nova);
        this.historico(`subestacoes.${nova.id}`, undefined, { nome: s.nome, natureza: s.natureza, tensoesKv: s.tensoesKv });
        this.proveniencia(`subestacoes.${nova.id}`, 'definir');
        continue;
      }
      if (!ex.evidenciaIds.includes(this.evidencia.id)) ex.evidenciaIds.push(this.evidencia.id);
      this.escalar(`subestacoes.${ex.id}.capacidadeMva`, s.capacidadeMva, () => ex.capacidadeMva, (v) => (ex.capacidadeMva = v));
      if (s.ponto && (!ex.ponto || PRECISAO_ORDEM[s.ponto.precisao] > PRECISAO_ORDEM[ex.ponto.precisao])) {
        this.historico(`subestacoes.${ex.id}.ponto`, ex.ponto, s.ponto);
        ex.ponto = s.ponto;
      }
    }
  }

  executar(): ResultadoMescla {
    const r = this.r;
    const p = this.p;
    const antes = jsonEstavel({ ...p, historico: undefined, evidencias: undefined, proveniencia: undefined, atualizadoEm: undefined });
    this.registrarEvidencia();

    // Identificação
    const nomeN = normalizarNomeEmpreendimento(r.nome);
    const nomesConhecidos = new Set([p.nomeOficial, ...p.nomesAlternativos].map(normalizarNomeEmpreendimento));
    for (const n of [r.nome, ...(r.nomesAlternativos ?? [])]) {
      if (!nomesConhecidos.has(normalizarNomeEmpreendimento(n))) {
        p.nomesAlternativos.push(n);
        nomesConhecidos.add(normalizarNomeEmpreendimento(n));
      }
    }
    void nomeN;
    for (const id of r.identificadores ?? []) {
      if (!p.identificadores.some((x) => x.tipo === id.tipo && normalizarTexto(x.valor) === normalizarTexto(id.valor))) {
        p.identificadores.push({ ...id, evidenciaId: this.evidencia.id });
        this.historico(`identificadores.${id.tipo}`, undefined, id.valor);
      }
    }
    // Tipo é composição de escopos: LT + SE = LT+SE (não é divergência entre fontes).
    if (r.tipo && r.tipo !== p.tipo && ['LT', 'SE', 'LT+SE'].includes(r.tipo) && ['LT', 'SE', 'LT+SE'].includes(p.tipo)) {
      const novo = r.tipo === 'LT+SE' || p.tipo === 'LT+SE' || r.tipo !== p.tipo ? 'LT+SE' : p.tipo;
      if (novo !== p.tipo) {
        this.historico('tipo', p.tipo, novo, 'Escopos combinados entre fontes.');
        p.tipo = novo;
      }
      this.proveniencia('tipo', 'reforcar');
    } else {
      this.escalar('tipo', r.tipo, () => p.tipo, (v) => (p.tipo = v));
    }
    this.escalar('setorOrigem', r.setorOrigem, () => p.setorOrigem, (v) => (p.setorOrigem = v));
    this.escalar('subsetor', r.subsetor, () => p.subsetor, (v) => (p.subsetor = v));
    if (r.descricao && !p.descricao) {
      p.descricao = r.descricao;
      this.proveniencia('descricao', 'definir');
    }

    // Participantes
    for (const o of r.organizacoes ?? []) {
      const org = this.resolverOrganizacao(o.nome, o.cnpj, o.tipo);
      this.participante(org.id, o.papel);
    }

    // Localização
    for (const m of r.municipios ?? []) {
      if (!p.localizacao.municipios.some((x) => x.uf === m.uf && normalizarTexto(x.nome) === normalizarTexto(m.nome))) {
        p.localizacao.municipios.push(m);
        this.historico('localizacao.municipios', undefined, `${m.nome}/${m.uf}`);
      }
    }
    for (const uf of [...(r.ufs ?? []), ...(r.municipios ?? []).map((m) => m.uf)]) {
      if (!p.localizacao.ufs.includes(uf)) {
        p.localizacao.ufs.push(uf);
        this.historico('localizacao.ufs', undefined, uf);
      }
    }
    if (r.ponto && (!p.localizacao.ponto || PRECISAO_ORDEM[r.ponto.precisao] > PRECISAO_ORDEM[p.localizacao.ponto.precisao])) {
      this.historico('localizacao.ponto', p.localizacao.ponto, r.ponto);
      p.localizacao.ponto = r.ponto;
      this.proveniencia('localizacao.ponto', 'definir');
    }

    // Técnico
    if (r.tensoesKv?.length) {
      const atuais = p.tecnico.tensoesKv;
      if (!atuais.length) {
        p.tecnico.tensoesKv = [...r.tensoesKv].sort((a, b) => b - a);
        this.historico('tecnico.tensoesKv', undefined, p.tecnico.tensoesKv);
        this.proveniencia('tecnico.tensoesKv', 'definir');
      } else if (Math.max(...r.tensoesKv) === Math.max(...atuais)) {
        p.tecnico.tensoesKv = [...new Set([...atuais, ...r.tensoesKv])].sort((a, b) => b - a);
        this.proveniencia('tecnico.tensoesKv', 'reforcar');
      } else if (this.conflito('tecnico.tensoesKv', atuais, r.tensoesKv)) {
        this.historico('tecnico.tensoesKv', atuais, r.tensoesKv);
        p.tecnico.tensoesKv = [...r.tensoesKv].sort((a, b) => b - a);
      }
    }
    this.escalar('tecnico.extensaoKm', r.extensaoKm, () => p.tecnico.extensaoKm, (v) => (p.tecnico.extensaoKm = v));
    this.escalar('tecnico.circuitos', r.circuitos, () => p.tecnico.circuitos, (v) => (p.tecnico.circuitos = v));
    this.escalar('tecnico.capacidadeMva', r.capacidadeMva, () => p.tecnico.capacidadeMva, (v) => (p.tecnico.capacidadeMva = v));
    this.escalar('tecnico.qtdSubestacoes', r.qtdSubestacoes, () => p.tecnico.qtdSubestacoes, (v) => (p.tecnico.qtdSubestacoes = v));
    this.escalar('tecnico.potenciaMw', r.potenciaMw, () => p.tecnico.potenciaMw, (v) => (p.tecnico.potenciaMw = v));
    this.trechos();
    this.subestacoes();

    // Financeiro (valores declarados pela fonte)
    const vm = r.valoresMonetarios;
    const valor = (v: number) => ({ valorBRL: v, natureza: vm?.natureza ?? ('declarado' as const), dataBase: vm?.dataBase ?? this.evidencia.dataPublicacao, observacao: vm?.observacao });
    this.escalar('financeiro.capexTotal', r.capexTotalBRL, () => p.financeiro.capexTotal?.valorBRL, (v) => (p.financeiro.capexTotal = valor(v)));
    this.escalar('financeiro.capexInfraEletrica', r.capexInfraEletricaBRL, () => p.financeiro.capexInfraEletrica?.valorBRL, (v) => (p.financeiro.capexInfraEletrica = valor(v)));
    this.escalar('financeiro.rapAnual', r.rapAnualBRL, () => p.financeiro.rapAnual?.valorBRL, (v) => (p.financeiro.rapAnual = valor(v)));
    this.escalar('financeiro.fonteFinanciamento', r.fonteFinanciamento, () => p.financeiro.fonteFinanciamento, (v) => (p.financeiro.fonteFinanciamento = v));

    // Situações
    const s = r.situacoes ?? {};
    this.situacao('situacoes.regulatoria', SITUACAO_REGULATORIA, s.regulatoria, () => p.situacoes.regulatoria, (v) => (p.situacoes.regulatoria = v));
    this.situacao('situacoes.ambiental', SITUACAO_AMBIENTAL, s.ambiental, () => p.situacoes.ambiental, (v) => (p.situacoes.ambiental = v));
    this.situacao('situacoes.fundiaria', SITUACAO_FUNDIARIA, s.fundiaria, () => p.situacoes.fundiaria, (v) => (p.situacoes.fundiaria = v));
    this.situacao('situacoes.engenharia', SITUACAO_ENGENHARIA, s.engenharia, () => p.situacoes.engenharia, (v) => (p.situacoes.engenharia = v));
    if (r.situacaoObra && r.situacaoObra !== p.situacaoObra) {
      if (r.situacaoObra === 'paralisada' || SITUACOES_OBRA.indexOf(r.situacaoObra) > SITUACOES_OBRA.indexOf(p.situacaoObra)) {
        this.historico('situacaoObra', p.situacaoObra, r.situacaoObra);
        p.situacaoObra = r.situacaoObra;
        this.proveniencia('situacaoObra', 'definir');
      } else if (this.conflito('situacaoObra', p.situacaoObra, r.situacaoObra)) {
        this.historico('situacaoObra', p.situacaoObra, r.situacaoObra);
        p.situacaoObra = r.situacaoObra;
      }
    }
    if (r.statusGeral && r.statusGeral !== p.statusGeral) {
      if (r.statusGeral !== 'ativo') {
        this.historico('statusGeral', p.statusGeral, r.statusGeral);
        p.statusGeral = r.statusGeral;
        this.proveniencia('statusGeral', 'definir');
      } else if (this.conflito('statusGeral', p.statusGeral, r.statusGeral)) {
        this.historico('statusGeral', p.statusGeral, r.statusGeral);
        p.statusGeral = r.statusGeral;
      }
    }

    this.marcos();
    this.pacotes();

    const depois = jsonEstavel({ ...p, historico: undefined, evidencias: undefined, proveniencia: undefined, atualizadoEm: undefined });
    const mudou = antes !== depois || this.alteracoes.length > 0;
    if (mudou) p.atualizadoEm = this.agora;
    return {
      projeto: p,
      alteracoes: this.alteracoes,
      conflitosNovos: this.conflitosNovos,
      evidencia: this.evidencia,
      organizacoesNovas: this.organizacoesNovas,
      mudou,
    };
  }
}

export function mesclarRegistro(p: Empreendimento, r: RegistroNormalizado, ctx: ContextoMescla): ResultadoMescla {
  return new Mesclador(p, r, ctx).executar();
}

function inferirTipo(r: RegistroNormalizado): Empreendimento['tipo'] {
  if (r.tipo) return r.tipo;
  const lt = !!(r.extensaoKm || r.trechosLT?.length || /\blt\b|linha de transmiss/i.test(normalizarTexto(r.nome)));
  const se = !!(r.qtdSubestacoes || r.subestacoes?.length || /\bse\b|subesta/i.test(normalizarTexto(r.nome)));
  if (lt && se) return 'LT+SE';
  if (lt) return 'LT';
  if (se) return 'SE';
  return 'infraestrutura_associada';
}

/** Cria um novo empreendimento a partir de um registro (aplicando a mesma lógica de mescla). */
export function criarEmpreendimentoDeRegistro(r: RegistroNormalizado, ctx: ContextoMescla, codigo: string): ResultadoMescla {
  const agora = ctx.agora ?? new Date().toISOString();
  const tipo = inferirTipo(r);
  const setor = r.setorOrigem ?? (ctx.fonte.categoria === 'regulador' || ctx.fonte.categoria === 'planejamento' ? 'transmissao' : 'outro');
  const fluxo = sugerirFluxo(setor, tipo, ctx.fluxos ?? FLUXOS_PADRAO);
  const esqueleto = EmpreendimentoSchema.parse({
    id: novoId('emp'),
    codigo,
    nomeOficial: r.nome,
    tipo,
    setorOrigem: setor,
    fluxoId: fluxo.id,
    identificadoEm: agora.slice(0, 10) || hojeISO(),
    criadoEm: agora,
    atualizadoEm: agora,
    demo: !!r.demo,
  });
  const res = mesclarRegistro(esqueleto, { ...r, tipo, setorOrigem: setor }, { ...ctx, agora });
  res.projeto.proveniencia.nomeOficial = { status: res.projeto.proveniencia.tipo?.status ?? 'inferido', evidenciaIds: [res.evidencia.id], atualizadoEm: agora.slice(0, 10) };
  res.alteracoes.unshift({ id: novoId('alt'), em: agora, por: ctx.por, origem: ctx.origem, campo: 'empreendimento', para: 'criado', evidenciaId: res.evidencia.id, coletaId: ctx.coletaId });
  res.projeto.historico.unshift(res.alteracoes[0]);
  return res;
}

/** Resolve manualmente um conflito, registrando justificativa e histórico. */
export function resolverConflito(
  p: Empreendimento,
  conflitoId: string,
  valor: unknown,
  justificativa: string,
  por: string,
  aplicar?: (proj: Empreendimento, valor: unknown) => void,
  agora: string = new Date().toISOString(),
): Empreendimento {
  const proj = clonar(p);
  const c = proj.conflitos.find((x) => x.id === conflitoId);
  if (!c) throw new Error('Conflito não encontrado');
  if (c.status === 'resolvido') throw new Error('Conflito já resolvido');
  c.status = 'resolvido';
  c.valorAdotado = valor;
  c.resolucao = { valor, justificativa, por, em: agora.slice(0, 10) };
  if (aplicar) aplicar(proj, valor);
  const prov = proj.proveniencia[c.campo];
  if (prov) {
    prov.emConflito = proj.conflitos.some((x) => x.campo === c.campo && x.status === 'aberto');
    const ev = c.valores.find((v) => iguais(v.valor, valor))?.evidenciaId;
    if (ev) prov.evidenciaIds = [...new Set([ev, ...prov.evidenciaIds])];
  }
  proj.historico.push({ id: novoId('alt'), em: agora, por, origem: 'manual', campo: c.campo, para: valor, observacao: `Conflito resolvido: ${justificativa}` });
  proj.atualizadoEm = agora;
  return proj;
}
