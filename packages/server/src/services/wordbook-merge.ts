/**
 * T-09 · 词本**字段级 merge / 墓碑**的纯函数层（§4.4.2 合并规则表的逐行代码化）。
 *
 * 本文件**不做任何 IO、不读开关、不碰数据库**：全部入参出参都是普通 JSON，
 * 所以它是判据①②③④⑥⑦⑧ 的单测靶子（`test/unit/wordbook-merge.spec.ts`），
 * 也是 T-21 抽样比对脚本（判据⑧）离线复算"整数组结果 vs 增量结果"的同一套算法 ——
 * 两边跑的是同一个纯函数，diff 才有意义。
 *
 * 三条红线（写在这里，`wordbook-service.ts` 与两个门面都不许绕过）：
 * 1. `wordbooks.data` 仍是 `WordbookEntry[]` 整数组，**字段名与语义一字不动**（R-03⑦ / PRD §6.1-3）；
 *    本文件唯一新增的是**可选键** `updatedAt`（M6 / `WORDBOOK_ENTRY_OPTIONAL_KEYS`）。
 * 2. **未知键原样保留**：合并只"在新增键上前进"，绝不重排、绝不丢弃不认识的键（前向兼容）。
 *    实现上靠两件事：结果对象以 `{...base}` 起头（键序 = 存量键序），未知键只在
 *    "来方的 `updatedAt` 更新"时覆盖，其余一律不动。
 * 3. **没有任何写路径**：落库只在 `wordbook-service` 里经 `db.wordbooks.applyEntries/applySync`
 *    （两者都是单事务），§4.4.3 "落库只有一条路径"。
 */

import {
  WORDBOOK_MAX_ENTRIES,
  WORDBOOK_PUSH_BATCH_MAX,
  WORDBOOK_TOMBSTONE_RETENTION_DAYS,
  type WordbookEntry,
} from '@tm/shared';

/** 墓碑集合：词名（`wordKeyOf` 归一后）→ 删除时刻（ms）。序列化后落 `wordbooks.tombstones`。 */
export type Tombstones = Record<string, number>;

/**
 * §4.4.2 的已知键：除它们之外的键都是"未来版本才会加的未知键"，
 * 合并时只按 `updatedAt` 较新者胜，**永不删除、永不改名**（红线 2）。
 */
const KNOWN_KEYS: ReadonlySet<string> = new Set(['word', 'addedAt', 'lastReview', 'reviewCount', 'updatedAt']);

/** 条目上唯一新增的可选键（M6，`@tm/shared/schema` 的 `WORDBOOK_ENTRY_OPTIONAL_KEYS`）。 */
export const ENTRY_UPDATED_AT_KEY = 'updatedAt';

/* ───────────────────────────── 取数小工具（全部宽容取值） ───────────────────────────── */

const asRecord = (entry: WordbookEntry): Record<string, unknown> => entry as unknown as Record<string, unknown>;

/** 非负整数字段；缺省/非法一律按"没有这个字段"处理（返回 undefined），绝不猜测。 */
export function numField(entry: WordbookEntry, key: string): number | undefined {
  const raw = asRecord(entry)[key];
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : undefined;
}

/** 词名归一键（与存量 `add`/`PUT` 的 `trim().toLowerCase()` 口径一致）。 */
export function wordKeyOf(entry: Pick<WordbookEntry, 'word'> | null | undefined): string {
  return typeof entry?.word === 'string' ? entry.word.trim().toLowerCase() : '';
}

