/**
 * tRPC 应用 Router（装配点）
 *
 * - dictionary.lookup：查词（SSE 流式 subscription：先推静态结果，再流式推 AI 内容）
 * - wordbook.list / add / remove / clear
 * - review.today / review.reviewCard
 * - checkin.status / create
 * - profile.get / update / changePassword
 * - auth.sendCode / login / me
 *
 * T-08：原 610 行 `trpc/router.ts` 按域拆到本目录，本文件只做装配。
 * **键名顺序与拆分前逐字一致**（防客户端过程名漂移）；判据①的快照见 `test/trpc-shape.spec.ts`。
 */

import { router } from '../init.js';
import { agent } from './agent.js';
import { analyst } from './analyst.js';
import { assessment } from './assessment.js';
import { auth } from './auth.js';
import { chat } from './chat.js';
import { checkin } from './checkin.js';
import { dictionary } from './dictionary.js';
import { profile } from './profile.js';
import { review } from './review.js';
import { wordbook } from './wordbook.js';

export const appRouter = router({
  dictionary,
  wordbook,
  review,
  checkin,
  profile,
  auth,
  agent,
  assessment,
  chat,
  analyst,
});

export type AppRouter = typeof appRouter;
