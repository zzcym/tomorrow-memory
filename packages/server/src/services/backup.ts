/**
 * 每日自动备份（PostgreSQL pg_dump）
 * 与 server.js 行为一致：启动 5 分钟后首次备份，之后每 24 小时一次，保留最近 30 天。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { AppConfig } from '../config.js';

export function findPgDump(config: AppConfig): string {
  if (process.env.PGDUMP_BIN) return process.env.PGDUMP_BIN;
  const localBin = path.join(
    config.dataDir,
    'pgsql',
    'bin',
    process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump',
  );
  if (fs.existsSync(localBin)) return localBin;
  return process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
}

export function scheduleBackup(config: AppConfig, databaseUrl: string): void {
  const backupDir = path.join(config.dataDir, 'backups');
  const bin = findPgDump(config);

  function backup(): void {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const now = new Date();
    const stamp =
      now.getFullYear() +
      '-' +
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getDate()).padStart(2, '0');
    const backupPath = path.join(backupDir, 'pg-' + stamp + '.dump');
    execFile(
      bin,
      ['--dbname=' + databaseUrl, '--format=custom', '--no-password', '--file=' + backupPath],
      (err) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') {
            console.error(
              '[BACKUP] 找不到 pg_dump，跳过备份。请安装 postgresql-client 或设置 PGDUMP_BIN',
            );
          } else {
            console.error('[BACKUP] 备份失败:', err.message);
          }
          return;
        }
        const files = fs
          .readdirSync(backupDir)
          .filter((f) => /^pg-\d{4}-\d{2}-\d{2}\.dump$/.test(f))
          .sort();
        while (files.length > 30) {
          fs.unlinkSync(path.join(backupDir, files.shift()!));
        }
        console.log('[BACKUP] PostgreSQL 已备份到', backupPath);
      },
    );
  }

  setTimeout(() => {
    backup();
    setInterval(backup, 24 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);
}
