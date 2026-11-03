// ESLint 9 flat config
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Node/BOM 全局名（flat config 没有 env 机制）。只给仓库里的 .mjs/.cjs 工具脚本用，
 * 不为此引入 globals 依赖（T-01：eslint.config.js 归构建基线）。
 */
const runtimeGlobals = {
  // Node
  process: 'readonly',
  Buffer: 'readonly',
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  __dirname: 'readonly',
  __filename: 'readonly',
  globalThis: 'readonly',
  console: 'readonly',
  structuredClone: 'readonly',
  // timers / 通用异步
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  queueMicrotask: 'readonly',
  performance: 'readonly',
  // WHATWG / Web API（Node 18+ 亦内置）
  fetch: 'readonly',
  Headers: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  Blob: 'readonly',
  FormData: 'readonly',
  ReadableStream: 'readonly',
  WritableStream: 'readonly',
  TransformStream: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  EventTarget: 'readonly',
  MessageChannel: 'readonly',
  WebSocket: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  crypto: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
};

/**
 * S15：depcruise(T-02) 是主门禁，这里的 no-restricted-imports 只是"写错当场红"的辅助层。
 *
 * A-14：`*-no-io` 家族（uiForbidden / sharedForbidden）的作用面**只覆盖 `src/**`**，
 * `test/**` 一并豁免 —— "组件/契约包不得做 IO"针对的是被打进产物的代码，测试不进产物。
 * 同一口径在 `.dependency-cruiser.cjs`（ui-no-io / shared-pure / shared-pure-core 的 from.path）
 * 与 `tools/boundaries.mjs`（ui-no-io-globals / shared-pure-env 的 roots = `packages/<x>/src`）同步收窄，
 * 三处同 ID 同面。**被禁模块清单一条都未放宽**（axios/node-fetch/got/superagent/next/@trpc/@tm/server/@tm/agent
 * 与 node:* 全部保留）。
 */
const uiForbidden = {
  paths: [
    {
      name: '@tm/server',
      message: 'packages/ui 只渲染不请求（§3.1、顶层边界规则①）；宿主能力经 UiHost 注入。',
    },
    { name: '@tm/agent', message: 'packages/ui 不得依赖 agent（§3.5 ui-no-io）。' },
    {
      name: 'next/navigation',
      message: 'packages/ui 不得绑定 Next 路由（§3.1）；请经 UiHost.navigate。',
    },
  ],
  patterns: [
    { group: ['@trpc/*'], message: 'packages/ui 不发请求（§3.5 ui-no-io）。' },
    { group: ['next/*'], message: 'packages/ui 必须宿主无关（§3.2 双宿主）。' },
    {
      group: ['axios', 'undici', 'node:*'],
      message: 'packages/ui 禁止 IO 依赖（§3.5 ui-no-io）。',
    },
  ],
};

const appForbidden = {
  paths: [
    { name: '@tm/server', message: 'apps/app 只经 REST 访问后端（S9、§5.2）。' },
    {
      name: '@tm/agent',
      message: 'apps/app 不得直达 agent（§3.5 review-no-agent 的客户端侧前提）。',
    },
  ],
  patterns: [
    { group: ['@trpc/*'], message: 'App 走 REST，不接 tRPC client（S9）。' },
    { group: ['next/*'], message: 'apps/app 是 Vite SPA（S8）。' },
    { group: ['@tm/web*'], message: 'apps/app 与 apps/web 互不可达（顶层边界规则③）。' },
  ],
};

const sharedForbidden = {
  patterns: [
    {
      group: ['node:*', 'fs', 'http', 'path', 'os'],
      message: 'packages/shared 必须无 IO（§3.3 ⛔）。',
    },
    {
      group: ['@trpc/*', '@tm/server*', '@tm/agent*', 'react', 'react-dom'],
      message: 'packages/shared 只放契约与常量（§3.3 ⛔）。',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/*.js',
      'node_modules/',
      'backups/',
      'pgdata/',
      'pgsql/',
      '_archive/',
      '*.db',
      '*.db-*',
      // 兄弟项目「明日日程」：随仓库存放的参考实现，不是本期 workspace 成员，也不在 02-tech-design §2 的目标树里。
      // 它的遗留脚本按本期规则集会持续报未使用变量，而 files 边界归其它任务 → 从 lint 作用域中排除。
      'mobile-agenda/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: {
          // 根级配置文件（vitest.workspace.ts 等）不在任何 tsconfig 的 include 里
          allowDefaultProject: ['*.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  {
    // 仓库级工具脚本（含 T-02 的 tools/*.mjs、T-21 的 scripts/release/*.mjs）：补全局与 CommonJS 写法，不放宽其它规则
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: { globals: runtimeGlobals },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // T-02 门禁的**样本数据**（`tools/fixtures/**`）：这些 .ts/.tsx 是故意造的"违规/干净样本"，
    // 供 boundaries.mjs --self-test 与 depcruise 定向跑，不参与任何 tsconfig 的 include。
    // 它们落在 projectService 里必然 "Parsing error: file not found for project"（88 条），
    // 而处置**不是**全局关规则、也不是把它们从 lint 作用域里删掉：
    // 只对这一棵子树关掉 type-aware 解析（非类型规则照旧生效）。
    files: ['tools/fixtures/**/*.ts', 'tools/fixtures/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        tsconfigRootDir: undefined,
      },
    },
  },
  {
    // 历史手写 App 脚本（T-20 边界内，legacy 分支仍在用）：只按"宽松 JS"标准对待，新增脚本请落到 apps/app
    files: ['mobile-memory/**/*.mjs', 'mobile-memory/**/*.cjs'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // A-14：只作用于 src/**（test/** 豁免，与 depcruise / boundaries 三处同面）
    files: ['packages/ui/src/**/*.ts', 'packages/ui/src/**/*.tsx'],
    rules: { 'no-restricted-imports': ['error', uiForbidden] },
  },
  {
    files: ['apps/app/**/*.ts', 'apps/app/**/*.tsx'],
    rules: { 'no-restricted-imports': ['error', appForbidden] },
  },
  {
    // A-14：同上 —— shared 的"域内禁 IO"只约束产物代码
    files: ['packages/shared/src/**/*.ts', 'packages/shared/src/**/*.tsx'],
    rules: { 'no-restricted-imports': ['error', sharedForbidden] },
  },
  {
    files: ['packages/server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@tm/ui', message: '服务端不得依赖 UI 包（§2 packages/server ⛔）。' }],
          patterns: [
            {
              group: ['@tm/ui*', '@tm/app*'],
              message: '服务端不得依赖 UI 包（§2 packages/server ⛔）。',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