/** 入参词名的同一归一（`removedWords` 收的是裸字符串）。 */
export function normalizeWordKey(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

/** 本条目的 `updatedAt`；缺省 = 0（存量数据没有这个键，M6 之前写的都算"最旧"）。 */
export function updatedAtOf(entry: WordbookEntry): number {
  return numField(entry, ENTRY_UPDATED_AT_KEY) ?? 0;
}

/**
 * 判定"这条数据有多新"的时间：有 `updatedAt` 用它，否则退到 `addedAt`/`lastReview` 的较晚者。
 * 旧客户端只发 `{word, addedAt}`（`mobile-memory/assets/api.js:180`），所以必须有这个退化，
 * 否则 off 态的整数组覆盖会把"对方刚加的词"当成旧数据洗掉。
 */
export function effectiveTimeOf(entry: WordbookEntry): number {
  const explicit = updatedAtOf(entry);
  if (explicit > 0) return explicit;
  return Math.max(numField(entry, 'addedAt') ?? 0, numField(entry, 'lastReview') ?? 0);
}

/** 数组里"最新的那一条"的时间（off 态整数组覆盖的保护基线）。 */
export function maxEffectiveTime(entries: readonly WordbookEntry[]): number {
  let max = 0;
  for (const entry of entries) max = Math.max(max, effectiveTimeOf(entry));
  return max;
}

/* ───────────────────────────────── 墓碑序列化 ───────────────────────────────── */

/**
 * `wordbooks.tombstones` 的宽容解析：列默认 `'[]'`（M4），语义却是"词名→删除时间戳"的映射，
 * 所以 `'[]'` / `'{}'` / `null` / 坏 JSON 一律读成"无墓碑"，绝不抛错（读路径不许因脏数据 500）。
 */
export function parseTombstones(raw: unknown): Tombstones {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Tombstones = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const k = normalizeWordKey(key);
    const at = typeof v === 'string' ? Number(v) : v;
    if (k && typeof at === 'number' && Number.isFinite(at) && at >= 0) out[k] = Math.trunc(at);
  }
  return out;
}

/** 确定性序列化（键升序）：同一集合两次序列化必得同一串 → `applySync` 的"未变即不 ++"才成立。 */
export function serializeTombstones(tombstones: Tombstones): string {
  const keys = Object.keys(tombstones).sort();
  const out: Tombstones = {};
  for (const key of keys) out[key] = tombstones[key] as number;
  return JSON.stringify(out);
}

/**
 * 落库用的墓碑串：两侧列默认都是 `'[]'`（M4），语义却是"词名→时间戳"的映射。
 * 所以"空集合"要沿用库里原有那一串（`'[]'` 或 `'{}'`），否则一次本来无变化的 push
 * 会因为 `'[]' → '{}'` 这种纯串差把版本 +1，判据③"重放后 version 不变"当场破功。
 */
export function tombstonesJsonFor(next: Tombstones, rawExisting: unknown): string {
  if (Object.keys(next).length > 0) return serializeTombstones(next);
  const parsedExisting = parseTombstones(rawExisting);
  if (Object.keys(parsedExisting).length > 0) return serializeTombstones(next); // 这次清空了
  return typeof rawExisting === 'string' && rawExisting.length > 0 ? rawExisting : '[]';
}

/** §4.4.2 压缩窗口：墓碑保留 30 天，过期的不再参与"防复活"判断。 */
export function pruneTombstones(
  tombstones: Tombstones,
  now: number,
  retentionDays: number = WORDBOOK_TOMBSTONE_RETENTION_DAYS,
): { tombstones: Tombstones; dropped: number } {
  const horizon = now - Math.max(0, retentionDays) * 86_400_000;
  const out: Tombstones = {};
  let dropped = 0;
  for (const [key, at] of Object.entries(tombstones)) {
    if (at < horizon) dropped += 1;
    else out[key] = at;
  }
  return { tombstones: out, dropped };
}

/** 墓碑是否已被压缩掉（压缩过 → 增量客户端只能拿全量重放，§4.4.2 压缩窗口行）。 */
export function isPruned(since: number | undefined, tombstones: Tombstones): boolean {
  if (since === undefined || since <= 0) return false;
  const horizonValues = Object.values(tombstones);
  return horizonValues.length === 0 ? false : Math.min(...horizonValues) > since;
}

/* ───────────────────────────── 单条字段的合并（判据②） ───────────────────────────── */

