/**
 * T-09 · 词本域 service（§4.2 收敛规则：REST 与 tRPC 两个门面都只转调本文件）。
 *
 * 本文件是 R-03 的**唯一裁决点**（§4.4.4 调用点行："只在 `wordbook-service.apply/pull` 内部各一处"）：
 * - 开关 `wordbookIncremental` 只在这里读（经 `services/feature-flags.ts`，不复制判定逻辑）；
 * - 落库只有一条路径（§4.4.3）：`db.wordbooks.applyEntries` / `applySync`，两者都是单事务；
 * - merge / 墓碑 / 排序的算法全在 `wordbook-merge.ts`（纯函数），这里只做取数、校验、落库、组装响应。
 *
 * 门面侧不许出现的三件事（`tools/boundaries.mjs` 的 thin-facade + `--copy` 两条都会抓）：
 * 判定逻辑、SQL/`db/**` 直连、字面量文案。错误码与文案一律走 `@tm/shared` 的 `TM_ERRORS` / `tmErrorBody`。
 *
 * ⚠ 与旧实现的两处刻意一致（§6.2 兼容矩阵，不许"顺手改好"）：
 * 1. `PUT /api/wordbook` 的条目校验口径（词名 ≤100 字符、`addedAt` 非数字则取当前时刻、上限 20000）
 *    与 `routes/wordbook.ts` 改动前逐字相同 —— `WORD_MAX_LENGTH=64` 只用于**新**端点（push/pull）；
 * 2. `PUT` 不删 FSRS 卡片（只有 tRPC `wordbook.remove`/`clear` 删），这是改动前的行为差异，保留。
 */

import {
  TM_ERROR_CODES,
  TM_ERRORS,
  WORDBOOK_MAX_ENTRIES,
  WORDBOOK_PROGRESS_KEYS,
  WORDBOOK_PUSH_BATCH_MAX,
  errorMessage,
  supplementErrorStatus,
  type TmErrorSupplementCode,
  type WordbookEntry,
  type WordbookEntryWithProgress,
  type WordbookPullResultDto,
  type WordbookPushInputDto,
} from '@tm/shared';
import type { AppDB } from '../db/types.js';
import { cardFromJson, type Card } from './fsrs.js';
import { createFeatureFlags, type FeatureFlags } from './feature-flags.js';
import { cacheKeys } from './cache.js';
import {
  applyOps,
  filterReadable,
  invalidWordKeys,
  isPruned,
  normalizeEntry,
  parseTombstones,
  projectArrayMerge,
  projectArrayOverwrite,
  pruneTombstones,
  serializeTombstones,
  sizeViolation,
  sortForRead,
  tombstonesJsonFor,
  wordKeyOf,
  type SizeViolation,
  type Tombstones,
} from './wordbook-merge.js';

/** §4.4.3 的"退化为整数组覆盖语义"埋点 + §4.4.4 的命中/未命中埋点。 */
export type WordbookModeLog = (level: 'info' | 'warn', event: string, meta: Record<string, unknown>) => void;

export interface WordbookServiceDeps {
  db: AppDB;
  /** 缺省时按同一 `AppDB` 惰性建一份 `feature-flags`（WeakMap 记忆）—— 仍然是唯一入口，不复制判定。 */
  flags?: FeatureFlags;
  /** 只用来失效 `cacheKeys.wordbook(userId)`（tRPC `list` 的 30 秒缓存）。缺省即跳过。 */
  cache?: { invalidate(key: string): Promise<void> | void };
  /** 注入时钟（测试用）。生产不传。 */
  now?: () => number;
  log?: WordbookModeLog;
  /** 墓碑压缩窗口覆写（测试用；默认取 `WORDBOOK_TOMBSTONE_RETENTION_DAYS`）。 */
  tombstoneRetentionDays?: number;
}

/* ───────────────────────────── 结果形状（门面只做映射，不做判定） ───────────────────────────── */

/** 409 `WORDBOOK_STALE` 的载荷：服务端最新 `version` + 全量，客户端据此静默重放（R-03④）。 */
export interface WordbookStale {
  kind: 'stale';
  version: number;
  server: { updatedAt: number; entries: WordbookEntry[] };
  /** §4.4.1：墓碑已被压缩 → 只能重放全量（客户端必须丢弃本地待发送队列里的删除项）。 */
  pruned: boolean;
}

