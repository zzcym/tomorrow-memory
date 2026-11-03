# T-21d 开发报告 · 让 preflight 的报红真的能拦人（批次 4 收尾）

任务号：T-21d（裁决 A-54 #146）｜改动面：`scripts/release/preflight.mjs`、`scripts/release/lib.mjs`、`scripts/release/README.md`（退出码段 3 行）+ 本报告。
缺陷：旧 `printGate`（lib.mjs:472-476）只 push + `console.log`，旧退出码算式（preflight.mjs:1033/1041/1042）只看 `children[]` 与 `step8Bad` ⇒ **16 条 inline 门一条都不进退出码**，`[GATE] xxx → FAIL` 照样 exit 0。

## ① 现在会被计入退出码的门（dry-run 实测注册 16 条；档位由 `GATE_TIERS` 前缀表汇出）
| # | 门 id 前缀 | 档位 | 贡献 | 归类理由（一句） |
| --- | --- | --- | --- | --- |
| 1 | `步 4 /` account-audit 退出码 0 | soft | 1 | 子进程镜像门；audit 自身 exit 2 已由 children 升 2，镜像不双重升级 |
| 2 | `步 5c ①/` 真实迁移路径退出码 0 | **hard** | 2 | 迁移跑不通 = 上线后新列根本不存在，读侧整片 500（契约破坏面） |
| 3 | `步 5c ②/` `migrate --status` 待执行为空 | **hard** | 2 | 仍有 pending = 带旧 schema 起服，代码与库形状不一致（契约破坏面） |
| 4 | `步 5c ③/` 清单 8 条逐条已应用 | **hard** | 2 | 迁移账本与库不符 ⇒ 重放/回滚无据（契约破坏面） |
| 5 | `步 5·6·6b·7 /` restore-drill 退出码 0 | soft | 1 | 子进程镜像门（同上，不双重升级） |
| 6 | `步 5 台账核对 /` `--manifest-check` 退出码 0 | soft | 1 | 台账缺演练结论 = 证据链缺口，不是数据损坏；与基线同档 |
| 7 | `步 6 对账基线 /` reconcile diff-sample 退出码 0 | soft | 1 | diff≠0 是两路互校分歧（tmp 自建库口径），硬红线归子进程自身的 2 |
| 8-13 | `步 8 ①…⑥/` 开关初值/逐字对齐/宽限期/两路时延 | soft | 1 | 旧 `step8Bad` 已是 exit 1 语义，不升级 |
| 14 | `步 8 ⑦/` 必需计数项齐备 | soft | 1 | 缺项即红（沿用 `requireMetrics` 口径） |
| 15 | `步 8 ⑧/` 仓库两个 data.db 指纹一致 | **hard** | 2 | 指纹变了 = **真库被写过**（触碰真库，R-41 ④ / §6.1 只读红线） |
| 16 | `步 5b(A)/` 告警通道状态行 | **advisory** | 不改 | 白名单：`getAlertChannel()` 两态都返回 `blocking:false`、判据文案自身即"绝不阻塞"；拦人只会逼发布方跳过预检，可见性由步 5b(B) 强制读回兜住 |

**advisory 白名单只有 `步 5b(A)` 一条**（外加 self-test 疫苗 `疫苗 ③`），逐条在 `GATE_TIERS` 里带 `why`；`gateTierTableCheck()` 断言"hard/advisory 必带 ≥12 字理由 + key 不重复"，否则 self-test 红。**未登记分级的门一律落 soft（从严，不存在整片默认放行）**，疫苗用例 4 专证这条默认路径。

