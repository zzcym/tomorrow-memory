/** 开关初值唯一源（§6.4-2 步 8；PRD §6.4-7）。改这里之前先看 §4.7。 */
export const FLAG_DEFAULTS = {
  wordbookIncremental: '0%',
  explicitFavorite: 'on',
  autoFavoriteDefault: 'off',
  studyModes: 'on',
  dailyReminder: 'on(20:30)',
  passwordRegister: 'on',
  avatarUnifiedLimit: 'on',
  passwordUpgradeEnforce: 'on',
} as const;

export type FlagKey = keyof typeof FLAG_DEFAULTS;
