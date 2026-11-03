/**
 * A-32-1(b) 启动自检夹具（pg 侧，被 `boot-check.spec.ts` 用 `tsx` **子进程**起，不是用例本体）。
 *
 * 本机没有 PostgreSQL 实例（A-18-3），但"两侧对称：同一判据、同一条消息"这条判据不需要真库也能钉死：
 * 这里给 `PostgresAppDB.init()` 装一个**语句桩池**——只认 init() 实际发出的那几条语句
 * （`CREATE TABLE …` / `CREATE INDEX …` / 那条 `information_schema.columns` introspection），
 * **认不出来就抛**，桩不许把"驱动其实没这么写"糊过去。
 * `PG_USERS_COLUMNS` 决定 introspection 回报哪几列，于是可以分别模拟"未迁移库"与"已迁移库"。
 *
 * 为什么走子进程而不是在用例里直接调：豁免判据里有一条"测试进程（`VITEST`）放行"
 * （并行期十几个用例文件都要先 init 再显式 migrate，见 T-07 报告 §8-1）。
 * 要验**服务进程**那一支就得有真实进程语义 —— 与 `boot-init.ts`（sqlite 真库）完全同一条路。
 */

import process from 'node:process';
import pg from 'pg';
import { PostgresAppDB } from '../../../src/db/pg.js';

const usersColumns = String(process.env.PG_USERS_COLUMNS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s !== '');

const INTROSPECTION = /information_schema\.columns[\s\S]*table_name = 'users'/;

const pool = {
  query: async (text: string) => {
    const sql = String(text).replace(/\s+/g, ' ').trim();
    if (INTROSPECTION.test(sql)) {
      return { rows: usersColumns.map((name) => ({ name })) };
    }
    if (/^CREATE (TABLE|INDEX) (IF NOT EXISTS )?\b/i.test(sql)) return { rows: [] };
    throw new Error(`桩不认的 SQL：${sql}`);
  },
  connect: async () => {
    throw new Error('init() 不该开事务');
  },
  end: async () => undefined,
} as unknown as pg.Pool;

try {
  const app = new PostgresAppDB(pool);
  await app.init();
  await app.close();
  console.log('BOOT-OK');
} catch (err) {
  console.error(`BOOT-FAIL: ${(err as Error).message}`);
  process.exit(1);
}
