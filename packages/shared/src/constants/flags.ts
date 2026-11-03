/**
 * 运行时开关的**默认值单一源**（§4.4.4 / PRD §6.4-7；`tools/boundaries.mjs --flags` 直接 grep 本文件）。
 * 落库与读取归 T-06/T-07（表 `feature_flags`、`services/feature-flags.ts`），
 * 本文件只提供"种子值 + 键名 + 放量档位"，其他任何地方不得再写第二份默认值。
 *
 * 注意：`passwordUpgradeEnforce` 在此只是**定义/种子**位置（`boundaries.mjs` 的
 * `ENFORCE_DEFINITION_FILES` 已放行本文件）；§4.7 明令"代码内不得读该 flag"，
 * 全库唯一读取点必须是 `auth-service.issueTokens` 的"是否发正常 token"那一处。
 */

/** 8 个开关的键名联合（表 `feature_flags.key` 的合法值域）。 */
export type FeatureFlagKey =
  | 'wordbookIncremental'
  | 'explicitFavorite'
  | 'autoFavoriteDefault'
  | 'studyModes'
  | 'dailyReminder'
  | 'passwordRegister'
  | 'avatarUnifiedLimit'
  | 'passwordUpgradeEnforce';

/**
 * PRD §6.4-7 的初值（字符串口径与 `tools/boundaries.mjs` 的 `FLAG_DEFAULTS` 逐字相同）。
 * **本对象必须写在文件里第一个出现这 8 个键的位置**：`--flags` 断言按
 * `key\s*:\s*['"]…['"]` 取首个匹配，键名表一类的 `k: 'k'` 写法会把它带偏，
 * 所以下面的 `FEATURE_FLAGS` 用 `Object.fromEntries` 派生，不落第二份字面量。
 */
export const FEATURE_FLAG_DEFAULTS: Record<FeatureFlagKey, string> = {
  wordbookIncremental: '0%',
  explicitFavorite: 'on',
  autoFavoriteDefault: 'off',
  studyModes: 'on',
  dailyReminder: 'on(20:30)',
  passwordRegister: 'on',
  avatarUnifiedLimit: 'on',
  passwordUpgradeEnforce: 'on',
};

/** 开关键名（表 `feature_flags.key`），由初值对象的键派生。 */
export const FEATURE_FLAGS = Object.fromEntries(
  (Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlagKey[]).map((k) => [k, k]),
) as Record<FeatureFlagKey, FeatureFlagKey>;

/** `feature_flags.value` 的合法形态：百分比放量或 on/off。 */
export const FLAG_ON = 'on';
export const FLAG_OFF = 'off';

/** R-03⑤：三档放量（10% → 50% → 100%），每档提升前必须满足 R-03⑥ 的抽样比对。 */
export const WORDBOOK_INCREMENTAL_ROLLOUT = ['0%', '10%', '50%', '100%'] as const;

/**
 * §4.4.4 的尾号规则写死：`Math.abs(userId) % 100 < pct`，**不引入哈希**
 * （哈希会让"同一人两次请求不同结果"无法解释）。本函数是全库唯一实现，供 T-09 直接复用。
 */
export function isFlagBucketOn(userId: number, percent: string | number): boolean {
  const pct = typeof percent === 'number' ? percent : Number.parseInt(String(percent).replace('%', ''), 10);
  if (!Number.isFinite(pct)) return false;
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  return Math.abs(Math.trunc(userId)) % 100 < pct;
}

/** `on(20:30)` 这类"开关 + 参数"形态的解析（dailyReminder 用）。 */
export function parseFlagValue(value: string): { on: boolean; arg: string | null } {
  const v = (value || '').trim();
  if (v === FLAG_OFF) return { on: false, arg: null };
  const m = /^on(?:\((.*)\))?$/i.exec(v);
  if (m) return { on: true, arg: m[1] ?? null };
  const pct = Number.parseInt(v.replace('%', ''), 10);
  if (Number.isFinite(pct)) return { on: pct > 0, arg: v };
  return { on: false, arg: null };
}