/**
 * PRD §5.4-2 理由② 的**成因**枚举（"可辨性由日志承担、不由错误码承担"）。
 *
 * 两种成因共用同一条 `INVALID_WORDBOOK_ENTRY`（400）与同一句定稿文案，**不拆第二条码**
 * （§5.4-2 PM 决定 / A-32-8 P-2 / A-37 §八-32）；本枚举只出现在日志参数里，
 * 绝不出现在响应体里（响应体恒两键 `{error, code}`）。
 * 键名 `cause` 沿用 PRD 原措辞。
 */
export type WordbookRejectCause = 'malformed_json' | 'invalid_word_name';

export type WordbookRejection =
  | WordbookStale
  | { kind: 'too-large'; violation: SizeViolation }
  /** `cause` = 该 400 出口的两种成因（仅用于日志；见 `WordbookRejectCause`）。 */
  | { kind: 'invalid-entry'; words: string[]; cause: WordbookRejectCause };

export interface WordbookPushResult {
  /**
   * 判别字段（与 `WordbookRejection` 的 `kind` 同位）。门面**只按 `kind` narrow**，
   * 不许 `as` 强转、不许 `@ts-expect-error`。它只是 service → 门面的内部契约，
   * 不进任何响应体（REST `push` 的响应仍逐字是 `WordbookPushResultSchema` 的五个键）。
   */
  kind: 'ok';
  ok: true;
  version: number;
  added: number;
  merged: number;
  removed: number;
  /** 本次是否按增量模式落库（off 态仍接受，只是退化成整数组语义，§4.4.3）。 */
  incremental: boolean;
}

export type WordbookPushOutcome = WordbookPushResult | WordbookRejection;

export interface WordbookReplaceResult {
  kind: 'ok';
  ok: true;
  version: number;
  incremental: boolean;
  added: number;
  merged: number;
  removed: number;
  unchanged: boolean;
}

export type WordbookReplaceOutcome = WordbookReplaceResult | WordbookRejection;

/** `replaceArray` 落库前的计数结果 —— 即 `CasProjection` 的 `out`（成功响应按判别字段展开）。 */
type CounterOut = { added: number; merged: number; removed: number; unchanged: boolean };

export interface WordbookMutateResult {
  ok: true;
  added: boolean;
  version: number;
  incremental: boolean;
  /** 与改动前 tRPC `wordbook.add` 的 `data` 一致：写完之后的整数组。 */
  data: WordbookEntry[];
}

/* ───────────────────────────── 开关读取（§4.4.4 唯一裁决点） ───────────────────────────── */

/** 按 `AppDB` 实例记忆一份 flags，避免"没注入就每人新建"造成的 TTL 缓存碎片。 */
const flagsByDb = new WeakMap<AppDB, FeatureFlags>();

function flagsOf(deps: WordbookServiceDeps): FeatureFlags {
  if (deps.flags) return deps.flags;
  const cached = flagsByDb.get(deps.db);
  if (cached) return cached;
  const created = createFeatureFlags(deps.db);
  flagsByDb.set(deps.db, created);
  return created;
}

export interface WordbookService {
  /** §4.4.4：`userId % 100 < pct`，尾号放量，无哈希。 */
  isIncrementalOn(userId: number): Promise<boolean>;
  /** R-16：显式收藏开关（off = 保留旧的"查询即入库"自动灌入路径；服务端两侧都照常接受写入）。 */
  isExplicitFavoriteOn(userId: number): Promise<boolean>;

  /** `GET /api/wordbook` / `wordbook.list`：按 `addedAt` 稳定排序 + 墓碑过滤（off 态不过滤）。 */
  read(userId: number): Promise<WordbookEntry[]>;
  /**
   * `read()` 的同一份排序/过滤，**之后** join FSRS 进度三键（R-15⑤ · 见 `withProgress` 的注释）。
   * 走这一颗而不是 `read()` 本身，是因为 `GET /api/wordbook` 的条目键集合被 §6.2-1 兼容快照钉死
   * （`test/contract/legacy-apk.spec.ts:487` 与 `test/integration/wordbook-concurrency.spec.ts:1189` 两枚禁改哨）；
   * 本期点亮的是**非旧 APK 面**：tRPC `wordbook.list`（`routers/wordbook.ts` 的 `list` 转调这一颗）。
   */
  readWithProgress(userId: number): Promise<WordbookEntryWithProgress[]>;
  /** `pull` 面与 T-21 抽样比对的**只读**入口。 */
  snapshot(userId: number): Promise<WordbookPullResultDto>;
  /**
   * 判据⑥⑧：同一批写入在两种模型下的投影，**只读、不落库**。
   * T-21 的 `scripts/release/reconcile.mjs --mode diff-sample --n 20` 用做取数口：
   * 对每个抽样用户喂同一份 `incoming`（通常就是它当前整数组 + 一批模拟写入），
   * 比 `projections.array` 与 `projections.incremental` 的差集 —— 不写任何数据。
   */
  reconcileFor(
    userId: number,
    incoming?: readonly WordbookEntry[],
  ): Promise<{
    version: number;
    tombstones: Tombstones;
    projections: { array: WordbookEntry[]; incremental: WordbookEntry[] };
  }>;

