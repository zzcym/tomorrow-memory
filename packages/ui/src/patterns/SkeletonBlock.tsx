'use client';

/**
 * `SkeletonBlock`（UI §3.11.3；§3.1.5 / §3.5.6 / §3.6.5 / §3.7.4 的形状定稿）。
 *
 * 骨架必须与真实元素**同形同位**，所以形状表写在这里而不是让各页手搓灰板。
 * 尺寸一律走内联 style（§1.12.4：不写 Tailwind 任意值），容器 `aria-busy` + `role=status`，
 * 块自身 `aria-hidden`；`label` 的 `sr-only` 文案由宿主从 `@tm/shared` 注入（§8.2-14）。
 */
import * as React from 'react';
import { cn } from '../host.js';
import { Skeleton } from '../primitives/skeleton.js';

export type SkeletonBlockVariant =
  | 'line'
  | 'text'
  | 'result-bar'
  | 'card'
  | 'row'
  | 'list-rows'
  | 'stat-card'
  | 'flashcard'
  | 'rating-bar'
  | 'chart'
  | 'heatmap-grid';

export interface SkeletonBlockProps {
  variant?: SkeletonBlockVariant;
  rows?: number;
  label?: string;
  width?: string | number;
  height?: string | number;
  className?: string;
  testid?: string;
}

interface Block {
  width?: string | number;
  height?: string | number;
  rounded?: string;
}

const DIM = (v: string | number | undefined): string | undefined =>
  typeof v === 'number' ? `${v}px` : v;

const blockStyle = (b: Block): React.CSSProperties => ({
  width: DIM(b.width) ?? '100%',
  height: DIM(b.height) ?? '12px',
  flex: b.width === undefined ? '1 1 auto' : undefined,
});

/** §3.x 定稿形状：一个 variant = 一组真实尺寸。 */
const SHAPES: Record<SkeletonBlockVariant, (rows: number) => { blocks: Block[]; list?: boolean; grid?: 'columns' | 'cells' | 'rows7' }> = {
  line: () => ({ blocks: [{ width: '100%', height: 12 }] }),
  text: () => ({ blocks: [{ width: '100%', height: 14 }, { width: '70%', height: 14 }], list: true }),
  card: () => ({ blocks: [{ width: '100%', height: 56 }], list: false }),
  row: () => ({ blocks: [{ width: '100%', height: 56 }], list: false }),
  'result-bar': () => ({
    blocks: [
      { width: 160, height: 24, rounded: 'rounded-xs' },
      { width: 88, height: 14, rounded: 'rounded-xs' },
      { width: '100%', height: 12 },
      { width: '70%', height: 12 },
    ],
    list: true,
  }),
  'list-rows': (rows) => ({
    blocks: new Array(Math.max(1, rows)).fill(0).flatMap(() => [
      { width: 120, height: 16 },
      { width: '100%', height: 12 },
      { width: 80, height: 10 },
    ]),
    list: true,
  }),
  'stat-card': () => ({ blocks: [{ width: '100%', height: 84 }], list: false }),
  'flashcard': () => ({
    blocks: [
      { width: 200, height: 32 },
      { width: 100, height: 14 },
      { width: '100%', height: 12 },
      { width: '100%', height: 12 },
    ],
    list: true,
  }),
  'rating-bar': () => ({ blocks: new Array(4).fill(0).map(() => ({ width: '100%', height: 52 })), grid: 'cells' }),
  'chart': () => ({ blocks: [{ width: '100%', height: 160 }], list: false }),
  'heatmap-grid': (rows) => ({ blocks: new Array(Math.max(1, rows) * 7).fill(0).map(() => ({ width: 11, height: 11 })), grid: 'rows7' }),
};

const DEFAULT_ROWS: Partial<Record<SkeletonBlockVariant, number>> = {
  'list-rows': 8,
  'heatmap-grid': 13,
};

function SkeletonBlock({
  variant = 'line',
  rows,
  label,
  width,
  height,
  className,
  testid,
}: SkeletonBlockProps): React.JSX.Element {
  const shape = SHAPES[variant];
  const count = rows ?? DEFAULT_ROWS[variant] ?? 1;
  const spec = shape(count);
  const blocks = spec.blocks.map((b) => ({
    ...b,
    width: width ?? b.width,
    height: height ?? b.height,
  }));

  const cells = blocks.map((b, i) => (
    <Skeleton
      key={`${variant}-${String(i)}`}
      aria-hidden
      style={blockStyle(b)}
      className={cn(b.rounded ?? 'rounded-xs', spec.grid === 'columns' && 'shrink-0')}
    />
  ));

  const rows7: React.JSX.Element[][] = [];
  if (spec.grid === 'rows7') {
    /* §3.7.4：热力图骨架**必须**画出 7 行 × N 列的 11px 方块阵列（形状 = 真实形状）。 */
    for (let r = 0; r < cells.length; r += 7) rows7.push(cells.slice(r, r + 7));
  }

  return (
    <div
      data-testid={testid}
      role="status"
      aria-busy="true"
      className={cn('w-full', className)}
    >
      {label ? <span className="sr-only">{label}</span> : null}
      <div aria-hidden="true" className={cn('flex w-full', spec.list ? 'flex-col gap-2' : 'gap-3')}>
        {spec.grid === 'cells' ? (
          <div className="grid w-full grid-cols-4 gap-2">{cells}</div>
        ) : spec.grid === 'columns' ? (
          <div className="flex w-full gap-2 overflow-hidden">{cells}</div>
        ) : spec.grid === 'rows7' ? (
          <div className="flex flex-col gap-1 overflow-hidden">
            {rows7.map((row, r) => (
              <div key={`heat-row-${String(r)}`} className="flex gap-1">
                {row}
              </div>
            ))}
          </div>
        ) : (
          cells
        )}
      </div>
    </div>
  );
}

export { SkeletonBlock };
