/**
 * Provedor de IA generativa (Claude, via SDK oficial da Anthropic) — usado SOMENTE no servidor.
 * A chave vem de ANTHROPIC_API_KEY; nunca é enviada ao navegador.
 *
 * O modelo devolve saída estruturada (JSON validado por esquema). Toda afirmação deve trazer
 * citação literal; a verificação das citações é feita por código em `analise.ts`.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { TIPOS_MARCO } from '@radar/core';

export const SaidaExtracaoSchema = z.object({
  itens: z.array(
    z.object({
      campo: z.enum([
        'nome', 'tipo', 'setor', 'tensaoKv', 'extensaoKm', 'capacidadeMva', 'qtdSubestacoes', 'capexTotalBRL',
        'capexInfraEletricaBRL', 'rapAnualBRL', 'empreendedor', 'contratada', 'cnpj', 'uf', 'municipio',
        'situacaoAmbiental', 'faseContratacao', 'outro',
      ]),
      valor: z.string(),
      trecho: z.string(),
      observacao: z.string().nullable(),
    }),
  ),
  marcos: z.array(
    z.object({
      tipo: z.enum(TIPOS_MARCO),
      data: z.string(),
      natureza: z.enum(['realizado', 'previsto_oficial']),
      escopo: z.enum(['LT', 'SE', 'geral']),
      trecho: z.string(),
    }),
  ),
  indicios: z.array(
    z.object({
      tipo: z.enum(['contratacao_proxima', 'contratacao_realizada', 'obra_iniciada']),
      descricao: z.string(),
      trecho: z.string(),
    }),
  ),
  classificacao: z.object({
    tipo: z.enum(['LT', 'SE', 'LT+SE', 'conexao_geracao', 'expansao_industrial', 'infraestrutura_associada', 'indefinido']),
    setor: z.enum(['transmissao', 'geracao', 'mineracao', 'industria', 'distribuicao', 'outro', 'indefinido']),
    justificativa: z.string(),
    trecho: z.string().nullable(),
  }),
  resumo: z.string(),
  lacunas: z.array(z.string()),
});
export type SaidaExtracao = z.infer<typeof SaidaExtracaoSchema>;

const SISTEMA = `Você é um analista de inteligência comercial do setor elétrico brasileiro, especializado em obras de linhas de transmissão (LT) e subestações (SE) a partir de 138 kV.
Sua tarefa é EXTRAIR informações de UM documento (edital, resolução autorizativa, relatório, cronograma, comunicado ou notícia).

Regras obrigatórias:
1. Use somente o que está escrito no documento. Não use conhecimento externo, não complete lacunas e não deduza valores.
2. Todo item, marco e indício deve ter o campo "trecho" com uma citação LITERAL e contígua do documento (copie exatamente, sem parafrasear, com no máximo ~400 caracteres). Itens sem citação literal serão descartados automaticamente.
3. Datas no formato AAAA-MM-DD. Se o documento indicar apenas mês/ano, use o dia 01; se indicar trimestre, o primeiro dia do trimestre.
4. "natureza" do marco: "realizado" somente se o texto afirma que o evento já ocorreu; caso contrário "previsto_oficial".
5. Valores monetários em reais, como número sem separadores (ex.: "1200000000"). Distinga CAPEX total do empreendimento (capexTotalBRL) de investimento em LT/SE (capexInfraEletricaBRL); na dúvida, use capexTotalBRL e explique em "observacao".
6. Uma licença ou concessão NÃO significa que a obra já foi contratada; registre indícios de contratação apenas quando o texto mencionar RFQ/RFP, cotação, concorrência, pré-qualificação, contratação de EPC/obra ou mobilização.
7. "resumo": até 6 frases objetivas para a área comercial; cada frase deve conter entre aspas o trecho do documento que a sustenta.
8. "lacunas": liste informações comercialmente relevantes que o documento NÃO informa (ex.: extensão, tensão, contratante, prazo de energização, situação do licenciamento).
9. Se o documento não tratar de LT/SE ou de demanda de energia, retorne listas vazias e explique em "lacunas".`;

export interface OpcoesLLM {
  apiKey?: string;
  modelo?: string;
  esforco?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  cliente?: Anthropic;
  timeoutMs?: number;
}

export class ErroIA extends Error {
  constructor(mensagem: string, public recuperavel = false) {
    super(mensagem);
  }
}

export async function extrairComLLM(texto: string, contexto: { titulo: string; tipoDocumento?: string; hoje: string }, opcoes: OpcoesLLM): Promise<{ saida: SaidaExtracao; modelo: string }> {
  const modelo = opcoes.modelo ?? 'claude-opus-5-5';
  const cliente = opcoes.cliente ?? new Anthropic({ apiKey: opcoes.apiKey, timeout: opcoes.timeoutMs ?? 300_000, maxRetries: 2 });
  try {
    const resposta = await cliente.beta.messages.parse({
      model: modelo,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: opcoes.esforco ?? 'high', format: betaZodOutputFormat(SaidaExtracaoSchema) },
      system: SISTEMA,
      messages: [
        {
          role: 'user',
          content: `Data de referência (hoje): ${contexto.hoje}\nTítulo: ${contexto.titulo}\nTipo de documento declarado: ${contexto.tipoDocumento ?? 'não informado'}\n\n<documento>\n${texto}\n</documento>`,
        },
      ],
    });
    if (resposta.stop_reason === 'refusal') throw new ErroIA('O modelo recusou a solicitação para este documento.');
    if (resposta.stop_reason === 'max_tokens') throw new ErroIA('Resposta truncada (limite de tokens): divida o documento em partes menores.', true);
    if (!resposta.parsed_output) throw new ErroIA('Saída do modelo não pôde ser validada contra o esquema.', true);
    return { saida: resposta.parsed_output, modelo: resposta.model };
  } catch (e) {
    if (e instanceof ErroIA) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ErroIA('Chave da API de IA inválida (ANTHROPIC_API_KEY).');
    if (e instanceof Anthropic.RateLimitError) throw new ErroIA('Limite de requisições da API de IA atingido; tente novamente mais tarde.', true);
    if (e instanceof Anthropic.BadRequestError) throw new ErroIA(`Requisição inválida à API de IA: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new ErroIA(`Erro da API de IA (${e.status}): ${e.message}`, true);
    throw new ErroIA(`Falha ao chamar a API de IA: ${(e as Error).message}`, true);
  }
}

/** Resumo executivo de um empreendimento a partir de fatos já estruturados (com ids de evidência). */
export const SaidaResumoSchema = z.object({
  paragrafos: z.array(z.object({ texto: z.string(), evidencias: z.array(z.string()) })),
  acaoRecomendada: z.object({ texto: z.string(), evidencias: z.array(z.string()) }),
  ressalvas: z.array(z.string()),
});
export type SaidaResumo = z.infer<typeof SaidaResumoSchema>;