## ② 改动 diff（逐字）
`lib.mjs`（注册表 + 门算式）：
```diff
 const REGISTRY = { metrics: [], drivers: [], gates: [], notes: [] };
+export const GATE_LEVELS = ['hard', 'soft', 'advisory'];   // hard=红线→2 / soft=默认档→1 / advisory=白名单，不进退出码
-/** 人话结论行（判据是否成立），机器可读部分进 emitSummary。 */
-export function printGate(id, pass, detail) {
-  REGISTRY.gates.push({ id, pass, detail });
-  console.log(`[GATE] ${id} → ${pass ? 'PASS' : 'FAIL'}${detail ? ` :: ${detail}` : ''}`);
-  return pass;
-}
+export function printGate(id, pass, detail, level = 'soft', reason = null) {
+  const lv = GATE_LEVELS.includes(level) ? level : 'soft';
+  if (lv !== level)
+    console.log(`[GATE-TIER] ${id} 要求了未知档位 ${JSON.stringify(level)} → 按最严的 soft 处理`);
+  REGISTRY.gates.push({ id, pass, detail, level: lv, reason });
+  console.log(`[GATE] ${id} → ${pass ? 'PASS' : 'FAIL'}${detail ? ` :: ${detail}` : ''} · 档位=${lv}`);
+  return pass;
+}
+export function registryGates() { return REGISTRY.gates.map((g) => ({ ...g })); }
+/** 门 → 退出码贡献的唯一算式：hard 红=2 / soft 红=1 / advisory 红=0；未登记档位按 soft。
+    真跑（喂 registryGates()）与 --self-test 疫苗（喂影子数组）共用这一份。 */
+export function gateExitContrib(gates) {
+  const list = Array.isArray(gates) ? gates : [];
+  const tierOf = (g) => (GATE_LEVELS.includes(g.level) ? g.level : 'soft');
+  const failed = list.filter((g) => g.pass === false);
+  const hard = failed.filter((g) => tierOf(g) === 'hard');
+  const soft = failed.filter((g) => tierOf(g) === 'soft');
+  const advisory = failed.filter((g) => tierOf(g) === 'advisory');
+  return { code: hard.length ? 2 : soft.length ? 1 : 0, hard, soft, advisory, failed, total: list.length };
+}
```
（`[GATE] ${id} → ` 前缀逐字未动，档位只追加行尾 ⇒ `manifest.spec.ts:157` 的 `toContain` 前缀断言仍成立。）

`preflight.mjs`（5 处）：
```diff
   DEFAULT_FIXTURE,
+  GATE_LEVELS,
   … cleanupTmpRoot, emitSummary,
+  gateExitContrib,
   … protectedSqlitePaths,
+  registryGates,
   requireMetrics, …
```
```diff
 （OWN_FILES 之后新增分级表 + 唯一门入口 + 表自证）
+const GATE_TIERS = [
+  { key: '步 5c ①', tier: 'hard', why: '…（契约破坏面）' }, { key: '步 5c ②', tier: 'hard', why: '…（契约破坏面）' },
+  { key: '步 5c ③', tier: 'hard', why: '…（契约破坏面）' }, { key: '步 8 ⑧', tier: 'hard', why: '…真库被写过（触碰真库，R-41 ④ / §6.1 只读红线）' },
+  { key: '步 5b(A)', tier: 'advisory', why: '咨询性门·白名单：…两态都返回 blocking:false…仍打印 [RED-FLAG] 与档位=advisory 留痕。' },
+  { key: '疫苗 ②', tier: 'hard', why: '仅 --self-test 疫苗门：故意 FAIL 的 hard 门必须能把退出码贡献翻成 2…' },
+  { key: '疫苗 ③', tier: 'advisory', why: '仅 --self-test 疫苗门：故意 FAIL 的 advisory 门必须**不**翻退出码…' },
+];
+function gateTierOf(id) {
+  const hit = GATE_TIERS.find((t) => String(id).startsWith(t.key));
+  return hit ?? { key: null, tier: 'soft', why: '未登记分级 → 默认 soft（失败即 exit 1）' };
+}
+const gate = (id, pass, detail) => { const t = gateTierOf(id); return printGate(id, Boolean(pass), detail, t.tier, t.why); };
+function gateTierTableCheck() { /* 档位合法 + hard/advisory 必带 why + key 不重复 → {ok,hard,advisory,bad,dup} */ }
-  const gate = (id, pass, detail) => printGate(id, Boolean(pass), detail);          // main() 内的局部助手，删
+  /* inline 门一律走模块级 `gate()`（分级表 → 档位 → 退出码），此处不再另造局部助手。 */
```
```diff
-  const hardBad = children.some((c) => c.code === 2);
+  const gateFacts = gateExitContrib(registryGates());
+  const childHardBad = children.some((c) => c.code === 2);
+  const hardBad = childHardBad || gateFacts.hard.length > 0;
   const step8Ran = step8 !== null;   const step8Bad = …（原样）;
-  const softBad = children.some((c) => c.code !== 0) || step8Bad;
+  const childSoftBad = children.some((c) => c.code !== 0);
+  const softBad = childSoftBad || step8Bad || gateFacts.soft.length > 0;
   const exitCode = hardBad ? 2 : softBad ? 1 : 0;
+  console.log('\n===== 门禁 → 退出码归因（T-21d）=====');   // hard/soft/advisory 三档逐条列出
+  console.log(`  门禁侧共 ${gateFacts.total} 条（红 ${gateFacts.failed.length}）→ 贡献 ${gateFacts.code} · 子进程侧 hard=… · 最终 exit ${exitCode}`);
```
```diff
-    if (step === '步 5c') code = exitCode === 2 ? 2 : 0;
-    else if (step === '步 8') code = !step8Ran ? undefined : step8Bad ? 1 : 0;
+    if (step === '步 5c') code = !want('step5c') ? undefined : step5cFacts.code;
+    else if (step === '步 8')
+      code = !step8Ran ? undefined : step8Bad ? step8Facts.code || 1 : 0;
```
（`step5cFacts` / `step8Facts` = 对各自前缀的门再跑一次 `gateExitContrib`，清单展示码不再借全局 exitCode 猜；`emitSummary.extra` 新增 `gate_exit`：`contributed_code / total_gates / hard_failing / soft_failing / advisory_failing_not_blocking / rule`；`printSelfTest()` 末尾新增疫苗并把 `verdict` 追加 `&& vaccineOk`。）

