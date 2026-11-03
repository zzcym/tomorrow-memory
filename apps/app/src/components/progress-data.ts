/**
 * 学习情况页（tab4，`screens/ProgressScreen.tsx`）的**纯投影层** + 宿主注入串 —— T-18c。
 *
 * T-26b 只改了这里的**取数形状与注释**（投影算法一字未动）：入参口径从 `days:number` 换成
 * 服务端的 `period` 枚举，热力图要的一整年由 `period:'all'` 的返回在客户端裁到
 * `ANALYST_WINDOW_DAYS` 天（`growthPointsOf` 末尾那一步 filter）。
 *
 * 为什么单独成文件（§10.3 末段：批次4 只新增 `screens/*` 与 `components/*`）：
 *  1. 同一份接口结果要喂三处（B 区三张卡 / C 区 `GrowthLine` / D 区 `Heatmap`），
 *     "取哪个键、按哪天求和、图例区间怎么算"只能有一个口径（判据③）；
 *  2. 这批函数是**纯函数**，不碰 DOM、不发请求，能脱离渲染直接判真假
 *     （`test/progress-screen.spec.tsx` 的 A 组用例吃这一条）；
 *  3. UI §3.7.2 / §3.7.4 / §3.7.6 逐字点名的几条串原先按 T-15 的先例（`apps/web/src/lib/api/profile.ts`
 *     的 `HOST_PROFILE_COPY`）在本文件**模块级单点声明**（宿主对象 `PROGRESS_APP_COPY`）；
 *     T-03r5 已按 PM-fix8 §四 把它的 **9 个键**（注释曾自陈"7 串"，实体 9 —— A-65 #182）
 *     全部并入 `@tm/shared` 的 `PROGRESS_COPY` 并整体删除宿主对象，页面与组件不动。
 *
 * 判据③ 的红线：`连续天数` **只读接口**（`/api/checkin/status` 的 `streak`，与 tab 红点 /
 * 首页胶囊 / 「我的」是同一份 `['checkin','status']` 查询 = R-13③⑥）。本文件**不调**
 * `@tm/shared` 的 `computeStreak` / `computeStreakFromDates` / `currentStreak`，
 * 也不从 `reviewDates` 反推连胜 —— 页面里出现的唯一"算"是把接口给的逐日数字按日期区间相加
 * （`sumFrom`），相加的对象与"连胜"无关。`test/progress-screen.spec.tsx` 有源码级哨兵盯这条。
 *
 * Chrome84 红线（§5.1 / `apps/app/vite.config.ts` 的 `tm-app:dist-guard`）：
 * 不用 `structuredClone` / `Object.hasOwn` / `Array.prototype.at` / `requestIdleCallback`；
 * 索引取值一律显式判空（`tsconfig.base.json` 的 `noUncheckedIndexedAccess`）。
 */

import { ARIA, HEATMAP_LEGEND, PROGRESS_COPY, getDateStr, type GrowthPoint } from '@tm/shared';
import type { HeatmapDayCell, HeatmapMode } from '@tm/ui';

/* ═════════════════ 窗口常量（§3.7.1 B/C/D 三区的取数范围） ═════════════════ */

/** D 区格阵年宽 = `Heatmap` 的 `weeks` 默认值（52+1 周，UI §3.7.1 行 D）。 */
export const HEATMAP_WEEKS = 53;
/** C 区曲线的天数（§3.7.1 行 C「近 30 天」= `PROGRESS_COPY.curve.subtitle` 的 30 天）。 */
export const CURVE_WINDOW_DAYS = 30;
/**
 * `analyst.report` 的入参（`AnalysisPeriod` 值域 = `'7d'|'30d'|'90d'|'all'`，
 * 真源 `packages/server/src/routes/analyst.ts` 的 `PeriodQuerySchema`）。
 *
 * 为什么是 `'all'`：D 区热力图要**一整年**，而枚举里没有"365 天"这一档 ——
 * **不扩枚举、不加端点**（A-47 #106 末段的硬口径），改为按 `'all'` 取全量、
 * 在客户端裁到最近 `ANALYST_WINDOW_DAYS` 天（`growthPointsOf` 里那一步）。
 * C 区曲线只要近 30 天（`CURVE_WINDOW_DAYS`），是这一份返回的尾巴，不另发请求。
 */
