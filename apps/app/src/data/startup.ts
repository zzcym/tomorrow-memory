/**
 * §5.5 的启动 / 回前台同步链（R-20 ①②④⑤、R-17 ⑨）。
 *
 * 四条硬约束在本文件里的落点：
 *  - **固定顺序**：1 补传离线队列 → 2 拉词本 → 3 刷新今日待背数 → 4 检查新版本；
 *  - **每步 try/catch 隔离**（R-20 ④ 的错误注入用例：第 1 步 reject，第 2/3/4 步仍执行）；
 *  - **离线不阻塞**：任何一步失败都不抛给调用方，冷启动仍然继续渲染首页；
 *  - 401/403 不在这里判断 —— 单点处理在 `rest-fetcher.handleAuthError()`（判据④）。
 *
 * 步骤之间只通过"结果数组 + 事件订阅"通信，不共享可变状态；UI 侧（`shell/`、T-17~T-19）
 * 只订阅本模块导出的 store，**不要自己再拼一份同步状态**。
 */

import {
  NOTICE_CHANNEL_COPY,
  SYNC_COPY,
  VERSION_PROMPT_SUPPRESS_HOURS,
} from '@tm/shared';
import {
  flushOfflineQueue,
  loadState,
  pendingCount,
  saveState,
} from './offline-queue.js';
import { pushWordbook, pullWordbook } from './queries/wordbook.js';
import { fetchDueCount } from './queries/review.js';
import { ApiError, apiGet, API_BASE, hasCredential } from './rest-fetcher.js';
import { currentAppVersion, kvGet, kvSet } from '../native/bridge.js';

export type StartupStepName = 'flush' | 'pull' | 'dueCount' | 'version';

/** §5.5 的固定顺序，判据④/⑥ 的断言就按这个数组做。 */
export const STARTUP_STEPS: readonly StartupStepName[] = ['flush', 'pull', 'dueCount', 'version'];

export interface StartupStepResult {
  step: StartupStepName;
  ok: boolean;
  /** 只用于诊断与测试断言；**不面向用户**（用户可见文案一律来自 `@tm/shared`）。 */
  error?: unknown;
  value?: unknown;
}

/** 依赖注入面：单测把任一步换成 reject 即可复现 R-20 ④ 的错误注入用例。 */
export interface StartupDeps {
  flush: () => Promise<unknown>;
  pull: (since: number) => Promise<unknown>;
  dueCount: () => Promise<number>;
  version: () => Promise<VersionPrompt | null>;
  now: () => number;
}

export interface RunStartupOptions {
  /** 跳过某些步（如未登录时不拉词本）。 */
  skip?: readonly StartupStepName[];
  deps?: Partial<StartupDeps>;
}

const defaultDeps: StartupDeps = {
  flush: () =>
    flushOfflineQueue(pushWordbook, {
      onSynced: (epochMs) => setSyncedAt(epochMs),
    }).then((r) => {
      if (!r.ok) setSyncFailed(true);
      else setSyncFailed(false);
      publishPending();
      return r;
    }),
  pull: async (since) => {
    const shape = await pullWordbook(since);
    const state = loadState();
    saveState({ ...state, baseVersion: shape.version });
    return shape;
  },
  dueCount: () => fetchDueCount(),
  version: () => checkAppVersion(),
  now: () => Date.now(),
};

/**
 * 跑完整四步。**永不 reject**（每步隔离），返回逐步结果。
 */
export async function runStartup(options: RunStartupOptions = {}): Promise<StartupStepResult[]> {
  const deps: StartupDeps = { ...defaultDeps, ...options.deps };
  const skip = options.skip ?? [];
  const results: StartupStepResult[] = [];
  const since = loadState().baseVersion;

  for (const step of STARTUP_STEPS) {
    if (skip.includes(step)) {
      results.push({ step, ok: false });
      continue;
    }
    try {
      const value = await runStep(step, deps, since);
      results.push({ step, ok: true, value });
      if (step === 'dueCount' && typeof value === 'number') setDueCount(value);
    } catch (error) {
      results.push({ step, ok: false, error });
    }
  }
  return results;
}

