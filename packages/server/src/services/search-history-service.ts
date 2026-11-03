/**
 * 最近查询的服务端形状（§10.2 T-11 清单项：`search-history-service.ts` 🆕 "本机 / R-26 同步的读接口
 * （本期仅本机，服务端留形状）"）。
 *
 * ⛔ 本期**不建表**：技术设计 §5 数据面写死"不加 `search_history` 表（P1 R-26）"，
 * PRD 的 R-10 也明示"本期本机存储、跨设备同步为 P1 R-26"。因此本文件交付的是**读接口与其不变量**，
 * 不是一次落库实现：
 *  1. **属主隔离**（R-05②/R-41① 的同一条口径）：分区键 `user:<id>` 只由 `searchHistoryOwner()`
 *     从**已认证**的 userId 生成，任何对外函数都不接受调用方递进来的分区键；
 *     携带他人属主标识的写入 ⇒ `SearchHistoryForbidden`（`FORBIDDEN`，403），
 *     **绝不静默写进别人的分区、绝不 500、绝不猜属主**。
 *  2. **上限**：`RECENT_MAX`（20）与条目形状的唯一真源是 `@tm/shared` 的
 *     `RecentSearchItemSchema` / `RecentSearchListSchema`，本文件不写第二份数字、不自建码表（A-28-4）。
 *  3. **合并语义与两端逐字一致**：去重键 `${word.toLowerCase()}|${direction}`、新→旧、超上限截断 ——
 *     与 `packages/ui/src/hooks/use-recent-searches.ts` 的 `dedupe()` 同一套规则，
 *     这样 R-26 真正接上同步时"本机列表 ∪ 服务端列表"不会出现两套口径的行为差异。
 *
 * 未登录（`userId` 为 null）在服务端**没有分区**：读回空列表、写入不落库，但**不抛 403** ——
 * R-10⑦ 要求未登录时本机存储照常可用，那一份存在宿主的 kv 里，不是错误。
 *
 * 存储实现：`createMemorySearchHistoryStore()` 是**进程内**实现（与 `routes/chat.ts` 的
 * `LEGACY_CLAIMS` 台账同一生命周期量级），只用于把上面三条不变量钉住并在出口轮 / P1 之前保持形状可读；
 * R-26 落表时**只需替换 store 实现**（新增一张按 `user_id` 分区的表 + 一个 `SearchHistoryStore` 适配），
 * 本文件的对外签名一个字都不用改。
 */

import {
  RECENT_MAX,
  RecentSearchItemSchema,
  RecentSearchListSchema,
  errorMessage,
  supplementErrorStatus,
  type RecentSearchItemDto,
} from '@tm/shared';

/* ───────────────────────────── 属主（唯一派生点） ───────────────────────────── */

/** 存储层的分区键前缀：`user:<id>`，与 checkpoint key 的 `${userId}:` 前缀同一族语义。 */
const OWNER_KEY_PREFIX = 'user:';

/**
 * 已认证属主。`key` 是**私有**推导结果：构造一次即可传给本文件的任何读写口，
 * 但对外接口没有一处能传入字符串当分区键 ⇒ 越权在类型上就走不通。
 */
export interface SearchHistoryOwner {
  readonly userId: number;
  readonly key: string;
}

/**
 * 由已认证 userId 派生属主；未登录 / 非法 id ⇒ `null`（不是 403，见文件头 R-10⑦ 的说明）。
 * 这也是"属主只能从鉴权结果来"的唯一入口，命名与 `routes/chat.ts` 的 `checkpointKeyOf()` 对齐。
 */
export function searchHistoryOwner(userId: number | null | undefined): SearchHistoryOwner | null {
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) return null;
  return { userId, key: `${OWNER_KEY_PREFIX}${userId}` };
}

/** 反解分区键（诊断/R-26 落库后的对齐用）；解不出属主 ⇒ `null`，不抛。 */
export function splitSearchHistoryKey(key: string): number | null {
  if (!key.startsWith(OWNER_KEY_PREFIX)) return null;
  const raw = key.slice(OWNER_KEY_PREFIX.length);
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 && String(id) === raw ? id : null;
}

/* ───────────────────────────── 错误（零自建码表） ───────────────────────────── */