  push(userId: number, input: Partial<WordbookPushInputDto>): Promise<WordbookPushOutcome>;
  replaceArray(userId: number, incoming: readonly WordbookEntry[]): Promise<WordbookReplaceOutcome>;
  addWord(userId: number, rawWord: string): Promise<WordbookMutateResult>;
  removeWord(userId: number, rawWord: string, opts?: { deleteCard?: boolean }): Promise<{ version: number; data: WordbookEntry[] }>;
  clear(userId: number, opts?: { deleteCards?: boolean }): Promise<{ version: number }>;
}

/* ───────────────────────────── 装配 ───────────────────────────── */

/**
 * 门面侧 CAS 重试上限（`add`/`remove`/`clear` 没有客户端 `baseVersion`，只能自己追平服务端版本）。
 * k 路同时开写最坏需 k-1 轮；见 `writeWithCas` 的注释与 `wordbook-concurrency.spec.ts` 判据①。
 */
export const CAS_MAX_ATTEMPTS = 16;

/**
 * 词本域日志的**缺省通道**（`[event] {json}` 一行）。
 *
 * 之所以从 `createWordbookService` 内部提到模块级并导出：T-09r1 起 **REST 门面也是这个 400 出口的
 * 生产者之一**（`routes/wordbook.ts` 的两道关：`parseLegacyArray` 的坏载荷、`WordbookPushInputSchema`
 * 的入参关），它必须能打与 service 一字不差的日志行 —— 但**不许写第二份格式**（§5.4-2 理由②）。
 * 两侧都收 `deps.log` 注入：注入了就换掉，不注入就是这一份。
 */
export function wordbookConsoleLog(level: 'info' | 'warn', event: string, meta: Record<string, unknown>): void {
  const line = `[${event}] ${JSON.stringify(meta)}`;
  if (level === 'warn') console.warn(line);
  else console.info(line);
}

/** userId 的尾号口径（§4.4.4 放量与日志脱敏同一个式子；本文件唯一实现）。 */
function tailOf(userId: number): number {
  return Math.abs(userId) % 100;
}

/**
 * §5.4-2 理由② 的那一条日志：**同一个 400 出口的两种成因只在日志里分家**，响应体不带 `cause`。
 * `facade` 记的是"哪一道关拒的"（service 的 `push`/`replaceArray` 与两个门面各自的前置关），
 * 事件名沿用改动前的 `wordbook_invalid_entry`（只加键、不改名、不改级别）。
 * `meta.userId` 在这里统一取尾号（调用点传原始 id，脱敏口径不外泄到门面）。
 */
export function logWordbookInvalidEntry(
  log: WordbookModeLog,
  facade: string,
  cause: WordbookRejectCause,
  meta: { userId?: number } & Record<string, unknown> = {},
): void {
  const { userId, ...rest } = meta;
  log('warn', 'wordbook_invalid_entry', {
    ...(userId === undefined ? {} : { userId: tailOf(userId) }),
    facade,
    cause,
    ...rest,
  });
}

