/**
 * A-18-1：`src/scripts/**` 的统一入口护栏（批次1 出口修复轮新增）。
 *
 * 背景（裁决 A-18 第 1 条）：本目录里多个脚本把逻辑直接写在模块顶层
 * （`main().catch(...)` 或顶层 `await`），于是**任何 import 都会立刻执行**——
 * `init-fsrs.ts` 的无条件 `main()` 会在被 import 时就去连库并**写 FSRS 卡片**，
 * 目标就是当时的默认 config（`.env` 里 `SQLITE_PATH=` 留空 → 仓库根真 `data.db`）。
 *
 * 本模块只给护栏，不碰任何业务逻辑；它自身**零顶层副作用**，可以安全被 import。
 * 口径与 `migrate.ts` 已有的 `invokedDirectly()` 保持一致（同一 `process.argv[1]` 比对写法），
 * 受保护路径的唯一定义源仍是 `migrate.ts:protectedSqlitePaths()`（用动态 import 取，
 * 免得只要用护栏的脚本都被拖进整个 DB 层）。
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 与 `migrate.ts` 的 `invokedDirectly()` 同一实现口径：只有 `node/tsx 本文件` 时为 true。
 *
 * **`moduleUrl` 必须由调用脚本传自己的 `import.meta.url`**：护栏是被 import 的共享模块，
 * 它内部的 `import.meta.url` 永远是 `entry-guard.ts` 自己，绝不可能等于 `process.argv[1]`
 * ——`migrate.ts` 里那份局部实现能直接用 `import.meta.url`，搬进共享模块就必须改成显式入参
 * （否则脚本连"直接执行"时都不会跑，方向上偏保守但等于把脚本废掉）。
 */
export function invokedDirectly(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const strip = (s: string): string =>
    decodeURIComponent(s).replace(/^file:\/\/?/, '').replace(/\\/g, '/').toLowerCase();
  return strip(moduleUrl) === strip(pathToFileURL(entry).href);
}

/**
 * 只在"作为入口被直接执行"时跑 `main()`。
 * 被 import（含 vitest 的用例发现过程加载测试文件时顺带加载的模块）时什么都不做。
 * `moduleUrl` 传调用脚本自己的 `import.meta.url`（见上）。
 */
export function runWhenDirect(main: () => Promise<void>, label: string, moduleUrl: string): void {
  if (!invokedDirectly(moduleUrl)) return;
  main().catch((err) => {
    console.error(`${label} 失败:`, err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

/** 写库类脚本的唯一放行开关。 */
export const FORCE_DB_FLAG = '--force-db';

export function hasForceDbArg(argv: string[] = process.argv.slice(2)): boolean {
  return argv.includes(FORCE_DB_FLAG);
}

/** `--force-db` 之外的参数原样留给脚本自己解析（未知参数由调用方决定怎么处理）。 */
export function stripForceDbArg(argv: string[] = process.argv.slice(2)): string[] {
  return argv.filter((a) => a !== FORCE_DB_FLAG);
}

/**
 * 写库类脚本的目标闸门（A-18-1 的第二半）。
 *
 * 拒绝条件（任一命中即 exit 非 0，并打印人话原因）：
 *  - `DB_DRIVER=sqlite` 且**没有显式设 `SQLITE_PATH`**（`.env` 里留空也算没设）→
 *    config 的兜底目标就是仓库根 `data.db`；
 *  - 目标落在 `protectedSqlitePaths()`（仓库根 `data.db` / `packages/server/data.db`）；
 *  - `DB_DRIVER=pg` 且 `DATABASE_URL` 完全没配（连的是代码里的默认串）。
 * 放行方式：显式 `SQLITE_PATH=<别的路径>`（pg 侧为显式 `DATABASE_URL`），或 `--force-db`。
 *
 * @returns 一行人话的目标描述（pg 侧已脱敏），供调用方打印。
 * @throws Error 命中拒绝条件且未给 `--force-db`
 */
export async function assertExplicitWriteTarget(scriptName: string, force = false): Promise<string> {
  const { loadConfig } = await import('../config.js');
  const { protectedSqlitePaths } = await import('./migrate.js');
  const config = loadConfig();

  if (config.dbDriver !== 'sqlite') {
    if (config.databaseUrl === '') {
      throw new Error(
        `${scriptName} 要写库，但 DB_DRIVER=pg 且 DATABASE_URL 未配置（会落到代码里的默认串）。\n` +
          '  请显式给 DATABASE_URL=... ，或改用 SQLITE_PATH=... 指到临时副本，或 --force-db。',
      );
    }
    const masked = config.databaseUrl.replace(/:[^:@/]*@/, ':***@');
    if (!force) {
      return `pg（DATABASE_URL 显式配置：${masked}）`;
    }
    return `pg（--force-db 放行，DATABASE_URL=${masked}）`;
  }

  const target = path.resolve(config.sqlitePath);
  const explicitSqlitePath = String(process.env.SQLITE_PATH ?? '').trim() !== '';
  const protectedTarget = protectedSqlitePaths().includes(target);
  if (force) {
    return `sqlite:${target}（--force-db 放行${protectedTarget ? '，注意：这是仓库里的真库文件' : ''}）`;
  }
  if (!explicitSqlitePath) {
    throw new Error(
      `拒绝执行：${scriptName} 会写库，但没有显式设置 SQLITE_PATH。\n` +
        `  当前兜底目标 = ${target}（config 的 DATA_DIR/data.db；仓库根就是真库 data.db）。\n` +
        '  请 SQLITE_PATH=./tmp/xxx.db pnpm --filter @tm/server ... 指到临时副本；\n' +
        '  确实要动真库文件，才加 --force-db（PRD §6.4-2 步 6b：先 cp 副本再演练）。',
    );
  }
  if (protectedTarget) {
    throw new Error(
      `拒绝执行：SQLITE_PATH 指向仓库里的真库文件 ${target}。\n` +
        '  演练/验收一律先 cp 到临时副本再跑（PRD §6.4-2 步 6b①）；确实要对这个文件动手才加 --force-db。',
    );
  }
  return `sqlite:${target}`;
}

/** 给只打 HTTP 接口的脚本用的一行人话提示（不判红：写不写库由被调的 server 决定）。 */
export function httpTargetBanner(scriptName: string, base: string): string {
  return (
    `[${scriptName}] 目标 = ${base}（通过 HTTP/WS 写入正在运行的服务进程所使用的库；` +
    '本脚本不直接开库句柄。要打临时库，请先把 server 用 SQLITE_PATH=... 起在别处。）'
  );
}