`README.md` 退出码段（只 3 行）：
```diff
-| `1` | 任一判据不成立，或**必需计数缺任一项**（… 缺项都走这条路）—— 缺项即红，不许降级成告警 |
-| `2` | 安全阀拒绝（…）、CLI 非法、产物目录不合规 |
-`preflight` 的退出码取子进程的最坏值（任一子脚本 `2` → `2`；任一非 `0` → `1`）。
+| `1` | 任一判据不成立，或**必需计数缺任一项**（…），或 `preflight` 任一 **soft 档 inline 门** `[GATE] … → FAIL` —— 缺项即红，报红即拦人 |
+| `2` | 安全阀拒绝（…）、CLI 非法、产物目录不合规，或 `preflight` 任一 **hard 档红线门**失败 |
+`preflight` 的退出码 = 子进程最坏值与 inline 门禁最坏值再取最坏（任一子脚本 `2` 或 hard 门红 → `2`；任一非 `0` 或 soft 门红 → `1`）；只有分级表里逐条登记过理由的 `advisory` 白名单门报红不拦人（T-21d）。
```

## ③ 疫苗证据（`--self-test` 内，同一份 `gate()` + 同一份 `gateExitContrib()`，只喂影子注册表）
同一条红门的翻转前后：
```
[GATE] 示例/一条真红了但没人拦的门 → FAIL :: detail · 档位=soft
旧算式（只看 children）→ exit 0 ← 红了却放人
新算式（门进退出码）→ 门侧贡献 1 · 档位=soft
```
self-test 疫苗 5 用例 + 表自证（原文）：
```
  OK  hard+soft+advisory 三条同时红 → 门侧贡献 exit 2（应 2）· hard=1 soft=1 advisory=1
  OK  去掉 hard 门（soft+advisory 红） → 门侧贡献 exit 1（应 1）· hard=0 soft=1 advisory=1
  OK  只剩 advisory 门红（白名单） → 门侧贡献 exit 0（应 0）· hard=0 soft=0 advisory=1
  OK  只剩未登记分级的门红（默认 soft） → 门侧贡献 exit 1（应 1）· hard=0 soft=1 advisory=0
  OK  全绿（只有疫苗 ④） → 门侧贡献 exit 0（应 0）· hard=0 soft=0 advisory=0
  OK  分级表自证：hard=["步 5c ①","步 5c ②","步 5c ③","步 8 ⑧","疫苗 ②"] · advisory 白名单=["步 5b(A)","疫苗 ③"] · 缺理由/非法档位=[] · 重复 key=[]
```
不污染真退出码的做法：疫苗前 `resetRegistry()`、疫苗后再次 `resetRegistry()`，`printSelfTest()` 返回值仍只由 `verdict`（含 `vaccineOk`）汇出 ⇒ 交回 **exit 0**（见 ④-1）。

