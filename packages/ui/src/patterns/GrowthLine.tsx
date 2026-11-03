'use client';

/**
 * `GrowthLine`（UI §3.7.2 / §3.11.6 / §7.5；A-16 抽取判据）。
 *
 * 展示层从 `apps/web/src/components/charts/growth-line-chart.tsx` 抽出，**改为纯 SVG + token**：
 * 颜色只来自 `--chart-1|4|grid|axis`（经 `tailwind-preset` 的语义类），
 * 不引 `recharts`、零新依赖、零 `#RRGGBB`/`rgba()`（§8.2-1 与 §3.5 `ui-no-io`）。
 * 轴向不做等比缩放：`preserveAspectRatio="none"` + `vectorEffect="non-scaling-stroke"`，
 * 于是线宽恒 2px、文字不进 SVG（轴标签是 HTML，避免缩放糊字，§3.11.6）。
 */
import * as React from 'react';
import { PROGRESS_COPY, VERBS } from '@tm/shared';
import { cn } from '../host.js';
import { SkeletonBlock } from './SkeletonBlock.js';

export interface GrowthLinePoint {
  date: string;
  value: number;
}

export interface GrowthLineProps {
  data: GrowthLinePoint[];
  secondary?: GrowthLinePoint[];
  seriesLabels?: { primary: string; secondary?: string };
  accessibleSummary: string;
  heightPx?: number;
  minPointsForCurve?: number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  errorTitle?: string;
  errorBody?: string;
  tooFewLabel?: string;
  xTickCount?: number;
  areaOpacity?: number;
  animate?: boolean;
  className?: string;
  testid?: string;
}

const VIEW = 100;
const PAD_TOP = 8;

const clamp = (v: number): number => Math.min(VIEW - PAD_TOP, Math.max(PAD_TOP, v));