export function createWordbookService(deps: WordbookServiceDeps): WordbookService {
  const { db } = deps;
  const flags = flagsOf(deps);
  const now = deps.now ?? (() => Date.now());

  const log: WordbookModeLog = deps.log ?? wordbookConsoleLog;

  /** 读一次状态行；`null`（行不存在）时按"空词本 + 版本 0 + 无墓碑"处理，读路径永不抛。 */
  async function stateOf(userId: number): Promise<{ raw: Awaited<ReturnType<AppDB['wordbooks']['getSyncState']>>; data: WordbookEntry[]; tombstones: Tombstones; tombstonesRaw: string; version: number; updatedAt: number }> {
    const [data, raw] = await Promise.all([db.wordbooks.getData(userId), db.wordbooks.getSyncState(userId)]);
    const tombstonesRaw = raw?.tombstones ?? '[]';
    return {
      raw,
      data,
      tombstones: parseTombstones(tombstonesRaw),
      tombstonesRaw,
      version: raw?.sync_version ?? 0,
      updatedAt: raw?.updated_at ?? 0,
    };
  }

  async function modeOf(userId: number): Promise<boolean> {
    const on = await flags.isFlagOnForUser('wordbookIncremental', userId);
    log('info', 'wordbook_sync_mode', { userId: tailOf(userId), on, pct: await flags.get('wordbookIncremental') });
    return on;
  }

  async function invalidateCache(userId: number): Promise<void> {
    try {
      await deps.cache?.invalidate(cacheKeys.wordbook(userId));
    } catch {
      /* 缓存失效失败不得影响写入结果 */
    }
  }

  /**
   * 落库用的墓碑串：先按 §4.4.2 的 30 天压缩窗口裁剪，再序列化成确定性串。
   * `tombstonesJsonFor` 保证"空集合沿用库里原有那一串"，于是一次无变化的重放不会白白 +1 版本。
   */
  function tombstonesForDb(tombstones: Tombstones, tombstonesRaw: string, at: number): string {
    const { tombstones: kept } = pruneTombstones(tombstones, at, deps.tombstoneRetentionDays);
    return tombstonesJsonFor(kept, tombstonesRaw);
  }

  /** `stateOf()` 的返回：一次读到的全部状态（投影函数的唯一入参）。 */
  interface WordbookState {
    raw: Awaited<ReturnType<AppDB['wordbooks']['getSyncState']>>;
    data: WordbookEntry[];
    tombstones: Tombstones;
    tombstonesRaw: string;
    version: number;
    updatedAt: number;
  }

  /** 一次"CAS 写"的投影：要落库的三样东西 + 响应组装要用的任意数据（`out`）。 */
  interface CasProjection<T> {
    entries: WordbookEntry[];
    tombstones: Tombstones;
    tombstonesRaw: string;
    out: T;
  }

  /**
   * 单一落库路径的 CAS 重试：`wordbook.add`/`remove`/`clear` 要同时写 `data` + `tombstones`，
   * 只有 `applySync` 做得到（`applyEntries` 不碰墓碑列），而 `applySync` 需要 `baseVersion`。
   * 门面侧没有客户端版本号 → 用服务端刚读到的版本，撞上并发就**重读状态 + 重新投影**再试。
   *
   * ⚠ 重试必须重新投影：只把版本号换成服务端的新值、再拿旧快照写一次，会把并发对手刚写进去的词
   *    覆盖掉 —— 那正是判据①（两 client 各加不同词 → 双方都在）要杀的那类丢词。
   *
   * 次数上限取 `CAS_MAX_ATTEMPTS`：k 个同时开写的客户端最坏需要 k-1 次追平（每轮都重读最新版本，
   * 且 add/remove 的投影对新状态是单调的），16 覆盖到"同用户 16 路真并发"，
   * `test/integration/wordbook-concurrency.spec.ts` 判据① 用 8 路并发钉它。
   * 根治方案是"事务内 read-modify-write"（需要 `AppDB.wordbooks` 新增一个方法），
   * 那是 T-06 的_surface_，本任务不许自己加 → 见报告「需要别的任务配合」一节。
   *
   * 最终仍失败时退回 `applyEntries`（词该删还是删得掉，只是本次不更新墓碑，并打 warn）。
   */
  async function writeWithCas<T>(
    userId: number,
    project: (state: WordbookState) => CasProjection<T>,
    at: number,
  ): Promise<{ version: number; out: T }> {
    let lastVersion = (await db.wordbooks.getSyncState(userId))?.sync_version ?? 0;
    let last = project(await stateOf(userId)); // 兜底：行缺失/放弃重试时也要能回答响应
    for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt += 1) {
      const state = await stateOf(userId);
      const next = project(state);
      last = next;
      const res = await db.wordbooks.applySync(
        userId,
        next.entries,
        tombstonesForDb(next.tombstones, next.tombstonesRaw, at),
        state.version,
        at,
      );
      if (res.ok) return { version: res.version, out: next.out };
      if (res.reason === 'missing') break;
      lastVersion = res.version; // stale：下一轮重读重算，版本号只用于日志
    }
    log('warn', 'wordbook_sync_cas_gaveup', { userId: tailOf(userId), version: lastVersion });
    return { version: await db.wordbooks.applyEntries(userId, last.entries, at), out: last.out };
  }

  /**
   * on 态走 `writeWithCas`；off 态（§6.4-5-3"回到旧行为"）保持 `applyEntries` 的整数组落库路径，
   * 不碰墓碑列。两条分支都只经由 `db.wordbooks` 的**单事务**方法（§4.4.3）。
   */
  async function writeProjection<T>(
    userId: number,
    incremental: boolean,
    project: (state: WordbookState) => CasProjection<T>,
    at: number,
  ): Promise<{ version: number; out: T }> {
    if (incremental) return writeWithCas(userId, project, at);
    const state = await stateOf(userId);
    const next = project(state);
    return { version: await db.wordbooks.applyEntries(userId, next.entries, at), out: next.out };
  }

  /**
   * 一次取该用户的全部 FSRS 卡并按**归一词名**建索引（⛔ 不逐词 `getCard`：那是 N+1）。
   * 反序列化只走 `services/fsrs.ts` 的 `cardFromJson`（全库唯一那颗，不造第二份）。
   */
  async function cardsByWord(userId: number): Promise<Map<string, Card>> {
    const rows = await db.fsrs.getCardsByUser(userId);
    const byWord = new Map<string, Card>();
    for (const row of rows) {
      const key = wordKeyOf({ word: row.word });
      if (key && !byWord.has(key)) byWord.set(key, cardFromJson(row.fsrs_data));
    }
    return byWord;
  }

  /**
   * 进度三键 join（R-15⑤ · A-85 #312；键名取自 `@tm/shared` 的 `WORDBOOK_PROGRESS_KEYS` 单点）。
   * - **有卡**：服务端真值**覆盖**同名存量键 —— `normalizeEntry` 是 `{...asRecord(incoming)}`，
   *   客户端回推的未知键会原样存进整数组，于是历史脏值可能躺在 `data` 里，读侧必须让真值赢。
   * - **无卡**：三键整键缺席（不填 0/null）：填 0 会让消费方 `stageOf` 把"无卡"当成有档、屏蔽客户端兜底。
   * join 发生在 `sortForRead(filterReadable(…))` **之后**：排序与墓碑过滤的口径、成员与顺序都不动。
   */
  function withProgress(entries: readonly WordbookEntry[], cards: Map<string, Card>): WordbookEntryWithProgress[] {
    const [stateKey, lapsesKey, nextDueKey] = WORDBOOK_PROGRESS_KEYS;
    return entries.map((entry) => {
      const card = cards.get(wordKeyOf(entry));
      if (!card) return entry as unknown as WordbookEntryWithProgress;
      return {
        ...entry,
        [stateKey]: card.state,
        [lapsesKey]: card.lapses,
        [nextDueKey]: card.due.getTime(),
      };
    });
  }

  /** 条目形状 + 上限的统一前置校验（§4.4.2 大小上限行；命中即不写库、不半写）。 */
  function shapeRejection(
    violation: SizeViolation | undefined,
    entries: readonly WordbookEntry[],
    userId: number,
    facade: string,
  ): WordbookRejection | undefined {
    if (violation) {
      log('warn', 'wordbook_too_large', { userId: tailOf(userId), facade, ...violation });
      return { kind: 'too-large', violation };
    }
    const words = invalidWordKeys(entries);
    if (words.length > 0) {
      logWordbookInvalidEntry(log, facade, 'invalid_word_name', { userId, count: words.length });
      return { kind: 'invalid-entry', words, cause: 'invalid_word_name' };
    }
    return undefined;
  }

  const service: WordbookService = {
    async isIncrementalOn(userId) {
      return modeOf(userId);
    },

    async isExplicitFavoriteOn(userId) {
      return flags.isFlagOnForUser('explicitFavorite', userId);
    },

    async read(userId) {
      const { data, tombstones } = await stateOf(userId);
      const incremental = await modeOf(userId);
      return sortForRead(filterReadable(data, tombstones, incremental));
    },

    async readWithProgress(userId) {
      // `read()` 的那一次取数 + 一条 `getCardsByUser`（不是逐词 `getCard`：那是 N+1）；缓存层属下一轮。
      return withProgress(await service.read(userId), await cardsByWord(userId));
    },

    async snapshot(userId) {
      const { version, updatedAt } = await stateOf(userId);
      return { version, updatedAt, entries: await service.read(userId) };
    },

    async reconcileFor(userId, incoming) {
      const state = await stateOf(userId);
      const at = now();
      const ops = incoming ?? state.data;
      return {
        version: state.version,
        tombstones: state.tombstones,
        projections: {
          array: projectArrayOverwrite(state.data, ops, at).entries,
          incremental: projectArrayMerge(state.data, ops, at, state.tombstones).entries,
        },
      };
    },

    async push(userId, input) {
      const at = now();
      const baseVersion = Number.isFinite(input.baseVersion) ? Math.trunc(Number(input.baseVersion)) : 0;
      const entries = Array.isArray(input.entries) ? input.entries : [];
      const removedWords = Array.isArray(input.removedWords) ? input.removedWords : [];
      const incremental = await modeOf(userId);
      const state = await stateOf(userId);

      // 上限：单批 500（这里）+ 落库后总量 20000（merge 之后精确判，见下方 overflow）——都在写库之前
      const bad = shapeRejection(
        sizeViolation({ entries: entries.length, removedWords: removedWords.length, batchLimit: WORDBOOK_PUSH_BATCH_MAX }),
        entries,
        userId,
        'push',
      );
      if (bad) return bad;

      const merged = applyOps(state.data, { entries, removedWords }, {
        now: at,
        tombstonesEnabled: incremental,
        tombstones: incremental ? state.tombstones : {},
        stampUpdatedAt: incremental,
      });
      const overflow = sizeViolation({ totalAfter: merged.entries.length });
      if (overflow) return { kind: 'too-large', violation: overflow };

      if (!incremental) {
        // §4.4.3：off 态仍接受 push（新旧 App 混用不给 4xx），但退化成"整数组语义 + 不写墓碑"
        log('warn', 'wordbook_push_degraded', { userId: tailOf(userId), baseVersion });
        const version = await db.wordbooks.applyEntries(userId, merged.entries, at);
        await invalidateCache(userId);
        return { kind: 'ok', ok: true, version, added: merged.added, merged: merged.merged, removed: merged.removed, incremental: false };
      }

      const result = await db.wordbooks.applySync(
        userId,
        merged.entries,
        tombstonesForDb(merged.tombstones, state.tombstonesRaw, at),
        baseVersion,
        at,
      );
      if (!result.ok) {
        const fresh = await stateOf(userId);
        await invalidateCache(userId);
        return {
          kind: 'stale',
          version: result.version,
          server: { updatedAt: fresh.updatedAt, entries: sortForRead(filterReadable(fresh.data, fresh.tombstones, true)) },
          pruned: isPruned(baseVersion, fresh.tombstones),
        };
      }
      await invalidateCache(userId);
      return { kind: 'ok', ok: true, version: result.version, added: merged.added, merged: merged.merged, removed: merged.removed, incremental: true };
    },

    async replaceArray(userId, incoming) {
      const at = now();
      const incremental = await modeOf(userId);

      const bad = shapeRejection(sizeViolation({ totalAfter: incoming.length }), incoming, userId, 'put');
      if (bad) return bad;

      const project = (state: WordbookState): CasProjection<CounterOut> => {
        // 空数组 = 用户主动清空（旧 APK 的 clear 队列项 / `wordbook.clear`）：两种模式都直接清，
        // 否则 on 态的"字段级 merge"会把"交回一个空数组"读成"没有任何 upsert"。
        if (incoming.length === 0) {
          return {
            entries: [],
            tombstones: state.tombstones,
            tombstonesRaw: state.tombstonesRaw,
            out: { added: 0, merged: 0, removed: state.data.length, unchanged: state.data.length === 0 },
          };
        }
        const projected = incremental
          ? projectArrayMerge(state.data, incoming, at, state.tombstones)
          : projectArrayOverwrite(state.data, incoming, at);
        return {
          entries: projected.entries,
          tombstones: projected.tombstones,
          tombstonesRaw: state.tombstonesRaw,
          out: {
            added: projected.added,
            merged: projected.merged,
            removed: projected.removed,
            unchanged: projected.unchanged,
          },
        };
      };

      const { version, out } = await writeProjection(userId, incremental, project, at);
      await invalidateCache(userId);
      return { kind: 'ok', ok: true, version, incremental, ...out };
    },

    async addWord(userId, rawWord) {
      const word = String(rawWord ?? '').trim().toLowerCase();
      const at = now();
      const incremental = await modeOf(userId);

      const project = (state: WordbookState): CasProjection<{ added: boolean; data: WordbookEntry[] }> => {
        const merged = applyOps(
          state.data,
          { entries: [{ word, addedAt: at } as unknown as WordbookEntry] },
          {
            now: at,
            tombstonesEnabled: incremental,
            tombstones: incremental ? state.tombstones : {},
            stampUpdatedAt: incremental,
          },
        );
        const exists = state.data.some((entry) => wordKeyOf(entry) === word);
        return {
          entries: merged.entries,
          tombstones: merged.tombstones,
          tombstonesRaw: state.tombstonesRaw,
          // 改动前语义："这个词已经在词本里" → `added:false` 且不写库。墓碑里的"已删词"重新加回来算 added。
          out: { added: !exists || merged.added > 0 || merged.revived > 0, data: merged.entries },
        };
      };

      const { version, out } = await writeProjection(userId, incremental, project, at);
      await invalidateCache(userId);
      return { ok: true, added: out.added, version, incremental, data: out.data };
    },

    async removeWord(userId, rawWord, opts) {
      const word = String(rawWord ?? '').trim().toLowerCase();
      const at = now();
      const incremental = await modeOf(userId);

      const project = (state: WordbookState): CasProjection<{ data: WordbookEntry[] }> => {
        const merged = applyOps(state.data, { removedWords: [word] }, {
          now: at,
          tombstonesEnabled: incremental,
          tombstones: incremental ? state.tombstones : {},
        });
        return {
          entries: merged.entries,
          tombstones: merged.tombstones,
          tombstonesRaw: state.tombstonesRaw,
          out: { data: merged.entries },
        };
      };

      const { version, out } = await writeProjection(userId, incremental, project, at);
      if (opts?.deleteCard !== false) await db.fsrs.deleteCard(userId, word);
      await invalidateCache(userId);
      return { version, data: out.data };
    },

    async clear(userId, opts) {
      const at = now();
      const incremental = await modeOf(userId);
      // 清空 = 整本没了：on 态顺手把墓碑丢掉（那些"已删词"再没有复活对象）；
      // off 态一律不碰墓碑列（关掉开关的一方不该有写墓碑的机会）。
      const project = (state: WordbookState): CasProjection<null> => ({
        entries: [],
        tombstones: {},
        tombstonesRaw: state.tombstonesRaw,
        out: null,
      });
      const { version } = await writeProjection(userId, incremental, project, at);
      if (opts?.deleteCards !== false) {
        const cards = await db.fsrs.getCardsByUser(userId);
        for (const card of cards) await db.fsrs.deleteCard(userId, card.word);
      }
      await invalidateCache(userId);
      return { version };
    },
  };

  return service;
}

