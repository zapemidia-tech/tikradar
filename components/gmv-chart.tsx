'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const data = [
  { d: '18 ago', gmv: 1.2 },
  { d: '19 ago', gmv: 1.55 },
  { d: '20 ago', gmv: 1.43 },
  { d: '21 ago', gmv: 1.86 },
  { d: '22 ago', gmv: 2.04 },
  { d: '23 ago', gmv: 2.42 },
  { d: '24 ago', gmv: 2.78 },
];

export function GmvChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#167b58" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#167b58" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#edf0ee" vertical={false} />
        <XAxis dataKey="d" axisLine={false} tickLine={false} />
        <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `R$ ${v}m`} />
        <Tooltip formatter={(v) => [`R$ ${v} mi`, 'GMV']} />
        <Area type="monotone" dataKey="gmv" stroke="#167b58" strokeWidth={2.5} fill="url(#fill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
