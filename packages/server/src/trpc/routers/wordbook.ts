/**
 * tRPC 域：单词本（薄门面）
 *
 * T-08 自 `trpc/router.ts` 逐字搬迁；T-09 收口轮把**判定与落库**转调 `services/wordbook-service.ts`
 * （§4.2 收敛规则：REST 与本文件是同一个 service 的两个门面，并发/merge 语义必须同源，
 * 否则判据① 只在一侧成立）。
 *
 * 兼容面（`test/trpc-shape.spec.ts` 基线钉住，A-28-1"只增不改"）：
 * - 过程名 / 类型 / meta / `nMiddlewares` / **入参 zod 形状** / `output`（恒为 null，不加 `.output()`）
 *   与出参**键集合**（`add`→`{ok,added,data}`、`remove`→`{ok,data}`、`clear`→`{ok,data:[]}`、
 *   `list`→`WordbookEntry[]`）一字未改；
 * - 卡片初始化不再在此文件写：service 的落库路径（`db.wordbooks.applyEntries/applySync` 事务内的
 *   `ensureNewCards`）产出与旧 `saveData` 内联段逐字同形的卡（T-06 `test/db/methods.spec.ts` 断言），
 *   于是本文件不再 `import '@tm/agent'`；
 * - `events.record` 保留（只在真正新增时打点，与旧实现的早退分支一致）。
 *
 * ⚠ 未新增 `wordbook.push` / `wordbook.pull` 过程：`trpc-shape` 基线含 caller 清单，
 *   加过程 = 改基线（需 `TRPC_SHAPE_UPDATE=1` 再生，非本任务权限）→ 见报告待裁决 P-3。
 *   增量协议的客户端消费面（T-14/T-16）走 REST `POST /api/wordbook/push`、`GET /api/wordbook/pull`。
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { WORD_MAX_LENGTH, type WordbookEntry } from '@tm/shared';
import { cacheKeys } from '../../services/cache.js';
import { createWordbookService, wordbookRejectionBody, type WordbookService } from '../../services/wordbook-service.js';
import { protectedProcedure, router, type TrpcContext } from '../init.js';

/** service 按 ctx 装配：`flags`/`cache` 都取上下文里的同一份实例（feature-flags 的唯一入口）。 */
function svcOf(ctx: TrpcContext): WordbookService {
  return createWordbookService({ db: ctx.db, flags: ctx.flags, cache: ctx.cache });
}

export const wordbook = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    // Phase 6：单词本缓存 30 秒（写操作时失效）—— 缓存的仍是"整数组"，只是取数经 service（墓碑过滤 + addedAt 稳定排序）
    // R-15⑤：走 `readWithProgress` ⇒ 本面带 FSRS 进度三键；REST `GET /api/wordbook` 不带（§6.2-1 兼容快照钉死其键集合）。
    return ctx.cache.getOrSet(cacheKeys.wordbook(ctx.userId), 30, () => svcOf(ctx).readWithProgress(ctx.userId));
  }),

  add: protectedProcedure
    .input(z.object({ word: z.string().min(1).max(WORD_MAX_LENGTH) }))
    .mutation(async ({ ctx, input }) => {
      const word = input.word.trim().toLowerCase();
      // 纯空格词（`z.min(1)` 放行，但 trim 后为空）在调 service 之前拒成 400 —— 与 REST push 面
      // `wordbookRejectionBody` 同码同 body（BAD_REQUEST → httpStatus 400，`data.code` 由 init.ts
      // 唯一 errorFormatter 从 `cause.tmCode` 提升，A-30-1/A-33-6 的先例，不自造第二套错误形状）。
      if (word === '') {
        const { status, body } = wordbookRejectionBody({
          kind: 'invalid-entry',
          words: [input.word],
          cause: 'invalid_word_name',
        });
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: String(body.error),
          cause: { tmCode: body.code, httpStatus: status },
        });
      }
      const res = await svcOf(ctx).addWord(ctx.userId, input.word);
      // Phase 5：学情事件（异步，不阻塞）。早退分支（词已存在）与旧实现一致：不打点。
      if (res.added) ctx.events.record({ user_id: ctx.userId, event_type: 'word_added', word_id: word });
      return { ok: true, added: res.added, data: res.data };
    }),

  remove: protectedProcedure
    .input(z.object({ word: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { data } = await svcOf(ctx).removeWord(ctx.userId, input.word);
      return { ok: true, data };
    }),

  clear: protectedProcedure.mutation(async ({ ctx }) => {
    await svcOf(ctx).clear(ctx.userId);
    return { ok: true, data: [] as WordbookEntry[] };
  }),
});