/* ───────────────────────────── 门面共用的小工具（避免两个门面各写一遍） ───────────────────────────── */

/** `PUT /api/wordbook` 的旧载荷口径：`{data:[{word,addedAt}]}`，词名 ≤100（改动前一字未动，见文件头注 2）。 */
export const LEGACY_WORD_MAX_LENGTH = 100;

export type LegacyArrayParse =
  | { ok: true; entries: WordbookEntry[] }
  | { ok: false; rejection: WordbookRejection };

/**
 * 把旧 `PUT` 的 `{data}` 解析成 `WordbookEntry[]`，并顺手产出与 service 同一口径的拒绝结果。
 *
 * 校验规则与 `routes/wordbook.ts` 改动前的循环逐条对应（含"非数字 addedAt → 取当前时刻"、
 * 词名 ≤100、总量 ≤ `WORDBOOK_MAX_ENTRIES`）；与旧实现唯一的差别：**不再丢掉客户端发来的其它键**
 * （旧代码只留 `{word,addedAt}`，会把 `reviewCount`/`lastReview` 洗成空 —— 这正是 R-03③
 * 要治的那一处，属于"少丢数据"方向，不改变任何响应形状）。
 */
export function parseLegacyArray(
  body: unknown,
  now: number,
  maxEntries: number = WORDBOOK_MAX_ENTRIES,
): LegacyArrayParse {
  const data = (body as { data?: unknown } | null)?.data;
  // 载荷本身不是 `{data:[…]}`（含 `c.req.json()` 解析失败被兜成 `{}` 那一路）= §5.4-2 的 `malformed_json`
  if (!Array.isArray(data)) return { ok: false, rejection: { kind: 'invalid-entry', words: [], cause: 'malformed_json' } };
  const tooLarge = sizeViolation({ totalAfter: data.length, totalLimit: maxEntries });
  if (tooLarge) return { ok: false, rejection: { kind: 'too-large', violation: tooLarge } };
  const entries: WordbookEntry[] = [];
  const invalid: string[] = [];
  for (const item of data as Array<Record<string, unknown> | null>) {
    const word = typeof item?.word === 'string' ? item.word.trim() : '';
    if (!word || word.length > LEGACY_WORD_MAX_LENGTH) {
      invalid.push(String(item?.word ?? ''));
      continue;
    }
    entries.push(
      normalizeEntry(
        {
          ...(item as Record<string, unknown>),
          word,
          addedAt: typeof item?.addedAt === 'number' ? item.addedAt : now,
        } as unknown as WordbookEntry,
        now,
      ),
    );
  }
  if (invalid.length > 0) return { ok: false, rejection: { kind: 'invalid-entry', words: invalid, cause: 'invalid_word_name' } };
  return { ok: true, entries };
}

