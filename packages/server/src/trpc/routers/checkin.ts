/**
 * tRPC 域：checkin（打卡）—— 与 REST 门面共用 `services/checkin-service.ts`。
 * 只做过程声明 + service 调用 + 响应组装（§4.2 收敛规则 1）。
 */

import { protectedProcedure, router } from '../init.js';
import { checkinStatus, checkinToday } from '../../services/checkin-service.js';

export const checkin = router({
  status: protectedProcedure.query(async ({ ctx }) => checkinStatus(ctx.db, ctx.userId)),

  create: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await checkinToday(ctx.db, ctx.userId);
    // Phase 5：学情事件（异步），不进响应体
    ctx.events.record({ user_id: ctx.userId, event_type: 'checkin', word_id: '' });
    return result;
  }),
});
