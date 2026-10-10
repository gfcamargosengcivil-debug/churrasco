import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { diferencaDias, hojeISO, mesChave, somarMeses, type Cenario, type ItemLinhaDoTempo } from '@radar/core';
import { AvisoDemo, Carregando, Cartao, Erro } from '../componentes/base';
import { BarraFiltros } from '../componentes/filtros';
import { Colunas } from '../componentes/graficos';
import { useApi } from '../lib/api';
import { aplicarFiltros, useFiltros } from '../lib/filtros';
import { brl, dataBR, mesBR } from '../lib/formatos';
import type { Resumo } from '../lib/tipos';

interface RespostaDemanda {
  cenario: Cenario;
  porMes: ({ mes: string; central: number; ids: string[]; rfq: number; assinaturaContrato: number; mobilizacao: number; energizacao: number })[];
  linhaDoTempo: ItemLinhaDoTempo[];
  concentracao: string[];
}

type Metrica = 'rfq' | 'assinaturaContrato' | 'mobilizacao' | 'energizacao' | 'central';
const ROTULO_METRICA: Record<Metrica, string> = {
  rfq: 'RFQ/RFP previstas',
  assinaturaContrato: 'Contratos de execução previstos',
  mobilizacao: 'Mobilizações previstas',
  energizacao: 'Conclusões/energizações previstas',
  central: 'Potencial (R$) com RFQ no mês',
};

