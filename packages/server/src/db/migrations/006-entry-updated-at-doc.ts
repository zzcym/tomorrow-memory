/**
 * M6 `006-entry-updated-at-doc` —— **无 DDL**：`wordbooks.data` 条目新增可选键 `updatedAt`
 *
 * PRD §6.1-3 允许"整数组形状不动、条目内只新增可选键"。本迁移做三件事：
 *   ① 把口径写进 schema 源（`WORDBOOK_ENTRY_OPTIONAL_KEYS` + 注释），供 T-09/T-21 读；
 *   ② 注册 `verifyWordbookEntryDoc()` —— 一次 **dry-parse**：拿现有条目跑
 *      `WordbookEntrySchema`（`.passthrough()`），断言"多一个 `updatedAt` 键不改变已有键的校验结果"；
 *   ③ 在 `_migrations` 里留下这一格，使 M6 与 M1-M5 一样可追溯。
 *
 * **默认不执行任何读写**：`verifyWordbookEntryDoc()` 只在
 * `pnpm --filter @tm/server migrate --verify-data` 显式要求时才在副本上跑（判据⑤的同一条红线：
 * 迁移路径里不碰业务数据）。传进去的是已读出的 JSON 文本，函数本身是纯函数。
 */

import { parseWordbookEntry } from '@tm/shared';
import { WORDBOOK_ENTRY_OPTIONAL_KEYS, WORDBOOK_ENTRY_OPTIONAL_KEYS_NOTE } from '@tm/shared/schema';
import type { Migration } from './index.js';

export interface EntryDocCheckResult {
  ok: boolean;
  checked: number;
  /** 校验失败的条目下标 + 原因（只报下标，不回显用户内容）。 */
  failures: Array<{ index: number; reason: string }>;
}

/**
 * R-03③ 的兼容判据：加了 `updatedAt` 的条目必须仍被 `WordbookEntrySchema` 接受，
 * 且**不影响**原有四个键（word/addedAt/lastReview/reviewCount）的解析结果。
 * @param rawJson `wordbooks.data` 的原始 JSON 文本（数组）
 */
export function verifyWordbookEntryDoc(rawJson: unknown): EntryDocCheckResult {
  const parsed: unknown = typeof rawJson === 'string' ? safeJson(rawJson) : rawJson;
  if (!Array.isArray(parsed)) return { ok: false, checked: 0, failures: [{ index: -1, reason: 'wordbooks.data 不是数组' }] };
  const failures: EntryDocCheckResult['failures'] = [];
  parsed.forEach((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      failures.push({ index, reason: '条目不是对象' });
      return;
    }
    const baseline = parseWordbookEntry(entry);
    const withKey = parseWordbookEntry({ ...(entry as Record<string, unknown>), updatedAt: 1_700_000_000_000 });
    if (!withKey.success) {
      failures.push({ index, reason: `新增可选键 ${WORDBOOK_ENTRY_OPTIONAL_KEYS[0]} 后校验失败：${withKey.error.issues[0]?.message ?? '未知原因'}` });
      return;
    }
    if (baseline.success) {
      const same = Object.keys(baseline.data).every(
        (k) => k === 'updatedAt' || JSON.stringify((baseline.data as Record<string, unknown>)[k]) === JSON.stringify((withKey.data as Record<string, unknown>)[k]),
      );
      if (!same) failures.push({ index, reason: '新增可选键改变了已有键的解析结果' });
    }
  });
  return { ok: failures.length === 0, checked: parsed.length, failures };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export const migration: Migration = {
  name: '006-entry-updated-at-doc',
  title: 'wordbooks.data 条目可选键 updatedAt：文档 + dry-parse 注册（无 DDL）',
  notes: WORDBOOK_ENTRY_OPTIONAL_KEYS_NOTE,
  statements: () => [],
  noDownReason:
    'M6 无 DDL：可选键由旧客户端的 passthrough schema 自动容忍，旧镜像读不到该键也不报错，' +
    '因此不存在"回滚该迁移"这个动作（要停用只需 T-09 不再写这个键）。',
};

export default migration;
