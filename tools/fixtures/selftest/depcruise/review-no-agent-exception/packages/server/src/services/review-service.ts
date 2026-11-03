/**
 * A-19 疫苗 fixture（用例①的第一条）：本文件在 review-no-agent 的 from 集合里，
 * 但白名单里**没有**任何以本文件为 from 的条目 ⇒ 主干规则必须照旧判红。
 * 修复前 materialize() 把规则的 from.path 并进 from.pathNot，这里永远不红 = 假绿。
 */
import { graphNote } from '../../../agent/src/graph';

export const scorePath = () => graphNote();
