# 开发报告（后端 · T-11 第 5 微轮 · 把 `profile-output-parser.spec.ts` 的占位断言改成钉持久性质）

- 角色：后端开发工程师（T-11 owner）
- 轮次：T-11 第 5 微轮（批次3 收口后 E3′ §9-1 登记的那一条残留红）
- 登记/裁决依据：`.delivery/04-adjudications.md` **A-36 一-#1②④ / 一-#2 / 三-#17①**；`.delivery/04-dev-report-E3-prime.md` **§0 末段 / §6.1 第 4 行 / §6.2 / §9-1 / §9-2**
- 可写面：`packages/server/test/integration/profile-output-parser.spec.ts`（仅此一个仓内文件）+ 本报告
  - 注：任务书写的是 `packages/server/test/profile-output-parser.spec.ts:330`，盘上真实路径在 `test/integration/` 下（`:330` 那一格就是它，行号一字不差对上）。
- 日期：2026-09-20
- 一句话：**未再生基线（`TRPC_SHAPE_UPDATE=1` 出现 0 次）、未碰任何实现代码（`profile.ts` 只在疫苗步骤被临时改过并已 sha256 对账复原）、未改 `trpc-shape.spec.ts` 一字节、未放宽任何判据**；只把那条"把基线尚未再生钉成期望值"的占位断言换成钉"parser 挂着 / 闭合对象 / 声明键 = 13 键"三条持久性质。`@tm/server` 全套 **356 passed (356) / 0 红**。

## 0. 上游必读的定位方式（未整篇通读）

| 资料 | Grep 定位 | 实读行区间 |
|---|---|---|
| `04-adjudications.md` | `grep -n "^## A-36\|A-36-#1\|A-36-17"` → 唯一命中 `:313` | `:313-356`（A-36 全节，含一-#1/#2、三-#17、四-1/2/3） |
| `04-dev-report-E3-prime.md` | `grep -n "待 TPM 拍板\|^## 9\|§9"` → `:388` | `:1-26`（§0 那格红的一句话登记）、`:313-338`（§6.1/§6.2）、`:388-411`（§9/§10） |

取到的三条约束：
1. **A-36 §9-1 的两条修法**里我走的是 ①（T-11 微轮把那一格翻成"再生后的真相"），但**不采用**其字面措辞建议里残留的瞬时语义（"`baseline` 现状 = 无 parser" 的反面还是对 baseline 再生状态的断言）——任务书把口径收得更严：**钉持久性质**。
2. **A-36 三-#17①**：键集合钉用例是"未声明键静默丢失"的唯一防线，且这条保护必须**继续来自本文件**（E3′ §8 已按要求复述来源）⇒ 本文件那 4 支键集合钉用例一支未删、一支未放宽（§6.2 的 19 条逐条清单可逐支对）。
3. **E3′ §9-2**：行号引用正在腐化（再生把基线从 9793 行撑到 18334 行）⇒ 新断言与其注释**不引任何行号**。

## 1. 改前那条红的真实输出

命令：`pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server profile-output`（2026-09-20 06:48，改动前，`tail -45` 原文照贴）

```
 ❯ test/integration/profile-output-parser.spec.ts:330:102
    328|     expect(baseline.procedures.map((p) => p.path)).not.toContain('prof…
    329|     // 出参侧本轮的唯一 delta：三条都从 `output: null` 变成"get 有 parser / 另两条仍无"
    330|     expect(baseline.procedures.find((p) => p.path === 'profile.get')?.…
       |                                                                                                      ^
    331|     expect(baseline.procedures.find((p) => p.path === 'profile.update'…
    332|   });

 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
   Start at  06:48:36
```

被拒的期望值就是 `toBeNull()`，而新基线那一格是（同一份输出里打印出来的实际值，节选）：

```
  "typeName": "ZodObject",
  "unknownKeys": "strip",
}
```

⇒ 因果链与 E3′ §6.1 归因表逐字吻合：**基线正常 ⇒ 该断言必红**（"自测探针依赖一个活的缺陷"的镜像）。

