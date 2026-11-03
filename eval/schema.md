# 评测集格式规范（eval/schema.md）

写之前读这一页。写完跑 `npm run eval:validate`。

---

## 0. 一句话

`seed.jsonl` 是**你手写的真实语料**（30 条，写完全程不许改，这是你的 held-out）。
`gold.jsonl` 是**从 seed 扩出来的评测集**（200 条，可以反复迭代）。

格式：JSONL —— 一行一个 JSON 对象，UTF-8 不带 BOM，行尾不要逗号。

---

## 1. 两类记录

### A. `route` —— 考「意图判断 + 工具调用」

```json
{"id":"r001","kind":"route","text":"abandon 怎么都记不住，有啥办法","expect":{"intent":"learn","tools":["etymology","finish"]},"notes":"「怎么都记不住」是 learn 强信号"}
```

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | ✅ | string | `r` + 三位数字，**分配后永不变更**（变了就丢历史对比） |
| `kind` | ✅ | string | 固定 `"route"` |
| `text` | ✅ | string | **用户原话**，一字不改，包括错别字 |
| `expect.intent` | ⬜ | 枚举 | `lookup` / `learn` / `review` / `assess` / `report` |
| `expect.tools` | ⬜ | string[] | **有序**工具序列；必须包含结尾的 `finish`。空数组 =「不该调工具，直接答」 |
| `expect.args` | ⬜ | object | 只写要**严格校验**的参数（如 `{"word":"abandon","rating":3}`），不必写全 |
| `expect.clarify` | ⬜ | boolean | `true` = 应该调 `ask_user` 反问。此时 `tools` 必须为空 |
| `tags` | ⬜ | string[] | `multi_step` / `no_clarify` / `no_word` / `typo` / `pinyin` / `mixed` / `fail_recovery` |
| `notes` | ⬜ | string | 为什么这么标。**两周后你会需要它** |

`expect.intent` 与 `expect.tools` **至少填一个**。

### B. `content` —— 考「教学内容生成」

```json
{"id":"c001","kind":"content","word":"abandon","level":"B1","expect":{"constraints":["sceneExamples 恰好 3 条","每条例句含 abandon 或其词形"]}}
```

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | ✅ | string | `c` + 三位数字 |
| `kind` | ✅ | string | 固定 `"content"` |
| `word` | ✅ | string | 小写英文单词 |
| `level` | ✅ | string | `A1`~`C2` |
| `expect.constraints` | ✅ | string[] | 每条一个**可机器判定**的条件，非空 |
| `notes` | ⬜ | string | |

---

## 2. 标注的 6 条铁律

1. **别润色。** 你输入法里怎么打就怎么写，包括打错的、没打完的、带表情的。润色过的语料训出来的是一个「听不懂人话」的模型。
2. **一条只考一件事。** 「今天复习啥顺便讲讲 abandon」考多步，就只标 `multi_step`，别再叠加词形错的用例。
3. **标期望，不标唯一答案。** 「讲讲 abandon」用 `etymology` 或 `tutor_content` 都合理 —— 这种情况只标 `intent`，`tools` 留空，别硬指定。
4. **必须有负例。** 没有 `no_clarify` 负例，你就没法测 over-clarify（该答却反问）。至少要 5 条。
5. **`constraints` 必须可判定。** ❌「口诀要生动」（judge 才能判，会引入噪声）→ ✅「口诀是中文且不含整句英文」。
6. **每条写 `notes`。** 一句话。这是给面试官看的，它证明你想过。

---

## 3. `seed.jsonl` 的 30 条怎么分

| 类别 | 条数 | 长什么样 |
|---|---|---|
| `lookup` | 5 | 「abandan 啥意思」「怎么读」 |
| `learn` | 5 | 「abandon 老记不住」「有没有词根」 |
| `review` | 5 | 「今天复习啥」「这周还有多少」 |
| `assess` | 5 | 「考我 apple，3 分」「我忘了 abandon」 |
| `report` | 5 | 「我学了多少」「坚持几天了」 |
| 模糊 / 澄清 | 5 | 「嗯」「这个」「再来一个」「还是不行」「。。。」 |

**必须覆盖的 5 种「脏输入」**（每种至少 2 条）：

- 口语碎片：「abandon 咋整」「又忘了」
- 中英混：「review 一下 abandon」「bei dan ci 怎么安排」
- 错别字 / 拼音：「abandan」「jiao wo zhe ge ci」
- 带参数：「考我 apple，我答 3 分」（`rating` 的 1 和 4 各写一条 —— 边界最容易错）
- 多步：「今天复习啥，顺便讲讲 abandon」（2~4 个工具）

**白捡 8 条**：`packages/agent/test/orchestrator-intent.spec.ts` 里那 20 个 case 全是现成的边界样本，尤其这几个（规则实现本来就在这些地方错）：
`'考我 3 分'`、`'测评'`、`'测验单词'`、`'i 想 learn'`、`'打分'`、`'abandon'`、`'B1'`、`'90 分'`。

---

## 4. `gold.jsonl` 的 200 条怎么来

`seed 的句式 × stardict 抽样词 × 同义改写`，模板生成。两条硬约束：

- **按 word 划分 train/test**：同一个词只能出现在一边，否则评测数字是假的。`npm run eval:words` 会按 hash 分好。
- **不许把训练集里的样本抄进 gold**。生成完跑一次 `validate`，它会查 id 重复。

---

## 5. 常见错误（validate 会拦）

| 错误 | 为什么会犯 |
|---|---|
| 工具名写错（`lookup` vs `dict_lookup`） | 用了 node 名而不是工具名 |
| `clarify:true` 还写了 `tools` | 想「先问再查」，但一轮只做一件事 |
| `args` 里的参数不在工具签名里 | 参数名从记忆里写，没看 `tools.json` |
| 用 `notes` 代替 `constraints` | 约束被写成散文，评测时没法判 |
| 同一个 `text` 标了两个不同 intent | 说明这句话本身有歧义 —— 要么拆成两条，要么标 `clarify` |
| id 重复 | 复制粘贴后忘改 |

---

## 6. 怎么用（全流程）

```bash
npm run eval:validate            # 校验 + 覆盖率报告 + 建议下一个 id
npm run eval:words -- --n 200    # 从 stardict 分层抽样，产出 eval/words.jsonl
```

覆盖率报告会告诉你缺什么：某个 intent 少于 3 条、没有 `no_clarify` 负例、`rating` 边界没测到 —— 这些都会在 `validate` 的输出里点出来。
