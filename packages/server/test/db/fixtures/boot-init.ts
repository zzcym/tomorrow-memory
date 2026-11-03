/**
 * A-32-1(b) 启动自检夹具（被 `boot-check.spec.ts` 用 `tsx` **子进程**起，不是用例本体）。
 *
 * 为什么要子进程：豁免判据里有一条"测试进程（`VITEST`）放行"，因为并行期十几个用例文件
 * 都要在临时库上"先 init 再 migrate"（T-07 报告 §8-1 写明的就是这条路）。
 * 于是**服务进程**那一支必须在真实进程语义里验：非 vitest、非迁移引导入口、非显式豁免
 * ⇒ 未迁移库上的 `init()` 就该以非 0 退出码失败，并把 `pnpm db:migrate` 打出来。
 *
 * 只走 `SqliteAppDB.init()` 这一条真实启动路径（不 import `src/index.ts`：那会连带起
 * Redis / ClickHouse / agent，且要绑端口），失败即 exit 1、成功打印 BOOT-OK。
 */

import process from 'node:process';
import Database from 'better-sqlite3';
import { SqliteAppDB } from '../../../src/db/sqlite.js';

const file = String(process.env.SQLITE_PATH ?? '');
if (file === '') {
  console.error('BOOT-NO-SQLITE-PATH');
  process.exit(2);
}

const app = new SqliteAppDB(new Database(file));
try {
  await app.init();
  await app.close();
  console.log('BOOT-OK');
} catch (err) {
  console.error(`BOOT-FAIL: ${(err as Error).message}`);
  process.exit(1);
}