## 2. 改动内容（唯一一处语义替换 + 一处注释防复发戳）

文件：`packages/server/test/integration/profile-output-parser.spec.ts`

**删掉**（占位式，钉的是瞬时状态）：

```ts
    // 出参侧本轮的唯一 delta：三条都从 `output: null` 变成"get 有 parser / 另两条仍无"
    expect(baseline.procedures.find((p) => p.path === 'profile.get')?.output, '基线现状：get 出参无 parser').toBeNull();
```

**换成**（三条持久性质，前 3 条全部从**真实 router 的 `_def`** 上取 ⇒ 疫苗必红；基线同一格只做一致性核对）：

```ts
    const GET_OUTPUT_KEYS = [
      'avatar', 'dailyGoal', 'daily_goal', 'hasPassword', 'nickname', 'phone', 'pwPolicyVersion',
      'reviewDates', 'reviewDays', 'streak', 'totalWords', 'updated_at', 'user_id',
    ].sort();   // 实际书写为每行一键；= 8 契约键 + 4 统计键 + 唯一别名键 = 13
    const mounted = rawDef('get').output as ClosedParserDef | undefined;
    expect(mounted, 'profile.get 挂着 output parser（`_def.output` 存在）').toBeTruthy();
    expect(mounted?._def?.unknownKeys, '挂上的 parser 必须是闭合对象').toBe('strip');
    const mountedKeys = Object.keys(mounted?.shape ?? {});
    expect(mountedKeys, '声明键集合 = 13 键').toHaveLength(13);
    expect(mountedKeys.sort()).toEqual(GET_OUTPUT_KEYS);
    const outputCell = baseline.procedures.find((p) => p.path === 'profile.get')
      ?.output as BaselineOutputShape | null;
    expect(outputCell, '基线记录的 profile.get 出参是 parser，不是"无 parser"占位').not.toBeNull();
    expect(outputCell?.unknownKeys, '基线同格也是闭合对象').toBe('strip');
    expect(Object.keys(outputCell?.shape ?? {}).sort()).toEqual(GET_OUTPUT_KEYS);
```

（`GET_OUTPUT_KEYS` 在文件里是每行一键的 13 行写法；两处只是排版，语义与 §4-④ 的 `-U0` 账一字不差。）

口径说明（三条都是**与再生无关也成立**的命题）：
- ①②③ 的主体取的是**代码**（`profile` router 的 `_def`），不是基线文件 ⇒ 实现退步即红，不依赖任何"第几轮/再生过没有"的瞬时事实。
- 基线那三行只做"代码记录 == 基线记录"的一致性核对；它与相邻那条 `profile.update` 的 `toBeNull()` 同类（E3′ §6.1 实测 update 至今没挂 output parser，所以那格在旧基线和新基线里都是 `null`，不是瞬时状态）。二者若不符，`trpc-shape` 门禁自己会红，本用例只是不再把"不符"当期望值。
- **未新增、也未删除任何用例**：本文件仍 19 条，全套仍 356 条（不是"改条数换绿"）。
- 另在文件头 docblock 追加第 5 条戳，写明"这里不得再钉瞬时状态/不得引行号"，防同一形状被下一次改回来。
- 行号引用：新注释只引裁决号（A-35-1① / A-34-1③④ / A-28-2 / E3′ §9-1），**0 个行号**。

## 3. 疫苗取证（两次，均为临时改 `profile.ts`，改后 sha256 对账复原）

改前留底（`cp` 到仓库外 `/tmp/t11fix5/`）：

```
67e0fd75619c5a3acbf11fc523efda0230d902c42173cfdb55cdea1069172d82 *packages/server/test/integration/profile-output-parser.spec.ts   (spec 留底)
3b6d5a5a19e0aab4a1c1fc75b6ab18624f9167e4123a3f06a85261770a20604e *packages/server/src/trpc/routers/profile.ts                        (实现留底，疫苗前)
```

### 3.1 疫苗 A：临时摘掉 `profile.ts:126` 的 `.output(ProfileGetOutputSchema)`

`pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server profile-output`（2026-09-20 06:52:24）

