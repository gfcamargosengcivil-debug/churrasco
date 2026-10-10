/**
 * Gráficos (Recharts) seguindo as especificações de marca da plataforma: barras ≤ 24px com
 * ponta arredondada, linhas de 2px, grade em linha fina sólida, um único eixo, cores por papel
 * (variáveis CSS), tooltip com valor em destaque. Textos usam tokens de texto, nunca a cor da série.
 */
import type { ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList,
} from 'recharts';
import { compactoEixo } from '../lib/formatos';

interface PontoBarra {
  rotulo: string;
  valor: number;
  detalhe?: string;
  destaque?: boolean;
  cor?: string;
}

function CaixaTooltip({ titulo, linhas }: { titulo: ReactNode; linhas: { cor?: string; valor: ReactNode; rotulo: ReactNode }[] }) {
  return (
    <div className="tooltip-grafico">
      <div style={{ marginBottom: 4, color: 'var(--texto-2)' }}>{titulo}</div>
      {linhas.map((l, i) => (
        <div key={i}>
          {l.cor && <span className="k" style={{ background: l.cor }} />}
          <span className="v">{l.valor}</span> <span className="muted">{l.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

/** Barras horizontais de uma série (magnitude por categoria). */
export function BarrasHorizontais({
  dados, formatar = (v) => v.toLocaleString('pt-BR'), altura, rotuloValor, cor = 'var(--serie-1)', aoClicar,
}: {
  dados: PontoBarra[];
  formatar?: (v: number) => string;
  altura?: number;
  rotuloValor?: string;
  cor?: string;
  aoClicar?: (p: PontoBarra) => void;
}) {
  const h = altura ?? Math.max(120, dados.length * 30 + 20);
  return (
    <div style={{ width: '100%', height: h }}>
      <ResponsiveContainer>
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--grade)" />
          <XAxis type="number" tickFormatter={(v) => formatar(v)} stroke="var(--eixo)" tickLine={false} fontSize={11} allowDecimals={false} />
          <YAxis type="category" dataKey="rotulo" width={170} stroke="var(--eixo)" tickLine={false} fontSize={11.5} interval={0} />
          <Tooltip
            cursor={{ fill: 'var(--superficie-2)' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <CaixaTooltip titulo={(payload[0].payload as PontoBarra).rotulo} linhas={[{ cor, valor: formatar(payload[0].value as number), rotulo: rotuloValor ?? '' }, ...((payload[0].payload as PontoBarra).detalhe ? [{ valor: (payload[0].payload as PontoBarra).detalhe, rotulo: '' }] : [])]} />
              ) : null
            }
          />
          <Bar dataKey="valor" maxBarSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false} onClick={aoClicar ? (d) => aoClicar(d as unknown as PontoBarra) : undefined} cursor={aoClicar ? 'pointer' : undefined}>
            {dados.map((d, i) => <Cell key={i} fill={d.cor ?? cor} />)}
            <LabelList dataKey="valor" position="right" formatter={(v: number) => formatar(v)} style={{ fill: 'var(--texto-2)', fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Colunas por período (uma série; meses de concentração em destaque, demais em neutro). */
export function Colunas({
  dados, formatar = (v) => v.toLocaleString('pt-BR'), rotuloValor, altura = 240, enfatizar,
}: {
  dados: PontoBarra[];
  formatar?: (v: number) => string;
  rotuloValor: string;
  altura?: number;
  enfatizar?: boolean;
}) {
  return (
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer>
        <BarChart data={dados} margin={{ top: 16, right: 8, bottom: 4, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--grade)" />
          <XAxis dataKey="rotulo" stroke="var(--eixo)" tickLine={false} fontSize={11} interval="preserveStartEnd" minTickGap={12} />
          <YAxis stroke="var(--eixo)" tickLine={false} fontSize={11} width={56} tickFormatter={(v) => formatar(v)} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'var(--superficie-2)' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <CaixaTooltip
                  titulo={(payload[0].payload as PontoBarra).rotulo}
                  linhas={[
                    { cor: 'var(--serie-1)', valor: formatar(payload[0].value as number), rotulo: rotuloValor },
                    ...((payload[0].payload as PontoBarra).detalhe ? [{ valor: (payload[0].payload as PontoBarra).detalhe, rotulo: '' }] : []),
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="valor" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {dados.map((d, i) => <Cell key={i} fill={!enfatizar || d.destaque ? 'var(--serie-1)' : 'var(--neutro-serie)'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Linha de uma série ao longo do tempo (crosshair + tooltip). */
export function LinhaTempo({ dados, rotuloValor, altura = 220, formatar = (v) => v.toLocaleString('pt-BR') }: { dados: { rotulo: string; valor: number; detalhe?: string }[]; rotuloValor: string; altura?: number; formatar?: (v: number) => string }) {
  const ultimo = dados.at(-1);
  return (
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer>
        <LineChart data={dados} margin={{ top: 16, right: 40, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grade)" />
          <XAxis dataKey="rotulo" stroke="var(--eixo)" tickLine={false} fontSize={11} interval="preserveStartEnd" minTickGap={16} />
          <YAxis stroke="var(--eixo)" tickLine={false} fontSize={11} width={44} tickFormatter={(v) => compactoEixo(v)} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: 'var(--texto-3)', strokeWidth: 1 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <CaixaTooltip titulo={label} linhas={[{ cor: 'var(--serie-1)', valor: formatar(payload[0].value as number), rotulo: rotuloValor }, ...((payload[0].payload as { detalhe?: string }).detalhe ? [{ valor: (payload[0].payload as { detalhe?: string }).detalhe, rotulo: '' }] : [])]} />
              ) : null
            }
          />
          <Line type="monotone" dataKey="valor" stroke="var(--serie-1)" strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: 'var(--superficie)', strokeWidth: 2 }} isAnimationActive={false}>
            <LabelList dataKey="valor" content={({ x, y, index }) => (index === dados.length - 1 && ultimo ? <text x={Number(x) + 6} y={Number(y) + 4} fontSize={12} fill="var(--texto)" fontWeight={600}>{formatar(ultimo.valor)}</text> : null)} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
