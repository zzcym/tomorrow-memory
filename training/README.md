# training/ —— 后训练管线

**状态：环境已就绪，训练代码待写（第 3 周开始）。** 这一页是路线图，不是教程。

---

## 目标一句话

把 `eval/tools.json` 里那 9 个工具组成的 ReAct 环境，后训练成 **Qwen3.5-4B** 的领域策略模型：
QLoRA SFT → DPO → GRPO（可验证奖励），最后 vLLM 部署回 `packages/agent/src/tools/llm-router.ts`。

---

## 目录规划（还没建，别提前建空壳）

```
training/
  setup-env.ps1        ✅ 环境安装（venv + torch cu126 + 训练栈）
  check_env.py         ✅ 自检：torch/cuda/显存/各库版本，一条命令看全
  requirements.txt     ✅ 依赖下限（含两个钉死的版本，见下）
  requirements.lock.txt ✅ 实际安装版本快照（pip freeze）
  data/
    build_sft.py       ⏳ 合成 SFT 轨迹（教师蒸馏 + 规则模板 + 失败注入）
    build_dpo.py       ⏳ 采 4 候选 → 规则+judge 排序 → 偏好对
    build_grpo.py      ⏳ GRPO prompt 集（1–2k 最难样本）
    split.json         ⏳ 按 word 划分，与 eval/words.jsonl 的 split 对齐
  sft.py               ⏳ QLoRA SFT
  dpo.py               ⏳ DPO
  grpo.py              ⏳ GRPO + reward 函数
  reward.py            ⏳ 可验证奖励（这一份必须你自己写）
  serve.sh             ⏳ vLLM 启动（Linux 卡上跑）
  README.md            ✅
```

⚠ 上面每个 `⏳` 都是**要你自己写**的。我给的只有骨架和 review，`reward.py` 尤其不能代笔 —— 面试只会深挖这一份。

---

## 环境（已装好，2026-10-30 验证通过）

```powershell
npm run train:env                          # 重装/换机时用
.venv-train\Scripts\python.exe training\check_env.py   # 自检
```

实测版本（`requirements.lock.txt` 是完整快照）：

| 包 | 版本 | 说明 |
|---|---|---|
| torch | **2.8.0+cu126** | 钉死。2.14.1+cu126 在本机 `import torch` 就崩（WinError 1114 加载 c10.dll） |
| transformers | 5.22.0 | |
| peft | 0.21.2 | |
| trl | 1.17.0 | |
| bitsandbytes | 0.50.2 | |
| sentencepiece | **0.1.99** | 钉死。0.2.2 在本机 import 时 access violation 崩溃 |

GPU：RTX 4060 Laptop 8GB，bf16 支持 ✅，**本地跑 4B QLoRA 够用**；GRPO 仍建议租 24G 卡。

两个坑（换机器重现时先看这里）：
1. **`setup-env.ps1` 必须保持纯 ASCII。** Windows PowerShell 5.1 读无 BOM 的 .ps1 会按 ANSI 解，中文注释会导致引号错位、脚本后半截不执行（第一次安装就是这样只装了 torch）。
2. **torch / sentencepiece 别随手升级。** 升之前先 `python training/check_env.py`，挂了就回退到锁文件里的版本。

---

## 三阶段的关键超参（起步值，不是最优值）

| 阶段 | 数据量 | 关键超参 | 显存 | 在哪跑 |
|---|---|---|---|---|
| QLoRA SFT | 1.5–2 万条 | r=32, α=64, dropout=0.05, lr=1e-4, 2–3 epoch, seq 2048, 只对 assistant 算 loss | ~6G | 本地 4060 ✅ |
| DPO | 4–6k 对 | β=0.1, lr=1e-5, 1 epoch, ref=SFT 后模型 | ~6G | 本地 4060 ✅ |
| GRPO | 1–2k prompt | group=8, lr=1e-6, KL β=0.001, 1–2 epoch | ~20–24G | 租 4090/A100 |

---

## reward 的骨架（你要填的是细节和权重）

```python
def reward(completion, sample):
    r = 0.0
    ok, obj = parse_json(completion)
    if not ok:
        return 0.0                      # 连 JSON 都不合法 → 0 分，不给部分分
    r += 0.35 * schema_ok(obj)          # zod 那套 schema 的 python 版
    r += 0.35 * tool_match(obj, sample) # 工具名完全一致 + args 逐字段
    r += 0.15 * content_ok(obj, sample) # 例句含词形（用 exchange）/ 中文占比 / 长度
    r += 0.15 * judge(obj, sample) / 10
    return r
```

**调这一份 + 看分项曲线，就是后训练岗的全部日常工作。** 权重为什么是 0.35 不是 0.5、`content_ok` 怎么判词形（提示：`eval/lib/word-meta.mjs` 的 `parseExchange` 已经把 exchange 解析好了，Python 侧照着实现一份即可）—— 这些是你面试要讲的东西。

---

## 硬约束

1. **训练数据只能用 `split=train` 的词**；`split=test` 的词只出现在评测集。混了 = 数字造假。
2. **`seed.jsonl` 的原文不许进训练集**。可以用它的句式做模板，但不能把它的 `text` 喂进 SFT。
3. **每次实验必须记一条**：数据版本 / 超参 / 评测结果，落在 `training/experiments.md`。面试时这张表就是你的证据链。
