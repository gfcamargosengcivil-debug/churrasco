/**
 * Conectores do Portal de Dados Abertos da ANEEL (CKAN datastore), validados contra o serviço real:
 *
 * - SIGET (Sistema de Gestão da Transmissão): empreendimentos de transmissão outorgados por contrato
 *   de concessão ou resolução autorizativa, com situação, prazo do ato legal, data de operação
 *   comercial registrada, transmissora, módulos e linhas (origem/destino/extensão).
 * - Resultado de leilões de transmissão: lotes leiloados com prazo de construção, extensão, MVA,
 *   investimento previsto pela ANEEL, RAP e vencedor.
 *
 * Nada é inventado: cada campo vem de uma coluna do conjunto oficial (citada no trecho da evidência).
 * Datas estimadas pela plataforma são sempre marcadas como `previsto_estimado`.
 */
import {
  extrairTensoesKv, identidadesDoNome, normalizarData, normalizarExtremidade, normalizarNumero, normalizarTexto, somarMeses, UFS,
  type Fonte, type RegistroNormalizado, type UF as Uf,
} from '@radar/core';
import { carregarIndiceSE, localizarPorSubestacao } from './epe.js';
import { buscar, type Adaptador, type ContextoAdaptador, type Encerramento, type ResultadoAdaptador } from './tipos.js';

type Linha = Record<string, string | number | null>;

interface ConfigCkanAneel {
  baseUrl?: string;
  pacote?: string;
  /** Localiza obras pela SE homônima no WebMap EPE (padrão: sim). */
  localizarPorSE?: boolean;
  servicoEpe?: string;
}

/** SEs citadas pelo registro: nome, descrição e extremidades das LTs. */
function nomesSEDoRegistro(r: RegistroNormalizado): string[] {
  return [
    ...subestacoesCitadas(`${r.nome} ${(r.nomesAlternativos ?? []).join(' ')}`),
    ...(r.subestacoes ?? []).map((s) => s.nome),
    ...(r.trechosLT ?? []).flatMap((t) => [t.origem, t.destino]).filter((x): x is string => !!x),
  ];
}

async function localizar(registros: RegistroNormalizado[], c: ConfigCkanAneel, ctx: ContextoAdaptador, avisos: string[]) {
  if (c.localizarPorSE === false || !registros.length) return;
  try {
    const indice = await carregarIndiceSE(ctx.fetch, c.servicoEpe);
    const n = localizarPorSubestacao(registros, indice, nomesSEDoRegistro);
    avisos.push(`Localização: ${n} de ${registros.length} registros localizados pela SE homônima no WebMap EPE (nome + UF, apenas correspondências inequívocas).`);
  } catch (e) {
    avisos.push(`Localização pela SE homônima indisponível (WebMap EPE): ${(e as Error).message}. Registros seguem sem coordenadas.`);
  }
}

const BASE_PADRAO = 'https://dadosabertos.aneel.gov.br';

/** Localiza um recurso do conjunto pelo nome publicado (ids de recurso podem mudar entre cargas). */
export async function resolverRecurso(f: typeof fetch, base: string, pacote: string, nome: string | RegExp): Promise<{ id: string; nome: string; modificado?: string }> {
  const r = await buscar(f, `${base}/api/3/action/package_show?id=${encodeURIComponent(pacote)}`, { timeoutMs: 60_000 });
  const corpo = (await r.json()) as { result: { resources: { id: string; name: string; format: string; datastore_active?: boolean; last_modified?: string }[] } };
  const rec = corpo.result.resources.find((x) => x.datastore_active && (typeof nome === 'string' ? x.name === nome : nome.test(x.name)));
  if (!rec) throw new Error(`Recurso "${String(nome)}" não encontrado (ou sem datastore) no conjunto ${pacote}.`);
  return { id: rec.id, nome: rec.name, modificado: rec.last_modified };
}

/** Lê todas as linhas de um recurso do datastore, paginando; filtros opcionais por igualdade. */
export async function lerDatastore(f: typeof fetch, base: string, recurso: string, filtros?: Record<string, string>): Promise<Linha[]> {
  const linhas: Linha[] = [];
  const pagina = 32_000;
  for (let offset = 0; ; offset += pagina) {
    const q = new URLSearchParams({ resource_id: recurso, limit: String(pagina), offset: String(offset) });
    if (filtros) q.set('filters', JSON.stringify(filtros));
    const r = await buscar(f, `${base}/api/3/action/datastore_search?${q}`, { timeoutMs: 120_000 });
    const corpo = (await r.json()) as { success: boolean; result: { records: Linha[]; total: number } };
    if (!corpo.success) throw new Error(`datastore_search falhou para ${recurso}`);
    linhas.push(...corpo.result.records);
    if (!corpo.result.records.length || linhas.length >= corpo.result.total) break;
  }
  return linhas;
}

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const data = (v: unknown) => normalizarData(texto(v) || undefined)?.data;
const numero = (v: unknown) => {
  const n = normalizarNumero(texto(v) || undefined);
  return n !== undefined && Number.isFinite(n) ? n : undefined;
};
const ehUf = (s: string): s is Uf => (UFS as readonly string[]).includes(s);