const sameValue = (a: unknown, b: unknown): boolean =>
  a === b || (a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b));

/**
 * "这批写入没改变数组"的判定口径：**同 JSON**（不只是同引用）。
 * `applyOps` 里同引用必然同 JSON；`projectArrayOverwrite` 是按来方数组重建的，
 * 只有 JSON 口径才能表达"重放同一份 PUT → 落库串不变 → 版本不 ++"（判据③）。
 */
const sameEntries = (a: readonly WordbookEntry[], b: readonly WordbookEntry[]): boolean =>
  a === b || (a.length === b.length && JSON.stringify(a) === JSON.stringify(b));

export interface EntryMerge {
  entry: WordbookEntry;
  /** false = 合并后与入参 `base` **完全同一对象**（引用相等）→ 数组未变 → 版本不 ++。 */
  changed: boolean;
}

/**
 * R-03③ / §4.4.2 的字段级合并：
 * `addedAt` 取**较早**、`lastReview` 取**较晚**、`reviewCount` 取 **max**（后写绝不覆盖前一次的评分/次数），
 * 其余键（含未知键）按 `updatedAt` 较新者胜出；无任何字段真的变化时返回**同一个对象引用**。
 */
export function mergeEntry(base: WordbookEntry, incoming: WordbookEntry): EntryMerge {
  const out = { ...asRecord(base) };
  let changed = false;
  const set = (key: string, value: unknown): void => {
    if (sameValue(out[key], value)) return;
    out[key] = value;
    changed = true;
  };

  const minOf = (key: string): void => {
    const next = numField(incoming, key);
    if (next === undefined) return;
    const cur = numField(base, key);
    set(key, cur === undefined ? next : Math.min(cur, next));
  };
  const maxOf = (key: string): void => {
    const next = numField(incoming, key);
    if (next === undefined) return;
    const cur = numField(base, key);
    set(key, cur === undefined ? next : Math.max(cur, next));
  };
  minOf('addedAt');
  maxOf('lastReview');
  maxOf('reviewCount');

  if (updatedAtOf(incoming) > updatedAtOf(base)) {
    for (const [key, value] of Object.entries(asRecord(incoming))) {
      if (KNOWN_KEYS.has(key)) continue;
      set(key, value);
    }
  }

  if (!changed) return { entry: base, changed: false };
  const newest = Math.max(updatedAtOf(base), updatedAtOf(incoming));
  if (newest > 0) set(ENTRY_UPDATED_AT_KEY, newest);
  return { entry: out as WordbookEntry, changed: true };
}

/* ───────────────────────────── 一批操作的合并（判据①③④⑦） ───────────────────────────── */

/** `wordbook.push` / `PUT` / `add` / `remove` 共用的操作集合。 */
export interface WordbookOps {
  /** upsert 集合（同词按 `mergeEntry` 前进，新词追加到数组尾部）。 */
  entries?: readonly WordbookEntry[];
  /** 删除集合（词名即键）。 */
  removedWords?: readonly string[];
}

export interface MergeOptions {
  /** 落库时刻（ms）：新词的 `addedAt` 补值与墓碑时间戳都用它。 */
  now: number;
  /**
   * true = 增量模式（写/读墓碑）；false = 开关 off（§4.4.3：墓碑不参与，
   * 否则"关掉开关反而看不见词"）。
   */
  tombstonesEnabled: boolean;
  /** 现有墓碑（off 态传 `{}`）。 */
  tombstones?: Tombstones;
  /**
   * true = 增量写入路径（`push` / on 态 `PUT`）：来方没带 `updatedAt` 的条目补上本次落库时刻。
   * 这一条是 §6.4-5-3 保护生效的前提 —— 只有带 `updatedAt` 的条目才会在"开关关掉后被整数组
   * 覆盖"时幸存；off 态（整数组语义）绝不能补，否则旧 APK 的"数组里没有 = 已删除"会永久失效。
   */
  stampUpdatedAt?: boolean;
}

