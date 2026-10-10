import { EmpreendimentoSchema, type Empreendimento, type EmpreendimentoEntrada, type Evidencia, type Fonte, type Marco } from '../src/index.js';

let seq = 0;
export function projeto(dados: Partial<EmpreendimentoEntrada> = {}): Empreendimento {
  seq++;
  return EmpreendimentoSchema.parse({
    id: `p${seq}`,
    codigo: `RLT-${String(seq).padStart(6, '0')}`,
    nomeOficial: `LT 500 kV Alfa – Beta ${seq}`,
    tipo: 'LT+SE',
    setorOrigem: 'transmissao',
    fluxoId: 'transmissao_leilao',
    identificadoEm: '2025-01-10',
    criadoEm: '2025-01-10T00:00:00Z',
    atualizadoEm: '2025-01-10T00:00:00Z',
    ...dados,
  });
}

export function evidencia(id: string, dados: Partial<Evidencia> = {}): Evidencia {
  return { id, fonteId: 'aneel', titulo: `Doc ${id}`, tipoDocumento: 'ato_regulatorio', dataColeta: '2026-09-01', classe: 'A', ...dados };
}

export function marco(tipo: Marco['tipo'], data: string, natureza: Marco['natureza'] = 'realizado', extra: Partial<Marco> = {}): Marco {
  return { id: `m-${tipo}-${data}-${natureza}`, tipo, data, natureza, escopo: 'geral', evidenciaIds: [], ...extra };
}

export function fonte(dados: Partial<Fonte> = {}): Fonte {
  return {
    id: 'aneel',
    nome: 'ANEEL',
    orgao: 'ANEEL',
    categoria: 'regulador',
    classe: 'A',
    metodoAcesso: 'manual',
    frequencia: 'manual',
    statusIntegracao: 'importacao_manual',
    adaptador: 'manual',
    config: {},
    credenciais: [],
    limitacoes: [],
    ativo: true,
    ...dados,
  };
}