/**
 * 跨属主访问。文案与状态都取自 `@tm/shared` 的补充码 `FORBIDDEN`
 * （人话串的唯一真值 = `constants/errors.ts` 里 `TM_ERRORS_SUPPLEMENT.FORBIDDEN.copy`，本文件只经
 * `errorMessage('FORBIDDEN')` 取、不复述字面 —— 复述必再漂，见 A-36-#14①/A-36-10 的教训），
 * 与 `routes/chat.ts`、`trpc/routers/chat.ts` 同一条。
 */
export class SearchHistoryForbidden extends Error {
  /** `FORBIDDEN` 在 `TM_ERRORS_SUPPLEMENT` 里（不在 §4.6 冻结的 `TM_ERROR_CODES`），故按字面量取，与 `routes/chat.ts` 同一条。 */
  readonly code = 'FORBIDDEN' as const;
  readonly status = supplementErrorStatus('FORBIDDEN');
  /**
   * - `foreign-owner`：payload 里的属主标识与当前登录用户不一致（越权写入）。
   * - `unowned-payload`：R-26 的批量上行里缺属主标识，服务端无法判定写进谁的分区。
   */
  readonly reason: 'foreign-owner' | 'unowned-payload';

  constructor(reason: SearchHistoryForbidden['reason']) {
    super(errorMessage('FORBIDDEN'));
    this.name = 'SearchHistoryForbidden';
    this.reason = reason;
  }
}

/** 是否跨属主错误（门面 catch 用，避免 `instanceof` 跨包失效时漏判）。 */
export function isSearchHistoryForbidden(err: unknown): err is SearchHistoryForbidden {
  return err instanceof SearchHistoryForbidden || (err as { name?: string })?.name === 'SearchHistoryForbidden';
}

/**
 * §4.6 响应体：`{ error: 人话, code: tm_code }`。
 * REST 门面若将来挂出来就用这一个出口，别再复制一份字面量。
 */
export function searchHistoryErrorBody(err: SearchHistoryForbidden): {
  status: number;
  body: { error: string; code: string };
} {
  return { status: err.status, body: { error: err.message, code: err.code } };
}

/* ───────────────────────────── 存储面（可替换） ───────────────────────────── */

/**
 * 存储适配面（P1 R-26 落库时唯一要新增实现的地方）。
 * `key` 只可能是 `searchHistoryOwner()` 的产物 ⇒ 实现内部无须再做鉴权。
 */
export interface SearchHistoryStore {
  list(key: string): Promise<RecentSearchItemDto[]>;
  replace(key: string, items: readonly RecentSearchItemDto[]): Promise<void>;
  clear(key: string): Promise<void>;
}

/**
 * 进程内实现：`Map<分区键, 列表>`。
 * ⚠ 本期没有任何路由/过程调用它（`searchHistory.list/clear/push` 是 P1 R-26 的接口清单），
 * 所以生产路径上这张表始终为空 —— 不存在"看起来同步了、其实换了设备就没了"的假承诺。
 */
export function createMemorySearchHistoryStore(): SearchHistoryStore {
  const partitions = new Map<string, RecentSearchItemDto[]>();
  return {
    async list(key) {
      return [...(partitions.get(key) ?? [])];
    },
    async replace(key, items) {
      partitions.set(key, items.map((i) => ({ ...i })));
    },
    async clear(key) {
      partitions.delete(key);
    },
  };
}

/* ───────────────────────────── 纯函数：归一与合并 ───────────────────────────── */

/** 去重键，与 `packages/ui` 的 `useRecentSearches().dedupe` 逐字同规则（R-10⑤）。 */
export function recentSearchKeyOf(item: Pick<RecentSearchItemDto, 'word' | 'direction'>): string {
  return `${item.word.toLowerCase()}|${item.direction}`;
}

