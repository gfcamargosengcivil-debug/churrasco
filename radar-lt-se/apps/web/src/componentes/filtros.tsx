import { ETAPAS_PADRAO, REGIOES, ROTULO_REGIAO, ROTULO_SETOR, SETORES, UFS } from '@radar/core';
import { useMemo } from 'react';
import { FILTROS_PADRAO, useFiltros, type Filtros } from '../lib/filtros';
import type { Resumo } from '../lib/tipos';

/** Barra única de filtros, acima do conteúdo que ela delimita (radar, mapa, funil, previsão). */
export function BarraFiltros({ lista, compacta }: { lista: Resumo[]; compacta?: boolean }) {
  const { filtros, setFiltros, limpar } = useFiltros();
  const clientes = useMemo(
    () => [...new Map(lista.filter((v) => v.contratanteId).map((v) => [v.contratanteId!, v.contratante ?? v.contratanteId!])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [lista],
  );
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros({ ...filtros, [k]: v });
  const ativos = (Object.keys(FILTROS_PADRAO) as (keyof Filtros)[]).filter((k) => filtros[k] !== FILTROS_PADRAO[k]).length;
  return (
    <div className="filtros" role="search">
      <label className="campo largo">
        <span>Buscar</span>
        <input className="entrada" value={filtros.busca} onChange={(e) => set('busca', e.target.value)} placeholder="Nome, código, cliente, município" />
      </label>
      <label className="campo">
        <span>Janela de contratação</span>
        <select className="entrada" value={filtros.janela} onChange={(e) => set('janela', e.target.value as Filtros['janela'])}>
          <option value="">Todas</option>
          <option value="cotacao">Cotação em andamento</option>
          <option value="3">Até 3 meses</option>
          <option value="6">Até 6 meses</option>
          <option value="12">Até 12 meses</option>
          <option value="24">Até 24 meses</option>
          <option value="verificar">Verificar (janela vencida)</option>
          <option value="indefinida">Indefinida</option>
        </select>
      </label>
      <label className="campo">
        <span>Tensão mínima</span>
        <select className="entrada" value={filtros.tensaoMin} onChange={(e) => set('tensaoMin', e.target.value)}>
          <option value="">Qualquer</option>
          {[138, 230, 345, 440, 500, 600].map((t) => <option key={t} value={t}>≥ {t} kV</option>)}
        </select>
      </label>
      <label className="campo">
        <span>Região</span>
        <select className="entrada" value={filtros.regiao} onChange={(e) => set('regiao', e.target.value as Filtros['regiao'])}>
          <option value="">Todas</option>
          {REGIOES.map((r) => <option key={r} value={r}>{ROTULO_REGIAO[r]}</option>)}
        </select>
      </label>
      {!compacta && (
        <label className="campo" style={{ width: 90 }}>
          <span>UF</span>
          <select className="entrada" value={filtros.uf} onChange={(e) => set('uf', e.target.value as Filtros['uf'])}>
            <option value="">—</option>
            {UFS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </label>
      )}
      <label className="campo">
        <span>Setor</span>
        <select className="entrada" value={filtros.setor} onChange={(e) => set('setor', e.target.value as Filtros['setor'])}>
          <option value="">Todos</option>
          {SETORES.map((s) => <option key={s} value={s}>{ROTULO_SETOR[s]}</option>)}
        </select>
      </label>
      <label className="campo">
        <span>Cliente / contratante</span>
        <select className="entrada" value={filtros.cliente} onChange={(e) => set('cliente', e.target.value)}>
          <option value="">Todos</option>
          {clientes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
      </label>
      <label className="campo" style={{ width: 120 }}>
        <span>Serviço</span>
        <select className="entrada" value={filtros.servico} onChange={(e) => set('servico', e.target.value as Filtros['servico'])}>
          <option value="">LT e SE</option>
          <option value="LT">Com LT</option>
          <option value="SE">Com SE</option>
        </select>
      </label>
      {!compacta && (
        <>
          <label className="campo">
            <span>Estágio (maturidade)</span>
            <select className="entrada" value={filtros.etapa} onChange={(e) => set('etapa', e.target.value)}>
              <option value="">Todos</option>
              {ETAPAS_PADRAO.map((e) => <option key={e.id} value={e.id}>{e.ordem}. {e.nome}</option>)}
            </select>
          </label>
          <label className="campo" style={{ width: 120 }}>
            <span>Prioridade</span>
            <select className="entrada" value={filtros.prioridade} onChange={(e) => set('prioridade', e.target.value as Filtros['prioridade'])}>
              <option value="">Todas</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </label>
          <label className="campo" style={{ width: 130 }}>
            <span>Confiança mínima</span>
            <select className="entrada" value={filtros.confianca} onChange={(e) => set('confianca', e.target.value as Filtros['confianca'])}>
              <option value="">Qualquer</option>
              <option value="baixa">Baixa ou mais</option>
              <option value="media">Média ou mais</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label className="campo" style={{ width: 130 }}>
            <span>Valor mín. (R$ mi)</span>
            <input className="entrada" type="number" min={0} value={filtros.valorMinMi} onChange={(e) => set('valorMinMi', e.target.value)} />
          </label>
        </>
      )}
      <label className="campo" style={{ width: 120 }}>
        <span>Situação</span>
        <select className="entrada" value={filtros.status} onChange={(e) => set('status', e.target.value as Filtros['status'])}>
          <option value="ativos">Ativos</option>
          <option value="todos">Todos</option>
        </select>
      </label>
      <label className="campo" style={{ width: 130 }}>
        <span>Dados</span>
        <select className="entrada" value={filtros.dados} onChange={(e) => set('dados', e.target.value as Filtros['dados'])}>
          <option value="todos">Reais e demo</option>
          <option value="reais">Somente reais</option>
          <option value="demo">Somente demo</option>
        </select>
      </label>
      <label className="chk" title="Inclui empreendimentos abaixo de 138 kV">
        <input type="checkbox" checked={filtros.escopo === 'todos'} onChange={(e) => set('escopo', e.target.checked ? 'todos' : 'dentro')} />
        Incluir &lt; 138 kV
      </label>
      {ativos > 0 && <button className="botao fantasma peq" onClick={limpar}>Limpar filtros ({ativos})</button>}
    </div>
  );
}
