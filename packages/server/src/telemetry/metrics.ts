/**
 * Prometheus 指标注册表（Phase 5）
 *
 * 轻量实现：计数器 + 直方图，渲染 Prometheus 文本格式，供 /metrics 端点输出。
 * 指标：
 *  - http_requests_total{method,path,status}
 *  - http_request_duration_seconds（直方图）
 *  - agent_calls_total{agent}
 *  - agent_tokens_total{agent,type}（input/output）
 *  - llm_cost_usd_total
 *  - events_recorded_total / events_dropped_total
 */

interface CounterEntry {
  help: string;
  values: Map<string, number>;
}

interface HistogramEntry {
  help: string;
  buckets: number[];
  counts: Map<string, number[]>;
  sums: Map<string, number>;
}

export class MetricsRegistry {
  private counters = new Map<string, CounterEntry>();
  private histograms = new Map<string, HistogramEntry>();

  counter(name: string, help: string): { inc: (labels?: Record<string, string>, value?: number) => void } {
    if (!this.counters.has(name)) {
      this.counters.set(name, { help, values: new Map() });
    }
    const entry = this.counters.get(name)!;
    return {
      inc: (labels = {}, value = 1) => {
        const key = this.labelKey(labels);
        entry.values.set(key, (entry.values.get(key) ?? 0) + value);
      },
    };
  }

  histogram(name: string, help: string, buckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]): {
    observe: (value: number, labels?: Record<string, string>) => void;
  } {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, { help, buckets, counts: new Map(), sums: new Map() });
    }
    const entry = this.histograms.get(name)!;
    return {
      observe: (value, labels = {}) => {
        const key = this.labelKey(labels);
        const counts = entry.counts.get(key) ?? new Array<number>(entry.buckets.length).fill(0);
        const sum = entry.sums.get(key) ?? 0;
        for (let i = 0; i < entry.buckets.length; i++) {
          if (value <= entry.buckets[i]!) counts[i] = (counts[i] ?? 0) + 1;
        }
        entry.counts.set(key, counts);
        entry.sums.set(key, sum + value);
      },
    };
  }

  /** 渲染 Prometheus 文本格式 */
  render(): string {
    const lines: string[] = [];
    for (const [name, entry] of this.counters) {
      lines.push(`# HELP ${name} ${entry.help}`, `# TYPE ${name} counter`);
      for (const [labels, value] of entry.values) {
        lines.push(`${name}${labels} ${value}`);
      }
    }
    for (const [name, entry] of this.histograms) {
      lines.push(`# HELP ${name} ${entry.help}`, `# TYPE ${name} histogram`);
      for (const [labels] of entry.counts) {
        const counts = entry.counts.get(labels)!;
        const sum = entry.sums.get(labels) ?? 0;
        for (let i = 0; i < entry.buckets.length; i++) {
          lines.push(`${name}_bucket${labels}{le="${entry.buckets[i]}"} ${counts[i] ?? 0}`);
        }
        lines.push(`${name}_bucket${labels}{le="+Inf"} ${counts[counts.length - 1] ?? 0}`);
        lines.push(`${name}_sum${labels} ${sum}`);
        lines.push(`${name}_count${labels} ${counts[counts.length - 1] ?? 0}`);
      }
    }
    return lines.join('\n') + '\n';
  }

  private labelKey(labels: Record<string, string>): string {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0) return '';
    return `{${keys.map((k) => `${k}="${labels[k]}"`).join(',')}}`;
  }
}

/** 全局指标实例 */
export const metrics = new MetricsRegistry();
