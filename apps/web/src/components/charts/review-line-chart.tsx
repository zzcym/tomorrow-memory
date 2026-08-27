'use client';

import {
  Bar,
  CartesianGrid,
  Legend,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReviewEfficiencyPoint } from '@tm/shared';

export default function ReviewLineChart({ data }: { data: ReviewEfficiencyPoint[] }): React.JSX.Element {
  const chartData = data.map((d) => ({ date: d.date.slice(5), 复习量: d.reviewCount }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="复习量" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