```
   × A-34-1①③ 形状只增不改（A-28-1 / A-30-2 冻结口径 + E3 核对材料） > procedure 清单一字未动：get / update / changePassword，且不存在 profile.stats 8ms
     → profile.get 挂着 output parser（`_def.output` 存在）: expected undefined to be truthy

 FAIL   @tm/server  test/integration/profile-output-parser.spec.ts > A-34-1①③ 形状只增不改（A-28-1 / A-30-2 冻结口径 + E3 核对材料） > procedure 清单一字未动：get / update / changePassword，且不存在 profile.stats
AssertionError: profile.get 挂着 output parser（`_def.output` 存在）: expected undefined to be truthy

- Expected:
true

+ Received:
undefined

 ❯ test/integration/profile-output-parser.spec.ts:364:71
    363|     const mounted = rawDef('get').output as ClosedParserDef | undefine…
    364|     expect(mounted, 'profile.get 挂着 output parser（`_def.output` 存在）').…
       |                                                                       ^

 Test Files  1 failed (1)
      Tests  2 failed | 17 passed (19)
```

（第 2 条红是本文件既有那条 `hasOutputParser('get')`，不属本轮改动。）
（这里的 `:364` / §3.2 的 `:368` 是**疫苗当时**那份文件的行号；其后 §4-④ 之前我只做了换行排版（`type BaselineOutputShape` 拆多行、`outputCell` 的 cast 折行），未改任何判定，故终态行号会后移若干行 —— 报告引的是当次运行的真实输出，不做事后修饰。）

复原后对账：

```
3b6d5a5a19e0aab4a1c1fc75b6ab18624f9167e4123a3f06a85261770a20604e *packages/server/src/trpc/routers/profile.ts
3b6d5a5a19e0aab4a1c1fc75b6ab18624f9167e4123a3f06a85261770a20604e */tmp/t11fix5/profile.ts.orig
```

### 3.2 疫苗 B（加钉，因为任务书给的第二个候选是"把一个声明键改错"）：`ProfileGetOutputSchema` 的 `streak` 临时改名 `streakRenamedByVaccineB`

同一命令（跑在 06:52:24 的疫苗 A 与 06:52:59 的复原复跑之间；下面这块是从 `grep -B 6 -A 26 "procedure 清单一字未动"` 的过滤输出里照贴的，故不含 `Start at` 行，总计 `Failed Tests 14`）

```
AssertionError: expected [ 'avatar', 'dailyGoal', …(11) ] to deeply equal [ 'avatar', 'dailyGoal', …(11) ]

- Expected
+ Received

@@ -6,10 +6,10 @@
    "reviewDates",
    "reviewDays",
-   "streak",
+   "streakRenamedByVaccineB",
    "totalWords",
    "updated_at",
    "user_id",
  ]

 ❯ test/integration/profile-output-parser.spec.ts:368:32
    366|     const mountedKeys = Object.keys(mounted?.shape ?? {});
    367|     expect(mountedKeys, '声明键集合 = 13 键').toHaveLength(13);
    368|     expect(mountedKeys.sort()).toEqual(GET_OUTPUT_KEYS);
```

同轮 A-35-1② 的键集合钉用例也一起红（`停发别名键时也不得有未声明键: expected [ 'streak' ] to deeply equal []`）⇒ #17① 那条唯一防线确实还活着，本轮没把它削弱。
复原后对账（与 §3.1 同一个 sha）：

```
3b6d5a5a19e0aab4a1c1fc75b6ab18624f9167e4123a3f06a85261770a20604e *packages/server/src/trpc/routers/profile.ts
3b6d5a5a19e0aab4a1c1fc75b6ab18624f9167e4123a3f06a85261770a20604e */tmp/t11fix5/profile.ts.orig
$ grep -n "streakRenamedByVaccineB\|\.output(ProfileGetOutputSchema)" packages/server/src/trpc/routers/profile.ts
126:    .output(ProfileGetOutputSchema)
```

（`streakRenamedByVaccineB` 已 0 命中，`.output()` 回到原位。）