## ④ 三条出口命令 + 静态检查（原文与实测退出码）
1. `node scripts/release/preflight.mjs --self-test` → **`PREFLIGHT_SELFTEST_EXIT=0`**，末行 `→ self-test PASS`
2. `node scripts/release/reconcile.mjs --self-test` → **`RECONCILE_SELFTEST_EXIT=0`**（我没改它，跑它是为了证明没碰坏）
3. `node scripts/release/preflight.mjs --dry-run --driver sqlite --fixture tools/fixtures/schema-fixtures.json` → **`DRYRUN_EXIT=1`**，归因段原文：
```
  hard 档红线门失败：0 条（无）
  soft 档门失败：1 条 → 贡献 exit 1
      × [soft] 步 5 台账核对 / restore-drill --manifest-check 退出码 0（…） :: EXIT=1 · tag=v2.0.0
  advisory 白名单门失败：0 条（无）
  门禁侧共 16 条（红 1）→ 贡献 1 · 子进程侧 hard=false soft=true · 步 8 判定核 bad=false · 最终 exit 1
```
4. `node --check scripts/release/preflight.mjs && node --check scripts/release/lib.mjs && npx eslint scripts/release/*.mjs` → **`EXIT=0`**（eslint 零输出 = 0 problem）

## ⑤ `data.db` 跑前/跑后指纹（全程只读，未跑任何带 `--i-know-this-is-prod` 的命令）
| 文件 | 跑前（size / sha256 前 12 / mtime） | 跑后 |
| --- | --- | --- |
| `data.db` | 253952 / `6595517661cc` / `2026-09-18 04:05:38.198449400 +0800` | 253952 / `6595517661cc` / `1789675538.198449400`（同一时刻，一字未变） |
| `packages/server/data.db` | 0 / `e3b0c44298fc` / `2026-09-17 00:10:53.374159200` | 0 / `e3b0c44298fc` / `1789575053.374159200`（未变） |
| `data.db-wal` / `data.db-shm` | 跑前未单独取 | 424392 / `1789675756.857435000`；32768 / `1789577581.561551800` ⇒ mtime 仍是 09-18 04:09，早于本轮全部命令 ⇒ 未被写 |

诚实标注：跑前只对两个 `data.db` 取了指纹（wal/shm 缺"跑前"），故 wal/shm 以"mtime 早于本轮命令"作旁证；步 8 ⑧ 这道 hard 门本身每轮真跑该断言，本轮 PASS。临时写入只在 `os.tmpdir()`（`tm-t21-<pid>`，末尾 `cleanupTmpRoot()`）。git 仅跑只读 `status`，无写操作；未跑 vitest / playwright / build。

## ⑥ `--dry-run` 退出码变化归因
**未变化，仍是 1**（基线 1）。新增 4 条 hard 红线门（步 5c ①②③、步 8 ⑧）本轮全绿（清单 `步 5c PASS`、`步 8 PASS`），故没从 1 翻成 2；唯一红仍是真话"有备份无演练"。差别在于：这条红现在**既**由子进程 `manifestChild.code=1`（旧路径）**又**由 inline soft 门（新路径，门禁侧贡献 1）各自独立拦人 —— 以前只有前者，门是装饰。未放宽任何门。

## ⑦ 上报未修项（只上报，本轮没顺手改）
1. **同一 lib 缺陷的其余三面**：`restore-drill.mjs:961` 的 `gate()`、`account-audit.mjs`、`reconcile.mjs:296` 的 inline 门仍不进**它们自己**的退出码（reconcile 的 `判据⑧[…] 只观测不处置` 这类"打印即通过"门只靠子进程退出码镜像）。建议 T-22 用同一份 `gateExitContrib()` 收口。
2. **兄弟脚本 stdout 文案变了（cosmetic）**：`[GATE] …` 行尾新增 ` · 档位=soft`（lib 统一实现带来）。已知唯一字符串消费者是 `manifest.spec.ts:157` 的 `toContain`，前缀逐字保留；按并发红线我没跑 vitest，请消费端口顺路确认。
3. **分级表 key 是前缀匹配**：门 id 文案被改 ⇒ hard 会掉回默认 soft（方向安全，不会静默放行，但会漏升级）。建议加"每条 key 至少命中一条真实门"的断言，代价是 self-test 要先跑一遍真实门清单，本轮未做。
4. **dry-run 出口恒为 1**：`--dry-run` 下演练不落台账 ⇒ `步 5 台账核对` 必红。真话不绕，但 CI 若要"dry-run 允许 1、真跑要求 0"需显式区分两态，归 T-22。
5. 既有未修面不变：步 8 判据⑥ 真机侧、pg 侧双驱动台账、判据⑦ 线上 ≥20 真实账号口径（Phase 7 索取只读访问）。
