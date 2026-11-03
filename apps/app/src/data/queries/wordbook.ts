/**
 * 词本（R-03 / R-15 / R-16 的数据面）。
 *  - `GET /api/wordbook` 旧形状 `{data:[…]}` 不变（兼容矩阵成员）；
 *  - `POST /api/wordbook/push` / `GET /api/wordbook/pull` 是 §4.4.1 的增量协议；
 *  - 写一律先落 `offline-queue`，由它决定何时补传（R-20①⑤）。
 */

import { queryOptions } from '@tanstack/react-query';
import {
  WORDBOOK_MAX_ENTRIES,
  WORDBOOK_PROGRESS_QUERY,
  WORDBOOK_PROGRESS_QUERY_ON,
  WordbookArraySchema,
  WordbookEntrySchema,
  WordbookPullResultSchema,
  WordbookPushResultSchema,
  SYNC_COPY,
  type WordbookEntryDto,
  type WordbookPushInputDto,
  type WordbookPushResultDto,
} from '@tm/shared';
import { ApiError, apiGet, apiPost, unwrapParse } from '../rest-fetcher.js';
import { enqueueRemove, enqueueUpsert, type UpsertPatch } from '../offline-queue.js';

export const wordbookKeys = {
  all: ['wordbook'] as const,
  list: () => [...wordbookKeys.all, 'list'] as const,
};

/* ════════════════ A-40 #49：读侧容错（整批不挂，单条不丢） ════════════════ */

/** 一次整批读取的分流结果（诊断位，不面向用户，也不进 React Query 缓存）。 */
export interface WordbookReadReport {
  /** 契约不收（旧数据的 65-100 字符词、字段形状不合）但**已原样保留**的条数。 */
  salvaged: number;
  /** 连 `word` 都取不出来、无法渲染的条数。 */
  dropped: number;
  /** 服务端这一批总共回了多少条。 */
  total: number;
}

const NO_READ: WordbookReadReport = { salvaged: 0, dropped: 0, total: 0 };

let lastListRead: WordbookReadReport = NO_READ;

/** 最近一次整批读取的分流结果（排障 / 用例断言用）。 */
export function lastWordbookListRead(): WordbookReadReport {
  return lastListRead;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** 已知可选项数值字段坏掉时按缺省处理；**未知键一律原样留着**（R-03⑦ 红线：不得静默丢弃后回写）。 */
function salvageEntry(raw: unknown): WordbookEntryDto | null {
  if (!isRecord(raw)) return null;
  const word = typeof raw.word === 'string' ? raw.word.trim() : '';
  if (!word) return null;
  const kept: Record<string, unknown> = { ...raw, word };
  for (const key of ['addedAt', 'lastReview', 'reviewCount'] as const) {
    if (key in kept && !isNonNegativeInt(kept[key])) delete kept[key];
  }
  return kept as WordbookEntryDto;
}

function partitionEntries(items: readonly unknown[]): {
  entries: WordbookEntryDto[];
  report: WordbookReadReport;
} {
  const entries: WordbookEntryDto[] = [];
  let salvaged = 0;
  let dropped = 0;
  for (const item of items) {
    const parsed = WordbookEntrySchema.safeParse(item);
    if (parsed.success) {
      entries.push(parsed.data);
      continue;
    }
    const kept = salvageEntry(item);
    if (kept) {
      entries.push(kept);
      salvaged += 1;
    } else {
      dropped += 1;
    }
  }
  return { entries, report: { salvaged, dropped, total: items.length } };
}

/** 数组来源：裸数组或旧 `GET` 的 `{data:[…]}` 包装；两种都不是数组 → null。 */
function entryListSource(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw) && Array.isArray(raw.data)) return raw.data as unknown[];
  return null;
}

const badResponse = (detail: unknown): ApiError =>
  new ApiError('BAD_RESPONSE', SYNC_COPY.serverBusy, 200, detail);

/**
 * 整批**逐条** `safeParse` 分流（判据①）。只有两种情况才判整批失败：
 * 响应里根本没有数组、条数越出 `WORDBOOK_MAX_ENTRIES`（服务端预算都不成立 ⇒ 形状真的漂了）。
 * 单条形状不合不得拖垮整批 —— 一本里有一个旧 65-100 字符词时，单词本页照常渲染。
 */
export function readWordbookList(raw: unknown): {
  entries: WordbookEntryDto[];
  report: WordbookReadReport;
} {
  const items = entryListSource(raw);
  if (!items) throw badResponse(raw);
  if (items.length > WORDBOOK_MAX_ENTRIES) throw badResponse({ count: items.length });
  const clean = WordbookArraySchema.safeParse(items);
  if (clean.success) {
    const report: WordbookReadReport = { salvaged: 0, dropped: 0, total: items.length };
    lastListRead = report;
    return { entries: unwrapParse(clean), report };
  }
  const { entries, report } = partitionEntries(items);
  lastListRead = report;
  return { entries, report };
}

