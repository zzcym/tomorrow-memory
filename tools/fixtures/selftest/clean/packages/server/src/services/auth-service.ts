import type { AppDB } from '../db/types';

declare function readFlag(key: string): string;
declare function hash(pw: string): string;
declare function verify(hashStr: string, pw: string): boolean;
declare function needsUpgrade(stored: string): boolean;

export interface Session {
  token: string;
  mustUpgradePassword: boolean;
}

export async function issueTokens(db: AppDB, userId: string, password: string): Promise<Session> {
  const stored = await loadHash(db, userId);
  const enforceUpgrade = readFlag('passwordUpgradeEnforce') === 'on' && needsUpgrade(stored);
  if (!verify(stored, password)) {
    throw new Error('密码不正确');
  }
  if (enforceUpgrade) {
    await db.activateUser(userId, hash(password));
  }
  return { token: sign(userId), mustUpgradePassword: enforceUpgrade };
}

declare function sign(userId: string): string;
declare function loadHash(db: AppDB, userId: string): Promise<string>;
