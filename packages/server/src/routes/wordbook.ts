/**
 * 单词本路由（REST 门面）
 *
 * §4.2 收敛规则：本文件只做"路径声明 + 取数 + 转调 service + 响应组装"，判定逻辑全在
 * `services/wordbook-service.ts`（与 tRPC `wordbook.*` 同一个实例），merge 算法在 `services/wordbook-merge.ts`。
 *
 * 兼容面（PRD §6.2 红线接口清单，T-21 的 `legacy-apk` 快照逐字比对这些）：
 * - `GET /api/wordbook` → `{ data: WordbookEntry[] }`，形状一字未动，只多了一条"按 `addedAt` 稳定排序"；
 * - `PUT /api/wordbook` → 仍收 `{ data: [...] }`、响应仍 `{ ok: true }`（判据⑥），
 *   内部不再整表覆盖（改动前 `db.wordbooks.saveData` 无条件覆写 = 丢词根因），转 service 做字段级 merge；
 * - 🆕 `POST /api/wordbook/push` / `GET /api/wordbook/pull`（§4.4.1），旧 APK 永不触碰。
 *
 * 装配（T-07 的 `app.ts`）：`createWordbookRouter(db)` 调用形状不变；
 * 想复用同一份 `feature-flags` / 缓存实例时传第二个参数 `deps`（可选，不传也能跑）。
 */

import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { WordbookPushInputSchema, WORDBOOK_PROGRESS_QUERY, WORDBOOK_PROGRESS_QUERY_ON } from '@tm/shared';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';
import type { FeatureFlags } from '../services/feature-flags.js';
import {
  createWordbookService,
  logWordbookInvalidEntry,
  parseLegacyArray,
  wordbookConsoleLog,
  wordbookInvalidEntryBody,
  wordbookPushIssueCause,
  wordbookRejectionBody,
  type WordbookModeLog,
  type WordbookService,
} from '../services/wordbook-service.js';

export interface WordbookRouterDeps {
  flags?: FeatureFlags;
  /**
   * 只需要 `invalidate`（写后把 `cacheKeys.wordbook(userId)` 清掉），所以按结构类型收，
   * 与 `WordbookServiceDeps.cache` 同一口径 —— 生产装配传 `CacheService` 实例照样满足。
   */
  cache?: { invalidate(key: string): Promise<void> | void };
  now?: () => number;
  /**
   * §5.4-2 理由②：坏 JSON 与词名非法**共用**一条码、同一句人话，成因差异只能进日志 ——
   * 本注入点就是那条日志（同时透传给 service，两侧共用一份通道与格式）。
   */
  log?: WordbookModeLog;
}

/**
 * `c.req.json()` 解析失败时的哨兵值（区别于"JSON 合法但字段不对"）。
 * 带一个契约里不存在的键 ⇒ 任何入参关都判它失败，只用于把成因钉成 `malformed_json`。
 */
const MALFORMED_JSON = { __malformedJson: true } as const;

export function createWordbookRouter(db: AppDB, deps: WordbookRouterDeps = {}): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();
  const svc: WordbookService = createWordbookService({
    db,
    flags: deps.flags,
    cache: deps.cache,
    now: deps.now,
    log: deps.log,
  });
  /** 门面自己那两道关的日志通道（未注入即用 service 同一份缺省实现，不写第二份格式）。 */
  const log: WordbookModeLog = deps.log ?? wordbookConsoleLog;

  r.get('/api/wordbook', auth, async (c) => {
    // E4b3b 件A（A-87 #325）：`?with_progress=1` 才 opt-in 进度三键（additive）。
    // 缺省 / `0` / 任何其余取值都走 `read()` —— 缺省响应逐字节不变（§6.2-1 兼容快照红线）。
    const progressOn = c.req.query(WORDBOOK_PROGRESS_QUERY) === WORDBOOK_PROGRESS_QUERY_ON;
    const entries = progressOn
      ? await svc.readWithProgress(c.get('userId'))
      : await svc.read(c.get('userId'));
    return c.json({ data: entries });
  });

  r.put('/api/wordbook', auth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { data?: unknown };
    const parsed = parseLegacyArray(body, Date.now());
    if (!parsed.ok) {
      // 旧 PUT 的载荷形状问题在门面这一侧判（没进 service）⇒ 成因由门面记：
      // `data` 不是数组 = `malformed_json`，词条不合格 = `invalid_word_name`（`parseLegacyArray` 已分好）。
      if (parsed.rejection.kind === 'invalid-entry') {
        logWordbookInvalidEntry(log, 'PUT /api/wordbook', parsed.rejection.cause, {
          userId: c.get('userId'),
          count: parsed.rejection.words.length,
        });
      }
      const { status, body: payload } = wordbookRejectionBody(parsed.rejection);
      return c.json(payload, status as ContentfulStatusCode);
    }
    const outcome = await svc.replaceArray(c.get('userId'), parsed.entries);
    if (outcome.kind !== 'ok') {
      // service 已经记过一条（含 `cause`），门面不重复记 —— 见 `wordbook-service.shapeRejection`。
      const { status, body: payload } = wordbookRejectionBody(outcome);
      return c.json(payload, status as ContentfulStatusCode);
    }
    return c.json({ ok: true });
  });

  r.post('/api/wordbook/push', auth, async (c) => {
    const userId = c.get('userId');
    const raw = await c.req.json().catch(() => MALFORMED_JSON);
    const parsed = WordbookPushInputSchema.safeParse(raw);
    if (!parsed.success) {
      // §5.4-2：坏 JSON 与词名非法**共用** `INVALID_WORDBOOK_ENTRY` 同一句人话（不拆第二条码、不得无码），
      // 成因只写进日志。走 `wordbookInvalidEntryBody()` 是为了与 service 那一侧、与 tRPC 面同一出口。
      const cause = raw === MALFORMED_JSON ? ('malformed_json' as const) : wordbookPushIssueCause(parsed.error.issues);
      logWordbookInvalidEntry(log, 'POST /api/wordbook/push', cause, {
        userId,
        issues: parsed.error.issues.length,
      });
      const { status, body } = wordbookInvalidEntryBody();
      return c.json(body, status as ContentfulStatusCode);
    }
    const outcome = await svc.push(userId, parsed.data);
    if (outcome.kind !== 'ok') {
      const { status, body } = wordbookRejectionBody(outcome);
      return c.json(body, status as ContentfulStatusCode);
    }
    return c.json({
      ok: true,
      version: outcome.version,
      merged: outcome.merged,
      added: outcome.added,
      removed: outcome.removed,
    });
  });

  r.get('/api/wordbook/pull', auth, async (c) => {
    // `?since=` 是 §4.4.1 给增量分支留的位置；`WordbookPullResultSchema` 只定义了全量形状，
    // 所以本期恒回全量（客户端 diff 即可），since 暂不参与判定 —— 见报告偏差 D-3。
    const snapshot = await svc.snapshot(c.get('userId'));
    return c.json(snapshot);
  });

  return r;
}
