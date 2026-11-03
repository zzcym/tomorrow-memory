/**
 * 运行时开关（S16 / §4.4.4 / PRD §6.4-5）
 *
 * 表 `feature_flags` 即真相；进程内 **30 秒 TTL** 缓存（`FLAG_TTL_SECONDS`），
 * 管理接口 `POST /api/admin/flags` 写完立即失效本进程缓存 →
 * "改开关不需重新发版、≤60 秒生效"（`FLAG_EFFECTIVE_MAX_SECONDS`）的最坏路径成立。
 *
 * 三级取值：DB 行 → `FEATURE_FLAGS_JSON` 环境变量种子 → `FEATURE_FLAG_DEFAULTS`（shared 单源）。
 * DB 读失败**不回退到"当作 off"**，而是落回种子并打 error 日志：
 * 开关判成 off 会静默改变业务行为，种子值是发布时确认过的那一份（清单步 8）。
 */

import {
  FEATURE_FLAG_DEFAULTS,
  FLAG_TTL_SECONDS,
  isFlagBucketOn,
  parseFlagValue,
  type FeatureFlagKey,
} from '@tm/shared';
import type { AppDB } from '../db/types.js';

export interface FeatureFlags {
  /** 原样取值（含 `0%` / `on(20:30)` 这类带参形态）。 */
  get(key: FeatureFlagKey): Promise<string>;
  /** on/off 语义（`parseFlagValue` 的 `on` 位；百分比按 `>0` 视为 on）。 */
  isOn(key: FeatureFlagKey): Promise<boolean>;
  /** 按 userId 尾号放量（§4.4.4 写死 `Math.abs(userId) % 100 < pct`，不引入哈希）。 */
  isFlagOnForUser(key: FeatureFlagKey, userId: number): Promise<boolean>;
  /** 管理后台改值：写库 + 立即失效本进程缓存。 */
  set(key: FeatureFlagKey, value: string, opts?: { now?: number }): Promise<{ key: string; value: string; updatedAt: number }>;
  /** 全量读回（`GET /api/admin/flags`、发布步 8 的初值断言）。 */
  list(): Promise<Array<{ key: string; value: string; updatedAt: number; source: 'db' | 'seed' }>>;
  /** 清 TTL 缓存（测试钩子 / 改值后调用）。 */
  invalidate(key?: FeatureFlagKey): void;
  /** 把缓存条目的"写入时刻"整体前移，模拟 TTL 到期（测试钩子，不改生产逻辑）。 */
  __advanceCacheAge(ms: number): void;
}

interface CacheEntry {
  value: string;
  at: number;
  /** true = 这一行来自 DB；false = 回退到种子 */
  fromDb: boolean;
}

const ALL_KEYS = Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlagKey[];

export function createFeatureFlags(
  db: AppDB,
  opts: { seed?: Partial<Record<FeatureFlagKey, string>>; ttlMs?: number } = {},
): FeatureFlags {
  const ttlMs = opts.ttlMs ?? FLAG_TTL_SECONDS * 1000;
  const seed: Record<FeatureFlagKey, string> = { ...FEATURE_FLAG_DEFAULTS, ...(opts.seed ?? {}) };
  const cache = new Map<FeatureFlagKey, CacheEntry>();

  const seedOf = (key: FeatureFlagKey): string =>
    Object.prototype.hasOwnProperty.call(seed, key) ? seed[key] : FEATURE_FLAG_DEFAULTS[key];

  async function readRow(key: FeatureFlagKey): Promise<CacheEntry> {
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < ttlMs) return hit;
    try {
      const row = await db.flags.get(key);
      if (row) {
        const entry: CacheEntry = { value: row.value, at: now, fromDb: true };
        cache.set(key, entry);
        return entry;
      }
      // 表里没这一行（迁移未跑 / 新键）：按种子补一次缓存，但**不写库**（开关由人改，不由读路径改）
      const entry: CacheEntry = { value: seedOf(key), at: now, fromDb: false };
      cache.set(key, entry);
      return entry;
    } catch (err) {
      console.error('[feature-flags] 读取失败，回退种子值', key, (err as Error).message);
      const stale = cache.get(key);
      const entry: CacheEntry = { value: stale?.fromDb ? stale.value : seedOf(key), at: now, fromDb: false };
      cache.set(key, entry);
      return entry;
    }
  }

  const flags: FeatureFlags = {
    async get(key) {
      return (await readRow(key)).value;
    },
    async isOn(key) {
      return parseFlagValue(await flags.get(key)).on;
    },
    async isFlagOnForUser(key, userId) {
      const value = await flags.get(key);
      const { on, arg } = parseFlagValue(value);
      if (!on) return false;
      // on/off 形态对所有人一致；百分比形态才走尾号放量（`'100'`/`'100%'` 恒 true，见 isFlagBucketOn）
      if (arg === null || /^(on|off)$/i.test(value)) return true;
      return isFlagBucketOn(userId, value);
    },
    async set(key, value, setOpts) {
      const now = setOpts?.now ?? Date.now();
      await db.flags.set(key, value, now);
      cache.delete(key);
      // 写完立刻回填，让本进程"下一次读"就能看到新值（≤60 秒生效判据的本进程侧）
      cache.set(key, { value, at: Date.now(), fromDb: true });
      return { key, value, updatedAt: now };
    },
    async list() {
      let rows: Awaited<ReturnType<AppDB['flags']['list']>> = [];
      try {
        rows = await db.flags.list();
      } catch (err) {
        console.error('[feature-flags] 全量读取失败，回退种子值', (err as Error).message);
      }
      const byKey = new Map<string, (typeof rows)[number]>(rows.map((r) => [r.key, r]));
      const keys: string[] = [...new Set<string>([...ALL_KEYS, ...rows.map((r) => r.key)])];
      return keys
        .sort()
        .map((key) => {
          const row = byKey.get(key);
          return {
            key,
            value: row?.value ?? seedOf(key as FeatureFlagKey),
            updatedAt: row?.updated_at ?? 0,
            source: (row ? 'db' : 'seed') as 'db' | 'seed',
          };
        });
    },
    invalidate(key) {
      if (key) cache.delete(key);
      else cache.clear();
    },
    __advanceCacheAge(ms) {
      for (const [key, entry] of cache) cache.set(key, { ...entry, at: entry.at - ms });
    },
  };
  return flags;
}

/** 解析 `FEATURE_FLAGS_JSON` 种子（坏 JSON 只降级为"全部用默认值"，不阻断启动）。 */
export function parseFlagsSeed(raw: string | undefined): Partial<Record<FeatureFlagKey, string>> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<FeatureFlagKey, string>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' || typeof value === 'number') {
        out[key as FeatureFlagKey] = String(value);
      }
    }
    return out;
  } catch {
    console.error('[feature-flags] FEATURE_FLAGS_JSON 不是合法 JSON，已忽略');
    return {};
  }
}
