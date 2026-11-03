/**
 * A-19 疫苗 fixture（用例②的载体）：这条 from→to 对被 `legacy-review-routes-import-agent`
 * 登记在案（from = 本文件、to 命中 `^packages/agent/`）⇒ 例外在用（cursor < T-10）时必须判绿。
 * 规则本身一字未改：这里的 import 就是 review-no-agent 要禁的东西。
 */
import { graphNote } from '../../../agent/src/graph';

export const routeEntry = () => graphNote();
