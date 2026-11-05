/**
 * 离线写队列（R-20①⑤⑥、判据⑤）。
 *
 * 落盘形态直接采用 `@tm/shared` 的 `WordbookSyncStateSchema`（T-03 在契约里就写了
 * "T-14 单点写"）。三条语义与旧手写版（`assets/api.js:112-200`）逐条对齐，因为**覆盖安装时
 * WebView 的 localStorage 会留着旧键**，里面可能有用户还没传上去的词：
 *  - 序号单调（`seq`）：补传期间用户又点了收藏 → 新 op 的 seq 更大，本轮不误清（R-20⑥）；
 *  - 同词翻转：seq 更大的一方胜出（先收藏后删除 = 删除）；
 *  - 上限 `WORDBOOK_PUSH_BATCH_MAX`（500/次）与 `WORDBOOK_MAX_ENTRIES`（20000）都取常量。
 *
 * 失败语义（§5.5 第 1 步）：网络类失败**静默重试 ≤3 次**，仍失败就整批留在队列里，
 * 下次冷启动 / 回前台再补 —— 绝不"丢了再拉服务端"，那是 R-20⑤ 的反例。
 */

import {
  WORDBOOK_MAX_ENTRIES,
  WORDBOOK_PUSH_BATCH_MAX,
  WordbookSyncStateSchema,
  type WordbookEntryDto,
  type WordbookPushInputDto,
  type WordbookPushResultDto,
  type WordbookSyncStateDto,
} from '@tm/shared';
import { kvGet, kvSet } from '../native/bridge.js';
import { isApiError } from './rest-fetcher.js';

export const SYNC_STATE_KEY = 'tm.wbSyncState';
/** 旧手写版的键（`api.js:8`），只读一次做迁移。 */
const LEGACY_QUEUE_KEY = 'tm.wbQueue';
const LEGACY_SEQ_KEY = 'tm.wbSeq';
const LEGACY_CACHE_KEY = 'tm.wbCache';

/** §5.5：静默重试 ≤3 次。 */
export const MAX_FLUSH_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = [400, 1200, 3000] as const;

export interface PendingEntry extends WordbookEntryDto {
  seq: number;
  updatedAt?: number;
}

export interface WbSyncState extends WordbookSyncStateDto {
  pendingUpserts: PendingEntry[];
}

/** 409 `WORDBOOK_STALE` 时服务端回带的权威快照（§4.4.1）。 */
export interface StaleSnapshot {
  version: number;
  entries: WordbookEntryDto[];
}

/**
 * 队列写盘失败（A-43 #77 / §3.6.5 末行「删除写失败」的**可达性前提**）。
 *
 * `kvSet` 现在返回 boolean 而不是抛错，所以成败由本模块判定：**内存兜底对"读"仍然成立
 * （`kvGet` 不动），但写队列失败绝不假装成功** —— 否则 UI 会回 `已移出 · 撤销`，
 * 行既没消失也没落账（PRD §6.6 人话原则的反例）。
 */
