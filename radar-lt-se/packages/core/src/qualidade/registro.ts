import { z } from 'zod';
import {
  ESCOPOS, FASES_CONTRATACAO, NATUREZAS_MARCO, PACOTES, PAPEIS, SETORES, SITUACAO_AMBIENTAL,
  SITUACAO_ENGENHARIA, SITUACAO_FUNDIARIA, SITUACAO_REGULATORIA, SITUACOES_OBRA, STATUS_DADO,
  STATUS_GERAL, SUBSETORES, TIPOS_DOCUMENTO, TIPOS_EMPREENDIMENTO, TIPOS_MARCO, TIPOS_ORGANIZACAO, UFS,
} from '../constantes.js';
import { DataISO, IdentificadorSchema, PontoSchema, SubestacaoSchema, TrechoLTSchema } from '../tipos.js';

/**
 * Registro normalizado produzido por qualquer adaptador de fonte (API, planilha, documento, IA).
 * É a unidade de entrada da deduplicação e da mescla com o cadastro mestre.
 */
export const RegistroNormalizadoSchema = z.object({
  fonteId: z.string(),
  chaveExterna: z.string().optional(),
  nome: z.string().min(3),
  nomesAlternativos: z.array(z.string()).optional(),
  identificadores: z.array(IdentificadorSchema).optional(),
  tipo: z.enum(TIPOS_EMPREENDIMENTO).optional(),
  setorOrigem: z.enum(SETORES).optional(),
  subsetor: z.enum(SUBSETORES).optional(),
  descricao: z.string().optional(),
  organizacoes: z
    .array(z.object({ nome: z.string().min(2), cnpj: z.string().optional(), papel: z.enum(PAPEIS), tipo: z.enum(TIPOS_ORGANIZACAO).optional() }))
    .optional(),
  municipios: z.array(z.object({ nome: z.string(), uf: z.enum(UFS) })).optional(),
  ufs: z.array(z.enum(UFS)).optional(),
  ponto: PontoSchema.optional(),
  tensoesKv: z.array(z.number().positive()).optional(),
  extensaoKm: z.number().positive().optional(),
  circuitos: z.number().int().positive().optional(),
  capacidadeMva: z.number().nonnegative().optional(),
  qtdSubestacoes: z.number().int().nonnegative().optional(),
  potenciaMw: z.number().nonnegative().optional(),
  capexTotalBRL: z.number().nonnegative().optional(),
  capexInfraEletricaBRL: z.number().nonnegative().optional(),
  rapAnualBRL: z.number().nonnegative().optional(),
  /**
   * Como os valores de investimento (capex) do registro devem ser lidos: "declarado" pelo empreendedor
   * ou "estimado" por terceiro (ex.: investimento de referência da ANEEL no edital), com data-base de
   * preço. `rap` qualifica a RAP separadamente (ex.: RAP vencedora do leilão é declarada).
   */
  valoresMonetarios: z
    .object({
      natureza: z.enum(['declarado', 'estimado']),
      dataBase: DataISO.optional(),
      observacao: z.string().optional(),
      rap: z.object({ natureza: z.enum(['declarado', 'estimado']), dataBase: DataISO.optional(), observacao: z.string().optional() }).optional(),
    })
    .optional(),
  fonteFinanciamento: z.string().optional(),
  marcos: z
    .array(
      z.object({
        tipo: z.enum(TIPOS_MARCO),
        data: DataISO,
        natureza: z.enum(NATUREZAS_MARCO),
        escopo: z.enum(ESCOPOS).optional(),
        descricao: z.string().optional(),
      }),
    )
    .optional(),
  situacoes: z
    .object({
      regulatoria: z.enum(SITUACAO_REGULATORIA).optional(),
      ambiental: z.enum(SITUACAO_AMBIENTAL).optional(),
      fundiaria: z.enum(SITUACAO_FUNDIARIA).optional(),
      engenharia: z.enum(SITUACAO_ENGENHARIA).optional(),
    })
    .optional(),
  situacaoObra: z.enum(SITUACOES_OBRA).optional(),
  statusGeral: z.enum(STATUS_GERAL).optional(),
  pacotes: z
    .array(
      z.object({
        pacote: z.enum(PACOTES),
        escopo: z.enum(ESCOPOS),
        faseContratacao: z.enum(FASES_CONTRATACAO),
        contratada: z.string().optional(),
        dataEvento: DataISO.optional(),
      }),
    )
    .optional(),
  trechosLT: z.array(TrechoLTSchema.omit({ id: true, evidenciaIds: true }).partial({ corrente: true })).optional(),
  subestacoes: z.array(SubestacaoSchema.omit({ id: true, evidenciaIds: true })).optional(),
  evidencia: z.object({
    titulo: z.string().min(2),
    url: z.string().optional(),
    documentoId: z.string().optional(),
    trecho: z.string().optional(),
    pagina: z.number().int().optional(),
    tipoDocumento: z.enum(TIPOS_DOCUMENTO),
    dataPublicacao: DataISO.optional(),
    dataColeta: DataISO.optional(),
    validoAte: DataISO.optional(),
  }),
  /** Status de proveniência a aplicar. Padrão: confirmado (classe A/B) ou inferido (C/D, IA). */
  statusDado: z.enum(STATUS_DADO).optional(),
  demo: z.boolean().optional(),
});
export type RegistroNormalizado = z.infer<typeof RegistroNormalizadoSchema>;

export function resumoRegistro(r: RegistroNormalizado): string {
  const partes = [r.nome];
  if (r.tensoesKv?.length) partes.push(`${Math.max(...r.tensoesKv)} kV`);
  if (r.extensaoKm) partes.push(`${r.extensaoKm} km`);
  if (r.ufs?.length) partes.push(r.ufs.join('/'));
  const emp = r.organizacoes?.find((o) => ['empreendedor', 'concessionaria', 'proprietario'].includes(o.papel));
  if (emp) partes.push(emp.nome);
  return partes.join(' · ');
}
