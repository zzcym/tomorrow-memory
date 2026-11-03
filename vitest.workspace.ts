import { fileURLToPath } from 'node:url';
import { defineWorkspace } from 'vitest/config';

/**
 * T-01 仓库与构建基线：全仓测试目录的唯一登记处（S14）。
 * 后续任务只在 `packages/<x>/test/**` 或 `apps/<x>/test/**` 下放 `*.spec.ts(x)`，
 * 不要在包内另建 vitest.config.ts，也不要改本文件以外的测试装配点。
 * - @tm/ui / @tm/app 跑在 jsdom（组件与 WebView 宿主行为），其余包跑在 node。
 *   （A-30-5 起 jsdom 那一档再加 `@tm/web`：Next 页面与首页外壳是浏览器组件。）
 * - inline @tm/ui / @tm/shared：两者都是"源码直出"包（§3.1），必须经 Vite 转译而非 externalize。
 *
 * A-18-2：project 的 `root` 必须是**绝对路径**。vitest 3 把 workspace project 的相对 `root`
 * 解析到 CLI 的 process.cwd()（而非本文件所在目录），于是 `pnpm --filter @tm/server test`
 * （cwd = packages/server）会把项目根算成 packages/server/packages/server → 发现 0 用例。
 * 各包 `test` 脚本统一带 `--root ../..`（这样才读得到本装配文件），项目根由下面的绝对路径钉死，
 * 于是任一 cwd 下的用例发现口径都一致。
 *
 * A-30-5（出口轮 E2）：本装配文件此前**缺 `@tm/web`** ⇒ `apps/web/test/**` 在 `pnpm test`（根命令）里
 * 一条都不进收集、且**不报错**（"静默不跑"）。现补 `@tm/web` 一条，写法与 `@tm/app` 同套
 * （`jsdom` + `server.deps.inline`），发现口径共用 `SPEC_INCLUDE`，`root` 同样是绝对路径。
 * 该包额外需要 `resolve.alias` 的 `@` → `apps/web/src`：`apps/web/tsconfig.json` 的 `paths` 里
 * `@/*` 是 Next 自己消费的，Vite/vitest 不会自动读 tsconfig paths，不显式配就会在收集阶段
 * `Failed to resolve import "@/app/(user)/page"` —— 这是**用例发现失败**，不是放宽任何断言。
 */
const projectRoot = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/** 全部包共用同一发现口径：`test/**` 与 `src/**` 下的 `*.spec.ts(x)`。 */
const SPEC_INCLUDE = ['test/**/*.spec.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'];

export default defineWorkspace([
  {
    test: {
      name: '@tm/shared',
      root: projectRoot('./packages/shared'),
      environment: 'node',
      include: SPEC_INCLUDE,
    },
  },
  {
    test: {
      name: '@tm/ui',
      root: projectRoot('./packages/ui'),
      environment: 'jsdom',
      include: SPEC_INCLUDE,
      server: { deps: { inline: ['@tm/ui', '@tm/shared'] } },
    },
  },
  {
    test: {
      name: '@tm/server',
      root: projectRoot('./packages/server'),
      environment: 'node',
      include: SPEC_INCLUDE,
      server: { deps: { inline: ['@tm/shared'] } },
    },
  },
  {
    test: {
      name: '@tm/agent',
      root: projectRoot('./packages/agent'),
      environment: 'node',
      include: SPEC_INCLUDE,
      server: { deps: { inline: ['@tm/shared'] } },
    },
  },
  {
    test: {
      name: '@tm/app',
      root: projectRoot('./apps/app'),
      environment: 'jsdom',
      include: SPEC_INCLUDE,
      server: { deps: { inline: ['@tm/ui', '@tm/shared'] } },
    },
  },
  {
    test: {
      name: '@tm/web',
      root: projectRoot('./apps/web'),
      environment: 'jsdom',
      include: SPEC_INCLUDE,
      server: { deps: { inline: ['@tm/ui', '@tm/shared'] } },
    },
    // Next 的 `@/*` 只写在 apps/web/tsconfig.json 的 paths 里，Vite 不读 tsconfig paths，
    // 故在此显式登记同一份别名，使 `@/app/(user)/page`、`@/components/**` 可被解析。
    resolve: {
      alias: { '@': projectRoot('./apps/web/src') },
    },
    // `apps/web/tsconfig.json` 的 `jsx` 是 Next 约定的 `"preserve"`（@tm/ui / @tm/app 都是 `react-jsx`）。
    // esbuild 遇 `preserve` 会编成 `React.createElement` 而不注入 import → 凡 `@tm/web` 源码里没有
    // `import * as React` 的组件在测试里全报 `ReferenceError: React is not defined`（实测 8 条假红）。
    // Next 自己的 SWC 管线按自动运行时编译，所以这里把 transform 对齐到 Next 的实际语义；
    // 只改测试运行时的编译方式，不动任何源码、不放宽一条断言。
    esbuild: { jsx: 'automatic' },
  },
]);