function runStep(step: StartupStepName, deps: StartupDeps, since: number): Promise<unknown> {
  switch (step) {
    case 'flush':
      return deps.flush();
    case 'pull':
      return deps.pull(since);
    case 'dueCount':
      return deps.dueCount();
    case 'version':
      return deps.version();
  }
}

/* ═════════════════ 同步状态 store（R-20 ⑤ 的 `已同步 · HH:MM`） ═════════════════ */

export interface SyncStatus {
  /** 最近一次"队列清空/补传成功"的时刻，0 = 本次会话尚未同步过。 */
  syncedAt: number;
  /** 本机待补传条数（>0 时显示 `待同步 N`）。 */
  pending: number;
  /** 补传彻底失败（≤3 次重试后仍失败）→ 只显示 `还没同步 · 联网后会自动补上`。 */
  failed: boolean;
  /** 今日待背数，null = 还没拿到。 */
  dueCount: number | null;
}

let status: SyncStatus = { syncedAt: 0, pending: 0, failed: false, dueCount: null };
const statusListeners = new Set<() => void>();

function notifyStatus(): void {
  for (const listener of Array.from(statusListeners)) {
    try {
      listener();
    } catch {
      /* 订阅方自己抛错不得影响启动链 */
    }
  }
}

/** 快照是**不可变引用**（`useSyncExternalStore` 按 Object.is 比较）。 */
export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function patchStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  notifyStatus();
}

export function setSyncedAt(epochMs: number): void {
  patchStatus({ syncedAt: epochMs, failed: false });
}

export function setSyncFailed(failed: boolean): void {
  patchStatus({ failed });
}

export function setDueCount(due: number | null): void {
  patchStatus({ dueCount: due });
}

export function publishPending(): void {
  patchStatus({ pending: pendingCount() });
}

/** `HH:MM`（R-19 ⑤ 的人话口径：只报时刻，不报任何服务端口径的名词）。 */
export function formatClock(epochMs: number, now: number = Date.now()): string | null {
  if (!epochMs || epochMs > now) return null;
  const d = new Date(epochMs);
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 同步区的一句文案（三态互斥，全部来自 `SYNC_COPY`，本文件不写任何字面文案）：
 * 待补传 > 0 → `待同步 N`；补传失败 → `还没同步 · 联网后会自动补上`；否则有同步时间 → `已同步 · HH:MM`。
 */
export function syncLabel(s: SyncStatus = status): string | null {
  if (s.pending > 0) return SYNC_COPY.pending(s.pending);
  if (s.failed) return SYNC_COPY.replayFail;
  const clock = formatClock(s.syncedAt);
  return clock ? SYNC_COPY.synced(clock) : SYNC_COPY.offlineQuiet;
}

/* ═════════════════ 第 4 步：版本检查（R-17 ⑨，判据⑥） ═════════════════ */

/** `GET /api/version` 的兼容读取面：服务端字段由 T-07 落地，这里按三种常见命名宽容取值。 */
export interface VersionInfo {
  latest: string;
  url: string;
  notes?: string;
}

export interface VersionPrompt extends VersionInfo {
  /** 展示文案固定 = `NOTICE_CHANNEL_COPY.updateAvailable`（全库唯一一份）。 */
  label: string;
}

/** 抑制键：记录"关掉的是哪个版本 + 关掉的时刻"。 */
export const VERSION_PROMPT_KEY = 'tm.versionPromptDismissed';

const SUPPRESS_MS = VERSION_PROMPT_SUPPRESS_HOURS * 60 * 60 * 1000;

interface DismissRecord {
  version: string;
  at: number;
}

function readDismissRecord(): DismissRecord | null {
  const raw = kvGet(VERSION_PROMPT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DismissRecord> | null;
    if (!parsed || typeof parsed.version !== 'string' || typeof parsed.at !== 'number') return null;
    return { version: parsed.version, at: parsed.at };
  } catch {
    return null;
  }
}

/** 关闭提示：`VERSION_PROMPT_SUPPRESS_HOURS`（= 24）小时内对**同一版本**不再提示。 */
export function dismissVersionPrompt(version: string, now: number = Date.now()): void {
  kvSet(VERSION_PROMPT_KEY, JSON.stringify({ version, at: now }));
  prompt = null;
  notifyPrompt();
}

/** 判据⑥ 的可测入口：给定当前版本 / 远端版本 / 关闭记录，要不要提示。 */
export function shouldShowVersionPrompt(
  current: string,
  latest: string,
  dismissed: DismissRecord | null,
  now: number = Date.now(),
): boolean {
  if (!isNewerVersion(latest, current)) return false;
  if (dismissed && dismissed.version === latest && now - dismissed.at < SUPPRESS_MS) return false;
  return true;
}

/** 只比较点分数字段；无 `v` 前缀、无 range 语义（R-17 ⑨ 不做强制更新）。 */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

function parseVersion(v: string): number[] {
  const parts: number[] = [];
  for (const raw of String(v || '').replace(/^v/i, '').split('.')) {
    const n = Number.parseInt(raw, 10);
    parts.push(Number.isNaN(n) ? 0 : n);
  }
  return parts;
}

/**
 * 版本清单拉取。`/api/version` 无 zod 契约（T-07 才落地）→ 只做宽容归一，
 * 并在这里登记为"给 TPM/T-03 的需求"。**离线/失败一律返回 null，不提示、不阻塞**（R-17 ⑨）。
 */
export async function fetchVersionInfo(): Promise<VersionInfo | null> {
  const raw = await apiGet<Record<string, unknown>>('/api/version', { auth: false });
  return normalizeVersionInfo(raw);
}

export function normalizeVersionInfo(raw: unknown): VersionInfo | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const data = (o.data ?? o) as Record<string, unknown>;
  const latest = pickString(data, ['latest', 'latestVersion', 'version', 'versionName']);
  const url = pickString(data, ['url', 'apkUrl', 'downloadUrl', 'link']);
  if (!latest || !url) return null;
  const notes = pickString(data, ['notes', 'releaseNotes', 'changelog']);
  return notes ? { latest, url, notes } : { latest, url };
}

