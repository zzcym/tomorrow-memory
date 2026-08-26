# Phase 1 - 任务 1：pnpm workspace monorepo 搭建

## 做了什么

1. **创建 workspace 结构**
   - `pnpm-workspace.yaml`：`packages/*` + `apps/*`
   - 四个包：
     - `packages/agent`（@tm/agent，Agent 逻辑，Phase 2 实现）
     - `packages/server`（@tm/server，Hono 后端）
     - `packages/shared`（@tm/shared，共享类型与工具）
     - `apps/web`（@tm/web，Phase 3 前端空壳）
   - 根 `package.json`：workspace 脚本（build/typecheck/lint/docker 等），devDependencies 统一管理 TS/ESLint/Prettier/tsx

2. **TypeScript 基础配置** `tsconfig.base.json`
   - `strict: true`、`noImplicitAny: true`、`noUncheckedIndexedAccess: true`、`noImplicitOverride: true`
   - `module: ESNext` + `moduleResolution: Bundler`，paths alias `@tm/shared` / `@tm/agent` / `@tm/server`

3. **ESLint 9 flat config + Prettier**
   - `eslint.config.js`：`@eslint/js` + `typescript-eslint` + `eslint-config-prettier`
   - 规则：`no-explicit-any: error`（不允许 any）、`consistent-type-imports`、`no-unused-vars`
   - `.prettierrc.json`：单引号、100 列、trailing comma

4. **共享包 @tm/shared**
   - `types.ts`：WordbookEntry、UserRow、ProfileRow、LookupEn2Zh/Zh2En 结果、TutorContent、FsrsCardRow、TutorCacheRow、AgentIntent 等
   - `utils.ts`：getDateStr、computeStreak、maskPhone、detectLanguage、parseTranslation、parseExchange、safeJsonParse

## 遇到的问题

- **根目录旧 node_modules / package-lock.json**：旧项目用 npm，better-sqlite3 为 Node 20 编译（NODE_MODULE_VERSION 115），Node 22 下无法加载。处理：`git rm --cached package-lock.json`，废弃 npm lockfile，改用 pnpm（生成 pnpm-lock.yaml），依赖重新安装时 better-sqlite3 会针对 Node 22 重新获取预编译产物。
- **.gitignore 写入偶发 EIO**（Windows 文件被扫描器短暂锁定），重试后成功。

## 验证

- [x] 目录结构与配置文件就绪
- [x] pnpm install 完成（pnpm 11 需在 pnpm-workspace.yaml 配置 `allowBuilds` 放行 better-sqlite3/esbuild 构建脚本）
- [x] `pnpm typecheck` 全部通过（4 包）
- [x] `pnpm lint` 通过（eslint 9 flat config）
