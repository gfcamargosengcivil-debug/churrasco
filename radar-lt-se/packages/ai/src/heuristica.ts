/**
 * Extração heurística (sem IA generativa): regras e expressões regulares sobre o texto.
 * Cada item extraído carrega o TRECHO literal (sentença) em que foi encontrado.
 * Funciona sem chave de API e serve de base/validação para a extração por LLM.
 */
import {
  REGIAO_DA_UF, extrairTensoesKv, normalizarData, normalizarNumero, normalizarTexto, normalizarValorMonetario,
  type TipoMarco, type UF,
} from '@radar/core';
import type { IndicioContratacao, ItemExtraido, MarcoExtraido } from './tipos.js';

/** Divide o texto em sentenças preservando a posição e a página (marcadores "[[página N]]"). */
export function sentencas(texto: string): { texto: string; inicio: number; pagina?: number }[] {
  const res: { texto: string; inicio: number; pagina?: number }[] = [];
  const re = /\[\[página (\d+)\]\]/g;
  const marcos: { pos: number; pag: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) marcos.push({ pos: m.index, pag: Number(m[1]) });
  const paginaEm = (pos: number) => {
    let p: number | undefined;
    for (const x of marcos) if (x.pos <= pos) p = x.pag;
    return p;
  };
  const partes = texto.split(/\s*(?=\[\[página \d+\]\])|(?<=[.;!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9"“(])|\n{2,}|\n(?=\s*[-•*\d]+[.)]?\s)/);
  let cursor = 0;
  for (const parte of partes) {
    const i = texto.indexOf(parte, cursor);
    const t = parte.replace(/\[\[página \d+\]\]/g, '').replace(/\s+/g, ' ').trim();
    if (t.length >= 8) res.push({ texto: t, inicio: i, pagina: paginaEm(i) });
    cursor = i + parte.length;
  }
  return res;
}

const PALAVRAS_MARCO: [RegExp, TipoMarco][] = [
  [/licen[cç]a de instala[cç][aã]o|\bLI\b/i, 'licenca_instalacao'],
  [/licen[cç]a pr[eé]via|\bLP\b/i, 'licenca_previa'],
  [/licen[cç]a de opera[cç][aã]o|\bLO\b/i, 'licenca_operacao'],
  [/assinatura do contrato de concess[aã]o|contrato de concess[aã]o (foi )?assinado/i, 'contrato_concessao_assinado'],
  [/resolu[cç][aã]o autorizativa|\bREA\b/i, 'autorizacao_publicada'],
  [/\bleil[aã]o\b/i, 'leilao_realizado'],
  [/\bedital\b/i, 'edital_publicado'],
  [/consulta p[uú]blica/i, 'consulta_publica'],
  [/decis[aã]o final de investimento|\bFID\b|aprova[cç][aã]o do investimento/i, 'decisao_final_investimento'],
  [/\bRFQ\b|\bRFP\b|pedido de cota[cç][aã]o|concorr[eê]ncia|carta[- ]convite/i, 'rfq_publicada'],
  [/contrato de (execu[cç][aã]o|EPC|montagem|constru[cç][aã]o)/i, 'contrato_execucao_assinado'],
  [/mobiliza[cç][aã]o/i, 'mobilizacao'],
  [/in[ií]cio das obras|ordem de servi[cç]o|in[ií]cio da constru[cç][aã]o/i, 'inicio_obras'],
  [/prazo (contratual )?(de|para) (energiza[cç][aã]o|entrada em opera[cç][aã]o)|data de opera[cç][aã]o comercial prevista no contrato/i, 'prazo_contratual_energizacao'],
  [/energiza[cç][aã]o|entrada em opera[cç][aã]o|opera[cç][aã]o comercial/i, 'energizacao'],
  [/financiamento (aprovado|contratado)/i, 'financiamento_aprovado'],
  [/an[uú]ncio|anunciou|anuncia/i, 'anuncio'],
];

const FUTURO = /\b(prev[eê]|previst[oa]s?|dever[aá]|deve(m)? (ser|ocorrer)|pretende|estimad[oa]|programad[oa]|at[eé] (o|a)?\s?(fim|final)|planej)/i;

const DATA_RE = /\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2}|(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:[cç]o)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)\.?\s*(?:de\s*|\/\s*)?\d{4}|[1-4]\s*º?\s*(?:trimestre|T)\s*(?:de\s*)?\d{4}|\b[12]º?\s*semestre\s*(?:de\s*)?\d{4})/gi;

