import {
  ROTULO_MARCO, dataValida, extrairTensoesKv, formatarDataBR, normalizarNumero, normalizarTexto, normalizarUF,
  type Marco, type RegistroNormalizado, type TipoDocumento,
} from '@radar/core';
import { extrairHeuristico } from './heuristica.js';
import { ErroIA, extrairComLLM, type OpcoesLLM } from './llm.js';
import type { Descartado, ItemExtraido, MarcoExtraido, ResultadoAnaliseDocumental } from './tipos.js';
import { indexarDocumento, localizarTrecho, valorPresenteNoTrecho } from './verificacao.js';

export interface OpcoesAnalise {
  titulo: string;
  tipoDocumento?: TipoDocumento;
  hoje: string;
  /** Configuração do LLM; se ausente ou sem chave, usa somente a extração heurística. */
  llm?: OpcoesLLM & { habilitado: boolean };
  limiteCaracteres?: number;
}

export async function analisarDocumento(texto: string, op: OpcoesAnalise): Promise<ResultadoAnaliseDocumental> {
  const avisos: string[] = [];
  const descartados: Descartado[] = [];
  const indice = indexarDocumento(texto);
  const heur = extrairHeuristico(texto, op.hoje);
  const resultado: ResultadoAnaliseDocumental = {
    metodo: 'heuristico',
    analisadoEm: new Date().toISOString(),
    itens: heur.itens,
    marcos: heur.marcos,
    indicios: heur.indicios,
    lacunas: [],
    descartados,
    avisos,
  };
  if (!texto.trim()) {
    avisos.push('Documento sem texto extraível.');
    return resultado;
  }
  if (!op.llm?.habilitado) {
    avisos.push('Extração por IA generativa desabilitada (sem ANTHROPIC_API_KEY): resultado apenas heurístico.');
    return resultado;
  }
  const limite = op.limiteCaracteres ?? 400_000;
  if (texto.length > limite) {
    avisos.push(`Documento com ${texto.length.toLocaleString('pt-BR')} caracteres excede o limite de ${limite.toLocaleString('pt-BR')} para IA: divida o documento. Resultado apenas heurístico.`);
    return resultado;
  }
  try {
    const { saida, modelo } = await extrairComLLM(texto, { titulo: op.titulo, tipoDocumento: op.tipoDocumento, hoje: op.hoje }, op.llm);
    resultado.metodo = 'llm+heuristico';
    resultado.modelo = modelo;
    const itensLLM: ItemExtraido[] = [];
    for (const it of saida.itens) {
      const pagina = localizarTrecho(indice, it.trecho);
      if (pagina === undefined) {
        descartados.push({ item: it, motivo: 'Trecho citado não encontrado literalmente no documento.' });
        continue;
      }
      if (!valorPresenteNoTrecho(it.valor, it.trecho) && !['tipo', 'setor', 'situacaoAmbiental', 'faseContratacao'].includes(it.campo)) {
        descartados.push({ item: it, motivo: 'Valor não aparece no trecho citado.' });
        continue;
      }
      itensLLM.push({ campo: it.campo, valor: it.valor, trecho: it.trecho, pagina: pagina || undefined, metodo: 'llm', observacao: it.observacao ?? undefined });
    }
    const marcosLLM: MarcoExtraido[] = [];
    for (const m of saida.marcos) {
      const pagina = localizarTrecho(indice, m.trecho);
      if (pagina === undefined) {
        descartados.push({ item: m, motivo: 'Trecho do marco não encontrado literalmente no documento.' });
        continue;
      }
      if (!dataValida(m.data)) {
        descartados.push({ item: m, motivo: `Data inválida: ${m.data}` });
        continue;
      }
      marcosLLM.push({ ...m, pagina: pagina || undefined, metodo: 'llm' });
    }
    const indiciosLLM = saida.indicios.flatMap((i) => {
      const pagina = localizarTrecho(indice, i.trecho);
      if (pagina === undefined) {
        descartados.push({ item: i, motivo: 'Trecho do indício não encontrado literalmente no documento.' });
        return [];
      }
      return [{ ...i, pagina: pagina || undefined, metodo: 'llm' as const }];
    });
    // Itens do LLM têm prioridade; heurísticos complementam campos não cobertos.
    const camposLLM = new Set(itensLLM.map((i) => `${i.campo}|${normalizarTexto(i.valor)}`));
    resultado.itens = [...itensLLM, ...heur.itens.filter((i) => !camposLLM.has(`${i.campo}|${normalizarTexto(i.valor)}`))];
    const chaveMarco = (m: MarcoExtraido) => `${m.tipo}|${m.data}`;
    const marcosVistos = new Set(marcosLLM.map(chaveMarco));
    resultado.marcos = [...marcosLLM, ...heur.marcos.filter((m) => !marcosVistos.has(chaveMarco(m)))];
    resultado.indicios = [...indiciosLLM, ...heur.indicios.filter((h) => !indiciosLLM.some((i) => i.trecho === h.trecho))];
    resultado.resumo = saida.resumo;
    resultado.lacunas = saida.lacunas;
    const cls = saida.classificacao;
    const trechoOk = cls.trecho ? localizarTrecho(indice, cls.trecho) !== undefined : false;
    resultado.classificacao = {
      tipo: cls.tipo === 'indefinido' ? undefined : cls.tipo,
      setor: cls.setor === 'indefinido' ? undefined : cls.setor,
      justificativa: cls.justificativa + (cls.trecho && !trechoOk ? ' (citação não localizada no documento)' : ''),
      trecho: trechoOk ? cls.trecho ?? undefined : undefined,
    };
    if (descartados.length) avisos.push(`${descartados.length} item(ns) proposto(s) pela IA foram descartados por falta de evidência literal.`);
  } catch (e) {
    avisos.push(`IA generativa indisponível: ${(e as Error).message}${e instanceof ErroIA && e.recuperavel ? ' (tentar novamente)' : ''}. Resultado apenas heurístico.`);
  }
  return resultado;
}

