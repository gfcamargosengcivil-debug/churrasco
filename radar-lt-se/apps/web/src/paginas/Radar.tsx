import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createColumnHelper, flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type SortingState,
} from '@tanstack/react-table';
import { ROTULO_FASE_CONTRATACAO, ROTULO_NATUREZA_DATA, ROTULO_NECESSIDADE, ROTULO_NIVEL_CONFIANCA, ROTULO_SETOR } from '@radar/core';
import { AvisoDemo, BarraJanela, Carregando, Erro, SeloConfianca, SeloDemo, SeloFase, SeloNecessidade, SeloPrioridade, SeloStatusGeral } from '../componentes/base';
import { BarraFiltros } from '../componentes/filtros';
import { api, useApi } from '../lib/api';
import { aplicarFiltros, useFiltros } from '../lib/filtros';
import { baixarTexto, brl, csvDeLinhas, dataBR, faixaBRL } from '../lib/formatos';
import type { Resumo } from '../lib/tipos';

const col = createColumnHelper<Resumo>();

export function PaginaRadar() {
  const { dados, erro, recarregar } = useApi<Resumo[]>('/empreendimentos');
  const { filtros } = useFiltros();
  const [ordem, setOrdem] = useState<SortingState>([{ id: 'prioridade', desc: true }]);
  const lista = useMemo(() => aplicarFiltros(dados ?? [], filtros), [dados, filtros]);

  const colunas = useMemo(
    () => [
      col.accessor((v) => v.score.indice, {
        id: 'prioridade',
        header: 'Prioridade',
        cell: (c) => <SeloPrioridade faixa={c.row.original.score.faixa} indice={c.row.original.score.indice} />,
      }),
      col.accessor((v) => v.contratante ?? '', { id: 'cliente', header: 'Cliente', cell: (c) => c.getValue() || <span className="muted">não identificado</span> }),
      col.accessor('nome', {
        header: 'Empreendimento',
        cell: (c) => (
          <div className="nome">
            <Link to={`/empreendimentos/${c.row.original.id}`}>{c.getValue()}</Link>
            <div className="flex" style={{ marginTop: 3 }}>
              <span className="muted pequeno">{c.row.original.codigo} · {ROTULO_SETOR[c.row.original.setor]}</span>
              {c.row.original.demo && <SeloDemo />}
              <SeloStatusGeral status={c.row.original.statusGeral} />
              {c.row.original.score.foraDoEscopo && <span className="selo">&lt; 138 kV</span>}
            </div>
          </div>
        ),
      }),
      col.accessor((v) => v.ufs.join('/'), { id: 'uf', header: 'UF' }),
      col.accessor((v) => v.tensaoMaxKv ?? 0, { id: 'kv', header: 'Tensão (kV)', cell: (c) => c.row.original.tensaoMaxKv ?? '—', meta: { num: true } }),
      col.accessor((v) => v.etapa?.ordem ?? 0, { id: 'estagio', header: 'Estágio', cell: (c) => (c.row.original.etapa ? `${c.row.original.etapa.ordem}. ${c.row.original.etapa.nome}` : '—') }),
      col.accessor((v) => v.fase.geral, { id: 'fase', header: 'Fase de contratação', cell: (c) => <SeloFase fase={c.row.original.fase.geral} /> }),
      col.accessor((v) => v.previsao.janelas.rfq?.base ?? '9999', {
        id: 'janela',
        header: 'Janela RFQ/RFP',
        cell: (c) => {
          const j = c.row.original.previsao.janelas.rfq;
          return (
            <div style={{ minWidth: 170 }}>
              <BarraJanela inicio={j?.inicio} base={j?.base} fim={j?.fim} />
              <div style={{ marginTop: 3 }}><SeloNecessidade classe={c.row.original.previsao.necessidade.classe} /></div>
            </div>
          );
        },
      }),
      col.accessor((v) => v.previsao.base.inicioObras?.data ?? '9999', { id: 'inicio', header: 'Início obras (base)', cell: (c) => dataBR(c.row.original.previsao.base.inicioObras?.data) }),
      col.accessor((v) => v.previsao.base.energizacao?.data ?? '9999', { id: 'conclusao', header: 'Conclusão (base)', cell: (c) => dataBR(c.row.original.previsao.base.energizacao?.data) }),
      col.accessor((v) => v.mercado.central ?? -1, {
        id: 'potencial',
        header: 'Potencial (serviços)',
        cell: (c) => (
          <div className="direita" title={faixaBRL(c.row.original.mercado.faixa)}>
            {c.row.original.mercado.metodo === 'nao_estimavel' ? <span className="muted">não estimável</span> : brl(c.row.original.mercado.central)}
          </div>
        ),
        meta: { num: true },
      }),
      col.accessor((v) => ({ muito_baixa: 0, baixa: 1, media: 2, alta: 3 })[v.previsao.confianca], { id: 'confianca', header: 'Confiança', cell: (c) => <SeloConfianca nivel={c.row.original.previsao.confianca} /> }),
      col.accessor('ultimaAtualizacao', { header: 'Atualização', cell: (c) => dataBR(c.getValue().slice(0, 10)) }),
    ],
    [],
  );

  const tabela = useReactTable({
    data: lista,
    columns: colunas,
    state: { sorting: ordem },
    onSortingChange: setOrdem,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  const exportarCSV = () => {
    baixarTexto(
      csvDeLinhas(
        tabela.getSortedRowModel().rows.map(({ original: v }) => ({
          codigo: v.codigo, empreendimento: v.nome, cliente: v.contratante ?? '', uf: v.ufs.join('/'), tensao_kv: v.tensaoMaxKv, estagio: v.etapa?.nome,
          fase_contratacao: ROTULO_FASE_CONTRATACAO[v.fase.geral], rfq_base: v.previsao.janelas.rfq?.base, rfq_inicio: v.previsao.janelas.rfq?.inicio, rfq_fim: v.previsao.janelas.rfq?.fim,
          natureza_rfq: v.previsao.base.rfq ? ROTULO_NATUREZA_DATA[v.previsao.base.rfq.natureza] : '', necessidade: ROTULO_NECESSIDADE[v.previsao.necessidade.classe],
          inicio_obras_base: v.previsao.base.inicioObras?.data, conclusao_base: v.previsao.base.energizacao?.data, potencial_min: v.mercado.faixa?.[0], potencial_max: v.mercado.faixa?.[1],
          potencial_central: v.mercado.central, metodo_potencial: v.mercado.metodo, indice_prioridade: v.score.indice, prioridade: v.score.faixa,
          confianca_previsao: ROTULO_NIVEL_CONFIANCA[v.previsao.confianca], atualizacao: v.ultimaAtualizacao.slice(0, 10), demo: v.demo ? 'SIM' : '',
        })),
      ),
      `radar-filtrado-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;
  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Radar de oportunidades</h1>
          <p>Todos os empreendimentos com janelas de contratação (barra = otimista→conservador; marca = cenário base; traço = hoje), potencial de serviços e confiança. Clique no nome para abrir a ficha.</p>
        </div>
        <div className="acoes">
          <button className="botao" onClick={exportarCSV}>Exportar CSV (filtrado)</button>
          <button className="botao" onClick={() => void api.baixar('/export/radar.xlsx', `radar-lt-se-${new Date().toISOString().slice(0, 10)}.xlsx`)}>Exportar Excel (completo)</button>
        </div>
      </div>
      <AvisoDemo quantidade={lista.filter((v) => v.demo).length} />
      <BarraFiltros lista={dados} />
      <div className="sub">{lista.length} de {dados.length} empreendimentos · potencial central somado {brl(lista.reduce((s, v) => s + (v.mercado.central ?? 0), 0))}</div>
      <div className="tabela-wrap">
        <table className="tabela">
          <thead>
            {tabela.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => (
                  <th key={h.id} className={`ordenavel ${(h.column.columnDef.meta as { num?: boolean } | undefined)?.num ? 'num' : ''}`} onClick={h.column.getToggleSortingHandler()} aria-sort={h.column.getIsSorted() === 'asc' ? 'ascending' : h.column.getIsSorted() === 'desc' ? 'descending' : 'none'}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted() as string] ?? ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {tabela.getRowModel().rows.map((r) => (
              <tr key={r.id}>
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className={(c.column.columnDef.meta as { num?: boolean } | undefined)?.num ? 'num' : ''}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!lista.length && <div className="vazio">Nenhum empreendimento com os filtros atuais.</div>}
      </div>
      <div className="paginacao">
        <span>Página {tabela.getState().pagination.pageIndex + 1} de {Math.max(1, tabela.getPageCount())}</span>
        <button className="botao peq" disabled={!tabela.getCanPreviousPage()} onClick={() => tabela.previousPage()}>Anterior</button>
        <button className="botao peq" disabled={!tabela.getCanNextPage()} onClick={() => tabela.nextPage()}>Próxima</button>
      </div>
    </>
  );
}