/** UFs no sufixo do nome do módulo SIGET (ex.: "LT 230 kV PICOS /TAUA II C-1 PI/CE" → PI, CE). */
export function ufsDoModulo(nome: string): Uf[] {
  const m = /\s([A-Z]{2}(?:\/[A-Z]{2})*)\s*$/.exec(nome.trim());
  return m ? m[1].split('/').filter(ehUf) : [];
}

/** Padrão que casa a palavra sem diferenciar maiúsculas ("*" no fim = qualquer terminação). */
const semCaixa = (w: string) =>
  w.replace(/\*$/, '').replace(/[A-Za-zÀ-ÿ]/g, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`) + (w.endsWith('*') ? String.raw`\S*` : '');
const PALAVRAS_FIM_SE = [
  'Seccionamento*', 'Secc', 'Seccionadora*', 'Instala*', 'Implanta*', 'Substitui*', 'Amplia*', 'Adequa*', 'Refor*', 'Melhoria*', 'LT', 'LTs',
  'Banco*', 'Reator*', 'Transforma*', 'Autotransforma*', 'Compensa*', 'Módulo*', 'Modulo*', 'Entrada*', 'Conex*', 'Interliga*', 'Trecho*',
  'Setor*', 'Barramento*', 'Recapacita*', 'Recondut*', 'Reencabe*', 'Renomea*', 'Capacitor*', 'Disjunt*', 'Remanej*', 'Desativa*',
].map(semCaixa).join('|');
const ARTIGOS_FIM_SE = ['para', 'com', 'e', 'em', 'ao', 'à', 'via', 'pelo', 'pela', 'o', 'a', 'os', 'as', 'um', 'uma', 'no', 'na', 'nos', 'nas'].map(semCaixa).join('|');
const PREPOSICOES_SE = ['de', 'do', 'da', 'dos', 'das'].map(semCaixa).join('|');

/** Nomes de SE citados em textos oficiais ("Reforço na SE X: ...", "SE 500/138 kV X – ...", "a SE X e o ..."). */
export function subestacoesCitadas(t: string): string[] {
  const nomes = new Map<string, string>();
  // Palavra-chave colada ao nome na fonte ("Itararé IISubstituição do TR5").
  const txt = t.replace(/(\S)(?=(?:Substitui|Seccion|Instala|Implanta|Amplia|Reencabe|Adequa|Refor[cç]o|Desativa)\S)/g, '$1 ');
  // O nome termina em pontuação, tensão, artigo/conjunção, preposição seguida de número ou de
  // palavra-chave de obra, ou na própria palavra-chave (Seccionamento, Instalação, LT, Banco...).
  const fim = String.raw`(?=\s*(?:[:;,()–.]|-|\s\d+(?:[.,]\d+)?\s*[kK][vV]\b|\s(?:${ARTIGOS_FIM_SE})\s|\s(?:${PREPOSICOES_SE})\s+(?:\d|(?:${PALAVRAS_FIM_SE})\b)|\s(?:${PALAVRAS_FIM_SE})\b|\s(?:Novo|Nova|NOVO|NOVA)\s+(?:SE|${semCaixa('setor')}|${semCaixa('pátio')}|${semCaixa('patio')}|${semCaixa('barramento')})\b|$))`;
  const re = new RegExp(String.raw`\bSE\s+(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)*\s*kV\s+)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .'ºª°]*?)${fim}`, 'g');
  for (const m of txt.matchAll(re)) {
    const n = m[1].trim().replace(/\s+/g, ' ').replace(/\.$/, '');
    if (n.length < 3 || /^(nova|novas|existente|associada|seccionadora)s?$/i.test(n)) continue;
    // "Cuiabá Norte" = "CuiabáNorte" (grafias da fonte).
    const k = normalizarTexto(n).replace(/[^a-z0-9]/g, '');
    if (!nomes.has(k)) nomes.set(k, n);
  }
  return [...nomes.values()];
}

const urlRecurso = (base: string, pacote: string, recurso: string) => `${base}/dataset/${pacote}/resource/${recurso}`;

// ------------------------------------------------------------------------------------------------
// SIGET
// ------------------------------------------------------------------------------------------------

interface ConfigSiget extends ConfigCkanAneel {
  /** Situações do empreendimento coletadas como ativas (SIGET: DscSituacaoEpd). */
  situacoesAtivas?: string[];
  /** Também coleta empreendimentos que entraram em operação nos últimos N dias (para encerrar os acompanhados). */
  diasConcluidosRecentes?: number;
}

