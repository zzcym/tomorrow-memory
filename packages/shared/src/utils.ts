/**
 * 共享工具函数
 */

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