/**
 * 词本 400 出口的**唯一**一条码（PRD §5.4-2 / A-37 §八-32：坏 JSON 与词名非法**共用**这一条，
 * 本期不拆第二条码）。`INVALID_WORDBOOK_ENTRY` 住在 `TM_ERRORS_SUPPLEMENT`（§4.6 那 18 码冻结面里
 * 没有它，A-8），所以取文案走 `errorMessage()`、取状态走 `supplementErrorStatus()` —— 即
 * `errors.ts:228-230` 自陈"登记完了等服务端接线"的那两个助手。
 * 下面的字符串是**键名**（码标识），不是文案：全仓除本行与本域 `test/**` 的字面哨外不得再出现第二处。
 */
const INVALID_ENTRY_CODE: TmErrorSupplementCode = 'INVALID_WORDBOOK_ENTRY';

/**
 * 词本 400 出口的响应体：**恒两键** `{error, code}`，`code` 恒 `INVALID_WORDBOOK_ENTRY`，
 * 且**不随成因变化**（§5.4-2 理由②"可辨性由日志承担、不由错误码承担"）——
 * 坏 JSON 与词名非法对外逐字节是同一个体，`cause` 只出现在日志参数里，绝不进响应体。
 * R-17⑧：`error` 键名一字未动，只换值。
 */