export const ANALYST_PERIOD = 'all' as const;
/**
 * **客户端**裁剪窗口（不是请求参数）：热力图要一整年（53×7=371 天里最近 365 天），
 * 而服务端给的 `'all'` 是全量历史 ⇒ 不裁就会把一年外的日子算进"数据不足"判定与图例区间，
 * 而那两个数只是**文本通道**（§1.2.1 ②），必须与画得出来的那 53 周同口径。
 * 曲线取尾巴 30 天、B 区卡 1 只看本周，两者对裁剪不敏感。
 */
export const ANALYST_WINDOW_DAYS = 365;
/** 数据不足判定：有记录但不足一周 ⇒ 格阵照画，下面补一句（§3.7.4「数据不足」行同口径）。 */
export const SPARSE_DAYS = 7;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* ═════════════════ 形状守卫（analyst 在 shared 里只有 interface，没有 zod 契约） ═════════════════ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** 坏值按 0 收（判据①「数字必须存在」优先于"形状不合就不画"）。 */
const nonNegative = (value: unknown): number => {
  const n = finiteNumber(value);
  return n === null || n < 0 ? 0 : Math.round(n);
};

const dayKey = (value: unknown): string =>
  typeof value === 'string' && DAY_PATTERN.test(value) ? value : '';

/** `key` 的升序比较（ISO 串可直接比字典序）。 */
const byKeyAsc = (a: string, b: string): number => (a === b ? 0 : a < b ? -1 : 1);

/** 日期 `key` 往前推 `backDays` 天（本地时区，闭区间下界）；`key` 不合法时回 `''`。 */
function shiftKeyBack(key: string, backDays: number): string {
  if (!DAY_PATTERN.test(key)) return '';
  const parts = key.split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - backDays);
  return getDateStr(date);
}

/* ═════════════════ analyst / profile → 本页要的那几个数 ═════════════════ */

/**
 * `GET /api/analyst` 的 `dataset.growthCurve`，**并在这里做客户端裁剪**（`period:'all'` 换回的是
 * 全量历史，只留最近 `ANALYST_WINDOW_DAYS` 天 —— 见上面那条常量的理由）。
 *
 * 两种包装都收，且**两条都是真实存在的响应形状**（不是兜底分支）：
 *  - `{dataset:{growthCurve:[…]}}` = `AnalysisReport`，来自 `GET /api/analyst`（`routes/analyst.ts:97`）；
 *  - 裸 `{growthCurve:[…]}` = `AnalyticsDataset`，来自 `GET /api/analyst/dataset`（同文件 :134）。
 * 打戳（A-48 口径 · A-47 #106）：本函数**原来**这段注释写着"服务端 REST 面尚未落地
 * （`packages/server/src/app.ts` 只挂了 tRPC）"—— 那是已失效的错前提，两条端点已由 T-26a 交付；
 * 收形保留的唯一理由是上面那两条读路径**本来**就同存。
 * 不合形状的**点**丢掉，不合形状的响应交给查询本身失败，页面不会拿到半截曲线。
 */
export function growthPointsOf(source: unknown, today: string = todayKeyOf()): GrowthPoint[] {
  if (!isRecord(source)) return [];
  const dataset = isRecord(source.dataset) ? source.dataset : source;
  const list = Array.isArray(dataset.growthCurve) ? dataset.growthCurve : [];
  const out: GrowthPoint[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const date = dayKey(item.date);
    if (!date) continue;
    out.push({ date, newWords: nonNegative(item.newWords), total: nonNegative(item.total) });
  }
  out.sort((a, b) => byKeyAsc(a.date, b.date));
  const from = shiftKeyBack(today, ANALYST_WINDOW_DAYS - 1);
  if (!from) return out;
  return out.filter((point) => point.date >= from);
}