export interface MergeResult {
  entries: WordbookEntry[];
  tombstones: Tombstones;
  added: number;
  merged: number;
  removed: number;
  /** 本次结果与入参数组**逐元素同引用且墓碑串未变** → `applyEntries/applySync` 不 ++（判据③ 幂等）。 */
  unchanged: boolean;
  /** 因"用户重新收藏"而清掉的墓碑数（R-16①：星标可以再加回来）。 */
  revived: number;
}

/**
 * 一批 ops 作用在 base 数组上（§4.4.2 全表的唯一实现）。
 * 顺序固定为 **先删后加**：同一批里"又删又加同一个词"按 `updatedAt` 与本次删除时刻裁决，
 * 与旧 APK 的本地队列语义一致（`api.js:178-183` 也是先合并 add/remove/clear 再整体 PUT）。
 */
export function applyOps(base: readonly WordbookEntry[], ops: WordbookOps, opts: MergeOptions): MergeResult {
  const now = Math.trunc(opts.now);
  const tombstones: Tombstones = { ...(opts.tombstones ?? {}) };
  const entries: WordbookEntry[] = base.slice();
  const pos = new Map<string, number>();
  entries.forEach((entry, i) => {
    const key = wordKeyOf(entry);
    if (key && !pos.has(key)) pos.set(key, i);
  });
  const dead = new Set<string>();
  let added = 0;
  let merged = 0;
  let removed = 0;
  let revived = 0;
  const baselineTombstoneJson = serializeTombstones(tombstones);

  for (const raw of ops.removedWords ?? []) {
    const key = normalizeWordKey(raw);
    if (!key || dead.has(key)) continue;
    if (pos.has(key)) {
      dead.add(key);
      removed += 1;
    }
    if (!opts.tombstonesEnabled) continue;
    // 已有墓碑保持**最早**那条：重放同一份删除不刷新时间戳，否则幂等性会被"串变了"打破
    if (tombstones[key] === undefined) tombstones[key] = now;
  }

  for (const raw of ops.entries ?? []) {
    const incoming = opts.stampUpdatedAt ? withUpdatedAt(raw, now) : raw;
    const key = wordKeyOf(incoming);
    if (!key) continue;
    const deletedAt = opts.tombstonesEnabled ? tombstones[key] : undefined;
    if (deletedAt !== undefined) {
      if (effectiveTimeOf(incoming) <= deletedAt) continue; // §4.4.2：不再复活
      delete tombstones[key]; // updatedAt 晚于删除时刻 = 用户重新收藏 → 清墓碑并保留
      revived += 1;
    }
    const at = pos.get(key);
    if (at === undefined) {
      const fresh = normalizeEntry(incoming, now);
      entries.push(fresh);
      pos.set(key, entries.length - 1);
      dead.delete(key);
      added += 1;
      continue;
    }
    if (dead.has(key)) {
      dead.delete(key); // 同批"先删后加"：后加的更新，墓碑已在上面按需清掉
      pos.set(key, at);
    }
    const current = entries[at];
    if (!current) continue;
    const next = mergeEntry(current, normalizeEntry(incoming, now));
    if (next.changed) {
      entries[at] = next.entry;
      merged += 1;
    }
  }

  const out = dead.size > 0 ? entries.filter((entry) => !dead.has(wordKeyOf(entry))) : entries;
  // 任何一处改动都会落到四个计数器上，所以"全 0 + 墓碑串未变"= 整批幂等（O(1)，不必再全量比 JSON）
  const unchanged =
    added === 0 && merged === 0 && removed === 0 && revived === 0 && serializeTombstones(tombstones) === baselineTombstoneJson;

  return { entries: out, tombstones, added, merged, removed, revived, unchanged };
}

