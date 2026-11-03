'use client';

/**
 * `Heatmap`（UI §3.7.2 / §3.7.3 / §3.7.6；判据④；A-16 抽取；R-18 ③④ / R-27 ③）。
 *
 * 展示层从 `apps/web/src/components/charts/heatmap-chart.tsx` 抽出；**三模式 + 点选信息条**是
 * 新补能力，交互口径迁移自 `mobile-memory/assets/app.js:470-557`（只迁能力，不迁代码）。
 *
 * - 颜色：`--heat-1..4` + `--heat-empty` + `--heat-future`，全走 `tailwind-preset` 语义类。
 * - 三重编码（§1.2.1）：色阶 + L0 虚线框（形状通道）+ 文本（信息条 / `aria-label` / 浏览表格）。
 * - 格子 11px 视觉、命中区外扩 6px = §7.1 的**唯一豁免**（52×7=364 格不可能各占 44px）。
 * - 格子**不进焦点序**（§3.7.3），键盘出口 = `onBrowseToggle` 打开的同数据纯文本 `<table>`。
 * - 组件不读时钟：`today` 由宿主注入（SSR 稳定 + 可测），也不发任何请求。
 */
import * as React from 'react';
import { PROGRESS_COPY } from '@tm/shared';
import { cn } from '../host.js';
import { SkeletonBlock } from './SkeletonBlock.js';
import { Tabs, TabsList, TabsTrigger } from '../primitives/tabs.js';

export type HeatmapMode = 'daily' | 'weekly' | 'cumulative';

export interface HeatmapDayCell {
  /** `YYYY-MM-DD` */
  key: string;
  count: number;
}

export interface HeatmapProps {
  days: HeatmapDayCell[];
  today: string;
  mode: HeatmapMode;
  modeLabels?: Record<HeatmapMode, string>;
  onModeChange?: (mode: HeatmapMode) => void;
  monthsAxis?: boolean;
  weeks?: number;
  selectedKey?: string | null;
  onSelect?: (cell: { key: string; count: number; label: string }) => void;
  tip?: string | null;
  cellAriaLabel?: (key: string, count: number) => string;
  legend: { left: string; right: string; ranges?: string };
  ariaLabel: string;
  levelBreaks?: readonly [number, number, number];
  cumulativeBreaks?: readonly [number, number, number];
  cellPx?: number;
  gapPx?: number;
  hitExpandPx?: number;
  scrollClassName?: string;
  onBrowseToggle?: (open: boolean) => void;
  browseLabel?: string;
  unavailableLabel?: string;
  loading?: boolean;
  className?: string;
  testid?: string;
}

const MS_DAY = 86_400_000;
const ROWS = 7;

/** `heat-1..4` 按档序映射；L0 用虚线框（形状通道），不着色。 */
const LEVEL_CLASS = [
  'border border-dashed border-hair bg-heat-empty',
  'bg-heat-1',
  'bg-heat-2',
  'bg-heat-3',
  'bg-heat-4',
] as const;