export class QueueWriteError extends Error {
  readonly key: string;
  constructor(message: string, key: string) {
    super(message);
    this.name = 'QueueWriteError';
    this.key = key;
    // 目标若为 ES5 降级，`extends Error` 会断掉原型链 → 显式修正，保证 `instanceof` 可用。
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const isQueueWriteError = (error: unknown): error is QueueWriteError =>
  error instanceof QueueWriteError;

const writeFailedMessage = (key: string, what: string): string =>
  `离线写队列没能存进本机存储（键 ${key}）：${what}。这条操作只在内存里，进程结束就找不到，故按失败处理。`;

export type PushTransport = (input: WordbookPushInputDto) => Promise<WordbookPushResultDto>;

export interface FlushOptions {
  attempts?: number;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  /** 成功补传后回调（UI 显示"已同步 · HH:MM"，R-20⑤）。 */
  onSynced?: (epochMs: number) => void;
}

export interface FlushResult {
  ok: boolean;
  attempts: number;
  sentEntries: number;
  sentRemovals: number;
  remaining: number;
  version: number;
  /** 最后一批彻底失败时的原始错误，或补传途中本地写盘失败的 {@link QueueWriteError}（`startup.ts` 用它决定是否显示"还没同步"）。 */
  error?: unknown;
}

const emptyState = (): WbSyncState => ({
  baseVersion: 0,
  pendingUpserts: [],
  pendingRemovals: [],
  lastSyncedAt: 0,
});

const normalizeWord = (word: string): string => (word ?? '').trim().toLowerCase();

const readJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export function loadState(): WbSyncState {
  const parsed = WordbookSyncStateSchema.safeParse(readJson(kvGet(SYNC_STATE_KEY)));
  if (parsed.success) {
    return {
      ...parsed.data,
      pendingUpserts: (parsed.data.pendingUpserts as PendingEntry[]) ?? [],
    };
  }
  return emptyState();
}

/**
 * 队列落盘。**写失败即抛 {@link QueueWriteError}**（A-43 #77）：调用方
 * （`enqueueRemove` / `enqueueUpsert` / `startup.ts` 的 pull 步）由此能感知"没落账"，
 * UI 才能走 §3.6.5 末行的失败反馈而不是谎报成功。
 */
export function saveState(state: WbSyncState): void {
  const bounded: WbSyncState = {
    ...state,
    pendingUpserts: state.pendingUpserts.slice(-WORDBOOK_MAX_ENTRIES),
    pendingRemovals: state.pendingRemovals.slice(-WORDBOOK_MAX_ENTRIES),
  };
  if (!kvSet(SYNC_STATE_KEY, JSON.stringify(bounded))) {
    throw new QueueWriteError(writeFailedMessage(SYNC_STATE_KEY, 'WebView 未开 DOMStorage 或配额已满'), SYNC_STATE_KEY);
  }
}

/**
 * 一次性迁移旧手写版的 `tm.wbQueue`（`{op,word,at,seq}`）。
 * 覆盖安装的用户手里可能有还没传上去的收藏 —— 这正是 R-20⑦ hotfix 要救的"静默丢词"。
 */
export function migrateLegacyQueue(): number {
  const legacy = readJson<Array<{ op: string; word?: string; at?: number; seq?: number }>>(
    kvGet(LEGACY_QUEUE_KEY),
  );
  if (!legacy || !legacy.length) return 0;
  const state = loadState();
  const cached: Array<{ word: string; addedAt?: number }> =
    readJson(kvGet(LEGACY_CACHE_KEY)) ?? [];
  let moved = 0;
  let seq = state.pendingUpserts.length + state.pendingRemovals.length;
  for (const item of legacy) {
    const word = normalizeWord(item.word ?? '');
    seq += 1;
    const at = item.at ?? Date.now();
    const legacySeq = item.seq ?? seq;
    if (item.op === 'add' && word) {
      state.pendingUpserts.push({ word, addedAt: at, updatedAt: at, seq: legacySeq });
      moved += 1;
    } else if (item.op === 'remove' && word) {
      state.pendingRemovals.push(word);
      moved += 1;
    } else if (item.op === 'clear') {
      for (const entry of cached) state.pendingRemovals.push(normalizeWord(entry.word));
      moved += 1;
    }
  }
  // 顺序固定：**先**把新状态落盘，**再**清旧键。反过来会在"清成功 / 写失败"时把用户的词弄丢。
  saveState(state);
  // 旧键清不掉 = 迁移没走完（下次冷启动会重搬一遍）。不能回"搬好了"。
  const queueCleared = kvSet(LEGACY_QUEUE_KEY, null);
  const seqCleared = kvSet(LEGACY_SEQ_KEY, null);
  if (!queueCleared || !seqCleared) {
    throw new QueueWriteError(
      writeFailedMessage(LEGACY_QUEUE_KEY, '旧队列键没能清掉，迁移未完成'),
      LEGACY_QUEUE_KEY,
    );
  }
  return moved;
}

let seqCounter = 0;
const nextSeq = (): number => {
  seqCounter += 1;
  return Date.now() * 1000 + (seqCounter % 1000);
};

/**
 * 入队时可带的附加字段（`word` 由入队函数自己规范化）。
 * 用 `Pick` 而不是 `Omit`：`WordbookEntryDto` 来自 `.passthrough()` 的 zod 对象，
 * 带 `[k: string]: unknown` 索引签名 → `Exclude<keyof T, 'word'>` 会塌成 `string`，
 * `Omit` 于是把具名属性全丢掉（`addedAt` 变 `unknown`）。
 */
export type UpsertPatch = Partial<
  Pick<WordbookEntryDto, 'addedAt' | 'lastReview' | 'reviewCount'>
> & { [k: string]: unknown };

/** 收藏（乐观写入本地队列）。写盘失败抛 {@link QueueWriteError}，调用方据此回失败反馈。 */
/**
 * 队列变更广播（bug #4/#6/#7 的修复钩子）。
 *
 * 为什么需要：`enqueueUpsert`/`enqueueRemove` 只改本地存储，而补传以前**只在冷启动/回前台**跑
 * （`startup.ts` 的 flush 步）。于是"查词自动入库"写下的条目会一直挂着：词本页看得见，
 * 服务端的自测/学新词/统计却还是空的，tab 上的待同步点也永远不消失。
 * 这里只广播"队列变了"，不碰网络也不碰状态机（订阅方在 `data/startup.ts`）。
 */
const queueChangeListeners = new Set<() => void>();

export function subscribeQueueChange(fn: () => void): () => void {
  queueChangeListeners.add(fn);
  return () => {
    queueChangeListeners.delete(fn);
  };
}

function notifyQueueChange(): void {
  for (const fn of Array.from(queueChangeListeners)) {
    try {
      fn();
    } catch {
      /* 订阅方抛错不得反噬入队本身（与 host/store 同口径） */
    }
  }
}

export function enqueueUpsert(word: string, patch: UpsertPatch = {}): PendingEntry {
  const value = normalizeWord(word);
  const state = loadState();
  const at = patch.addedAt ?? Date.now();
  const entry: PendingEntry = { ...patch, word: value, addedAt: at, updatedAt: at, seq: nextSeq() };
  const rest = state.pendingUpserts.filter((x) => x.word !== value);
  rest.push(entry);
  saveState({
    ...state,
    pendingRemovals: state.pendingRemovals.filter((x) => x !== value),
    pendingUpserts: rest,
  });
  notifyQueueChange();
  return entry;
}

/**
 * 删除（同词翻转由 seq 决定谁胜出，见 `composeBatch`）。
 * **写盘失败抛 {@link QueueWriteError}** —— 这是 §3.6.5 末行「删除写失败：行不消失 + 定稿 toast」
 * 在真机上可达的唯一前提（`WordbookScreen.removeRow` 的 catch 依赖它）。
 */
export function enqueueRemove(word: string): number {
  const value = normalizeWord(word);
  const state = loadState();
  const seq = nextSeq();
  saveState({
    ...state,
    pendingUpserts: state.pendingUpserts.filter((x) => x.word !== value),
    pendingRemovals: state.pendingRemovals.concat(value),
  });
  notifyQueueChange();
  return seq;
}

export function pendingCount(): number {
  const state = loadState();
  return state.pendingUpserts.length + state.pendingRemovals.length;
}

/** 词名 → 最后一次操作的时序键（upsert 用 seq，remove 用"出现顺序"兜底）。 */
function composeBatch(state: WbSyncState, limit: number): WordbookPushInputDto {
  const ups = state.pendingUpserts.slice().sort((a, b) => a.seq - b.seq);
  const removed = state.pendingRemovals.slice();
  const consumed = new Set<string>();
  const entries: WordbookEntryDto[] = [];
  const removedWords: string[] = [];
  for (const entry of ups) {
    if (entries.length >= limit) break;
    const { seq, ...rest } = entry;
    void seq;
    entries.push(rest as WordbookEntryDto);
    consumed.add(entry.word);
  }
  for (const word of removed) {
    if (removedWords.length >= limit) break;
    if (consumed.has(word)) continue;
    removedWords.push(word);
  }
  return { baseVersion: state.baseVersion, entries, removedWords };
}

const maxSeqIn = (state: WbSyncState, batch: WordbookPushInputDto): number => {
  const words = new Set([...batch.entries.map((e) => e.word), ...batch.removedWords]);
  let max = 0;
  for (const entry of state.pendingUpserts) {
    if (words.has(entry.word) && entry.seq > max) max = entry.seq;
  }
  return max;
};

const commitBatch = (state: WbSyncState, batch: WordbookPushInputDto, version: number, now: number): WbSyncState => {
  const upsertWords = new Set(batch.entries.map((e) => e.word));
  const removedWords = new Set(batch.removedWords);
  const touched = new Set([...upsertWords, ...removedWords]);
  const keptUpserts = state.pendingUpserts.filter(
    (e) => !touched.has(e.word) || e.seq > maxSeqIn(state, batch),
  );
  const keptRemovals = state.pendingRemovals.filter((w) => !touched.has(w));
  return {
    ...state,
    baseVersion: version,
    pendingUpserts: keptUpserts,
    pendingRemovals: keptRemovals,
    lastSyncedAt: now,
  };
};

const isStale = (error: unknown): boolean => isApiError(error) && error.code === 'WORDBOOK_STALE';
const isRetryable = (error: unknown): boolean => {
  if (!isApiError(error)) return true;
  if (error.code === 'NETWORK' || error.code === 'TIMEOUT' || error.code === 'HTTP_ERROR') {
    return error.status === 0 || error.status >= 500;
  }
  // 409 走重放分支；401/403 已被 rest-fetcher 的单点处理消化，队列原地保留。
  return !isStale(error) && error.code !== 'CREDENTIAL_EXPIRED' && error.code !== 'PASSWORD_UPGRADE_REQUIRED';
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

/**
 * 按序补传（判据⑤）。`send` 由 `data/queries/wordbook.ts` 提供，测试里换成假实现。
 * 返回的 `attempts` 是本批消耗掉的请求次数（≤`attempts` 上限），`remaining` 是留在队列里的条数。
 */
export async function flushOfflineQueue(
  send: PushTransport,
  options: FlushOptions = {},
): Promise<FlushResult> {
  const maxAttempts = options.attempts ?? MAX_FLUSH_ATTEMPTS;
  const wait = options.wait ?? sleep;
  const now = options.now ?? Date.now;

  /**
   * 补传途中的写盘失败**不**把整次 flush 变成 reject —— 网络侧已经收下的批不能因为本地
   * 没记上账就说没送出去；但也**绝不**带着 `ok:true` 出去（A-43 #77：`startup.ts` 读 `ok`
   * 决定顶栏是「已同步」还是「还没同步」，谎报会让红点消失）。
   */
  let persistError: unknown = null;
  const save = (state: WbSyncState): boolean => {
    try {
      saveState(state);
      return true;
    } catch (error) {
      if (!persistError) persistError = error;
      return false;
    }
  };

  try {
    migrateLegacyQueue();
  } catch (error) {
    if (!persistError) persistError = error;
  }

  let totalSent = 0;
  let totalRemoved = 0;
  let totalAttempts = 0;
  let rounds = 0;

  for (;;) {
    rounds += 1;
    if (rounds > WORDBOOK_MAX_ENTRIES) break; // 防御：批次上限下不可能无限循环
    const state = loadState();
    if (!state.pendingUpserts.length && !state.pendingRemovals.length) {
      return {
        ok: persistError === null,
        attempts: totalAttempts,
        sentEntries: totalSent,
        sentRemovals: totalRemoved,
        remaining: 0,
        version: state.baseVersion,
        error: persistError ?? undefined,
      };
    }
    const batch = composeBatch(state, WORDBOOK_PUSH_BATCH_MAX);
    if (!batch.entries.length && !batch.removedWords.length) break;

    let attemptsForBatch = 0;
    let result: WordbookPushResultDto | null = null;
    let lastError: unknown = null;

    while (attemptsForBatch < maxAttempts) {
      attemptsForBatch += 1;
      totalAttempts += 1;
      try {
        result = await send(batch);
        break;
      } catch (error) {
        lastError = error;
        if (isStale(error)) {
          // §4.4.1：409 带服务端最新 version + 全量 → 采纳快照后**同批重放**（幂等）。
          const body = (isApiError(error) ? error.body : null) as
            | { version?: number; server?: { entries?: WordbookEntryDto[] } }
            | null;
          const version = body && typeof body.version === 'number' ? body.version : 0;
          const snapshot = body && body.server && body.server.entries ? body.server.entries : [];
          save({
            ...state,
            baseVersion: version,
            pendingUpserts: state.pendingUpserts.filter((e) => !snapshot.some((s) => s.word === e.word)),
          });
          // 同批重放必须带上刚采纳的版本，否则下一枪还是 409（`batch` 是本轮开始时组好的旧载荷）。
          batch.baseVersion = version;
          continue;
        }
        if (!isRetryable(error)) break;
        if (attemptsForBatch < maxAttempts) {
          const index = Math.min(attemptsForBatch - 1, RETRY_BACKOFF_MS.length - 1);
          await wait(RETRY_BACKOFF_MS[index] ?? 0);
        }
      }
    }

    if (!result) {
      const after = loadState();
      return {
        ok: false,
        attempts: totalAttempts,
        sentEntries: totalSent,
        sentRemovals: totalRemoved,
        remaining: after.pendingUpserts.length + after.pendingRemovals.length,
        version: after.baseVersion,
        error: lastError ?? persistError ?? undefined,
      };
    }

    const after = commitBatch(loadState(), batch, result.version, now());
    totalSent += batch.entries.length;
    totalRemoved += batch.removedWords.length;
    if (!save(after)) {
      // 本地记不上账 ⇒ 队列原样留着，下次冷启动重推同一批（push 幂等）。
      // 继续循环只会拿同一份旧状态空转，直接收口；`onSynced` 不调，顶栏保持「还没同步」。
      break;
    }
    options.onSynced?.(after.lastSyncedAt ?? now());
  }

  const final = loadState();
  return {
    ok: persistError === null && !final.pendingUpserts.length && !final.pendingRemovals.length,
    attempts: totalAttempts,
    sentEntries: totalSent,
    sentRemovals: totalRemoved,
    remaining: final.pendingUpserts.length + final.pendingRemovals.length,
    version: final.baseVersion,
    error: persistError ?? undefined,
  };
}

/** 给 UI 的红点用（`SYNC_COPY.pending(n)`）。 */
export const pendingLabelCount = (): number => pendingCount();