/** 0..100 归一化路径（x 按点位序等分，y 以 0 为基线）。 */
function toPath(points: GrowthLinePoint[], maxY: number): string {
  if (points.length === 0) return '';
  const n = points.length;
  const step = n > 1 ? VIEW / (n - 1) : 0;
  return points
    .map((p, i) => {
      const x = n > 1 ? i * step : VIEW / 2;
      const y = PAD_TOP + (1 - (p.value / (maxY || 1))) * (VIEW - PAD_TOP * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${clamp(y).toFixed(2)}`;
    })
    .join(' ');
}

function tickIndexes(length: number, count: number): number[] {
  if (length <= 1) return length === 1 ? [0] : [];
  const wanted = Math.max(2, Math.min(count, length));
  const out: number[] = [];
  for (let i = 0; i < wanted; i += 1) {
    out.push(Math.round((i * (length - 1)) / (wanted - 1)));
  }
  return Array.from(new Set(out));
}

function GrowthLine(
  {
    data,
    secondary,
    seriesLabels,
    accessibleSummary,
    heightPx = 160,
    minPointsForCurve = 3,
    loading = false,
    error = false,
    onRetry,
    retryLabel = VERBS.retry,
    errorTitle = PROGRESS_COPY.fail.title,
    errorBody = PROGRESS_COPY.fail.body,
    tooFewLabel = PROGRESS_COPY.tooFewData,
    xTickCount = 4,
    areaOpacity = 0.22,
    animate = true,
    className,
    testid,
  }: GrowthLineProps,
  ref: React.ForwardedRef<HTMLDivElement>,
): React.JSX.Element {
  if (loading) {
    return (
      <div ref={ref} data-testid={testid} className={cn('w-full', className)}>
        <SkeletonBlock variant="chart" height={heightPx} label={PROGRESS_COPY.loading} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        ref={ref}
        data-testid={testid}
        role="alert"
        className={cn(
          'flex w-full flex-col items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/50 p-4',
          className,
        )}
      >
        <span className="flex items-center gap-2 text-h3 font-bold text-ink">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-danger"
            style={{ height: 18, width: 18 }}
          >
            <path d="M12 4 2.8 20h18.4L12 4ZM12 10v4M12 17.2v.2" />
          </svg>
          {errorTitle}
        </span>
        <p className="text-sm text-ink-muted">{errorBody}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              'inline-flex min-h-tap items-center rounded-lg bg-brand px-4 text-sm font-medium text-on-brand',
              'transition-transform duration-tap ease-standard hover:bg-brand-strong active:scale-[.97]',
              'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
            )}
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    );
  }

  if (data.length < minPointsForCurve) {
    /* §3.7.4：数据不足 3 天不画图，改成一行文本进度（禁空坐标系）。 */
    return (
      <div ref={ref} data-testid={testid} className={cn('w-full text-sm text-ink-muted', className)}>
        <p>{tooFewLabel}</p>
        {data.length > 0 ? (
          <ul className="mt-2 space-y-1 text-2xs tnum">
            {data.map((p) => (
              <li key={p.date}>{`${p.date} · ${String(p.value)}`}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  const maxY = Math.max(...data.map((p) => p.value), 1);
  const primaryPath = toPath(data, maxY);
  const areaPath = `${primaryPath} L${String(VIEW)} ${String(VIEW)} L0 ${String(VIEW)} Z`;
  const secondaryPath = secondary ? toPath(secondary, maxY) : '';
  const ticks = tickIndexes(data.length, xTickCount);
  const gridY = [PAD_TOP, VIEW / 3, (VIEW * 2) / 3, VIEW - PAD_TOP];

  return (
    <div ref={ref} data-testid={testid} className={cn('w-full', className)}>
      <div
        role="img"
        aria-label={accessibleSummary}
        className={cn('relative w-full', animate && 'animate-fade-in')}
        style={{ height: `${String(heightPx)}px` }}
      >
        <svg
          viewBox={`0 0 ${String(VIEW)} ${String(VIEW)}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          aria-hidden="true"
        >
          {gridY.map((y) => (
            <line
              key={`grid-${String(y.toFixed(1))}`}
              x1="0"
              x2={String(VIEW)}
              y1={String(y)}
              y2={String(y)}
              className="stroke-chart-grid"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={areaPath} className="fill-chart-1" stroke="none" fillOpacity={areaOpacity} />
          {secondaryPath ? (
            <path
              d={secondaryPath}
              fill="none"
              className="stroke-chart-4"
              strokeWidth="2"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <path
            d={primaryPath}
            fill="none"
            className="stroke-chart-1"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="mt-1 flex items-center justify-between text-2xs text-ink-muted tnum">
        {ticks.map((i) => (
          <span key={`tick-${String(i)}`}>{data[i]?.date.slice(5) ?? ''}</span>
        ))}
      </div>

      {seriesLabels ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
          <span className="flex items-center gap-1">
            <span aria-hidden className="h-0.5 w-4 rounded-full bg-chart-1" />
            {seriesLabels.primary}
          </span>
          {secondary && seriesLabels.secondary ? (
            <span className="flex items-center gap-1">
              <span aria-hidden className="h-0.5 w-4 rounded-full bg-chart-4" />
              {seriesLabels.secondary}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* §7.5：图表必须有文本替身 —— 数据表在 `sr-only` 里读得到，视觉上不可见。 */}
      <table className="sr-only">
        <caption>{accessibleSummary}</caption>
        <thead>
          <tr>
            <th scope="col">{seriesLabels?.primary ?? ''}</th>
            {data.map((p) => (
              <th key={`h-${p.date}`} scope="col">
                {p.date}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{seriesLabels?.primary ?? ''}</th>
            {data.map((p) => (
              <td key={`c-${p.date}`}>{String(p.value)}</td>
            ))}
          </tr>
          {secondary ? (
            <tr>
              <th scope="row">{seriesLabels?.secondary ?? ''}</th>
              {secondary.map((p) => (
                <td key={`s-${p.date}`}>{String(p.value)}</td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

const GrowthLineWithRef = React.forwardRef(GrowthLine);
GrowthLineWithRef.displayName = 'GrowthLine';

export { GrowthLineWithRef as GrowthLine };