const INDICIOS: { re: RegExp; tipo: IndicioContratacao['tipo']; descricao: string }[] = [
  { re: /\bRFQ\b|\bRFP\b|pedido de cota[cç][aã]o|solicita[cç][aã]o de proposta/i, tipo: 'contratacao_proxima', descricao: 'Menção a RFQ/RFP ou pedido de cotação' },
  { re: /pr[eé][- ]qualifica[cç][aã]o|cadastro de fornecedores|chamada de fornecedores/i, tipo: 'contratacao_proxima', descricao: 'Pré-qualificação/cadastro de fornecedores' },
  { re: /concorr[eê]ncia|licita[cç][aã]o|carta[- ]convite|tomada de pre[cç]os/i, tipo: 'contratacao_proxima', descricao: 'Processo competitivo de contratação' },
  { re: /contrata[cç][aã]o (do|da|de) (EPC|montagem|obras?|constru[cç][aã]o|empreiteira)/i, tipo: 'contratacao_proxima', descricao: 'Contratação de EPC/obra mencionada' },
  { re: /licen[cç]a de instala[cç][aã]o (foi )?(emitida|obtida|concedida)|obteve a licen[cç]a de instala[cç][aã]o/i, tipo: 'contratacao_proxima', descricao: 'LI emitida — mobilização tende a seguir' },
  { re: /(contrato|contratou|contratada|adjudic)/i, tipo: 'contratacao_realizada', descricao: 'Possível contratação já realizada' },
  { re: /mobiliza[cç][aã]o (das equipes|iniciada|teve in[ií]cio)|in[ií]cio das obras|canteiro de obras/i, tipo: 'obra_iniciada', descricao: 'Obra/mobilização iniciada' },
];

const UF_NOMES: Record<string, UF> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES',
  goias: 'GO', maranhao: 'MA', 'mato grosso do sul': 'MS', 'mato grosso': 'MT', 'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR',
  pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};

export interface ResultadoHeuristico {
  itens: ItemExtraido[];
  marcos: MarcoExtraido[];
  indicios: IndicioContratacao[];
}

