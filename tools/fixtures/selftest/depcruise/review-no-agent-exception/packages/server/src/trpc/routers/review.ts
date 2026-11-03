/**
 * A-19 疫苗 fixture（用例①的第二条）：本文件**确实**有在用例外
 * （`legacy-review-trpc-router-import-agent`），但那条例外登记的 to 只枚举了
 * `packages/agent/src/**` 的 15 个模块，不含 `packages/server/src/services/analyst.ts`
 * ⇒ 变体规则的 to.pathNot 不吃这一条 ⇒ 仍须判红。这条同时自证 to 侧没有反向失明。
 */
import { analystNote } from '../../services/analyst';

export const reviewProcedure = () => analystNote();