const toMs = (key: string): number => {
  const parts = key.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
    ? Date.UTC(y, m - 1, d)
    : 0;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

const keyOf = (ms: number): string => {
  const dt = new Date(ms);
  return `${String(dt.getUTCFullYear())}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};

/** 周一 = 行 0（与 App 现实现同口径）。 */
const rowOf = (ms: number): number => (new Date(ms).getUTCDay() + 6) % ROWS;

const levelOfCount = (count: number, breaks: readonly [number, number, number]): number => {
  if (count <= 0) return 0;
  if (count <= breaks[0]) return 1;
  if (count <= breaks[1]) return 2;
  if (count <= breaks[2]) return 3;
  return 4;
};

const levelOfRatio = (ratio: number, breaks: readonly [number, number, number]): number => {
  if (ratio <= 0) return 0;
  if (ratio <= breaks[0]) return 1;
  if (ratio <= breaks[1]) return 2;
  if (ratio <= breaks[2]) return 3;
  return 4;
};

interface Cell {
  key: string;
  count: number;
  month: number;
}

function Heatmap(
  {
    days,
    today,
    mode,
    modeLabels = PROGRESS_COPY.heatmapModes,
    onModeChange,
    monthsAxis = true,
    weeks = 53,
    selectedKey,
    onSelect,
    tip,
    cellAriaLabel = (key, count) =>
      count > 0 ? PROGRESS_COPY.heatCell(key, count) : PROGRESS_COPY.heatCellEmpty(key),
    legend,
    ariaLabel,
    levelBreaks = [1, 3, 6] as const,
    cumulativeBreaks = [0.25, 0.5, 0.75] as const,
    cellPx = 11,
    gapPx = 3,
    hitExpandPx = 6,
    scrollClassName = 'heatmap-scroll',
    onBrowseToggle,
    browseLabel,
    unavailableLabel,
    loading = false,
    className,
    testid,
  }: HeatmapProps,
  ref: React.ForwardedRef<HTMLDivElement>,
): React.JSX.Element {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [browsing, setBrowsing] = React.useState(false);

  const todayMs = toMs(today);

  /* ── 1. 铺列：起点 = 今天往前推 `weeks` 周并对齐到周一 ── */
  const grid: Array<Array<Cell | null>> = React.useMemo(() => {
    const countByKey = new Map(days.map((d) => [d.key, d.count]));
    const span = Math.max(1, weeks) * ROWS;
    let start = todayMs - (span - 1) * MS_DAY;
    start -= rowOf(start) * MS_DAY;
    const columns: Array<Array<Cell | null>> = [];
    for (let ms = start; ms <= todayMs; ms += MS_DAY) {
      const key = keyOf(ms);
      const cell: Cell = {
        key,
        count: countByKey.get(key) ?? 0,
        month: new Date(ms).getUTCMonth(),
      };
      const col = Math.floor((ms - start) / MS_DAY / ROWS);
      while (columns.length <= col) columns.push(new Array(ROWS).fill(null));
      (columns[col] as Array<Cell | null>)[rowOf(ms)] = cell;
    }
    /* 未来格（本周剩余天数）不进无障碍树，但要占位。 */
    for (const column of columns) {
      for (let r = 0; r < ROWS; r += 1) {
        if (column[r] == null) column[r] = { key: '', count: -1, month: 0 };
      }
    }
    return columns;
  }, [days, todayMs, weeks]);

  /* ── 2. 三模式的取值口径 ── */
  const weekTotals = React.useMemo(
    () => grid.map((column) => column.reduce<number>((sum, c) => sum + Math.max(0, c?.count ?? 0), 0)),
    [grid],
  );
  const cumulativeFinal = React.useMemo(() => {
    let total = 0;
    for (const column of grid) {
      for (const c of column) if (c && c.count >= 0) total += c.count;
    }
    return total;
  }, [grid]);
  const runningByColumn = React.useMemo(() => {
    let acc = 0;
    return grid.map((column) => {
      acc += column.reduce<number>((sum, c) => sum + Math.max(0, c?.count ?? 0), 0);
      return acc;
    });
  }, [grid]);

  const valueAt = (column: number, cell: Cell): number =>
    mode === 'weekly' ? weekTotals[column] ?? 0 : mode === 'cumulative' ? runningByColumn[column] ?? 0 : cell.count;

  const levelAt = (column: number, cell: Cell): number => {
    const value = valueAt(column, cell);
    if (cell.count < 0) return -1;
    if (mode === 'cumulative') {
      return levelOfRatio(cumulativeFinal > 0 ? value / cumulativeFinal : 0, cumulativeBreaks);
    }
    return levelOfCount(value, levelBreaks);
  };

  /* ── 3. 默认滚到最右（App 现实现的口径：打开就看到"今天"那一列） ──
     I-08：`loading` 参与触发 —— loading 分支不挂 `scrollRef`，而 `grid.length` 在
     loading→loaded 之间不变，原 deps 首帧落不到真实容器（scrollLeft 停在 0）。 */
  React.useEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
  }, [mode, weeks, grid.length, loading]);

  if (loading) {
    return (
      <div ref={ref} data-testid={testid} className={cn('w-full', className)}>
        <SkeletonBlock variant="heatmap-grid" rows={Math.ceil(weeks / ROWS) || 8} label={PROGRESS_COPY.loading} />
      </div>
    );
  }

  const monthLabels: Array<{ column: number; text: string }> = [];
  if (monthsAxis) {
    let lastMonth = -1;
    grid.forEach((column, index) => {
      const first = column.find((c) => c && c.key) ?? null;
      if (!first) return;
      if (first.month !== lastMonth) {
        lastMonth = first.month;
        monthLabels.push({ column: index, text: String(first.month + 1) });
      }
    });
  }

  const pick = (column: number, cell: Cell): void => {
    if (!onSelect || cell.count < 0) return;
    const value = valueAt(column, cell);
    onSelect({ key: cell.key, count: value, label: cellAriaLabel(cell.key, value) });
  };

  /** 列距 = 格宽 + 列间隙：格子与月份标签**共用**这一个口径（I-06 逐列对齐）。 */
  const colPitchPx = cellPx + gapPx;

  const cellBox = (heightPx: number): React.CSSProperties => ({
    width: `${String(cellPx)}px`,
    height: `${String(heightPx)}px`,
    marginRight: `${String(gapPx)}px`,
  });

  return (
    <div
      ref={ref}
      data-testid={testid}
      role="group"
      aria-label={ariaLabel}
      className={cn('w-full rounded-xl border border-hair bg-surface p-4', className)}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {onModeChange ? (
          <Tabs
            value={mode}
            onValueChange={(value) => onModeChange(value as HeatmapMode)}
            className="w-full max-w-list"
          >
            <TabsList className="max-w-list">
              {(Object.keys(modeLabels) as HeatmapMode[]).map((key) => (
                <TabsTrigger key={key} value={key} className="min-h-8 text-sm">
                  {modeLabels[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <span className="text-sm font-medium text-ink">{modeLabels[mode]}</span>
        )}
        {onBrowseToggle && browseLabel ? (
          <button
            type="button"
            aria-expanded={browsing}
            onClick={() => {
              const next = !browsing;
              setBrowsing(next);
              onBrowseToggle(next);
            }}
            className={cn(
              'inline-flex min-h-tap items-center rounded-md px-2 text-xs text-ink-muted',
              'transition-colors duration-micro ease-standard hover:text-brand',
              'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
            )}
          >
            {browseLabel}
          </button>
        ) : null}
      </div>

      {unavailableLabel ? (
        <p className="mb-2 text-xs text-warning">{unavailableLabel}</p>
      ) : null}

      {/* I-06：月份标签行与格阵**同在一条横向滚动容器内**（脱节根因修复），
          每列标签宽 = `colPitchPx`（与格子列距同源），`w-max` 保证不被压缩。 */}
      <div
        ref={scrollRef}
        className={cn('overflow-x-auto overflow-y-hidden overscroll-x-contain', scrollClassName)}
      >
        {monthsAxis && monthLabels.length > 0 ? (
          <div className="mb-1 flex w-max text-2xs text-ink-muted" aria-hidden="true">
            {grid.map((_, index) => {
              const found = monthLabels.find((m) => m.column === index);
              return (
                <span key={`m-${String(index)}`} className="shrink-0 truncate" style={{ width: `${String(colPitchPx)}px` }}>
                  {found?.text ?? ''}
                </span>
              );
            })}
          </div>
        ) : null}

        {mode === 'weekly' ? (
          <div role="grid" aria-label={ariaLabel} className="flex w-max pb-1">
            <div role="row" className="flex">
              {grid.map((column, c) => {
                const first = column.find((x) => x && x.key) ?? null;
                const total = weekTotals[c] ?? 0;
                const sample = first ?? { key: '', count: 0, month: 0 };
                const level = first ? levelAt(c, { ...sample, count: total }) : -1;
                return (
                  <span
                    key={`w-${first?.key ?? String(c)}`}
                    role="gridcell"
                    tabIndex={-1}
                    aria-selected={selectedKey != null && first?.key === selectedKey}
                    aria-current={selectedKey != null && first?.key === selectedKey ? 'true' : undefined}
                    aria-label={first ? cellAriaLabel(first.key, total) : undefined}
                    onClick={() => first && pick(c, { ...first, count: total })}
                    className={cn(
                      'relative shrink-0 rounded-xs transition-[box-shadow] duration-micro ease-standard',
                      onSelect && first ? 'cursor-pointer' : 'cursor-default',
                      'md:hover:outline-2 md:hover:outline-focus',
                      level >= 0 ? LEVEL_CLASS[level] : LEVEL_CLASS[0],
                      selectedKey != null && first?.key === selectedKey && 'ring-2 ring-brand',
                    )}
                    style={{
                      width: `${String(cellPx)}px`,
                      height: `${String(ROWS * cellPx + (ROWS - 1) * gapPx)}px`,
                      marginRight: `${String(gapPx)}px`,
                    }}
                  >
                    {first ? (
                      <span
                        aria-hidden="true"
                        className="absolute"
                        style={{ inset: `-${String(hitExpandPx)}px` }}
                      />
                    ) : null}
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          <div role="grid" aria-label={ariaLabel} className="w-max pb-1">
            {Array.from({ length: ROWS }, (_, row) => (
              <div key={`row-${String(row)}`} role="row" className="flex">
                {grid.map((column, c) => {
                  const cell = column[row];
                  if (!cell || !cell.key) {
                    return (
                      <span
                        key={`p-${String(c)}-${String(row)}`}
                        aria-hidden="true"
                        className="shrink-0 rounded-xs bg-heat-future"
                        style={cellBox(cellPx)}
                      />
                    );
                  }
                  const level = levelAt(c, cell);
                  const isSelected = selectedKey != null && cell.key === selectedKey;
                  const isToday = cell.key === today;
                  return (
                    <span
                      key={cell.key}
                      role="gridcell"
                      tabIndex={-1}
                      aria-selected={isSelected}
                      aria-current={isToday ? 'date' : isSelected ? 'true' : undefined}
                      aria-label={cellAriaLabel(cell.key, valueAt(c, cell))}
                      onClick={() => pick(c, cell)}
                      className={cn(
                        'relative shrink-0 rounded-xs transition-[box-shadow] duration-micro ease-standard',
                        'md:hover:outline-2 md:hover:outline-focus',
                        LEVEL_CLASS[Math.max(0, level)],
                        isSelected && 'ring-2 ring-brand',
                        isToday && 'outline outline-1 outline-ink-muted',
                      )}
                      style={cellBox(cellPx)}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute"
                        style={{ inset: `-${String(hitExpandPx)}px` }}
                      />
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 text-2xs text-ink-muted">
        <span>{legend.left}</span>
        {LEVEL_CLASS.map((cls, level) => (
          <span
            key={`legend-${String(level)}`}
            aria-hidden="true"
            className={cn('inline-block h-2.5 w-2.5 rounded-xs', cls)}
          />
        ))}
        <span>{legend.right}</span>
        {legend.ranges ? <span className="tnum">（{legend.ranges}）</span> : null}
      </div>

      {/* §3.7.6：点选信息条在**滚动区之外**，未点选时不渲染文字。 */}
      <div
        role="status"
        aria-live="polite"
        className="mt-2 min-h-5 text-sm leading-snug text-ink"
      >
        {tip ? tip : null}
      </div>

      {browsing ? (
        <table className="mt-2 w-full text-2xs">
          <caption className="sr-only">{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">{modeLabels[mode]}</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((column, c) => {
              const days2 = column.filter((x): x is Cell => Boolean(x && x.key));
              const first = days2[0];
              if (!first) return null;
              const shown = mode === 'daily' ? weekTotals[c] ?? 0 : valueAt(c, first);
              return (
                <tr key={`bt-${String(c)}`}>
                  <th scope="row" className="text-left font-normal tnum">
                    {first.key}
                  </th>
                  <td className="tnum">{String(shown)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

const HeatmapWithRef = React.forwardRef(Heatmap);
HeatmapWithRef.displayName = 'Heatmap';

export { HeatmapWithRef as Heatmap };