export function wordbookInvalidEntryBody(): { status: number; body: { error: string; code: string } } {
  return {
    status: supplementErrorStatus(INVALID_ENTRY_CODE),
    body: { error: errorMessage(INVALID_ENTRY_CODE), code: INVALID_ENTRY_CODE },
  };
}

/** zod 关给出的最小问题形状（不 import `zod` 的 `ZodIssue`：本函数只读 `path` 的末段）。 */
export interface WordbookIssuePath {
  path: ReadonlyArray<string | number>;
}

/**
 * `POST /api/wordbook/push` 的**契约入参关**（`routes/wordbook.ts` 的 `WordbookPushInputSchema.safeParse`）
 * 失败时判成因：路径里出现 `word` / `removedWords` 的那一类 = **词名非法**
 * （空串 / 纯空格 / 非字符串 / 超 `WORD_MAX_LENGTH`，§5.4-2 背景行的四类）；
 * 其余（缺 `baseVersion`、条目不是对象、单批超量，以及 `c.req.json()` 解析失败被兜成 `{}` 那一路）
 * = **坏 JSON / 坏载荷**。只影响日志字段，不影响响应（同一条码同一句）。
 */
export function wordbookPushIssueCause(issues: readonly WordbookIssuePath[]): WordbookRejectCause {
  const isWordName = (path: ReadonlyArray<string | number>): boolean =>
    path.some((seg) => seg === 'word' || seg === 'removedWords');
  return issues.some((issue) => isWordName(issue.path)) ? 'invalid_word_name' : 'malformed_json';
}

