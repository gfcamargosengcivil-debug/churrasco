import type { ReactNode } from 'react';
import {
  ROTULO_FASE_CONTRATACAO, ROTULO_NATUREZA_DATA, ROTULO_NECESSIDADE, ROTULO_NIVEL_CONFIANCA, ROTULO_STATUS_DADO,
  ROTULO_STATUS_GERAL, diferencaDias, hojeISO, somarMeses, type ClasseNecessidade, type FaseContratacao, type NaturezaData,
  type NivelConfianca, type StatusDado, type StatusGeral,
} from '@radar/core';
import { dataBR } from '../lib/formatos';

export function Cartao({ titulo, sub, acoes, children, className }: { titulo?: ReactNode; sub?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`cartao ${className ?? ''}`}>
      {(titulo || acoes) && (
        <div className="cartao-topo">
          <div>
            {titulo && <h2>{titulo}</h2>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {acoes && <div className="acoes">{acoes}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ rotulo, valor, complemento, titulo }: { rotulo: string; valor: ReactNode; complemento?: ReactNode; titulo?: string }) {
  return (
    <div className="cartao kpi" title={titulo}>
      <span className="rotulo">{rotulo}</span>
      <span className="valor">{valor}</span>
      {complemento && <span className="complemento">{complemento}</span>}
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando" role="status">{texto}</div>;
}

export function Erro({ mensagem, tentar }: { mensagem: string; tentar?: () => void }) {
  return (
    <div className="aviso erro" role="alert">
      <span>⚠</span>
      <div>
        {mensagem} {tentar && <button className="botao peq" onClick={tentar}>Tentar novamente</button>}
      </div>
    </div>
  );
}

export function SeloDemo() {
  return <span className="selo demo" title="Dados fictícios de demonstração">DEMO · fictício</span>;
}

const COR_PRIORIDADE = { alta: 'var(--ord-1)', media: 'var(--ord-3)', baixa: 'var(--neutro-serie)' } as const;
export function SeloPrioridade({ faixa, indice }: { faixa: 'alta' | 'media' | 'baixa'; indice?: number }) {
  const rot = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }[faixa];
  return (
    <span className="selo" title="Índice de priorização (0–100). Não é probabilidade.">
      <i className="ponto" style={{ background: COR_PRIORIDADE[faixa] }} />
      {rot}
      {indice !== undefined && <span className="tab-num" style={{ fontWeight: 500 }}>{indice}</span>}
    </span>
  );
}

const SIMBOLO_CONF: Record<NivelConfianca, string> = { alta: '●●●', media: '●●○', baixa: '●○○', muito_baixa: '○○○' };
export function SeloConfianca({ nivel, rotulo = 'Confiança' }: { nivel: NivelConfianca; rotulo?: string }) {
  return (
    <span className="selo" title={`${rotulo}: ${ROTULO_NIVEL_CONFIANCA[nivel]}`}>
      <span aria-hidden style={{ letterSpacing: 1 }}>{SIMBOLO_CONF[nivel]}</span>
      {ROTULO_NIVEL_CONFIANCA[nivel]}
    </span>
  );
}

const ICONE_NATUREZA: Record<NaturezaData, string> = { realizado: '✓', divulgado: '◆', calculado_de_marco: '≈', heuristico: '?' };
export function SeloNatureza({ natureza, vencida }: { natureza: NaturezaData; vencida?: boolean }) {
  return (
    <span className={`selo ${natureza === 'realizado' || natureza === 'divulgado' ? 'acento' : ''}`} title={ROTULO_NATUREZA_DATA[natureza]}>
      {ICONE_NATUREZA[natureza]} {ROTULO_NATUREZA_DATA[natureza]}
      {vencida && <span style={{ color: 'var(--critico-texto)' }}> · vencida</span>}
    </span>
  );
}

const ICONE_STATUS: Record<StatusDado, string> = { confirmado: '✓', estimado: '≈', inferido: '?', pendente: '…' };
export function SeloStatusDado({ status, conflito }: { status: StatusDado; conflito?: boolean }) {
  return (
    <span className="selo" title={conflito ? 'Há divergência entre fontes para este campo' : ROTULO_STATUS_DADO[status]}>
      {ICONE_STATUS[status]} {ROTULO_STATUS_DADO[status]}
      {conflito && <span style={{ color: 'var(--critico-texto)' }}>· conflito</span>}
    </span>
  );
}

const ICONE_NECESSIDADE: Partial<Record<ClasseNecessidade, string>> = { imediata: '▲', verificar: '!', ja_contratada: '✓', suspensa: '‖', encerrada: '■' };
export function SeloNecessidade({ classe }: { classe: ClasseNecessidade }) {
  const forte = classe === 'imediata' || classe === 'verificar';
  return (
    <span className={`selo ${forte ? 'acento' : ''}`} title={ROTULO_NECESSIDADE[classe]}>
      {ICONE_NECESSIDADE[classe] ?? '•'} {ROTULO_NECESSIDADE[classe].split(' (')[0]}
    </span>
  );
}

export function SeloFase({ fase }: { fase: FaseContratacao }) {
  return <span className="selo">{ROTULO_FASE_CONTRATACAO[fase]}</span>;
}

export function SeloStatusGeral({ status }: { status: StatusGeral }) {
  if (status === 'ativo') return null;
  return <span className="selo" style={{ color: 'var(--atencao-texto)' }}>‖ {ROTULO_STATUS_GERAL[status]}</span>;
}

/** Barra compacta da janela (otimista → conservador) com marca do cenário base e de hoje. */
export function BarraJanela({ inicio, base, fim }: { inicio?: string; base?: string; fim?: string }) {
  if (!base || !inicio || !fim) return <span className="muted">—</span>;
  const hoje = hojeISO();
  const ini = somarMeses(hoje, -12);
  const tot = diferencaDias(ini, somarMeses(hoje, 48));
  const pos = (d: string) => `${Math.min(100, Math.max(0, (diferencaDias(ini, d) / tot) * 100))}%`;
  return (
    <div title={`Janela ${dataBR(inicio)} a ${dataBR(fim)} · base ${dataBR(base)} (escala: −12 a +48 meses)`}>
      <div className="janela" aria-hidden>
        <div className="faixa" style={{ left: pos(inicio), width: `calc(${pos(fim)} - ${pos(inicio)} + 4px)` }} />
        <div className="hoje" style={{ left: pos(hoje) }} />
        <div className="base" style={{ left: pos(base) }} />
      </div>
      <div className="pequeno tab-num" style={{ marginTop: 3 }}>{dataBR(base)} <span className="muted">({dataBR(inicio)}–{dataBR(fim)})</span></div>
    </div>
  );
}

export function Abas<T extends string>({ abas, ativa, onChange }: { abas: { id: T; rotulo: string }[]; ativa: T; onChange: (id: T) => void }) {
  return (
    <div className="abas" role="tablist">
      {abas.map((a) => (
        <button key={a.id} role="tab" aria-selected={a.id === ativa} className={`aba ${a.id === ativa ? 'ativa' : ''}`} onClick={() => onChange(a.id)}>
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div className="modal-fundo" onClick={onFechar} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="cartao-topo">
          <h2>{titulo}</h2>
          <button className="botao fantasma" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AvisoDemo({ quantidade }: { quantidade: number }) {
  if (!quantidade) return null;
  return (
    <div className="aviso demo" role="note">
      <strong>Dados demonstrativos fictícios.</strong>
      <span>
        {quantidade} empreendimento(s) marcados como DEMO foram inventados para demonstrar a plataforma (nomes, empresas, valores e documentos). Remova-os em
        Configurações antes de usar a base em decisões reais.
      </span>
    </div>
  );
}
