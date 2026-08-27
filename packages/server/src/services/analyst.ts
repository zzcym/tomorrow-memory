/**
 * Analyst 查询服务：学情分析 SQL 聚合（Phase 5）
 *
 * 优先 ClickHouse（learn_events 事件库），不可用时降级 DB 数据计算。
 * 输出标准 JSON（含图表配置数据），供 Analyst Agent 与 /report 前端使用。
 */

import type {
  AnalyticsDataset,
  CefrBucket,
  ForgettingBucket,
  GrowthPoint,
  ReviewEfficiencyPoint,
  StudyHeatmapCell,
} from '@tm/shared';
import { cardFromJson } from '@tm/agent';
import type { AppDB } from '../db/types.js';
import type { ClickHouseClient } from './clickhouse.js';
import type { DictSources } from './dict-sources.js';

export type AnalysisPeriod = '7d' | '30d' | '90d' | 'all';

/** collins 星级 → CEFR 启发式映射（高频词 = 更低等级） */
function collinsToCefr(collins: number | null): string {
  const c = collins ?? 0;
  if (c >= 5) return 'A1';
  if (c === 4) return 'A2';
  if (c === 3) return 'B1';
  if (c === 2) return 'B2';
  if (c === 1) return 'C1';
  return 'C2';
}

const STABILITY_BUCKETS: Array<{ range: string; min: number; max: number }> = [
  { range: '0-1', min: 0, max: 1 },
  { range: '1-2', min: 1, max: 2 },
  { range: '2-4', min: 2, max: 4 },
  { range: '4-8', min: 4, max: 8 },
  { range: '8-16', min: 8, max: 16 },
  { range: '16+', min: 16, max: Infinity },
];

export class AnalystService {
  constructor(
    private readonly db: AppDB,
    private readonly clickhouse: ClickHouseClient,
    private readonly dictSources: DictSources,
  ) {}

  /**
   * 生成学情分析数据集
   */
  async analyze(userId: number, period: AnalysisPeriod = '30d'): Promise<AnalyticsDataset> {
    if (this.clickhouse.isHealthy) {
      try {
        const dataset = await this.fromClickHouse(userId, period);
        if (dataset) return dataset;
      } catch (err) {
        console.warn('[ANALYST] ClickHouse 查询失败，降级 DB:', (err as Error).message);
      }
    }
    return this.fromDb(userId, period);
  }

  // ===== ClickHouse 路径 =====
  private async fromClickHouse(userId: number, period: AnalysisPeriod): Promise<AnalyticsDataset | null> {
    const since = period === 'all' ? 0 : Date.now() / 1000 - periodDays(period) * 86_400;
    const sinceExpr = period === 'all' ? '' : `AND created_at >= toDateTime(${Math.floor(since)})`;

    // 1. 词汇增长曲线
    const growthRows = await this.clickhouse.query<{ d: string; n: number }>(`
      SELECT toDate(created_at) AS d, countIf(event_type = 'word_added') AS n
      FROM learn_events WHERE user_id = ? ${sinceExpr}
      GROUP BY d ORDER BY d` , [userId]);
    const growthCurve = this.toGrowthCurve(growthRows.map((r) => ({ date: r.d, newWords: Number(r.n) })));

    // 2. 复习效率
    const reviewRows = await this.clickhouse.query<{ d: string; c: number; acc: number }>(`
      SELECT toDate(created_at) AS d,
             count() AS c,
             avgIf(toFloat64OrZero(JSONExtractString(metadata, 'score')), event_type = 'assess') AS acc
      FROM learn_events
      WHERE user_id = ? AND event_type IN ('review', 'assess') ${sinceExpr}
      GROUP BY d ORDER BY d`, [userId]);
    const reviewEfficiency: ReviewEfficiencyPoint[] = reviewRows.map((r) => ({
      date: r.d,
      reviewCount: Number(r.c),
      accuracy: Number.isFinite(r.acc) && r.acc !== 0 ? Number(r.acc) : null,
      avgStability: 0, // 状态类数据从 DB 补充
    }));

    // 3. 学习时段分布
    const heatRows = await this.clickhouse.query<{ h: number; dow: number; c: number }>(`
      SELECT toHour(created_at) AS h, toDayOfWeek(created_at) AS dow, count() AS c
      FROM learn_events WHERE user_id = ? ${sinceExpr}
      GROUP BY h, dow ORDER BY h, dow`, [userId]);
    const studyHeatmap: StudyHeatmapCell[] = heatRows.map((r) => ({
      hour: Number(r.h),
      dow: Number(r.dow) % 7,
      count: Number(r.c),
    }));

    // 遗忘曲线 / CEFR 从 DB（状态数据）
    const [forgettingCurve, cefrDistribution] = await this.fromDbState(userId);

    return {
      period,
      generatedAt: Date.now(),
      growthCurve,
      reviewEfficiency,
      forgettingCurve,
      studyHeatmap,
      cefrDistribution,
      source: 'clickhouse',
    };
  }

