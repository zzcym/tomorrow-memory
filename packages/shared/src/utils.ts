/**
 * 共享工具函数
 *
 * C-11（审计）：连胜计算在 `packages/server/src/db/pg.ts` 与 `sqlite.ts` 各有一份、
 * 本文件又有一份。本文件是**唯一实现**：两处 db 与所有客户端都改为调用
 * `computeStreak()` / `computeStreakFromTimestamps()`（T-06 收 db、T-08 收路由）。
 * 语义保持与现网一致：`dates` 按日期降序、允许"昨天"起算，断一天即归零。
 */

import { PASSWORD_MIN, type LookupDirectionValue } from './constants/limits.js';

/** 生成 YYYY-MM-DD 日期字符串（本地时区） */
export function getDateStr(d: Date = new Date()): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/** 计算连续打卡天数（dates 需按日期降序排列） */
export function computeStreak(datesDesc: string[], today: Date = new Date()): number {
  let streak = 0;
  for (let i = 0; i < datesDesc.length; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const expected = getDateStr(d);
    if (datesDesc[i] === expected) streak++;
    else break;
  }
  return streak;
}

/**
 * 从任意顺序的日期字符串（YYYY-MM-DD）算连胜：内部排序 + 去重，语义同 `computeStreak`。
 * 服务端 `getStreak()` 与 App 离线计数都走这一个函数。
 */
export function computeStreakFromDates(dates: readonly string[], today: Date = new Date()): number {
  const uniq = [...new Set(dates)].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return computeStreak(uniq, today);
}

/** 从毫秒时间戳集合算连胜（`checkins`/`reviews` 表的原始列形状，无需先转日期字符串）。 */
export function computeStreakFromTimestamps(
  timestamps: readonly number[],
  today: Date = new Date(),
): number {
  return computeStreakFromDates(
    timestamps.map((ms) => getDateStr(new Date(ms))),
    today,
  );
}

/**
 * R-13③④ 的"连续 N 天"读取口径：**今天还没打卡时，从昨天起算**（否则未打卡状态会显示 `连续 0 天`，
 * 与 UI §6.4 打卡表的 `今天打卡` + `连续 36 天` 判据冲突）。
 *
 * 现状登记（缺陷，非本任务修复面）：`db/sqlite.ts:297` 与 `db/pg.ts:506` 用的都是 `computeStreak`，
 * 即"今天必须已打卡才非零"。本函数是**新增导出**，不改任何既有行为；
 * 状态展示位（`checkin.status` / 学情三卡 / 小组件）应在 T-10 切到本函数。
 */
export function currentStreak(dates: readonly string[], today: Date = new Date()): number {
  const fromToday = computeStreakFromDates(dates, today);
  if (fromToday > 0) return fromToday;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return computeStreakFromDates(dates, yesterday);
}

/**
 * 密码强度四档（UI §3.9.2 强度条的**唯一计算**；四档标签在 `constants/copy.ts` 的
 * `AUTH_COPY.strengthLevels`，两者索引一一对应）。
 *  0 = 未达 `PASSWORD_MIN`；1 = 达标但单一；2 = 长度或多样性较好；3 = 长且混合字母数字。
 * 本函数只做展示分级，**不得**用作放行判据（放行只看 `PASSWORD_MIN` / `PASSWORD_MAX_BYTES`）。
 */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  const p = pw ?? '';
  if (p.length < PASSWORD_MIN) return 0;
  const lower = /[a-z]/.test(p);
  const upper = /[A-Z]/.test(p);
  const digit = /\d/.test(p);
  const symbol = /[^\w\s]/.test(p);
  const classes = [lower, upper, digit, symbol].filter(Boolean).length;
  if (p.length >= 12 && classes >= 2) return 3;
  if (classes >= 2 || p.length >= 12) return 2;
  return 1;
}

/** 手机号脱敏：138****1234 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/** 语言检测：根据字符集判断输入语言 */
export function detectLanguage(text: string): 'zh' | 'en' | 'mixed' {
  const hasChinese = /\p{sc=Han}/u.test(text);
  const hasEnglish = /[a-zA-Z]/.test(text);
  if (hasChinese && hasEnglish) return 'mixed';
  if (hasChinese) return 'zh';
  return 'en';
}

/**
 * 「换个查询方向」的目标档 = **生效方向**的纯反向（A-89 #342 单点，两端各删本地实现、不留转发壳）。
 * 不按输入字符猜：两端方向链的 `aria-label` 三元（App `DirectionLink` / Web `result-section`）
 * 本就是"非 `zh2en` 即承诺改用中译英"⇒ `auto` 归 `zh2en` 与标签同口径。
 */
export function flipLookupDirection(applied: LookupDirectionValue): LookupDirectionValue {
  return applied === 'zh2en' ? 'en2zh' : 'zh2en';
}

/** 解析 stardict translation 字段（"n. 冲突, 矛盾\nvi. 争执"） */
export function parseTranslation(trans: string | null | undefined): TranslationGroupLike[] {
  if (!trans) return [];
  const groups: TranslationGroupLike[] = [];
  const lines = trans.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    const m = line.match(/^(\[?\w+\]?\.?)\s*(.+)/);
    if (m) {
      groups.push({
        pos: m[1]!.trim(),
        meanings: m[2]!
          .split(/[,;，；]/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
    } else {
      if (groups.length === 0) groups.push({ pos: '', meanings: [line.trim()] });
    }
  }
  return groups;
}

interface TranslationGroupLike {
  pos: string;
  meanings: string[];
}

/** 解析 stardict exchange 字段（"s:hellos/p:..."） */
export function parseExchange(ex: string | null | undefined): Record<string, string> {
  if (!ex) return {};
  const result: Record<string, string> = {};
  const parts = ex.split('/');
  const map: Record<string, string> = {
    s: 'plural',
    p: 'past',
    i: 'present',
    '3': 'third',
    d: 'pastParticiple',
    r: 'comparative',
    t: 'superlative',
    '0': 'base',
    '1': 'base',
  };
  for (const p of parts) {
    const [k, v] = p.split(':');
    if (k && v) result[map[k] ?? k] = v;
  }
  return result;
}

/** 简单 JSON 安全解析 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