## 4. 出口命令（四条真实粘贴，全部在疫苗复原 + 最后一次排版收口之后跑）

### ① 单文件

`pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server profile-output`（终态 06:56:48；同一命令在 06:51:28 / 06:52:05 / 06:52:59 也各跑过一次，全是 19/19 绿）

```
 Test Files  1 passed (1)
      Tests  19 passed (19)
   Start at  06:56:48
   Duration  1.39s (transform 275ms, setup 0ms, collect 1.05s, tests 50ms, environment 0ms, prepare 118ms)
```

### ② 全套

`pnpm --filter @tm/server test`（终态 06:57:07，期望 356 / 0 红 ⇒ **达成**）

```
 Test Files  15 passed (15)
      Tests  356 passed (356)
   Start at  06:57:07
   Duration  16.19s (transform 2.22s, setup 0ms, collect 16.15s, tests 29.76s, environment 3ms, prepare 2.54s)
```

用例数与 E3′ §6.1 的收工值**同数**（356），本轮未增删用例；套件 exit 码由 `15 passed (15)` / `356 passed (356)` 与无 `failed` 行体现（E3′ 那句"其余全绿 ⇒ 套件 exit 0 未达成"的缺口在本轮闭合）。

### ③ ownership 自证（scoped patch）

```
$ node tools/boundaries.mjs --check-ownership --task T-11 --diff-file /tmp/t11fix5/t11-fix5-scoped.patch
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
NOTE packages/server/test/integration/profile-output-parser.spec.ts：归属表无条目（no-entry，不阻断）

--check-ownership task=T-11 触碰 0 个文件 → 无越界
OWNERSHIP_EXIT=0
```

证据形状说明（A-35-11 / A-36 一-#13 口径）：本文件与基线一样是**未跟踪**状态（`git status --porcelain` = `??`）⇒ HEAD 相对 diff 产不出账，故按 F2 §4-B② 用**agent 自有 scoped patch**（= 改前副本 vs 现文件的 unified diff，只含我那 2 个 hunk、1 个文件，69 行：`wc -l /tmp/t11fix5/t11-fix5-scoped.patch` → `69`）。

### ④ 该文件的 `-U0` diff

```
$ git diff -U0 -- packages/server/test/integration/profile-output-parser.spec.ts
（空输出）
$ git status --porcelain -- packages/server/test/integration/profile-output-parser.spec.ts
?? packages/server/test/integration/profile-output-parser.spec.ts
```

⇒ **如实记录**：文件未跟踪，故 `git diff` 天然为空，这不是"没改"。真实的 `-U0` 账用 `git diff --no-index -U0 <改前副本> <现文件>` 产（终态原文，两个 hunk，删 2 行 / 增 48 行）：