export function wordbookQueryOptions() {
  return queryOptions({
    queryKey: wordbookKeys.list(),
    staleTime: 30 * 1000,
    // E4b3b 件B（A-87 #325）：REST 认 `with_progress=1` 后在取数这颗带上参数点亮进度三键
    // （读侧 `.passthrough()` 原样透传，见 `readWordbookList` 的两条分流路径）。`pull`/`push` 不在此表面。
    queryFn: () =>
      apiGet<WordbookEntryDto[]>(
        '/api/wordbook',
        { auth: true, query: { [WORDBOOK_PROGRESS_QUERY]: WORDBOOK_PROGRESS_QUERY_ON } },
        (raw) => readWordbookList(raw).entries,
      ),
  });
}

/**
 * §4.4.1 的增量拉取。两种形状都收：全量 `{version,updatedAt,entries}`（走
 * `WordbookPullResultSchema`）与增量 `{version,updatedAt,changed,removed}`（契约里
 * 没有增量的 schema —— 见报告"给 TPM/T-03 的需求"，这里只做 `version` 的最小校验）。
 *
 * A-40 #49②：全量快照里有一条旧 65-100 字符词时，整份 `WordbookPullResultSchema` 不收，
 * 但 `entries` 数组本身在那儿 ⇒ 走逐条分流；只有"既没有 `entries` 也没有 `changed`/`removed`"
 * 的半形才算认不出来，此时**退回全量重取一次**，仍不成才显式抛 `BAD_RESPONSE`（禁止静默空）。
 */
export interface WordbookPullShape {
  version: number;
  updatedAt: number;
  entries?: WordbookEntryDto[];
  changed?: WordbookEntryDto[];
  removed?: string[];
}

export type WordbookPullKind = 'full' | 'incremental' | 'unknown';

export interface WordbookPullRead {
  kind: WordbookPullKind;
  /** `unknown` 时为 null：调用方必须报错或退回全量重取，不得当成"没有变化"。 */
  shape: WordbookPullShape | null;
}

/** 纯函数：一份 pull 响应能认出成什么。两条用例钉它（`src/data/queries/wordbook.spec.ts`）。 */
export function readPullPayload(raw: unknown): WordbookPullRead {
  const strict = WordbookPullResultSchema.safeParse(raw);
  if (strict.success) {
    return { kind: 'full', shape: unwrapParse(strict) as unknown as WordbookPullShape };
  }
  if (!isRecord(raw) || !Number.isInteger(raw.version)) return { kind: 'unknown', shape: null };
  const version = raw.version as number;
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;
  if (Array.isArray(raw.entries)) {
    return {
      kind: 'full',
      shape: { version, updatedAt, entries: partitionEntries(raw.entries).entries },
    };
  }
  if (Array.isArray(raw.changed) || Array.isArray(raw.removed)) {
    const shape: WordbookPullShape = { version, updatedAt };
    if (Array.isArray(raw.changed)) shape.changed = partitionEntries(raw.changed).entries;
    if (Array.isArray(raw.removed)) {
      shape.removed = (raw.removed as unknown[])
        .filter((word): word is string => typeof word === 'string' && word.trim() !== '')
        .map((word) => word.trim());
    }
    return { kind: 'incremental', shape };
  }
  return { kind: 'unknown', shape: null };
}

const requestPull = (since?: number): Promise<unknown> =>
  apiGet<unknown>('/api/wordbook/pull', {
    auth: true,
    query: since === undefined ? undefined : { since },
  });

export async function pullWordbook(since?: number): Promise<WordbookPullShape> {
  const first = readPullPayload(await requestPull(since));
  if (first.shape) return first.shape;
  if (since === undefined) throw badResponse({ reason: 'pull-full-shape-unknown' });
  const retry = readPullPayload(await requestPull(undefined));
  if (retry.shape) return retry.shape;
  throw badResponse({ reason: 'pull-fallback-full-unknown', since });
}

/** 真正的写：离线优先。返回本地队列条目，UI 立刻乐观更新（R-16② 星标才入库）。 */
export function addWord(word: string, patch: UpsertPatch = {}): void {
  enqueueUpsert(word, patch);
}

export function removeWord(word: string): void {
  enqueueRemove(word);
}

/** 供 `offline-queue.flushOfflineQueue()` 注入的传输实现。 */
export const pushWordbook = (input: WordbookPushInputDto): Promise<WordbookPushResultDto> =>
  apiPost<WordbookPushResultDto>(
    '/api/wordbook/push',
    input,
    { auth: true },
    (raw) => unwrapParse(WordbookPushResultSchema.safeParse(raw)),
  );
