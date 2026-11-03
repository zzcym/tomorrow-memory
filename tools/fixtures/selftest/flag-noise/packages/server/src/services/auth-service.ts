// A-32-5 绿向 fixture：唯一的**运行时读点**在这里，其余同名词全部是噪音（见同目录的三个邻居文件）。
import type { AppDB } from '../db/types';

declare function readFlag(key: string): string;
declare function needsUpgrade(stored: string): boolean;

export async function issueTokens(db: AppDB, userId: string, stored: string) {
  const enforceUpgrade = readFlag('passwordUpgradeEnforce') === 'on' && needsUpgrade(stored);
  return { mustUpgradePassword: enforceUpgrade };
}
