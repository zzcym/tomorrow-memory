# eval/ —— 评测集与工具环境定义

这个目录是后训练项目的**地基**：评测集、工具签名、抽样脚本、校验器都在这里。
**它不属于 monorepo workspace**，就是几个独立脚本，用根目录的 `node` 直接跑。

---

## 文件

| 文件 | 是什么 | 谁维护 |
|---|---|---|
| `tools.json` | **工具环境定义（唯一真相）**：9 个工具的名字、参数、返回值、调用规则 | 你审、我维护 |
| `schema.md` | 评测集格式规范 + 标注铁律 + 30 条怎么分 | 写之前读一遍 |
| `examples.jsonl` | 8 条格式示例（**不参与评测**，只是样例） | 已完成 |
| `seed.jsonl` | **你手写的 30 条真实语料**（held-out，写完不许改） | 你 |
| `gold.jsonl` | 从 seed 扩出的 200 条评测集 | 你（可迭代） |
| `words.jsonl` | 从 stardict 分层抽样的词表（含 train/test 划分） | `npm run eval:words` 生成 |
| `validate.mjs` | 校验器：格式 / 工具名 / 重复 id / 覆盖率缺口 | 已完成 |
| `sample-words.mjs` | 按考试等级分层抽样 + 按 word 做确定性 train/test 划分 | 已完成 |
| `lookup.mjs` | 查一个词的词典/词形/例句/tier/split；`--json` 直接吐 content 记录骨架 | 已完成 |
| `lib/word-meta.mjs` | tier 归属、train/test 划分、CEFR 猜测、词形解析的唯一实现 | 已完成 |
| `preflight.mjs` | 开工自检：环境、key、数据文件、评测集进度 | 已完成 |

---

## 三个命令

```bash
npm run preflight          # 开工前跑一次：缺什么一目了然
npm run eval:validate      # 写完就校验：报错带行号，还会告诉你下一个可用 id
npm run eval:words         # 抽样词表：每个 tier 40 个，按 word 划 train/test

node eval/lookup.mjs abandon          # 写某条之前，先看清这个词的底细
node eval/lookup.mjs abandon --json   # 直接吐一条 content 骨架，粘进 gold.jsonl
```

---

## 工作顺序

```
1. 写 seed.jsonl 30 条
      ↓  npm run eval:validate      ← 每写 5 条就跑一次
2. npm run eval:words              ← 拿到 240 个分层词
3. 用 seed 的句式 × test 分片词 扩到 gold.jsonl 200 条
      ↓  npm run eval:validate
4. 训模型 → 跑评测 → 填对照表
```

---

## 两条硬约束

1. **`seed.jsonl` 是 held-out。** 训练数据从它衍生可以，但不能**把它的原文**喂进 SFT。写完就冻结，只增不改。
2. **按 word 划分。** `words.jsonl` 里 `split=test` 的词才允许进评测集，`split=train` 的进训练集。同一个词两边都出现 = 数字造假。

---

## 为什么工具定义要单独一个文件

因为它是**三处共用**的唯一真相：

- `validate.mjs` 校验评测集里的工具名/参数是否合法
- 后续的数据合成脚本按它生成轨迹
- 训练时它就是模型的 tool schema

改工具就在 `tools.json` 里改一次，三处自动一致。**不要**在别的文件里再抄一份。