export function PaginaPrevisao() {
  const [cenario, setCenario] = useState<Cenario>('base');
  const [metrica, setMetrica] = useState<Metrica>('rfq');
  const { dados, erro, recarregar } = useApi<RespostaDemanda>(`/demanda?cenario=${cenario}&meses=36`);
  const { dados: lista } = useApi<Resumo[]>('/empreendimentos');
  const { filtros } = useFiltros();
  const filtrados = useMemo(() => aplicarFiltros(lista ?? [], filtros), [lista, filtros]);
  const ids = useMemo(() => new Set(filtrados.map((v) => v.id)), [filtrados]);
  if (erro) return <Erro mensagem={erro} tentar={recarregar} />;
  if (!dados || !lista) return <Carregando />;

  const linha = dados.linhaDoTempo.filter((l) => ids.has(l.id));
  // Recalcula a série mensal sobre o subconjunto filtrado.
  const meses = dados.porMes.map((m) => m.mes);
  const serie = meses.map((mes) => {
    const daMetrica = (ev: keyof ItemLinhaDoTempo['eventos']) => linha.filter((l) => l.eventos[ev] && l.eventos[ev]!.natureza !== 'realizado' && mesChave(l.eventos[ev]!.data) === mes);
    const rfqs = daMetrica('rfq');
    const valor = metrica === 'central' ? rfqs.reduce((s, l) => s + (l.central ?? 0), 0) : daMetrica(metrica).length;
    return { mes, valor, rfqs };
  });
  const comValor = serie.filter((s) => s.valor > 0);
  const media = comValor.length ? comValor.reduce((s, x) => s + x.valor, 0) / comValor.length : 0;
  const concentrados = new Set(serie.filter((s) => s.valor >= media * 1.5 && (metrica === 'central' || s.valor >= 2)).map((s) => s.mes));

  const hoje = hojeISO();
  const ini = somarMeses(hoje, -6);
  const fim = somarMeses(hoje, 48);
  const total = diferencaDias(ini, fim);
  const x = (d: string) => Math.min(100, Math.max(0, (diferencaDias(ini, d) / total) * 100));
  const marcas = Array.from({ length: 10 }, (_, i) => somarMeses(ini, i * 6));

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Previsão de demanda</h1>
          <p>Calendário de contratações, mobilizações e conclusões previstas. Datas calculadas a partir de marcos e premissas explícitas — não são compromissos divulgados pelos empreendedores.</p>
        </div>
        <div className="acoes">
          <div className="abas" role="radiogroup" aria-label="Cenário">
            {(['otimista', 'base', 'conservador'] as Cenario[]).map((c) => (
              <button key={c} className={`aba ${c === cenario ? 'ativa' : ''}`} onClick={() => setCenario(c)} role="radio" aria-checked={c === cenario}>{c[0].toUpperCase() + c.slice(1)}</button>
            ))}
          </div>
        </div>
      </div>
      <AvisoDemo quantidade={filtrados.filter((v) => v.demo).length} />
      <BarraFiltros lista={lista} compacta />
      <Cartao
        titulo={`${ROTULO_METRICA[metrica]} por mês — cenário ${cenario}`}
        sub={concentrados.size ? `Concentração (≥ 1,5× a média dos meses com demanda): ${[...concentrados].map((m) => mesBR(`${m}-01`)).join(', ')}` : 'Sem concentração relevante no período'}
        acoes={
          <select className="entrada" style={{ width: 'auto' }} value={metrica} onChange={(e) => setMetrica(e.target.value as Metrica)}>
            {(Object.keys(ROTULO_METRICA) as Metrica[]).map((m) => <option key={m} value={m}>{ROTULO_METRICA[m]}</option>)}
          </select>
        }
      >
        <Colunas
          dados={serie.map((s) => ({ rotulo: mesBR(`${s.mes}-01`), valor: s.valor, destaque: concentrados.has(s.mes), detalhe: s.rfqs.length ? s.rfqs.slice(0, 4).map((l) => l.nome.replace('[DEMO] ', '')).join('; ') + (s.rfqs.length > 4 ? '…' : '') : undefined }))}
          rotuloValor={metrica === 'central' ? 'potencial central' : 'empreendimentos'}
          formatar={metrica === 'central' ? (v) => brl(v) : undefined}
          enfatizar
        />
        <div className="legenda" style={{ marginTop: 6 }}>
          <span className="chave"><i className="amostra" style={{ background: 'var(--serie-1)', borderRadius: 2 }} />Mês de concentração</span>
          <span className="chave"><i className="amostra" style={{ background: 'var(--neutro-serie)', borderRadius: 2 }} />Demais meses</span>
        </div>
      </Cartao>

      <Cartao titulo={`Linha do tempo — cenário ${cenario}`} sub="Barra superior: RFQ → contrato de execução · barra inferior: mobilização → energização · hachurado: janela vencida sem evidência · linha vermelha: hoje">
        <div className="legenda" style={{ marginBottom: 8 }}>
          <span className="chave"><i className="amostra" style={{ background: 'var(--serie-1)', borderRadius: 2 }} />Contratação (RFQ → contrato)</span>
          <span className="chave"><i className="amostra" style={{ background: 'var(--serie-2)', borderRadius: 2 }} />Execução (mobilização → energização)</span>
        </div>
        <div className="gantt-escala">
          <div />
          <div className="marcas">{marcas.map((m) => <span key={m} style={{ left: `${x(m)}%` }}>{mesBR(m)}</span>)}</div>
        </div>
        <div className="gantt">
          {linha.map((l) => {
            const e = l.eventos;
            const rfq = e.rfq?.data ?? e.assinaturaContrato?.data;
            const ctr = e.assinaturaContrato?.data ?? rfq;
            const mob = e.mobilizacao?.data;
            const ene = e.energizacao?.data;
            return (
              <div className="gantt-linha" key={l.id}>
                <div className="gantt-nome" title={l.nome}><Link to={`/empreendimentos/${l.id}`}>{l.nome.replace('[DEMO] ', '')}</Link></div>
                <div className="gantt-trilho">
                  <div className="gantt-hoje" style={{ left: `${x(hoje)}%` }} />
                  {rfq && ctr && (
                    <div
                      className={`gantt-barra contratacao ${e.rfq?.vencida ? 'vencida' : ''}`}
                      style={{ left: `${x(rfq)}%`, width: `max(4px, ${x(ctr) - x(rfq)}%)` }}
                      title={`RFQ ${dataBR(rfq)} (${e.rfq?.natureza ?? '—'}) → contrato ${dataBR(ctr)} · potencial ${brl(l.central)}`}
                    />
                  )}
                  {mob && ene && <div className="gantt-barra execucao" style={{ left: `${x(mob)}%`, width: `max(4px, ${x(ene) - x(mob)}%)` }} title={`Mobilização ${dataBR(mob)} → energização ${dataBR(ene)}`} />}
                </div>
              </div>
            );
          })}
          {!linha.length && <div className="vazio">Nenhum empreendimento com os filtros atuais.</div>}
        </div>
      </Cartao>
    </>
  );
}