/** 拒绝结果 → HTTP 状态与响应体（错误码/文案一律取自 `@tm/shared`，A-28-4）。 */
export function wordbookRejectionBody(rejection: WordbookRejection): {
  status: number;
  body: Record<string, unknown>;
} {
  if (rejection.kind === 'stale') {
    const stale = TM_ERRORS.WORDBOOK_STALE;
    return {
      status: stale.http,
      body: {
        error: stale.copy,
        code: TM_ERROR_CODES.WORDBOOK_STALE,
        version: rejection.version,
        server: rejection.server,
        pruned: rejection.pruned,
      },
    };
  }
  if (rejection.kind === 'too-large') {
    const tooLarge = TM_ERRORS.WORDBOOK_TOO_LARGE;
    return {
      status: tooLarge.http,
      // 文案本体来自 shared（不许复制第二份）；括号里是**数据**（本次命中的那一档上限），不是文案
      body: {
        error: `${tooLarge.copy}（${rejection.violation.limit}）`,
        code: TM_ERROR_CODES.WORDBOOK_TOO_LARGE,
        limit: rejection.violation.limit,
      },
    };
  }
  // 词本 400 出口（`invalid-entry`）：T-09r1 接线 A-37 §八-31 那条缺码 —— 坏 JSON 与词名非法
  // **共用** `INVALID_WORDBOOK_ENTRY` + §5.4-2 定稿句，成因差异只进日志（`cause:`，见上）。
  // 旧注释写"§4.6 表里没有这一码 → 保持改动前的机器话"，那是 P-2 时代的过时理由：
  // 该码 A-30-7/E1b 已纯追加进 `TM_ERRORS_SUPPLEMENT`（`errors.ts:234`，自陈"本条即那条缺码的登记落点"），
  // §5.4-2 约束③ 于是明令该 400 不得再退化成机器话兜底串。
  return wordbookInvalidEntryBody();
}

/** 墓碑串的只读导出（T-21 抽样脚本要复算"整数组 vs 增量"时会用到）。 */
export { serializeTombstones };