export interface ProfileProgress {
  /** `profile.get` 的 `totalWords`（词本总数，本页只用于"是不是真空号"）。 */
  totalWords: number;
  /** 累计复习天数 → 热力图容器 `aria-label` 的「共打卡 N 天」（§3.7.6）。 */
  reviewDays: number;
  /** `YYYY-MM-DD`，一天多次复习会**重复**（Web 的 `buildHeatCells` 同一口径）。 */
  reviewDates: string[];
  /** `profile.get` 的 `streak`；`null` = 没这个键（与"给了 0"分开，兜底才走 `checkin.status`）。 */
  streak: number | null;
  /** 响应到没到过（`undefined` → false）。 */
  loaded: boolean;
}

/** `profile.get` 的学情四键（契约是 `passthrough()`，这四键只有运行时会带 → 只能这样读）。 */
export function profileProgressOf(source: unknown): ProfileProgress {
  const record = isRecord(source) ? source : null;
  const rawDates = record && Array.isArray(record.reviewDates) ? record.reviewDates : [];
  const dates: string[] = [];
  for (const item of rawDates) {
    const key = dayKey(item);
    if (key) dates.push(key);
  }
  return {
    totalWords: nonNegative(record?.totalWords),
    reviewDays: nonNegative(record?.reviewDays),
    reviewDates: dates,
    streak: record ? finiteNumber(record.streak) : null,
    loaded: record !== null,
  };
}

/* ═════════════════ D 区：格阵取值 ═════════════════ */

/** 主源 = `analyst.growthCurve` 的逐日 `newWords`（"那一天新增了几个词"）。 */
export function cellsFromGrowth(points: readonly GrowthPoint[]): HeatmapDayCell[] {
  const out: HeatmapDayCell[] = [];
  for (const point of points) {
    if (DAY_PATTERN.test(point.date) && point.newWords > 0) {
      out.push({ key: point.date, count: point.newWords });
    }
  }
  return out;
}

/**
 * 兜底源 = `profile.get` 的 `reviewDates`（服务端 `checkin_logs` 的逐条日期）。
 * 与 Web `apps/web/src/lib/api/profile.ts:408` 的 `buildHeatCells` 同口径：重复串 = 一天多次。
 * 语义差（这里是"复习了几次"，主源是"新增了几词"）已登记进报告的契约偏差清单。
 */