export interface SelecaoAplicacao {
  /** Índices de itens/marcos aprovados pelo revisor humano. */
  itens: number[];
  marcos: number[];
  nome?: string;
}

/**
 * Constrói um RegistroNormalizado somente com o que o revisor aprovou. Cada valor aprovado
 * já tem trecho verificado; o registro entra com status "inferido" (origem IA) e evidência
 * apontando para o documento.
 */
export function registroDeAnalise(
  analise: ResultadoAnaliseDocumental,
  sel: SelecaoAplicacao,
  doc: { id: string; titulo: string; url?: string; tipo: TipoDocumento; dataPublicacao?: string; fonteId: string },
): RegistroNormalizado {
  const itens = sel.itens.map((i) => analise.itens[i]).filter(Boolean);
  const marcos = sel.marcos.map((i) => analise.marcos[i]).filter(Boolean);
  const primeiro = (campo: ItemExtraido['campo']) => itens.find((i) => i.campo === campo);
  const nome = sel.nome ?? primeiro('nome')?.valor ?? doc.titulo;
  const tensoes = [...new Set(itens.filter((i) => i.campo === 'tensaoKv').flatMap((i) => extrairTensoesKv(`${i.valor} kV`)))];
  const ufs = [...new Set(itens.filter((i) => i.campo === 'uf').map((i) => normalizarUF(i.valor)).filter((u): u is NonNullable<typeof u> => !!u))];
  const orgs = itens
    .filter((i) => i.campo === 'empreendedor' || i.campo === 'organizacao' || i.campo === 'contratada')
    .map((i) => ({ nome: i.valor, papel: i.campo === 'contratada' ? ('executor_obra' as const) : ('empreendedor' as const) }));
  const num = (campo: ItemExtraido['campo']) => {
    const v = primeiro(campo);
    return v ? normalizarNumero(v.valor) : undefined;
  };
  const trechos = [...itens.map((i) => i.trecho), ...marcos.map((m) => m.trecho)];
  const paginas = [...itens, ...marcos].map((x) => x.pagina).filter((p): p is number => !!p);
  return {
    fonteId: doc.fonteId,
    nome,
    tensoesKv: tensoes.length ? tensoes : undefined,
    extensaoKm: num('extensaoKm'),
    capacidadeMva: num('capacidadeMva'),
    capexTotalBRL: num('capexTotalBRL'),
    capexInfraEletricaBRL: num('capexInfraEletricaBRL'),
    rapAnualBRL: num('rapAnualBRL'),
    ufs: ufs.length ? ufs : undefined,
    organizacoes: orgs.length ? orgs : undefined,
    marcos: marcos.length ? marcos.map((m) => ({ tipo: m.tipo, data: m.data, natureza: m.natureza, escopo: m.escopo ?? 'geral', descricao: m.precisao && m.precisao !== 'dia' ? `Data com precisão de ${m.precisao}` : undefined })) : undefined,
    evidencia: {
      titulo: doc.titulo,
      url: doc.url,
      documentoId: doc.id,
      tipoDocumento: doc.tipo,
      dataPublicacao: doc.dataPublicacao,
      trecho: [...new Set(trechos)].slice(0, 5).join(' […] ').slice(0, 2000),
      pagina: paginas[0],
    },
    statusDado: 'inferido',
  };
}

