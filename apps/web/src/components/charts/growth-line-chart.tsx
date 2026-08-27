'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GrowthPoint } from '@tm/shared';

export default function GrowthLineChart({ data }: { data: GrowthPoint[] }): React.JSX.Element {
  const chartData = data.map((d) => ({ date: d.date.slice(5), 新增: d.newWords, 累计: d.total }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="新增" stroke="#8b5cf6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="累计" stroke="#6d28d9" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