export function extrairHeuristico(texto: string, hoje: string): ResultadoHeuristico {
  const itens: ItemExtraido[] = [];
  const marcos: MarcoExtraido[] = [];
  const indicios: IndicioContratacao[] = [];
  const vistos = new Set<string>();
  const add = (i: ItemExtraido) => {
    const k = `${i.campo}|${i.valor}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    itens.push(i);
  };

  for (const s of sentencas(texto)) {
    const t = s.texto;
    // Nome de empreendimento
    const nome = t.match(/\b((?:LT|Linha de Transmiss[aã]o|SE|Subesta[cç][aã]o)\s+(?:\d{2,3}\s*(?:\/\s*\d{2,3}\s*)?kV\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\w\sÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç.'()-]{3,90}?(?:\s[–—-]\s[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\w\sÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç.'()-]{2,60}?)?)(?=[,;.:]|\s(?:com|de|no|na|em|para|que|e)\s|$)/);
    if (nome) add({ campo: 'nome', valor: nome[1].trim(), trecho: t, pagina: s.pagina, metodo: 'heuristico' });
    for (const kv of extrairTensoesKv(t)) {
      if (kv >= 69) add({ campo: 'tensaoKv', valor: String(kv), trecho: t, pagina: s.pagina, metodo: 'heuristico' });
    }
    const km = t.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:km|quil[oô]metros)\b/i);
    if (km && /linha|LT|extens|circuito|tra[cç]ado/i.test(t)) {
      const v = normalizarNumero(km[1]);
      if (v && v > 0.5 && v < 3000) add({ campo: 'extensaoKm', valor: String(v), trecho: t, pagina: s.pagina, metodo: 'heuristico' });
    }
    const mva = t.match(/(\d{2,5}(?:[.,]\d+)?)\s*MVA\b/i);
    if (mva) add({ campo: 'capacidadeMva', valor: String(normalizarNumero(mva[1])), trecho: t, pagina: s.pagina, metodo: 'heuristico' });
    for (const rs of t.matchAll(/R\$\s?[\d.,]+\s*(?:mil(?:h(?:ão|ões|oes))?|bilh(?:ão|ões|oes)|bi|mi)?/gi)) {
      const v = normalizarValorMonetario(rs[0]);
      if (!v || v < 100_000) continue;
      const nt = normalizarTexto(t);
      const campo = /\brap\b|receita anual permitida/.test(nt) ? 'rapAnualBRL' : /linha|subestac|transmiss|infraestrutura eletrica|conexao/.test(nt) && !/total|projeto como um todo/.test(nt) ? 'capexInfraEletricaBRL' : 'capexTotalBRL';
      add({ campo, valor: String(v), trecho: t, pagina: s.pagina, metodo: 'heuristico', observacao: campo === 'capexTotalBRL' ? 'Classificado como investimento total (não endereçável) por falta de menção a LT/SE.' : undefined });
    }
    const cnpj = t.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
    if (cnpj) add({ campo: 'cnpj', valor: cnpj[0], trecho: t, pagina: s.pagina, metodo: 'heuristico' });
    for (const org of t.matchAll(/\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç&.-]+(?:\s+(?:de|do|da|dos|das|e|[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç&.-]+)){0,6}\s+(?:S\.?\/?A\.?|Ltda\.?|S\/A)(?:\s*\(DEMO\))?)/g)) {
      add({ campo: 'organizacao', valor: org[1].trim(), trecho: t, pagina: s.pagina, metodo: 'heuristico' });
    }
    for (const uf of t.matchAll(/\(([A-Z]{2})\)|\/([A-Z]{2})\b/g)) {
      const sigla = (uf[1] ?? uf[2]) as UF;
      if (sigla in REGIAO_DA_UF) add({ campo: 'uf', valor: sigla, trecho: t, pagina: s.pagina, metodo: 'heuristico' });
    }
    const nt = normalizarTexto(t);
    for (const [nomeUf, sigla] of Object.entries(UF_NOMES)) {
      if (new RegExp(`\\b(estado d[eoa] |em |no |na )${nomeUf}\\b`).test(nt)) add({ campo: 'uf', valor: sigla, trecho: t, pagina: s.pagina, metodo: 'heuristico' });
    }

    // Marcos: data + palavra-chave na mesma sentença
    const datas = [...t.matchAll(DATA_RE)];
    if (datas.length) {
      const tipo = PALAVRAS_MARCO.find(([re]) => re.test(t))?.[1];
      if (tipo) {
        for (const d of datas) {
          const n = normalizarData(d[0].replace(/(\d)\s*º?\s*semestre\s*(de\s*)?(\d{4})/i, (_x, s1, _y, a) => `${s1 === '1' ? '01' : '07'}/${a}`));
          if (!n) continue;
          const natureza = FUTURO.test(t) || n.data > hoje ? 'previsto_oficial' : 'realizado';
          marcos.push({ tipo, data: n.data, precisao: n.precisao, natureza, trecho: t, pagina: s.pagina, metodo: 'heuristico' });
        }
      }
    }
    for (const ind of INDICIOS) {
      if (ind.re.test(t)) indicios.push({ tipo: ind.tipo, descricao: ind.descricao, trecho: t, pagina: s.pagina, metodo: 'heuristico' });
    }
  }
  return { itens, marcos, indicios };
}
