import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { diferencaMeses, hojeISO, type Regiao, type Setor, type UF } from '@radar/core';
import type { Resumo } from './tipos';

export interface Filtros {
  busca: string;
  tensaoMin: string;
  regiao: '' | Regiao;
  uf: '' | UF;
  setor: '' | Setor;
  cliente: string;
  servico: '' | 'LT' | 'SE';
  janela: '' | 'cotacao' | '3' | '6' | '12' | '24' | 'verificar' | 'indefinida';
  valorMinMi: string;
  etapa: string;
  confianca: '' | 'alta' | 'media' | 'baixa';
  prioridade: '' | 'alta' | 'media' | 'baixa';
  status: 'ativos' | 'todos';
  dados: 'todos' | 'reais' | 'demo';
  escopo: 'dentro' | 'todos';
}

export const FILTROS_PADRAO: Filtros = {
  busca: '', tensaoMin: '', regiao: '', uf: '', setor: '', cliente: '', servico: '', janela: '', valorMinMi: '', etapa: '',
  confianca: '', prioridade: '', status: 'ativos', dados: 'todos', escopo: 'dentro',
};

const ORDEM_CONF = { muito_baixa: 0, baixa: 1, media: 2, alta: 3 } as const;

export function aplicarFiltros(lista: Resumo[], f: Filtros, hoje = hojeISO()): Resumo[] {
  const busca = f.busca.trim().toLowerCase();
  return lista.filter((v) => {
    if (f.status === 'ativos' && ['cancelado', 'concluido'].includes(v.statusGeral)) return false;
    if (f.dados === 'reais' && v.demo) return false;
    if (f.dados === 'demo' && !v.demo) return false;
    if (f.escopo === 'dentro' && v.score.foraDoEscopo) return false;
    if (busca && !`${v.nome} ${v.codigo} ${v.contratante ?? ''} ${v.municipios.join(' ')}`.toLowerCase().includes(busca)) return false;
    if (f.tensaoMin && (v.tensaoMaxKv ?? 0) < Number(f.tensaoMin)) return false;
    if (f.regiao && !v.regioes.includes(f.regiao)) return false;
    if (f.uf && !v.ufs.includes(f.uf)) return false;
    if (f.setor && v.setor !== f.setor) return false;
    if (f.cliente && v.contratanteId !== f.cliente) return false;
    if (f.servico === 'LT' && v.fase.LT === 'nao_aplicavel') return false;
    if (f.servico === 'SE' && v.fase.SE === 'nao_aplicavel') return false;
    if (f.etapa && v.etapa?.id !== f.etapa) return false;
    if (f.prioridade && v.score.faixa !== f.prioridade) return false;
    if (f.confianca && ORDEM_CONF[v.previsao.confianca] < ORDEM_CONF[f.confianca]) return false;
    if (f.valorMinMi && (v.mercado.central ?? 0) < Number(f.valorMinMi) * 1e6) return false;
    if (f.janela) {
      const n = v.previsao.necessidade;
      const emCotacao = n.classe === 'imediata' && n.mesesAteDemanda === 0 && n.descricao.includes('cotação');
      if (f.janela === 'cotacao' && !emCotacao) return false;
      if (f.janela === 'verificar' && n.classe !== 'verificar') return false;
      if (f.janela === 'indefinida' && n.classe !== 'indefinida') return false;
      if (['3', '6', '12', '24'].includes(f.janela)) {
        if (!emCotacao) {
          const d = v.dataDemandaBase;
          if (!d || d < hoje || diferencaMeses(hoje, d) > Number(f.janela)) return false;
        }
      }
    }
    return true;
  });
}

const Ctx = createContext<{ filtros: Filtros; setFiltros: (f: Filtros) => void; limpar: () => void }>({
  filtros: FILTROS_PADRAO,
  setFiltros: () => undefined,
  limpar: () => undefined,
});
export const useFiltros = () => useContext(Ctx);

const CHAVE = 'radar.filtros.v1';

export function ProvedorFiltros({ children }: { children: ReactNode }) {
  const [filtros, setFiltros] = useState<Filtros>(() => {
    try {
      const salvo = localStorage.getItem(CHAVE);
      return salvo ? { ...FILTROS_PADRAO, ...JSON.parse(salvo) } : FILTROS_PADRAO;
    } catch {
      return FILTROS_PADRAO;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(filtros));
    } catch {
      /* armazenamento indisponível: filtros apenas na sessão */
    }
  }, [filtros]);
  return <Ctx.Provider value={{ filtros, setFiltros, limpar: () => setFiltros(FILTROS_PADRAO) }}>{children}</Ctx.Provider>;
}
