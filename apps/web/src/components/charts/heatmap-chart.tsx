'use client';

import { ResponsiveContainer, Tooltip, Cell, Bar, BarChart, XAxis, YAxis } from 'recharts';
import type { StudyHeatmapCell } from '@tm/shared';

const DOW_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

/** 24h × 7d 学习时段热力图（按小时聚合为条形 + 颜色深浅表示次数） */
export default function HeatmapChart({ data }: { data: StudyHeatmapCell[] }): React.JSX.Element {
  // 转成 7 行 × 24 列的表格数据
  const cells: Array<{ dow: number; hour: number; count: number }> = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const found = data.find((c) => c.dow === dow && c.hour === hour);
      cells.push({ dow, hour, count: found?.count ?? 0 });
    }
  }
  const max = Math.max(1, ...cells.map((c) => c.count));

  const color = (count: number): string => {
    if (count === 0) return 'hsl(var(--muted))';
    const ratio = count / max;
    return `rgba(139, 92, 246, ${0.25 + ratio * 0.75})`;
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={cells}
          layout="vertical"
          margin={{ left: 24, right: 8 }}
        >
          <XAxis type="number" hide domain={[0, 24]} />
          <YAxis
            type="category"
            dataKey="dow"
            tickFormatter={(dow: number) => DOW_LABEL[dow] ?? ''}
            tick={{ fontSize: 11 }}
            width={20}
          />
          <Tooltip
            formatter={(value: number) => [`${value} 次`, '学习']}
            labelFormatter={(dow) => `周${DOW_LABEL[Number(dow)]}`}
          />
          <Bar dataKey="hour" shape={undefined} isAnimationActive={false}>
            {cells.map((c, i) => (
              <Cell key={i} fill={color(c.count)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-center text-xs text-muted-foreground">颜色越深 = 学习次数越多（24h 横向分布）</p>
    </div>
  );
}