/** 单条校验：不合 `RecentSearchItemSchema`（词长 / 方向域 / 首义长度 / at）⇒ `null`，调用侧丢弃。 */
export function normalizeRecentSearchItem(raw: unknown): RecentSearchItemDto | null {
  const parsed = RecentSearchItemSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * 归一：新→旧排序 → 按 `word|direction` 去重（保留最新那条）→ 截到 `RECENT_MAX`。
 * 上限只从 shared 取；截完再用 `RecentSearchListSchema` 复核一次，
 * 这样"≤20"这件事是由契约保证的，不是由本文件的一句 `slice(0, 20)` 保证的。
 */
export function normalizeRecentSearches(raw: readonly unknown[]): RecentSearchItemDto[] {
  const items: RecentSearchItemDto[] = [];
  for (const entry of raw) {
    const item = normalizeRecentSearchItem(entry);
    if (item) items.push(item);
  }
  items.sort((a, b) => b.at - a.at);
  const seen = new Set<string>();
  const deduped: RecentSearchItemDto[] = [];
  for (const item of items) {
    const k = recentSearchKeyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(item);
    if (deduped.length >= RECENT_MAX) break;
  }
  const checked = RecentSearchListSchema.safeParse(deduped);
  return checked.success ? checked.data : deduped.slice(0, RECENT_MAX);
}

/** 两份列表合并（R-26 的多端归并用）：同键取 `at` 更大的那条。 */
export function mergeRecentSearchLists(
  a: readonly RecentSearchItemDto[],
  b: readonly RecentSearchItemDto[],
): RecentSearchItemDto[] {
  const byKey = new Map<string, RecentSearchItemDto>();
  for (const item of [...a, ...b]) {
    const k = recentSearchKeyOf(item);
    const current = byKey.get(k);
    if (!current || current.at < item.at) byKey.set(k, item);
  }
  return normalizeRecentSearches([...byKey.values()]);
}

/* ───────────────────────────── 对外读写口（本期"留形状"） ───────────────────────────── */

/**
 * 读：只返回该属主自己的 ≤20 条；未登录 ⇒ 空列表（不共享、不回落）。
 * 任何实现异常都收敛成空列表 —— 这条口永远不 500（R-05 的同一条 fail 姿态）。
 */
export async function listRecentSearches(
  store: SearchHistoryStore,
  owner: SearchHistoryOwner | null,
): Promise<RecentSearchItemDto[]> {
  if (!owner) return [];
  try {
    return normalizeRecentSearches(await store.list(owner.key));
  } catch {
    return [];
  }
}

/**
 * 记一条（R-10⑤：同词同方向上移到最前，不产生第二条）。
 * 未登录 ⇒ 原样返回当前（空）视图且不写库；返回的是"宿主应当展示的那份"，便于上层直接复用。
 */
export async function recordRecentSearch(
  store: SearchHistoryStore,
  owner: SearchHistoryOwner | null,
  item: Omit<RecentSearchItemDto, 'at'> & { at?: number },
  now: () => number = Date.now,
): Promise<RecentSearchItemDto[]> {
  const normalized = normalizeRecentSearchItem({
    word: item.word,
    direction: item.direction,
    gloss: item.gloss ?? '',
    at: item.at ?? now(),
  });
  if (!normalized) return owner ? await listRecentSearches(store, owner) : [];
  const current = await listRecentSearches(store, owner);
  if (!owner) return current;
  const next = normalizeRecentSearches([normalized, ...current]);
  await store.replace(owner.key, next);
  return next;
}

/**
 * R-26 的批量上行形状：客户端把自己那份推上来。
 * `payload.ownerId` 若存在且与当前登录用户不同 ⇒ 403（绝不写进别人的分区）；
 * 缺 `ownerId` 也 403（无法判定归属就不动，宁可拒也不猜）。
 * 合并语义 = 同键取新，再统一归一到 ≤20。
 */
export async function pushRecentSearches(
  store: SearchHistoryStore,
  owner: SearchHistoryOwner | null,
  payload: { items?: unknown; ownerId?: unknown },
): Promise<RecentSearchItemDto[]> {
  if (!owner) throw new SearchHistoryForbidden('unowned-payload');
  if (payload.ownerId === undefined || payload.ownerId === null) {
    throw new SearchHistoryForbidden('unowned-payload');
  }
  if (Number(payload.ownerId) !== owner.userId) {
    throw new SearchHistoryForbidden('foreign-owner');
  }
  const incoming = Array.isArray(payload.items) ? payload.items : [];
  const current = await listRecentSearches(store, owner);
  const next = mergeRecentSearchLists(current, normalizeRecentSearches(incoming));
  await store.replace(owner.key, next);
  return next;
}

/** 清空（R-10④ 的"清空"在服务端那侧的对应动作；二次确认在 UI 侧，不在这里）。 */
export async function clearRecentSearches(
  store: SearchHistoryStore,
  owner: SearchHistoryOwner | null,
): Promise<void> {
  if (!owner) return;
  await store.clear(owner.key);
}