function pickString(o: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = o[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

let prompt: VersionPrompt | null = null;
const promptListeners = new Set<() => void>();

function notifyPrompt(): void {
  for (const listener of Array.from(promptListeners)) {
    try {
      listener();
    } catch {
      /* 同上 */
    }
  }
}

/** 「我的/关于」页与顶部一次性横幅共用的待展示提示（判据⑥ 的唯一状态源）。 */
export function getPendingVersionPrompt(): VersionPrompt | null {
  return prompt;
}

export function subscribeVersionPrompt(listener: () => void): () => void {
  promptListeners.add(listener);
  return () => promptListeners.delete(listener);
}

/**
 * §5.5 第 4 步。返回本次要展示的提示（无新版本 / 在 24h 抑制窗口内 / 离线 → null）。
 * 未登录也检查（版本提示与账号无关）。
 */
export async function checkAppVersion(
  now: number = Date.now(),
): Promise<VersionPrompt | null> {
  try {
    const info = await fetchVersionInfo();
    if (!info) return prompt;
    const current = currentAppVersion();
    if (!shouldShowVersionPrompt(current, info.latest, readDismissRecord(), now)) {
      return prompt;
    }
    prompt = { ...info, label: NOTICE_CHANNEL_COPY.updateAvailable };
    notifyPrompt();
    return prompt;
  } catch (error) {
    /* 网络失败 / 404 / 形状不符：静默（R-17 ⑨"无网络时不提示、不阻塞进入首页"） */
    if (error instanceof ApiError) return null;
    return null;
  }
}

/** 测试用：把提示状态清干净，避免用例间互相污染。 */
export function resetVersionPrompt(): void {
  prompt = null;
  status = { syncedAt: 0, pending: 0, failed: false, dueCount: null };
  notifyPrompt();
  notifyStatus();
}

/* ═════════════════ 登录态相关：把"未登录就别打业务接口"收在一处 ═════════════════ */

/** 冷启动 / 回前台是否值得跑 1-3 步（401 已有单点处理，但没凭据时连请求都不该发）。 */
export function shouldRunSyncChain(): boolean {
  return hasCredential();
}

/** 供报告与排障：当前请求根址（`window.__API_BASE__` 可覆盖，沿用旧 `assets/api.js` 的开关名）。 */
export const requestBase = (): string => API_BASE;
