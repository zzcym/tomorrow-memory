# Phase 1 - 任务 3：Express → Hono 迁移

## 做了什么

按任务指定顺序完成全部路由迁移，**请求/响应格式与旧 server.js 完全一致**：

| 迁移项 | 旧实现 | 新实现 |
|---|---|---|
| 静态文件 + /admin | `express.static(__dirname)` + sendFile | `@hono/node-server/serve-static` + 手动 readFile |
| 认证中间件 | `auth` / `adminAuth`（JWT Bearer） | `middleware/auth.ts` 同语义 |
| 查词 API | `/api/lookup`（内联逻辑） | `routes/lookup.ts` + `services/lookup.ts` |
| 单词本 API | GET/PUT `/api/wordbook` | `routes/wordbook.ts` |
| 打卡 API | status + checkin | `routes/checkin.ts` |
| 个人主页 API | GET/PUT `/api/profile` | `routes/profile.ts` |
| 管理 API | login/stats/users | `routes/admin.ts` |
| 验证码 | 内存 Map | `services/sms.ts` |
| 备份 | 每日 pg_dump | `services/backup.ts` |

## 关键细节

1. **lookup 逻辑完整复刻**：zh2en 三级 fallback（ec-cedict → stardict FTS → 有道）、en2zh 精确查询 + 例句 + 在线 fallback、auto 语言检测、mixed 报错、404 语义（zh2en 未找到返回 404）。响应字段逐一对照旧代码（word/phonetic/translation/definition/groups/exchange/examples/freq/tag/detail/audio）。
2. **词典服务拆分**：`services/dict-sources.ts`（stardict/examples/ec-cedict 只读数据源）、`services/youdao.ts`（v3 签名 + 内存缓存）、`services/dictionaryapi.ts`。
3. **Hono 中间件**：`auth` 用 `c.set('userId', ...)` + 类型化 Variables（`AuthEnv`），全部路由类型安全。
4. **onError 统一 JSON 500**（替代 express 的 asyncHandler 包装）。
5. **CORS**：`hono/cors` 全开（与旧 `app.use(cors())` 一致）。

## 遇到的问题

- **Hono 与 Express 的 404 语义差异**：zh2en 未找到需要返回 404 + JSON body，在 lookup 服务返回 `{sourceLang:'zh', error}` 标记，路由层判断后 `c.json(result, 404)`。
- **静态文件与 API 路由顺序**：API 先注册，serveStatic 兜底，避免静态中间件吞掉 API 404。

## 验证

- [x] 代码迁移完成
- [x] `tsc --noEmit` 通过
- [x] 启动冒烟 18/18 通过：/api/lookup（en2zh + zh2en）、全部业务 API、静态页、鉴权保护均与旧版行为一致
