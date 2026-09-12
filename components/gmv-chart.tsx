'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { shortDate } from '@/lib/format';

export function GmvChart({ data }: { data: { date: string; gmv: number }[] }) {
  if (data.length < 2) {
    return (
      <div className="chart-empty">
        <p>Histórico insuficiente para um gráfico de tendência.</p>
        <small>Volta a aparecer depois de mais sincronizações em dias diferentes.</small>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--teal)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--teal)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border-soft)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-2)', fontSize: 11 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-2)', fontSize: 11 }} tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          labelFormatter={(label) => shortDate(String(label))}
          formatter={(value) => [`R$ ${Number(value).toLocaleString('pt-BR')}`, 'GMV']}
        />
        <Area type="monotone" dataKey="gmv" stroke="var(--teal)" strokeWidth={2} fill="url(#fill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