```
@@ -21,0 +22,3 @@
+ *  5. 第 3 组里"`profile.get` 出参面"那三条断言（E3′ §9-1 那格红之后的第 5 微轮）钉的是**持久性质**：
+ *     parser 挂着 / 挂的是闭合对象 / 声明键 = 13 键。**不得**在这里再钉"基线再生过没有""本轮改了什么"
+ *     这类瞬时状态（那种断言一旦基线正常就必红，属 A-28-2 禁的"探针依赖活的缺陷"），也不得引行号。
@@ -329,2 +332,48 @@ describe('A-34-1①③ 形状只增不改（A-28-1 / A-30-2 冻结口径 + E3
-    // 出参侧本轮的唯一 delta：三条都从 `output: null` 变成"get 有 parser / 另两条仍无"
-    expect(baseline.procedures.find((p) => p.path === 'profile.get')?.output, '基线现状：get 出参无 parser').toBeNull();
+    /*
+     * 出参侧的**持久性质**三条（T-11 第 5 微轮：这里原先钉的是"基线尚未再生"这一瞬时状态，
+     * 基线一再生它就必红 —— 与 A-28-2 禁止的"探针依赖一个活的缺陷"同病，已改掉）：
+     *  1. `profile.get` 挂着 output parser；
+     *  2. 挂上的是一个**闭合对象**（`unknownKeys === 'strip'`，A-35-1① —— 只有闭合对象才给得出客户端类型）；
+     *  3. 它的声明键集合恰好是下面 13 键（8 个契约键 + 4 个统计键 + 唯一别名键）。
+     * 三条都从**真实 router 的 `_def`** 上取 ⇒ 实现里摘掉 `.output()` 或改错一个声明键，这里当场红
+     * （疫苗 A/B 取证见报告 §3）。基线同一格只做**一致性**核对（代码与基线不符时 `trpc-shape` 门禁自己红），
+     * 不断言"第几轮改过/再生过没有"，也不引行号。
+     * `update` / `changePassword` 没有"已有 DTO + 双侧 safeParse 用例"的出参契约（A-34-1③④），
+     * 故基线那两格仍是 `null`。
+     */
+    const GET_OUTPUT_KEYS = [
+      'avatar',
+      'dailyGoal',
+      'daily_goal',
+      'hasPassword',
+      'nickname',
+      'phone',
+      'pwPolicyVersion',
+      'reviewDates',
+      'reviewDays',
+      'streak',
+      'totalWords',
+      'updated_at',
+      'user_id',
+    ].sort();
+    type ClosedParserDef = { _def?: { unknownKeys?: string }; shape?: Record<string, unknown> };
+    /** 基线那一格是 `trpc-shape.spec.ts` 自己摊平过的形状（`{typeName, unknownKeys, shape}`）。 */
+    type BaselineOutputShape = {
+      typeName?: string;
+      unknownKeys?: string;
+      shape?: Record<string, unknown>;
+    };
+
+    const mounted = rawDef('get').output as ClosedParserDef | undefined;
+    expect(mounted, 'profile.get 挂着 output parser（`_def.output` 存在）').toBeTruthy();
+    expect(mounted?._def?.unknownKeys, '挂上的 parser 必须是闭合对象').toBe('strip');
+    const mountedKeys = Object.keys(mounted?.shape ?? {});
+    expect(mountedKeys, '声明键集合 = 13 键').toHaveLength(13);
+    expect(mountedKeys.sort()).toEqual(GET_OUTPUT_KEYS);
+
+    // 同一条持久性质在基线里的那一格：只核"代码与基线记录的是同一件事"，不核"再生过没有"
+    const outputCell = baseline.procedures.find((p) => p.path === 'profile.get')
+      ?.output as BaselineOutputShape | null;
+    expect(outputCell, '基线记录的 profile.get 出参是 parser，不是"无 parser"占位').not.toBeNull();
+    expect(outputCell?.unknownKeys, '基线同格也是闭合对象').toBe('strip');
+    expect(Object.keys(outputCell?.shape ?? {}).sort()).toEqual(GET_OUTPUT_KEYS);
```

终态文件指纹：`sha256sum` → `df800af95dc7934bc5f77859130f852f12296878869678e4fb876c334bb8f117`（改前留底 = 本节 §3 的 `67e0fd75…`）。

### 附：typecheck（A-9 把 `test/` 纳入）

```
$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
TYPECHECK_EXIT=0        （无任何诊断输出，0 错）
```

## 5. 越界申请 / 待 TPM 拍板