export function cellsFromReviewDates(dates: readonly string[]): HeatmapDayCell[] {
  const counts = new Map<string, number>();
  for (const raw of dates) {
    const key = dayKey(raw);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: HeatmapDayCell[] = [];
  for (const key of Array.from(counts.keys()).sort(byKeyAsc)) {
    const count = counts.get(key) ?? 0;
    if (count > 0) out.push({ key, count });
  }
  return out;
}

/** 主源有格子就用主源，一条都没有才退到兜底源（两源都是接口给的数，本页不合成第三份真相）。 */
export function preferCells(
  primary: readonly HeatmapDayCell[],
  fallback: readonly HeatmapDayCell[],
): HeatmapDayCell[] {
  return primary.length > 0 ? primary.slice() : fallback.slice();
}

/** 某一天格值（没有记录 = 0 = L0 虚线格）。 */
export function countOf(cells: readonly HeatmapDayCell[], key: string): number {
  for (const cell of cells) if (cell.key === key) return cell.count;
  return 0;
}

/** **有**记录的天数（数据不足 / 空态判定用；与"打卡天数"同源，不做连胜推算）。 */
export function positiveDays(cells: readonly HeatmapDayCell[]): number {
  let days = 0;
  for (const cell of cells) if (cell.count > 0) days += 1;
  return days;
}

/** 今天（本地时区）的 `YYYY-MM-DD`。`now` 只给单测注入。 */
export function todayKeyOf(now: Date = new Date()): string {
  return getDateStr(now);
}

/**
 * 某个日期所在**周**的周一（§3.7.1 B 区「本周新增」与 D 区行 0 = 周一同口径；
 * `Heatmap` 内部 `rowOf = (getUTCDay()+6)%7` 也是周一开头）。
 */
export function weekStartKey(key: string): string {
  if (!DAY_PATTERN.test(key)) return key;
  const parts = key.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return getDateStr(date);
}

/** 日期区间 `[fromKey, toKey]` 内的格值合计（闭区间，ISO 串字典序即日期序）。 */
export function sumFrom(cells: readonly HeatmapDayCell[], fromKey: string, toKey: string): number {
  let sum = 0;
  for (const cell of cells) {
    if (cell.key >= fromKey && cell.key <= toKey) sum += cell.count;
  }
  return sum;
}

/** 「本周新增」= 本周（周一起）到今天的合计（§3.7.1 行 B 卡 1）。 */
export function weekAdded(cells: readonly HeatmapDayCell[], today: string): number {
  return sumFrom(cells, weekStartKey(today), today);
}

/**
 * 图例的数值区间（§1.2.1 ②「少 → 多 + 数值区间」的**文本通道**，缺即 §8 视觉验收不通过）。
 * 三档上界与 `Heatmap` 内部的三模式取值口径一致：日 = 单日最大、周 = 单周最大、累计 = 全部合计。
 */
export function legendRangesOf(mode: HeatmapMode, cells: readonly HeatmapDayCell[]): string {
  let max = 0;
  if (mode === 'daily') {
    for (const cell of cells) if (cell.count > max) max = cell.count;
  } else if (mode === 'weekly') {
    const byWeek = new Map<string, number>();
    for (const cell of cells) {
      const week = weekStartKey(cell.key);
      byWeek.set(week, (byWeek.get(week) ?? 0) + cell.count);
    }
    for (const value of Array.from(byWeek.values())) if (value > max) max = value;
  } else {
    for (const cell of cells) max += cell.count;
  }
  return max > 0 ? HEATMAP_LEGEND.range(1, max) : '';
}

/** D 区容器可访问名（§3.7.6 逐字模板；天数用服务端给的 `reviewDays`，不从格阵反推）。 */
export function heatAriaLabelOf(reviewDays: number): string {
  return PROGRESS_COPY.heatmapAria(reviewDays);
}

/* ═════════════════ C 区：增长曲线 ═════════════════ */

export interface CurvePoint {
  date: string;
  value: number;
}

/**
 * 曲线点：`{date, value: 累计掌握词数}`（§3.7.1 行 C「近 30 天累计掌握词数」，
 * 取 `GrowthPoint.total`，不是 `newWords`）。
 */
export function curvePointsOf(points: readonly GrowthPoint[], days = CURVE_WINDOW_DAYS): CurvePoint[] {
  const tail = points.length > days ? points.slice(points.length - days) : points.slice();
  const out: CurvePoint[] = [];
  for (const point of tail) out.push({ date: point.date, value: point.total });
  return out;
}

/**
 * `GrowthLine` 的 `accessibleSummary`（§3.7.6 逐字模板 = `ARIA.curveContainer` + `从 X 到 Y`）。
 * 没有点时只给 shared 那一串（`GrowthLine` 此时本来就走"数据不足"文本分支，不画图）。
 */
export function curveSummaryOf(points: readonly GrowthPoint[], days = CURVE_WINDOW_DAYS): string {
  const window = curvePointsOf(points, days);
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last) return ARIA.curveContainer;
  const newest = points[points.length - 1];
  return `${ARIA.curveContainer}：${PROGRESS_COPY.curveAria(first.value, last.value, newest ? newest.newWords : 0)}`;
}

/* ═════════════════ 空 / 首屏判定 ═════════════════ */

/**
 * §3.7.4「已登录、0 词 0 复习」：三卡显示 `0`（**不是空**），曲线区与热力图区各换空态。
 * 判据 = 接口给的 `totalWords` 为 0 **且** 格阵没有任何一天有记录。
 */
export function isEmptyBoard(cells: readonly HeatmapDayCell[], totalWords: number): boolean {
  return totalWords === 0 && positiveDays(cells) === 0;
}

/** 整页首屏：四个查询都还没落定（骨架屏只在这一刻出现，避免"局部刷新"时整页闪）。 */
export function isFirstLoad(flags: readonly boolean[]): boolean {
  for (const pending of flags) if (!pending) return false;
  return true;
}