/** 新词入库前的最小加工：词名归一 + `addedAt` 补值（与旧 `PUT`/`add` 行为一字不差）。 */
export function normalizeEntry(incoming: WordbookEntry, now: number): WordbookEntry {
  const record = { ...asRecord(incoming) };
  const key = wordKeyOf(incoming);
  record.word = typeof incoming.word === 'string' ? incoming.word.trim().toLowerCase() : key;
  if (numField(incoming, 'addedAt') === undefined) record.addedAt = now;
  return record as unknown as WordbookEntry;
}

/**
 * 增量写入路径的 `updatedAt` 补值：来方没带（或带得更旧，如客户端时钟落后）就用本次落库时刻。
 * 已带更新的时间戳原样保留（客户端自己知道"这次编辑发生在何时"，服务端 `now` 只是下界）。
 */
export function withUpdatedAt(entry: WordbookEntry, now: number): WordbookEntry {
  const cur = updatedAtOf(entry);
  if (cur >= now) return entry;
  return { ...asRecord(entry), [ENTRY_UPDATED_AT_KEY]: now } as unknown as WordbookEntry;
}

/* ───────────────────── 两种模型对同一批写入的投影（判据④⑥⑧ 的比对基线） ───────────────────── */

/**
 * **整数组覆盖语义**（开关 off / 旧 `PUT`）：客户端发来的数组就是成员与顺序的真相。
 *
 * 唯一的安全网来自 PRD §6.4-5-3 末句："已经按增量写入的词…被旧模型整数组写覆盖时保留
 * `updated_at` 较新者"。落点就在此处：**只保护带 `updatedAt` 的条目**（只有增量路径写过这个键，
 * 所以旧 APK 自己维护的词不会被"复活"，删词照旧生效），且**空数组 = 用户主动清空**
 * （`wordbook.clear` / 旧 APK 的 `clear` 队列项，`api.js:182`）不做任何保留。
 */
export function projectArrayOverwrite(
  server: readonly WordbookEntry[],
  incoming: readonly WordbookEntry[],
  now: number,
): MergeResult {
  if (incoming.length === 0) {
    return {
      entries: [],
      tombstones: {},
      added: 0,
      merged: 0,
      removed: server.length,
      revived: 0,
      unchanged: server.length === 0,
    };
  }
  const floor = maxEffectiveTime(incoming);
  const next: WordbookEntry[] = [];
  const seen = new Set<string>();
  let added = 0;
  let removed = 0;

  // 1) 来方数组就是成员与顺序的真相（去重保留首次出现）
  for (const raw of incoming) {
    const entry = normalizeEntry(raw, now);
    const key = wordKeyOf(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(entry);
    if (!server.some((s) => wordKeyOf(s) === key)) added += 1;
  }
  // 2) 服务端有、来方数组没有的词：默认就是"客户端已删除"→ 覆盖掉；
  //    只保留 §6.4-5-3 的那一类（带 `updatedAt` 且比来方数组里最新的一条更新）
  for (const entry of server) {
    const key = wordKeyOf(entry);
    if (!key || seen.has(key)) continue;
    if (updatedAtOf(entry) > floor) {
      seen.add(key);
      next.push(entry);
    } else {
      removed += 1;
    }
  }

  const unchanged = sameEntries(next, server);
  return { entries: next, tombstones: {}, added, merged: 0, removed, revived: 0, unchanged };
}

/**
 * **增量语义**（开关 on）对"一次整数组 PUT"的投影：与最新全量做字段级 merge、
 * 数组里没出现的词**不视为删除**（§4.4.1："而非整表覆盖"；删除的唯一显式出口是
 * `push.removedWords` 与 `wordbook.remove`）。判据① 就是靠这一条成立的。
 */
export function projectArrayMerge(
  server: readonly WordbookEntry[],
  incoming: readonly WordbookEntry[],
  now: number,
  tombstones: Tombstones = {},
): MergeResult {
  return applyOps(server, { entries: incoming }, { now, tombstonesEnabled: true, tombstones, stampUpdatedAt: true });
}

/* ─────────────────────────────── 读路径（判据④ / §6.2） ─────────────────────────────── */

/**
 * `GET /api/wordbook` 的顺序：按 `addedAt` **升序**稳定排序（§6.2 漂移表第 1 行，
 * 消除 pg `JSONB` 重排 key 造成的"顺序变了"伪 diff）。缺 `addedAt` 的条目按 0 排最前，
 * 同值保持存量数组里的相对次序（`Array.prototype.sort` 在 V8 里是稳定的）。
 */
export function sortForRead(entries: readonly WordbookEntry[]): WordbookEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (numField(a.entry, 'addedAt') ?? 0) - (numField(b.entry, 'addedAt') ?? 0) || a.index - b.index)
    .map((wrapped) => wrapped.entry);
}