export interface DiferencaCronograma {
  tipo: Marco['tipo'];
  escopo: Marco['escopo'];
  rotulo: string;
  de?: string;
  para?: string;
  deltaDias?: number;
  situacao: 'novo' | 'removido' | 'adiado' | 'antecipado' | 'realizado' | 'igual';
}

/** Compara duas versões de cronograma (listas de marcos) — determinístico. */
export function compararCronogramas(anterior: Pick<Marco, 'tipo' | 'escopo' | 'data' | 'natureza'>[], atual: Pick<Marco, 'tipo' | 'escopo' | 'data' | 'natureza'>[]): DiferencaCronograma[] {
  const chave = (m: Pick<Marco, 'tipo' | 'escopo'>) => `${m.tipo}|${m.escopo}`;
  const mapaA = new Map(anterior.map((m) => [chave(m), m]));
  const mapaB = new Map(atual.map((m) => [chave(m), m]));
  const res: DiferencaCronograma[] = [];
  for (const [k, b] of mapaB) {
    const a = mapaA.get(k);
    const rotulo = ROTULO_MARCO[b.tipo];
    if (!a) {
      res.push({ tipo: b.tipo, escopo: b.escopo, rotulo, para: b.data, situacao: 'novo' });
      continue;
    }
    const delta = Math.round((Date.parse(b.data) - Date.parse(a.data)) / 86_400_000);
    const situacao = a.natureza !== 'realizado' && b.natureza === 'realizado' ? 'realizado' : delta > 0 ? 'adiado' : delta < 0 ? 'antecipado' : 'igual';
    res.push({ tipo: b.tipo, escopo: b.escopo, rotulo, de: a.data, para: b.data, deltaDias: delta, situacao });
  }
  for (const [k, a] of mapaA) if (!mapaB.has(k)) res.push({ tipo: a.tipo, escopo: a.escopo, rotulo: ROTULO_MARCO[a.tipo], de: a.data, situacao: 'removido' });
  return res.sort((x, y) => Math.abs(y.deltaDias ?? 0) - Math.abs(x.deltaDias ?? 0));
}

export function descreverDiferencas(dif: DiferencaCronograma[]): string[] {
  return dif
    .filter((d) => d.situacao !== 'igual')
    .map((d) =>
      d.situacao === 'novo' ? `${d.rotulo}: novo marco em ${formatarDataBR(d.para)}.`
        : d.situacao === 'removido' ? `${d.rotulo}: marco ausente na nova versão (era ${formatarDataBR(d.de)}).`
          : d.situacao === 'realizado' ? `${d.rotulo}: realizado em ${formatarDataBR(d.para)} (previsto ${formatarDataBR(d.de)}).`
            : `${d.rotulo}: ${formatarDataBR(d.de)} → ${formatarDataBR(d.para)} (${d.deltaDias! > 0 ? '+' : ''}${d.deltaDias} dias).`,
    );
}