const SISTEMA_RESUMO = `Você redige resumos executivos para a diretoria comercial de uma construtora de LT/SE.
Receberá FATOS estruturados de um empreendimento, cada um com identificador de evidência entre colchetes, e ESTIMATIVAS calculadas pela plataforma (marcadas como estimativas).
Regras: use apenas os fatos fornecidos; cite em "evidencias" os identificadores que sustentam cada parágrafo; nunca apresente estimativas como fatos confirmados (diga "estimado"/"previsto pela plataforma"); não invente números, nomes ou datas; registre em "ressalvas" incertezas, divergências e dados ausentes. Máximo de 4 parágrafos curtos, em português.`;

export async function resumirComLLM(fatos: string, opcoes: OpcoesLLM): Promise<{ saida: SaidaResumo; modelo: string }> {
  const modelo = opcoes.modelo ?? 'claude-opus-5-5';
  const cliente = opcoes.cliente ?? new Anthropic({ apiKey: opcoes.apiKey, timeout: opcoes.timeoutMs ?? 120_000, maxRetries: 2 });
  try {
    const resposta = await cliente.beta.messages.parse({
      model: modelo,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: opcoes.esforco ?? 'medium', format: betaZodOutputFormat(SaidaResumoSchema) },
      system: SISTEMA_RESUMO,
      messages: [{ role: 'user', content: fatos }],
    });
    if (resposta.stop_reason === 'refusal') throw new ErroIA('O modelo recusou a solicitação.');
    if (!resposta.parsed_output) throw new ErroIA('Saída do modelo não pôde ser validada contra o esquema.', true);
    return { saida: resposta.parsed_output, modelo: resposta.model };
  } catch (e) {
    if (e instanceof ErroIA) throw e;
    if (e instanceof Anthropic.APIError) throw new ErroIA(`Erro da API de IA (${e.status}): ${e.message}`, true);
    throw new ErroIA(`Falha ao chamar a API de IA: ${(e as Error).message}`, true);
  }
}
