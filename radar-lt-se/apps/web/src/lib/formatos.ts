export { formatarDataBR as dataBR, formatarMesBR as mesBR } from '@radar/core';

export function brl(v?: number | null, opcoes: { compacto?: boolean } = { compacto: true }): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  if (opcoes.compacto) {
    if (Math.abs(v) >= 1e9) return `R$ ${(v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`;
    if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: v >= 1e8 ? 0 : 1 })} mi`;
    if (Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  }
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function faixaBRL(f?: [number, number] | null): string {
  if (!f) return '—';
  if (f[0] === 0 && f[1] === 0) return 'R$ 0 (contratado)';
  return `${brl(f[0])} – ${brl(f[1])}`;
}

export function num(v?: number | null, casas = 0): string {
  if (v === undefined || v === null) return '—';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

export function dataHoraBR(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function compactoEixo(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mi`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString('pt-BR');
}

export function csvDeLinhas(linhas: Record<string, unknown>[]): string {
  if (!linhas.length) return '';
  const cab = Object.keys(linhas[0]);
  const esc = (v: unknown) => {
    if (v === undefined || v === null) return '';
    const t = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + [cab.join(';'), ...linhas.map((l) => cab.map((c) => esc(l[c])).join(';'))].join('\r\n');
}

export function baixarTexto(conteudo: string, nome: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