/** Agrupa as linhas do SIGET (uma por módulo/obra) em um registro por empreendimento. */
export function registroSiget(
  linhas: Linha[],
  ctx: {
    fonte: Fonte;
    hoje: string;
    urlEvidencia: string;
    contratos: Map<string, Linha>;
    resolucoes: Map<string, Linha>;
    lts: Map<string, Linha>;
  },
): RegistroNormalizado | { erro: string } {
  const l0 = linhas[0];
  const ide = texto(l0.IdeEpd);
  const nome = texto(l0.NomEpd).replace(/\s+/g, ' ');
  if (nome.length < 3) return { erro: `SIGET ${ide}: empreendimento sem nome` };
  const situacao = texto(l0.DscSituacaoEpd);
  const descricaoEpd = texto(l0.DscEpd);
  const modulos = linhas.map((linha) => ({ linha }));
  const tiposObra = new Set(linhas.map((l) => texto(l.DscTipObr)));
  const textoEpd = `${nome} ${descricaoEpd}`;
  const contextoSecc = /seccion/i.test(textoEpd);
  // LTs seccionadas citadas ("seccionamento da LT A - B na SE C") e as SEs de seccionamento.
  const seccs = identidadesDoNome(textoEpd).filter((i) => i.tipo === 'secc');
  const seSecc = new Set([
    ...[...textoEpd.matchAll(/seccion\w*[^.;]*?\b(?:na|em)\s+SE\s+([A-Za-zÀ-ÿ0-9 ]+?)(?=[.,;(]|\s[-–]\s|$)/gi)].map((m) => normalizarExtremidade(m[1])),
    ...seccs.flatMap((i) => (i.se ? [i.se] : [])),
  ].filter(Boolean));
  const contem = (x: string, y: string) => !!x && !!y && (x === y || x.includes(y) || y.includes(x));
  const ehSESecc = (x: string) => [...seSecc].some((s) => contem(x, s));
  /** Circuito resultante: liga a SE de seccionamento a uma das extremidades da LT seccionada. */
  const resultanteDe = (origem: string, destino: string, kv: number) => {
    const [x, y] = [normalizarExtremidade(origem), normalizarExtremidade(destino)];
    if (seccs.length) return seccs.some((s) => [s.a, s.b].some((e) => (contem(e, x) && ehSESecc(y)) || (contem(e, y) && ehSESecc(x))));
    // Sem a LT seccionada identificada: basta tocar a SE de seccionamento (LT em corrente contínua não é seccionada).
    return kv !== 600 && kv !== 800 && (ehSESecc(x) || ehSESecc(y));
  };
  // Módulos gerais/infraestrutura/entrada de linha levam a tensão principal da SE ou da LT remota,
  // não a da obra: não entram na tensão do empreendimento.
  const moduloContexto = (nomeMdl: string, sig: string) => sig === 'MG' || /^(MG|IB|EL|MIM|MI|INS)\b/.test(nomeMdl);

  // Tensões e UFs a partir dos nomes oficiais dos módulos e dos textos do empreendimento/obras.
  const tensoes = new Set<number>();
  const ufs = new Set<Uf>();
  for (const { linha } of modulos) {
    const nm = texto(linha.NomMdl);
    if (!moduloContexto(nm, texto(linha.SigTipMdl))) for (const kv of extrairTensoesKv(nm)) tensoes.add(kv);
    for (const uf of ufsDoModulo(nm)) ufs.add(uf);
  }
  for (const kv of extrairTensoesKv(`${textoEpd} ${[...new Set(linhas.map((l) => texto(l.DscObr)))].join(' ')}`)) tensoes.add(kv);

  // Linhas de transmissão do empreendimento (módulos LT) com origem/destino/extensão oficiais.
  const trechos: NonNullable<RegistroNormalizado['trechosLT']> = [];
  const detalheLT: string[] = [];
  let extensaoNova = 0;
  const vistos = new Set<string>();
  for (const { linha } of modulos.filter((m) => texto(m.linha.SigTipMdl) === 'LT')) {
    const ideMdl = texto(linha.IdeMdl);
    if (vistos.has(ideMdl)) continue;
    vistos.add(ideMdl);
    const lt = ctx.lts.get(ideMdl);
    const nomeMdl = texto(linha.NomMdl) || texto(lt?.NomLinTms);
    const kv = numero(lt?.NumTensaoBaseLinhaTransm) ?? extrairTensoesKv(nomeMdl)[0];
    if (!kv) continue;
    tensoes.add(kv);
    const dscObr = texto(linha.DscObr);
    const origem = texto(lt?.NomSubestacaoOrigem);
    const destino = texto(lt?.NomSubestacaoDestino);
    // Circuitos resultantes de seccionamento: o módulo tem a extensão da linha resultante (quase toda
    // existente), não do trecho construído.
    const resultanteSecc = /seccion|originad|resultante/i.test(dscObr) || (contextoSecc && !!origem && !!destino && resultanteDe(origem, destino, kv));
    const kmModulo = numero(lt?.NumEtnLinTms);
    const kmObra = /(\d+(?:[.,]\d+)?)\s*km\b/i.exec(dscObr)?.[1];
    let km: number | undefined;
    if (texto(linha.DscTipObr) === 'Instalação' && !resultanteSecc) km = kmModulo;
    else if (resultanteSecc && kmObra && /constru|implanta|trecho/i.test(dscObr)) km = numero(kmObra);
    if (km) extensaoNova += km;
    detalheLT.push(`${nomeMdl}: NumEtnLinTms=${texto(lt?.NumEtnLinTms) || '∅'}${km ? ` (obra: ${km} km)` : ' (não atribuída à obra)'}`);
    for (const uf of [texto(lt?.SigUFSubestacaoOrigem), texto(lt?.SigUFSubestacaoDestino)]) if (ehUf(uf)) ufs.add(uf);
    trechos.push({
      // Nome do módulo traz o circuito ("C-1"): distingue circuitos da mesma LT.
      nome: nomeMdl,
      tensaoKv: kv,
      // Corrente pelo próprio módulo: empreendimento de bipolo também tem circuitos CA.
      corrente: /\bcc\b|±|bipolo|hvdc|kvcc/i.test(nomeMdl) || kv === 600 || kv === 800 ? 'CC' : 'CA',
      extensaoKm: km,
      circuitos: numero(lt?.NumCcuLinTms) ? Math.round(numero(lt?.NumCcuLinTms)!) : undefined,
      origem: origem || undefined,
      destino: destino || undefined,
    });
  }
  const temLT = trechos.length > 0;
  const temSE = modulos.some((m) => ['ME', 'MG', 'MM'].includes(texto(m.linha.SigTipMdl)) && !/^(EL|IB)\b/.test(texto(m.linha.NomMdl)));
  const tipo = temLT && temSE ? 'LT+SE' : temLT ? 'LT' : 'SE';

  const reforco = /refor[cç]o|melhoria/i.test(textoEpd);
  const ses = subestacoesCitadas(textoEpd);
  const novaSE = (!reforco && /^(SEs?|Subesta)/i.test(nome)) || /\b(nova\s+(?:SE|subesta)|SE\s+nova|implanta[çc][ãa]o\s+da\s+SE)/i.test(textoEpd);
  // SE listada como item do nome ("LT A - B e SE C", "...; SE C") em empreendimento que não é reforço: SE nova.
  const itemDoNome = (se: string) =>
    !reforco && new RegExp(String.raw`(?:^|[;,–-]\s*|\be\s+)SEs?\s+(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)*\s*kV\s+)?${se.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(nome);
  // Tensão da obra: quando o nome do empreendimento cita tensões, nada acima delas (e das LTs da obra)
  // — o texto descritivo e os módulos costumam citar a tensão principal da SE existente.
  const kvNome = extrairTensoesKv(nome);
  const teto = kvNome.length ? Math.max(...kvNome, ...trechos.map((t) => t.tensaoKv)) : Infinity;
  const kvs = [...tensoes].filter((k) => k > 0 && k <= teto).sort((a, b) => b - a);
  const subestacoes: NonNullable<RegistroNormalizado['subestacoes']> = kvs.length
    ? ses.map((s) => ({ nome: `SE ${s}`, natureza: novaSE || itemDoNome(s) ? 'nova' : 'ampliacao', tensoesKv: kvs }))
    : [];

  // Contrato do escopo: o da resolução (quando houver); senão, o mais frequente entre os módulos que
  // não são circuitos resultantes de seccionamento (esses ficam no contrato do dono da LT seccionada).
  // Contrato do escopo: o da resolução (quando houver); senão, o dos módulos de LT (a LT é da
  // transmissora do empreendimento; módulos nas SEs das pontas ficam nos contratos dos donos das SEs);
  // senão, o mais frequente. Circuitos resultantes de seccionamento ficam no contrato do dono da LT seccionada.
  const rea = ctx.resolucoes.get(ide);
  const naoSecc = linhas.filter((l) => !/seccion|originad|resultante/i.test(texto(l.DscObr)));
  const moda = (ls: Linha[]) => {
    const freq = new Map<string, number>();
    for (const l of ls) {
      const k = texto(l.IdeCcd);
      if (k) freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const ccds = [...new Set(naoSecc.map((l) => texto(l.IdeCcd)).filter(Boolean))];
  let criterioCcd = 'contrato da resolução autorizativa';
  let ideCcd = texto(rea?.IdeCcd);
  if (!ideCcd) {
    ideCcd = moda(naoSecc.filter((l) => texto(l.SigTipMdl) === 'LT')) ?? '';
    criterioCcd = 'contrato dos módulos de LT';
  }
  if (!ideCcd) {
    ideCcd = moda(naoSecc) || texto(l0.IdeCcd);
    criterioCcd = 'contrato mais frequente entre os módulos';
  }
  const contrato = ctx.contratos.get(ideCcd);
  const notaContratos =
    ccds.length > 1
      ? `Módulos vinculados a ${ccds.length} contratos (${ccds.map((k) => texto(ctx.contratos.get(k)?.NumCnaCcd) || k).join(', ')}); concessionária atribuída pelo ${criterioCcd} — verificar.`
      : '';
  const marcos: NonNullable<RegistroNormalizado['marcos']> = [];
  const identificadores: NonNullable<RegistroNormalizado['identificadores']> = [{ tipo: 'aneel_siget_empreendimento', valor: ide }];
  const onsEpd = texto(l0.IdeOnsEpd);
  if (onsEpd) identificadores.push({ tipo: 'ons_empreendimento', valor: onsEpd });
  let regulatoria: NonNullable<RegistroNormalizado['situacoes']>['regulatoria'];
  if (rea) {
    const dataRea = data(rea.DatPubDoc) ?? data(rea.DatAssDoc);
    if (dataRea) marcos.push({ tipo: 'autorizacao_publicada', data: dataRea, natureza: 'realizado', descricao: `${texto(rea.CodReg) || `REA ${texto(rea.NumAto)}`} — ${texto(rea.DscEmentaCcd).slice(0, 300)}` });
    identificadores.push({ tipo: 'aneel_rea', valor: texto(rea.CodReg) || texto(rea.NumAto) });
    regulatoria = 'autorizada';
  } else if (!reforco && !texto(l0.IdeDoc) && contrato) {
    // O contrato só é a outorga deste escopo se for compatível com o prazo do ato legal (escopos
    // incluídos anos depois em contratos antigos não têm o ato identificado nesta fonte).
    const dataCcd = data(contrato.DatAsnCcd);
    const prazoAto = data(l0.DatCaoCgmAtoLgl);
    const compativel = !!dataCcd && (prazoAto ? dataCcd >= somarMeses(prazoAto, -84) : dataCcd >= somarMeses(ctx.hoje, -96));
    if (dataCcd && compativel) {
      marcos.push({ tipo: 'contrato_concessao_assinado', data: dataCcd, natureza: 'realizado', descricao: `Contrato de concessão ${texto(contrato.NumCnaCcd)}` });
    }
    regulatoria = 'outorgada';
  } else if (situacao === 'Planejado') {
    regulatoria = 'em_planejamento';
  }
  if (contrato) identificadores.push({ tipo: 'aneel_contrato_concessao', valor: texto(contrato.NumCnaCcd) });

  const prazo = data(l0.DatCaoCgmAtoLgl);
  if (prazo) marcos.push({ tipo: 'prazo_contratual_energizacao', data: prazo, natureza: 'previsto_oficial', descricao: 'Previsão de conclusão do empreendimento no ato legal (SIGET: DatCaoCgmAtoLgl)' });
  const efetiva = data(l0.DatEfeOprComEpd);
  const operacao = data(l0.DatOprComEpd);
  const concluidoSiget = situacao === 'Em Operação' || situacao === 'Concluído';
  if (efetiva && efetiva <= ctx.hoje && concluidoSiget) {
    marcos.push({ tipo: 'operacao_comercial', data: efetiva, natureza: 'realizado', descricao: 'Data efetiva de início de operação comercial (SIGET: DatEfeOprComEpd)' });
  } else if (operacao && operacao !== prazo) {
    marcos.push({ tipo: 'operacao_comercial', data: operacao, natureza: 'previsto_oficial', descricao: 'Data de operação comercial registrada no SIGET (DatOprComEpd)' });
  }

  const concluido = situacao === 'Em Operação' || situacao === 'Concluído';
  const obras = [...new Set(linhas.map((l) => texto(l.DscObr)).filter(Boolean))];
  const descricao = [
    descricaoEpd,
    `Situação no SIGET: ${situacao || 'não informada'}. Tipos de obra: ${[...tiposObra].filter(Boolean).join(', ') || '—'}.`,
    efetiva && !concluidoSiget ? `Operação comercial efetiva registrada em ${efetiva} com o empreendimento ainda "${situacao}" (operação parcial).` : '',
    obras.length ? `Obras (${obras.length}): ${obras.slice(0, 6).join(' | ')}${obras.length > 6 ? ' …' : ''}` : '',
    rea && texto(rea.DscLink) ? `Ato: ${texto(rea.DscLink)}` : '',
    notaContratos,
  ].filter(Boolean).join('\n');

  const trecho = [
    `IdeEpd=${ide}`,
    onsEpd && `IdeOnsEpd=${onsEpd}`,
    `NomEpd="${nome}"`,
    `DscSituacaoEpd=${situacao || '∅'}`,
    `DatCaoCgmAtoLgl=${texto(l0.DatCaoCgmAtoLgl) || '∅'}`,
    `DatOprComEpd=${texto(l0.DatOprComEpd) || '∅'}`,
    `DatEfeOprComEpd=${texto(l0.DatEfeOprComEpd) || '∅'}`,
    rea && `[Resolução Contrato Agente] CodReg=${texto(rea.CodReg)}; DatAssDoc=${texto(rea.DatAssDoc).slice(0, 10)}; DatPubDoc=${texto(rea.DatPubDoc).slice(0, 10)}; DscLink=${texto(rea.DscLink)}`,
    contrato && `[Contrato Agente] (${criterioCcd}) IdeCcd=${ideCcd}; NumCnaCcd=${texto(contrato.NumCnaCcd)}; DatAsnCcd=${texto(contrato.DatAsnCcd)}; DscRazaoSocial="${texto(contrato.DscRazaoSocial)}"; NumCNPJ=${texto(contrato.NumCNPJ)}`,
    detalheLT.length && `[Módulos LT] ${detalheLT.join(' | ')}`,
  ].filter(Boolean).join('; ');

  return {
    fonteId: ctx.fonte.id,
    chaveExterna: `siget:${ide}`,
    nome,
    identificadores,
    tipo,
    setorOrigem: 'transmissao',
    subsetor: 'transmissao_regulada',
    descricao,
    organizacoes: contrato && texto(contrato.DscRazaoSocial)
      ? [{ nome: texto(contrato.DscRazaoSocial), cnpj: texto(contrato.NumCNPJ).replace(/\D/g, '').padStart(14, '0') || undefined, papel: 'concessionaria', tipo: 'concessionaria_transmissao' }]
      : undefined,
    ufs: [...ufs],
    tensoesKv: kvs.length ? kvs : undefined,
    extensaoKm: extensaoNova > 0 ? Math.round(extensaoNova * 100) / 100 : undefined,
    trechosLT: trechos.length ? trechos : undefined,
    subestacoes: subestacoes.length ? subestacoes : undefined,
    marcos,
    situacoes: regulatoria ? { regulatoria } : undefined,
    situacaoObra: concluido ? 'concluida' : undefined,
    statusGeral: concluido ? 'concluido' : 'ativo',
    evidencia: {
      titulo: `ANEEL/SIGET — ${nome}`.slice(0, 250),
      url: ctx.urlEvidencia,
      tipoDocumento: 'planilha',
      dataPublicacao: data(l0.DatGeracaoConjuntoDados),
      dataColeta: ctx.hoje,
      trecho,
    },
  };
}

export const adaptadorSiget: Adaptador = {
  id: 'aneel_siget',
  descricao: 'ANEEL SIGET via datastore do Portal de Dados Abertos (empreendimentos de transmissão)',
  validarConfiguracao: () => [],
  async coletar(fonte, ctx: ContextoAdaptador): Promise<ResultadoAdaptador> {
    const c = fonte.config as ConfigSiget;
    const base = (c.baseUrl ?? BASE_PADRAO).replace(/\/$/, '');
    const pacote = c.pacote ?? 'sistema-de-gestao-da-transmissao-siget';
    const ativas = c.situacoesAtivas ?? ['Em andamento', 'Planejado'];
    const diasRecentes = c.diasConcluidosRecentes ?? 365;
    const [recEpd, recRes, recCcd, recLt] = await Promise.all([
      resolverRecurso(ctx.fetch, base, pacote, 'SIGET - Contrato Empreendimento Obra Módulo.csv'),
      resolverRecurso(ctx.fetch, base, pacote, 'SIGET - Resolução Contrato Agente.csv'),
      resolverRecurso(ctx.fetch, base, pacote, 'SIGET - Contrato Agente.csv'),
      resolverRecurso(ctx.fetch, base, pacote, 'SIGET - Contrato Módulo Linha Transmissão Subestação Origem Subestação Destino.csv'),
    ]);
    const [linhas, resolucoes, contratos, lts] = await Promise.all([
      lerDatastore(ctx.fetch, base, recEpd.id),
      lerDatastore(ctx.fetch, base, recRes.id),
      lerDatastore(ctx.fetch, base, recCcd.id),
      lerDatastore(ctx.fetch, base, recLt.id),
    ]);
    const mapaContratos = new Map(contratos.map((x) => [texto(x.IdeCcd), x]));
    // Uma resolução por empreendimento: a mais recente.
    const mapaRes = new Map<string, Linha>();
    for (const r of resolucoes) {
      const k = texto(r.IdeEpd);
      const atual = mapaRes.get(k);
      if (!atual || (data(r.DatAssDoc) ?? '') > (data(atual.DatAssDoc) ?? '')) mapaRes.set(k, r);
    }
    const mapaLt = new Map(lts.map((x) => [texto(x.IdeMdl), x]));
    const limiteRecente = somarMeses(ctx.hoje, -Math.round(diasRecentes / 30));

    const porEpd = new Map<string, Linha[]>();
    const foraDoRadar = new Map<string, Linha>();
    for (const l of linhas) {
      const situacao = texto(l.DscSituacaoEpd);
      const efetiva = data(l.DatEfeOprComEpd);
      const recente = (situacao === 'Em Operação' || situacao === 'Concluído') && !!efetiva && efetiva >= limiteRecente;
      const k = texto(l.IdeEpd);
      if (!ativas.includes(situacao) && !recente) {
        if (!foraDoRadar.has(k)) foraDoRadar.set(k, l);
        continue;
      }
      porEpd.set(k, [...(porEpd.get(k) ?? []), l]);
    }
    const registros: RegistroNormalizado[] = [];
    const avisos: string[] = [];
    const urlEvidencia = urlRecurso(base, pacote, recEpd.id);
    for (const grupo of porEpd.values()) {
      const r = registroSiget(grupo, { fonte, hoje: ctx.hoje, urlEvidencia, contratos: mapaContratos, resolucoes: mapaRes, lts: mapaLt });
      if ('erro' in r) avisos.push(r.erro);
      else registros.push(r);
    }
    await localizar(registros, c, ctx, avisos);
    // Empreendimentos fora do radar (em operação há mais tempo ou sem situação/revogados): encerram os
    // que estiverem sendo acompanhados.
    const encerramentos: Encerramento[] = [];
    for (const [k, l] of foraDoRadar) {
      if (porEpd.has(k)) continue;
      const situacao = texto(l.DscSituacaoEpd);
      const efetiva = data(l.DatEfeOprComEpd);
      const operando = situacao === 'Em Operação' || situacao === 'Concluído';
      encerramentos.push({
        chaveExterna: `siget:${k}`,
        statusGeral: operando ? 'concluido' : 'cancelado',
        marcos: operando && efetiva ? [{ tipo: 'operacao_comercial', data: efetiva, natureza: 'realizado', descricao: 'Data efetiva de início de operação comercial (SIGET: DatEfeOprComEpd)' }] : undefined,
        motivo: operando ? `SIGET informa situação "${situacao}"` : 'SIGET sem situação para o empreendimento (revogado ou desativado no cadastro)',
        evidencia: { titulo: `ANEEL/SIGET — ${texto(l.NomEpd)}`.slice(0, 250), url: urlEvidencia, tipoDocumento: 'planilha', dataPublicacao: data(l.DatGeracaoConjuntoDados), dataColeta: ctx.hoje, trecho: `IdeEpd=${k}; NomEpd="${texto(l.NomEpd)}"; DscSituacaoEpd=${situacao || '∅'}; DatEfeOprComEpd=${texto(l.DatEfeOprComEpd) || '∅'}` },
      });
    }
    avisos.push(`SIGET: ${linhas.length} módulos lidos (carga de ${recEpd.modificado?.slice(0, 10) ?? '?'}); ${porEpd.size} empreendimentos em andamento/planejados ou concluídos nos últimos ${diasRecentes} dias.`);
    return { registros, encerramentos, sinais: [], avisos, lidos: linhas.length };
  },
};

// ------------------------------------------------------------------------------------------------
// Resultado de leilões de transmissão
// ------------------------------------------------------------------------------------------------

interface ConfigLeiloes extends ConfigCkanAneel {
  /** Considera lotes leiloados a partir deste ano (obras antigas já estão em operação). */
  anoMinimo?: number;
  /** Meses entre leilão e assinatura usados apenas para a energização estimada (rotulada como estimativa). */
  mesesLeilaoAssinatura?: number;
}

/** Converte um lote leiloado em registro. */
export function registroLeilao(l: Linha, ctx: { fonte: Fonte; hoje: string; url: string; mesesAssinatura: number; descricaoRepetida?: boolean }): RegistroNormalizado | { erro: string } {
  const numLeilao = texto(l.NumLeilao);
  const lote = texto(l.NumLoteLeilao);
  const bruto = texto(l.NomEmpreendimento).replace(/\s+/g, ' ');
  if (!bruto) return { erro: `Leilão ${numLeilao} lote ${lote}: sem descrição` };
  // Descrição oficial repetida em lotes diferentes do mesmo leilão (divergência da fonte): não se
  // deriva nome, tensões nem instalações dela.
  const confiavel = !ctx.descricaoRepetida;
  // A descrição oficial lista as instalações separadas por "- " no início de cada item.
  const itens = bruto.split(/-\s+(?=(?:LT|SE|Trechos?|Sublote|Novas|Compensador|Reator|Seccionamento|CS|CE)\b)/i).map((s) => s.replace(/[-–\s]+$/, '').trim()).filter((s) => s.length > 3);
  const principal = (itens[0] ?? bruto).slice(0, 140);
  const nome = confiavel ? `Leilão ${numLeilao} · Lote ${lote}: ${principal}` : `Leilão ${numLeilao} · Lote ${lote} (${texto(l.SigUFPrincipal)})`;
  const dataLeilao = data(l.DatLeilao);
  const km = numero(l.MdaExtensaoLinhaTransmissaoKm);
  const mva = numero(l.MdaSubEstacoesMVA);
  const prazoMeses = numero(l.QtdPrazoConstrucaoMeses);
  const tensoes = confiavel ? extrairTensoesKv(bruto) : [];
  const temSE = (mva ?? 0) > 0 || (confiavel && /\bSE\b|subesta/i.test(bruto));
  const temLT = (km ?? 0) > 0 || (confiavel && /\bLT\b/.test(bruto));
  const ufs = texto(l.SigUFPrincipal).split(/[\/,;\s]+/).filter(ehUf);
  const marcos: NonNullable<RegistroNormalizado['marcos']> = [];
  if (dataLeilao) {
    marcos.push({ tipo: 'leilao_realizado', data: dataLeilao, natureza: 'realizado', descricao: `Leilão ANEEL ${numLeilao}, lote ${lote}` });
    if (prazoMeses) {
      marcos.push({
        tipo: 'energizacao',
        data: somarMeses(dataLeilao, ctx.mesesAssinatura + prazoMeses),
        natureza: 'previsto_estimado',
        descricao: `Estimativa da plataforma: data do leilão + ${ctx.mesesAssinatura} meses até a assinatura (premissa) + prazo de construção do edital (${prazoMeses} meses). Não é data divulgada.`,
      });
    }
  }
  const vencedor = texto(l.NomVencedorLeilao);
  return {
    fonteId: ctx.fonte.id,
    chaveExterna: `leilao:${numLeilao}:${lote}`,
    nome,
    nomesAlternativos: confiavel ? itens.slice(0, 8).map((s) => s.slice(0, 200)) : undefined,
    identificadores: [{ tipo: 'aneel_leilao_lote', valor: `${numLeilao} lote ${lote}` }],
    tipo: temLT && temSE ? 'LT+SE' : temLT ? 'LT' : 'SE',
    setorOrigem: 'transmissao',
    subsetor: 'transmissao_regulada',
    descricao: `${confiavel ? bruto : `Descrição oficial deste lote repete a de outro lote do mesmo leilão (divergência na fonte): "${bruto.slice(0, 200)}".`}\nPrazo de construção do edital: ${prazoMeses ?? '?'} meses. Investimento previsto (ANEEL): ${texto(l.VlrInvestimentoPrevisto) || '?'}; RAP vencedora: ${texto(l.VlrRAPVencedorLeilao) || '?'} (deságio ${texto(l.PctDesagio) || '?'}).`,
    organizacoes: vencedor ? [{ nome: vencedor, papel: 'concessionaria', tipo: 'concessionaria_transmissao' }] : undefined,
    ufs,
    tensoesKv: tensoes.length ? tensoes : undefined,
    extensaoKm: km && km > 0 ? km : undefined,
    capacidadeMva: mva && mva > 0 ? mva : undefined,
    capexInfraEletricaBRL: numero(l.VlrInvestimentoPrevisto),
    rapAnualBRL: numero(l.VlrRAPVencedorLeilao),
    // Investimento previsto pela ANEEL é estimativa de referência do edital (preços da época do leilão).
    valoresMonetarios: {
      natureza: 'estimado',
      dataBase: dataLeilao,
      observacao: 'investimento previsto pela ANEEL para o lote (referência do edital)',
      rap: { natureza: 'declarado', dataBase: dataLeilao, observacao: 'RAP vencedora do leilão' },
    },
    marcos,
    situacoes: { regulatoria: 'outorgada' },
    // O conjunto não informa o andamento: o status não é afirmado por esta fonte.
    evidencia: {
      titulo: `ANEEL — Resultado de leilões de transmissão: Leilão ${numLeilao}, lote ${lote}`,
      url: ctx.url,
      tipoDocumento: 'planilha',
      dataPublicacao: data(l.DatGeracaoConjuntoDados),
      dataColeta: ctx.hoje,
      trecho: `DatLeilao=${texto(l.DatLeilao).slice(0, 10)}; NumLoteLeilao=${lote}; NomEmpreendimento="${bruto.slice(0, 400)}"; QtdPrazoConstrucaoMeses=${texto(l.QtdPrazoConstrucaoMeses)}; MdaExtensaoLinhaTransmissaoKm=${texto(l.MdaExtensaoLinhaTransmissaoKm)}; MdaSubEstacoesMVA=${texto(l.MdaSubEstacoesMVA)}; VlrInvestimentoPrevisto=${texto(l.VlrInvestimentoPrevisto)}; NomVencedorLeilao="${vencedor}"`,
    },
  };
}

export const adaptadorLeiloesTransmissao: Adaptador = {
  id: 'aneel_leiloes_transmissao',
  descricao: 'ANEEL — resultado de leilões de transmissão (datastore do Portal de Dados Abertos)',
  validarConfiguracao: () => [],
  async coletar(fonte, ctx: ContextoAdaptador): Promise<ResultadoAdaptador> {
    const c = fonte.config as ConfigLeiloes;
    const base = (c.baseUrl ?? BASE_PADRAO).replace(/\/$/, '');
    const pacote = c.pacote ?? 'resultado-de-leiloes';
    const anoMinimo = c.anoMinimo ?? Number(ctx.hoje.slice(0, 4)) - 5;
    const rec = await resolverRecurso(ctx.fetch, base, pacote, /leiloes-transmissao/i);
    const linhas = await lerDatastore(ctx.fetch, base, rec.id);
    const registros: RegistroNormalizado[] = [];
    const avisos: string[] = [];
    const url = urlRecurso(base, pacote, rec.id);
    const meses = c.mesesLeilaoAssinatura ?? 3;
    // Descrições repetidas entre lotes do mesmo leilão.
    const porDescricao = new Map<string, string[]>();
    for (const l of linhas) {
      const k = `${texto(l.NumLeilao)}|${normalizarTexto(texto(l.NomEmpreendimento))}`;
      porDescricao.set(k, [...(porDescricao.get(k) ?? []), texto(l.NumLoteLeilao)]);
    }
    let antigos = 0;
    for (const l of linhas) {
      if ((numero(l.AnoLeilao) ?? 0) < anoMinimo) continue;
      // Lote cuja energização estimada passou há mais de 12 meses: provavelmente em operação; não entra
      // como oportunidade (o SIGET informa o andamento real dos que seguem em implantação).
      const dl = data(l.DatLeilao);
      const prazo = numero(l.QtdPrazoConstrucaoMeses);
      if (dl && prazo && somarMeses(dl, meses + prazo) < somarMeses(ctx.hoje, -12)) {
        antigos++;
        continue;
      }
      const lotes = porDescricao.get(`${texto(l.NumLeilao)}|${normalizarTexto(texto(l.NomEmpreendimento))}`) ?? [];
      const repetida = lotes.length > 1;
      if (repetida) avisos.push(`Leilão ${texto(l.NumLeilao)}: a descrição oficial do lote ${texto(l.NumLoteLeilao)} repete a dos lotes ${lotes.filter((x) => x !== texto(l.NumLoteLeilao)).join(', ')} (divergência na fonte; nome e tensões não derivados do texto).`);
      const r = registroLeilao(l, { fonte, hoje: ctx.hoje, url, mesesAssinatura: meses, descricaoRepetida: repetida });
      if ('erro' in r) avisos.push(r.erro);
      else registros.push(r);
    }
    if (antigos) avisos.push(`${antigos} lote(s) com energização estimada anterior a 12 meses atrás não incluídos (provavelmente em operação).`);
    await localizar(registros, c, ctx, avisos);
    const ultimo = linhas.map((l) => texto(l.DatLeilao).slice(0, 10)).sort().at(-1);
    avisos.push(`Leilões: ${linhas.length} lotes no conjunto (último leilão registrado: ${ultimo ?? '?'}); ${registros.length} lotes desde ${anoMinimo}.`);
    return { registros, sinais: [], avisos, lidos: linhas.length };
  },
};

/** Utilitário exportado para testes: normaliza a chave de comparação de nomes de SE. */
export const chaveSE = (s: string) => normalizarTexto(s).replace(/^(se|sub)\s+/, '').replace(/\s+/g, ' ').trim();
