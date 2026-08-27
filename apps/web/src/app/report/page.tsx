'use client';

/**
 * 学情分析报告页（Phase 5）
 * - 词汇增长折线图 / 正确率趋势 / 遗忘曲线分布 / 学习时段热力图（24h × 7d）
 * - LLM 洞察卡片（AI 图标 + 渐显动画）
 * - 学习建议列表
 * - 数据刷新按钮 + 上次更新时间
 */

import * as React from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import { trpc } from '@/lib/trpc';
import { getToken } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalystInsight } from '@tm/shared';

// 代码分割：Recharts 图表组件动态导入（重型依赖，按需加载）
const GrowthLineChart = dynamic(() => import('@/components/charts/growth-line-chart'), { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> });
const ReviewLineChart = dynamic(() => import('@/components/charts/review-line-chart'), { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> });
const ForgettingBarChart = dynamic(() => import('@/components/charts/forgetting-bar-chart'), { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> });
const HeatmapChart = dynamic(() => import('@/components/charts/heatmap-chart'), { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> });

const PERIODS = [
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: '90d', label: '近 90 天' },
  { value: 'all', label: '全部' },
] as const;

type Period = (typeof PERIODS)[number]['value'];

const INSIGHT_STYLE: Record<AnalystInsight['type'], string> = {
  positive: 'border-green-500/50 bg-green-500/10',
  warning: 'border-amber-500/50 bg-amber-500/10',
  suggestion: 'border-blue-500/50 bg-blue-500/10',
  prediction: 'border-purple-500/50 bg-purple-500/10',
};

const INSIGHT_LABEL: Record<AnalystInsight['type'], string> = {
  positive: '正面反馈',
  warning: '问题诊断',
  suggestion: '改进建议',
  prediction: '预测',
};

export default function ReportPage(): React.JSX.Element {
  const [period, setPeriod] = React.useState<Period>('30d');
  const [forceRefresh, setForceRefresh] = React.useState(false);
  const authed = !!getToken();

  const report = trpc.analyst.report.useQuery(
    { period, refresh: forceRefresh },
    { enabled: authed, refetchOnWindowFocus: false },
  );

  const dataset = report.data?.dataset;
  const insights = report.data?.insights ?? [];

  if (!authed) {
    return <p className="py-20 text-center text-muted-foreground">请先登录后查看学情分析。</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">学情分析</h1>
          <p className="text-sm text-muted-foreground">
            数据来源：{dataset?.source === 'clickhouse' ? 'ClickHouse 事件流' : '本地数据库（ClickHouse 未接入）'}
            {report.data?.cached && ' · 洞察已缓存'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={period === p.value ? 'default' : 'outline'}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setForceRefresh(true);
              void report.refetch().then(() => {
                setForceRefresh(false);
                toast.success('已刷新，洞察重新生成');
              });
            }}
            disabled={report.isFetching}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${report.isFetching ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {report.isLoading ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : dataset ? (
        <>
          {/* 图表区 */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">词汇增长曲线</CardTitle>
                <CardDescription>每日新增词数 + 累计词汇量</CardDescription>
              </CardHeader>
              <CardContent>
                <GrowthLineChart data={dataset.growthCurve} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">复习效率</CardTitle>
                <CardDescription>日均复习量趋势</CardDescription>
              </CardHeader>
              <CardContent>
                <ReviewLineChart data={dataset.reviewEfficiency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">遗忘曲线分布</CardTitle>
                <CardDescription>各 stability 区间的单词数量</CardDescription>
              </CardHeader>
              <CardContent>
                <ForgettingBarChart data={dataset.forgettingCurve} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">学习时段分布</CardTitle>
                <CardDescription>24 小时 × 7 天学习次数热力图</CardDescription>
              </CardHeader>
              <CardContent>
                <HeatmapChart data={dataset.studyHeatmap} />
              </CardContent>
            </Card>
          </div>

          {/* CEFR 分布 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">CEFR 等级分布</CardTitle>
              <CardDescription>你的词汇覆盖水平（按词频启发式映射）</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                {dataset.cefrDistribution.map((b) => (
                  <div key={b.level} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-sm font-semibold">{b.count}</span>
                    <div
                      className="w-full rounded-t bg-primary/60"
                      style={{ height: `${Math.max(4, (b.count / Math.max(1, ...dataset.cefrDistribution.map((x) => x.count))) * 80)}px` }}
                    />
                    <span className="text-xs text-muted-foreground">{b.level}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* LLM 洞察卡片 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">AI 学习洞察</h2>
              <Badge variant="outline">24h 缓存</Badge>
            </div>
            {insights.map((insight, i) => (
              <div
                key={i}
                className={`animate-fade-in-up rounded-lg border p-3.5 ${INSIGHT_STYLE[insight.type]}`}
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <span className="mr-2 text-xs font-semibold">{INSIGHT_LABEL[insight.type]}</span>
                <span className="text-sm">{insight.text}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {report.error?.message ?? '加载失败，请稍后重试'}
          </CardContent>
        </Card>
      )}
      <div className="h-8" />
    </div>
  );
}