1. **无越界写**：本轮实际写入的仓内文件只有 1 个（那条 spec）+ 本报告。`profile.ts` 的两次改动是任务书第 3 步要求的**疫苗临时件**，已 sha256 复原（§3）。
2. **登记一条在册缺口（不自行处置）**：`tools/ownership.json` 里 T-11 名下只有 `packages/server/test/integration/{chat-isolation,profile-dto}.spec.ts`，**本文件从未入册** ⇒ `--check-ownership` 对我报 `no-entry`（不阻断）。这不是本轮缺陷，但"owner 名下的测试文件不在归属表里"= 门禁对该文件的越界能力为零。建议批次4 出口轮把它补进 §10.3 表（owner 工具文件归 E1c/T-08 面，我不碰）。
3. **E3′ §9-2 那三条行号腐化**（`contracts/auth.ts:19/:58`、`auth-hardening.spec.ts:1096`、E3 §5）仍按 E3′ 的归口在 T-03 / T-07 名下，本文件未替它们刷新，也**没有新增任何行号引用**。
4. 任务书里"profile.get 有 output parser（`output !== null`）"的措辞我实现成了两层：代码侧 `toBeTruthy()`（未挂时 `_def` 上根本没有 `output` 键 ⇒ 疫苗 A 才会红）+ 基线侧 `not.toBeNull()`（序列化后未挂才是 `null`）。若 TPM 认为"外部 spec 不得读基线"（E3′ §9-1 的修法②）成立，这三行基线一致性核对可以整块摘掉，摘掉后①②③仍然成立、疫苗仍然必红——**这是一个可以随时零成本删除的块**，请 TPM 一句话定夺。
5. **`prettier --check` 本文件仍红，但不是本轮引入的**（A-36 三-#16 已把全仓格式化轮推到批次5，我未跑 `--write`，那会顺手改到别人名下的行）：实测**改前留底同样红**（`npx prettier --check /tmp/t11fix5/spec.orig.ts` → `[warn] Code style issues found`），根因是 `printWidth:100` 遇上 CJK 按宽度 2 计，本文件全量 `diff -u 现文件 prettier输出` 有 189 行差异，绝大多数在我没碰的行上。我**只做了一件事**：把我自己新增的两处超宽行（`type BaselineOutputShape` 单行版、`outputCell` 的 cast）按 prettier 口径拆开，使**新增区内 prettier 想动的行数 = 0**（`diff -u 现文件 prettier输出 | grep "outputCell\|mountedKeys\|GET_OUTPUT_KEYS\|BaselineOutputShape\|ClosedParserDef"` → 空命中）。

## 6. 铁律自查

| 铁律 | 自查 |
|---|---|
| 禁止 git 写操作 | 只跑过 `git status --porcelain` / `git diff`（只读）；无 commit/push/stash/checkout/reset/clean/restore/add |
| 不清理/不还原他人未提交改动 | 工作区其他角色的改动一字节未动；本轮写过的仓内文件只有 §5-1 那一个 |
| 真实粘贴、禁止编造 | §1/§3/§4 的每个代码块都是命令原文 + 输出原文（含 `tail -45` 截断标注与 `git diff` 空输出的如实说明） |
| 不再生基线 | `TRPC_SHAPE_UPDATE=1` 出现 **0 次**；`sha256sum packages/server/test/trpc-shape.baseline.json` = `5d89760c07f2dd05b5e34ab2411b9580d52fe1bbd582593c2329a5b80f4e1f72`（= E3′ §0 的新 sha，一字未变） |
| 不改 `trpc-shape.spec.ts` | `sha256sum` = `b5bf5db9c1c144aa85dae31711c3ebe994b3fe60d6e6dbfa88b77c2eeaa559f4`，与 E3′ §10 记录的同一枚 sha 逐字相同 |
| 不碰 `data.db` | 未跑任何迁移/写操作；用例只在 `os.tmpdir()` 临时库上跑；仓库根 `data.db`（253952 B，mtime 2026-09-18 04:05）与 `packages/server/data.db`（0 B，mtime 2026-09-17 00:10）mtime 未变 |
| 不为变绿放宽规则 | 未删任何用例（19 条 → 19 条）、未放宽 A-35-1② 的键集合钉（#17① 防线原样，疫苗 B 实证仍咬）、`profile.update` 的 `toBeNull()` 未动；净效果是**新写 7 条 `expect`、删掉 1 条瞬时断言**（代码侧 4 条 + 基线侧 3 条） |
| 未碰三个文档 agent 的产出 | `.delivery/01-prd.md` / `02-tech-design*.md` / `03-ui-spec.md` 只字未读写 |
| CLI 坑 | 单文件用 `pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server profile-output`，未用不生效的 `test -- <名>` 形式 |

临时件全在仓库外 `/tmp/t11fix5/`（`spec.orig.ts` / `profile.ts.orig` / `t11-fix5-scoped.patch`），**保留未删**：`spec.orig.ts` 与 scoped patch 是 §4-③/④ 的证据两端，QA 复核后可自行清理。