  // ===== DB 降级路径 =====
  private async fromDb(userId: number, period: AnalysisPeriod): Promise<AnalyticsDataset> {
    const cards = await this.db.fsrs.getCardsByUser(userId);
    const sinceMs = period === 'all' ? 0 : Date.now() - periodDays(period) * 86_400_000;

    // 1. 词汇增长（按 created_at 天）
    const byDay = new Map<string, number>();
    for (const c of cards) {
      if (c.created_at >= sinceMs) {
        const d = new Date(c.created_at).toISOString().slice(0, 10);
        byDay.set(d, (byDay.get(d) ?? 0) + 1);
      }
    }
    const growthCurve = this.toGrowthCurve(
      [...byDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, newWords]) => ({ date, newWords })),
    );

    // 2. 复习效率（按 last_review 天）
    const reviewByDay = new Map<string, number>();
    for (const c of cards) {
      if (c.last_review !== null && c.last_review >= sinceMs) {
        const d = new Date(c.last_review).toISOString().slice(0, 10);
        reviewByDay.set(d, (reviewByDay.get(d) ?? 0) + 1);
      }
    }
    const reviewEfficiency: ReviewEfficiencyPoint[] = [...reviewByDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, reviewCount]) => ({
        date,
        reviewCount,
        accuracy: null, // 无事件数据无法计算正确率
        avgStability: 0,
      }));

    // 3. 学习时段（按 updated_at 近似）
    const heatMap = new Map<string, number>();
    for (const c of cards) {
      const d = new Date(c.updated_at);
      const key = `${d.getDay()}:${d.getHours()}`;
      heatMap.set(key, (heatMap.get(key) ?? 0) + 1);
    }
    const studyHeatmap: StudyHeatmapCell[] = [...heatMap.entries()].map(([k, count]) => {
      const [dow, hour] = k.split(':').map(Number) as [number, number];
      return { hour, dow, count };
    });

    const [forgettingCurve, cefrDistribution] = await this.fromDbState(userId);

    return {
      period,
      generatedAt: Date.now(),
      growthCurve,
      reviewEfficiency,
      forgettingCurve,
      studyHeatmap,
      cefrDistribution,
      source: 'db-fallback',
    };
  }

  /** 遗忘曲线 + CEFR（状态类数据，两种路径共用） */
  private async fromDbState(userId: number): Promise<[ForgettingBucket[], CefrBucket[]]> {
    const cards = await this.db.fsrs.getCardsByUser(userId);

    // 遗忘曲线：stability 分桶
    const buckets = STABILITY_BUCKETS.map((b) => ({ ...b, count: 0 }));
    for (const c of cards) {
      const s = cardFromJson(c.fsrs_data).stability;
      const bucket = buckets.find((b) => s >= b.min && s < b.max);
      if (bucket) bucket.count++;
    }
    const forgettingCurve: ForgettingBucket[] = buckets.map((b) => ({ range: b.range, count: b.count }));

    // CEFR 分布：word → stardict collins → CEFR
    const cefrCounts = new Map<string, number>();
    for (const c of cards) {
      const row = this.dictSources.lookupStardict(c.word);
      const level = collinsToCefr(row?.collins ?? null);
      cefrCounts.set(level, (cefrCounts.get(level) ?? 0) + 1);
    }
    const cefrDistribution: CefrBucket[] = (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).map((level) => ({
      level,
      count: cefrCounts.get(level) ?? 0,
    }));

    return [forgettingCurve, cefrDistribution];
  }

  /** 增量 → 累计曲线 */
  private toGrowthCurve(points: Array<{ date: string; newWords: number }>): GrowthPoint[] {
    let total = 0;
    return points.map((p) => {
      total += p.newWords;
      return { date: p.date, newWords: p.newWords, total };
    });
  }
}

function periodDays(period: AnalysisPeriod): number {
  switch (period) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    default:
      return 0;
  }
}
