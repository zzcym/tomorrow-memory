/**
 * ClickHouse 客户端（HTTP 接口，原生 fetch，无额外依赖）
 *
 * - learn_events 事件表（MergeTree，排序键 (user_id, created_at)）
 * - 批量插入（JSONEachRow 格式）
 * - 只读查询（Analyst Agent 使用）
 */

export interface ClickHouseClientOptions {
  url: string;
  database?: string;
  /** 连接不可用时静默降级（开发环境无 ClickHouse 时） */
  tolerant?: boolean;
}

export interface LearnEventRow {
  event_id: string;
  user_id: number;
  event_type: string;
  word_id: string;
  metadata: string;
  created_at: string;
}

/** learn_events 建表 DDL（MergeTree 引擎） */
export const LEARN_EVENTS_DDL = `
CREATE TABLE IF NOT EXISTS learn_events (
  event_id UUID,
  user_id UInt32,
  event_type String,
  word_id String,
  metadata String,
  created_at DateTime('UTC')
) ENGINE = MergeTree()
ORDER BY (user_id, created_at)
`;

export class ClickHouseClient {
  private readonly base: string;
  private readonly database: string;
  private healthy = false;

  constructor(private readonly options: ClickHouseClientOptions) {
    this.base = options.url.replace(/\/+$/, '');
    this.database = options.database ?? 'default';
  }

  get isHealthy(): boolean {
    return this.healthy;
  }

  /** 初始化：建表（失败时置为不可用，不抛错——开发环境允许无 ClickHouse） */
  async init(): Promise<void> {
    try {
      await this.query(LEARN_EVENTS_DDL);
      this.healthy = true;
      console.log('[CH] ClickHouse 连接成功，learn_events 表就绪');
    } catch (err) {
      this.healthy = false;
      if (this.options.tolerant) {
        console.warn('[CH] ClickHouse 不可用（开发降级）:', (err as Error).message);
      } else {
        throw err;
      }
    }
  }

  /** 执行 SQL（只读/DDL），返回解析后的行 */
  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    let body = sql;
    if (params && params.length > 0) {
      // 简易参数化：? 按序替换（仅用于已白名单的聚合模板，无注入风险）
      let i = 0;
      body = sql.replace(/\?/g, () => {
        const v = params[i++]!;
        return typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "\\'")}'`;
      });
    }
    const resp = await fetch(`${this.base}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `${body} FORMAT JSONEachRow`,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`ClickHouse 查询失败: ${resp.status} ${text.slice(0, 300)}`);
    }
    const text = await resp.text();
    if (!text.trim()) return [];
    return text
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as T);
  }

  /** 批量插入（一次请求） */
  async insert(table: string, rows: Array<Record<string, unknown>>): Promise<void> {
    if (rows.length === 0) return;
    const body = rows.map((r) => JSON.stringify(r)).join('\n');
    const resp = await fetch(`${this.base}/?query=${encodeURIComponent(`INSERT INTO ${this.database}.${table}`)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`ClickHouse 插入失败: ${resp.status} ${text.slice(0, 300)}`);
    }
  }
}