/**
 * 墓碑过滤（只在增量模式参与，§4.4.3：off 态退化为不过滤）。
 * 条目时间 `<=` 删除时刻 → 已删；`>` 删除时刻 → 用户重新收藏，保留。
 */
export function filterReadable(
  entries: readonly WordbookEntry[],
  tombstones: Tombstones,
  incremental: boolean,
): WordbookEntry[] {
  if (!incremental) return entries.slice();
  return entries.filter((entry) => {
    const deletedAt = tombstones[wordKeyOf(entry)];
    return deletedAt === undefined || effectiveTimeOf(entry) > deletedAt;
  });
}

/* ───────────────────────────── 入参与上限校验（§4.4.2 大小上限行） ───────────────────────────── */

export interface SizeViolation {
  kind: 'push-batch' | 'total';
  count: number;
  limit: number;
}

/**
 * §4.4.2 大小上限行的唯一实现（两种模式共用）：
 * - 单次 `push` 的 entries / removedWords 各自 ≤ `WORDBOOK_PUSH_BATCH_MAX`（500）；
 * - 落库后的总条数 ≤ `WORDBOOK_MAX_ENTRIES`（20000）。
 *
 * 命中即由门面回 `WORDBOOK_TOO_LARGE`（§4.6，400）；`kind` 只用于日志定位，不进响应。
 */
export function sizeViolation(counts: {
  entries?: number;
  removedWords?: number;
  totalAfter?: number;
  batchLimit?: number;
  totalLimit?: number;
}): SizeViolation | undefined {
  const batchLimit = counts.batchLimit ?? WORDBOOK_PUSH_BATCH_MAX;
  for (const count of [counts.entries, counts.removedWords]) {
    if (count !== undefined && count > batchLimit) return { kind: 'push-batch', count, limit: batchLimit };
  }
  const totalLimit = counts.totalLimit ?? WORDBOOK_MAX_ENTRIES;
  if (counts.totalAfter !== undefined && counts.totalAfter > totalLimit) {
    return { kind: 'total', count: counts.totalAfter, limit: totalLimit };
  }
  return undefined;
}

/**
 * 词名非法（空 / 纯空格 / 非字符串）的收集口 —— 命中即由调用方走 §5.4-2 那**一条** 400：
 * `INVALID_WORDBOOK_ENTRY` + 定稿句，坏 JSON 与词名非法共用、不拆第二条码（A-37 §八-31/32，
 * 接线在 `wordbook-service.ts` 的 `wordbookInvalidEntryBody()`）。
 * 旧注释写"§4.6 里没有对应码，见报告待裁决 P-2"：该码现已登记进 `TM_ERRORS_SUPPLEMENT`（`errors.ts:234`），
 * P-2 已闭合。⚠ 本函数只做"去空白后为空"这一判据，**不**管长度（`LEGACY_WORD_MAX_LENGTH` 的长度关在
 * `parseLegacyArray`、契约的 64 字关在 `WordbookPushInputSchema`，两处都在本文件外）。
 */
export function invalidWordKeys(entries: readonly WordbookEntry[]): string[] {
  return entries.filter((entry) => wordKeyOf(entry).length === 0).map((entry) => String(asRecord(entry).word ?? ''));
}
