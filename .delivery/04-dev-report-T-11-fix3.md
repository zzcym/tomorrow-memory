# 开发报告 T-11 微轮 fix3（A-35-1 三件事，一轮做完）

角色：服务端开发工程师（T-11）· 第二次微轮
裁决依据：**A-35-1 ①②③**（`.delivery/04-adjudications.md:292` 起的表第 1 行）
上一轮报告：`.delivery/04-dev-report-T-11-fix2.md`（其 §5.1 待拍板 1 被 A-35-1 采为"①+③ 一轮做完"，本轮已落地）

**结论先说：A-35-1 的立论被本轮实测逐条复现，三件事全做完，本轮硬判据 `pnpm --filter @tm/web typecheck` = 0 错。**
① 改成闭合对象后，web 的报错从 `unknown` **变成** `number | undefined`（同一条 `:92`）—— 这正是 A-35-1#1 说的"第二层"；
③ 改读 canonical 键 `daily_goal` 后才归零。这两步之间的中间态本轮真实跑到（§2.3），不是推演。

---

## 0. 本轮要办的事与可写面

| # | A-35-1 条目 | 落点文件 | 状态 |
|---|---|---|---|
| ① | `ProfileGetOutputSchema` 由 `ProfileDtoSchema.extend()`（继承 passthrough）改为**闭合对象** `z.object({ ...ProfileDtoSchema.shape, …5 键 })` | `packages/server/src/trpc/routers/profile.ts` | done |
| ② | 补**键集合钉**用例：真实 `getProfileDto()` 输出键集合 ⊆ 闭合 schema 声明键集合，新增键未声明即红 + 疫苗双向取证 | `packages/server/test/integration/profile-output-parser.spec.ts` | done（4 支；疫苗"必红→删除→再绿"都实跑） |
| ③ | `page.tsx:92` 单行改读 canonical 键 `daily_goal`（`bounded-edit:A-35-1`） | `apps/web/src/app/(user)/profile/page.tsx`（**仅第 92 行**） | done（单行、0 既有行改写） |

**零改动面（本轮核过，mtime 取证见 §6.1）**：`packages/shared/**`、`trpc/init.ts`、`routes/review.ts`、
`routers/review.ts`、`tools/**`、`vitest.workspace.ts`、`.delivery/02-tech-design.md`、
`trpc-shape.baseline.json`（`TRPC_SHAPE_UPDATE` 未跑，只 `readFileSync` 对照；盘上真实路径是
`packages/server/test/trpc-shape.baseline.json`，任务书写的 `test/contract/` 下只有 `legacy-apk.spec.ts`）、
§4.6 三个冻结集合（`TM_ERROR_CODES`/`TM_ERROR_ROWS`/`TM_ERRORS`）、`ts-fsrs` 版本与序列化格式。**git 零写操作。**
唯一一次越界触碰是 A-35-1② **明文要求的疫苗**（临时给装配点加未声明键），已按 sha256 逐字回滚，见 §3.4。

---

## 1. 改动前基线（出口命令的"起点"）

```
$ pnpm --filter @tm/web typecheck        # 改动前
$ tsc --noEmit
src/app/(user)/profile/page.tsx(92,20): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'SetStateAction<number>'.
E:\CC\tomorrow-memory\apps\web:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/web@3.0.0 typecheck: `tsc --noEmit`
Exit status 1

$ pnpm --filter @tm/server typecheck     # 改动前
$ tsc -p tsconfig.json --noEmit
（无输出 = 0 错）
```

⇒ 起点与 TPM 的实测**逐字一致**：web **1 错**（就是 `:92` 那条 `unknown`），server **0 错**。
fix2 挂的 parser 确实在场（终态探针 `hasParser=true`，见 §5.3），但客户端类型仍是 `unknown`
⇒ A-34-1 的"挂 parser 就有类型"对 passthrough 对象不成立，本轮按 A-35-1① 改的是**形状本身**。

---

## 2. ① `ProfileGetOutputSchema` 改为闭合对象

### 2.1 改动前后（`packages/server/src/trpc/routers/profile.ts`；该文件是未跟踪新文件，git diff 无内容，故贴逐字前后）

改前（fix2 版，`extend` 继承了 `ProfileDtoSchema` 的 `.passthrough()`）：
```ts
export const ProfileGetOutputSchema = ProfileDtoSchema.extend({
  dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional(),
  totalWords: z.number().int().nonnegative(),
  reviewDays: z.number().int().nonnegative(),
  reviewDates: z.array(z.string()),
  streak: z.number().int().nonnegative(),
});
```

改后（A-35-1① 逐字口径：`.shape` 复用 8 个契约键的**字段 schema 实例**，5 个键的约束沿用 fix2 那份、一格未改）：
```ts
export const ProfileGetOutputSchema = z.object({
  ...ProfileDtoSchema.shape,
  /** 唯一别名键，只读派生自 `daily_goal`（生成点 = shared 的 `profileDtoLegacyAlias()`）。 */
  dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional(),
  totalWords: z.number().int().nonnegative(),
  reviewDays: z.number().int().nonnegative(),
  reviewDates: z.array(z.string()),
  streak: z.number().int().nonnegative(),
});
```

- **没有把 8 个键再抄一遍形状**：`...ProfileDtoSchema.shape` 直接引用 shared 的实例；
  "同一个实例"这一事实由本轮新用例（`toBe` 引用相等）与 fix2 已有的第 3 组用例双向钉住（§3.2）。
- `dailyGoal` **仍是 `optional`**：A-35-1#1 第二层（`PROFILE_DTO_LEGACY_ALIAS=off` 时两门面同时停发该键，
  `profile-dto.spec.ts` 判据② 钉着）。fix2 已实测证否必填化（当场打死一条现存绿用例），本轮不重犯。
- 4 个统计键仍必填（装配点无条件发）。文件内那段取舍注释已同步改写为 A-35-1 口径。

### 2.2 REST 侧 passthrough 一字未动（A-35-1① 的 ⛔）

`packages/shared/src/contracts/profile.ts` 本轮**只读**（mtime 取证见 §6.1）。"passthrough 未动"不只是"我没改文件"，
本轮还钉成了断言且跑绿：
```
expect((ProfileDtoSchema …)._def.unknownKeys).toBe('passthrough');                              ✓
expect(restKept.futureKey /* 过 ProfileDtoSchema.parse 之后 */).toBe('x');                        ✓
```

### 2.3 【关键中间态】只做 ①、还没做 ③ 时的真实输出

```
$ pnpm --filter @tm/web typecheck        # 只做 ① 之后
$ tsc --noEmit
src/app/(user)/profile/page.tsx(92,20): error TS2345: Argument of type 'number | undefined' is not assignable to parameter of type 'SetStateAction<number>'.
  Type 'undefined' is not assignable to type 'SetStateAction<number>'.
Exit status 2
```

⇒ **索引签名确实被消掉了**：同一条 `:92` 的报错消息从 `'unknown'` 变成 `'number | undefined'`。
这就是 A-35-1#1 两层因的分离证据 —— ① 治 `unknown`（passthrough 的 `{[k:string]: unknown}` 在属性访问时压过声明键），
剩下的 `number | undefined` 是别名键的 optional 语义，只能靠 ③ 换读 canonical 键解决，
不许用 `as number` 抹平（A-34-1⑤ 仍有效，本轮零 cast，§4.2）。

---

## 3. ② 键集合钉用例（本轮成败关键）

### 3.1 先记录"只改 ①、未动测试"时的真实红（证明形状改动会咬到既有断言，不是我顺手改绿）

```
 ❯  @tm/server  test/integration/profile-output-parser.spec.ts (15 tests | 1 failed) 53ms
   × A-34-1② 判据二：parser 真的会咬（不是挂了个空转的 shape） > 未知键仍放行（`ProfileDtoSchema` 是 passthrough，批次4 加键不会被这里抢先拒掉） 6ms
     → expected 'strip' to be 'passthrough' // Object.is equality

 Test Files  1 failed (1)
      Tests  1 failed | 14 passed (15)
```

⇒ fix2 那 15 条里**只有 1 条**被 ① 打红，红的是 `_def.unknownKeys === 'passthrough'` 那半句 —— 它钉的正是本轮
被裁决改掉的旧事实。其余 14 条（含判据一"parser 返回的就是服务端装配的那一份，未被裁剪"）全绿
⇒ 闭合形状没有误杀真实装配输出。**这一条按 A-35-1① 改向：不删断言，且反向加严（§3.2a）。**

### 3.2 本轮对测试面的改动（净 +4 支；15 → 19）

**a) 改写那 1 条的后半，并多钉两条**（标题：`出参装配面已闭合（A-35-1①）：未知键不拒但会被 strip ⇒ 必须靠键集合钉兜住；REST 侧 passthrough 未动`）：
```ts
expect(ProfileGetOutputSchema.safeParse({ ...good, futureKey: 'x' }).success).toBe(true);                       // 保留（strip 语义下仍不拒）
expect((ProfileGetOutputSchema …)._def.unknownKeys).toBe('strip');                                              // 翻转：钉"已闭合"这个新事实
expect(Object.prototype.hasOwnProperty.call(stripped, 'futureKey'), '闭合对象必须把未声明键 strip 掉（静默丢键的真实后果）').toBe(false);  // 新增
expect((ProfileDtoSchema …)._def.unknownKeys).toBe('passthrough');                                              // 新增：钉 REST 侧未动
expect(restKept.futureKey, 'REST 侧未知键存活 = T-06 事务 RMW 的既有语义，本轮未动').toBe('x');                   // 新增：行为面而非仅 _def
```
断言数 2 → 5 ⇒ **加严**，且新增那两条钉的正是"闭合会静默丢键"这个新风险本身。

**b) 新增第 4 组 `A-35-1② 键集合钉：真实装配输出 ⊆ 闭合出参 schema 的声明键（新增键未声明即红）`，4 支：**
1. `真实 getProfileDto() 的键集合与闭合 schema 的声明键集合全等（开关 on 的默认产品态）`
   —— 双向 + 端到端：`emitted ⊆ declared`（未声明即红）、`declared ⊆ emitted`（声明面撒谎即红）、两集合全等、
   且 `Object.keys(schema.parse(装配输出))` 与装配输出全等（strip 无处可 strip）。
2. `声明键集合 = PROFILE_DTO_KEYS（服务端自报清单）+ 唯一别名键，不从第三方形状派生`
   —— 钉 13 个声明键的来源；8 个契约键仍 `toBe` shared 的实例。
3. `PROFILE_DTO_LEGACY_ALIAS=off ⇒ 同一支钉仍然成立（少发别名键是产品行为，不是漏声明）`
   —— 另一产品态下 `emitted === PROFILE_DTO_KEYS`，声明面只许多出 `dailyGoal` 一个。
4. `三门面实际返回的键集合都 ⊆ 声明键，且过 parser 后不增键` —— tRPC caller / REST / 线上 HTTP 各自 ⊆ declared，且三路键集合全等。

### 3.3 【疫苗·第一步】临时给装配点加一个未声明键 ⇒ 该用例必红

疫苗内容（`packages/server/src/services/profile-service.ts` 的 `getProfileDto()` 中 `base` 对象，`streak,` 之后插一行）：
```ts
    streak,
    vaccineKey: 'A-35-1② 疫苗：临时未声明键，取证后立即删除',
  };
```
真实输出：
```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server profile-output

 FAIL   @tm/server  test/integration/profile-output-parser.spec.ts > A-34-1② 判据一：真实服务端输出过 schema（三个门面都不误杀） > profile.get（REST createProfileRouter）与 tRPC 线上 HTTP 都过同一个 parser
 FAIL   @tm/server  test/integration/profile-output-parser.spec.ts > A-34-1② 判据一：真实服务端输出过 schema（三个门面都不误杀） > parser 返回的就是服务端装配的那一份（键与值逐字相等，未被裁剪/未被补键）
 FAIL   @tm/server  test/integration/profile-output-parser.spec.ts > A-35-1② 键集合钉：真实装配输出 ⊆ 闭合出参 schema 的声明键（新增键未声明即红） > 真实 getProfileDto() 的键集合与闭合 schema 的声明键集合全等（开关 on 的默认产品态）
 FAIL   @tm/server  test/integration/profile-output-parser.spec.ts > A-35-1② 键集合钉：真实装配输出 ⊆ 闭合出参 schema 的声明键（新增键未声明即红） > PROFILE_DTO_LEGACY_ALIAS=off ⇒ 同一支钉仍然成立（少发别名键是产品行为，不是漏声明）
 FAIL   @tm/server  test/integration/profile-output-parser.spec.ts > A-35-1② 键集合钉：真实装配输出 ⊆ 闭合出参 schema 的声明键（新增键未声明即红） > 三门面实际返回的键集合都 ⊆ 声明键，且过 parser 后不增键（键集合钉对真实线上一致）

AssertionError: 装配点发了闭合 schema 未声明的键 ⇒ 会被静默 strip：vaccineKey: expected [ 'vaccineKey' ] to deeply equal []
AssertionError: 停发别名键时也不得有未声明键: expected [ 'vaccineKey' ] to deeply equal []
AssertionError: REST 返回了闭合 schema 未声明的键 ⇒ 会被静默丢掉：vaccineKey: expected [ 'vaccineKey' ] to deeply equal []
AssertionError: expected [ 'avatar', 'dailyGoal', …(11) ] to deeply equal [ 'avatar', 'dailyGoal', …(12) ]

 Test Files  1 failed (1)
      Tests  5 failed | 14 passed (19)
```

⇒ **疫苗必红达成**，且失败消息**点名 `vaccineKey`**（不是只给"数组不等"），排障时一眼看出是哪个键漏声明。
新组 4 支里 3 支被疫苗打红；第 4 支（`声明键集合 = PROFILE_DTO_KEYS + dailyGoal`）**保持绿** —— 设计使然：
它钉"声明面从哪来"，而疫苗既没改 `PROFILE_DTO_KEYS` 也没改 schema，所以不该红（它防的是另一类漂移：
将来有人给 schema 加一个装配点不发的键 / 只改清单不改装配）。两类钉子不互相替代。
另有 2 支 fix2 既有用例（判据一的"未被裁剪"与"三门面全等"）**独立变红** ⇒ 静默丢键不止一支新用例在守。

### 3.4 【疫苗·第二步】删除疫苗 ⇒ 逐字回滚取证 + 再跑绿

```
$ sha256sum packages/server/src/services/profile-service.ts
疫苗前：      346351317f44b36c093845ec2aaa6bdf80a7447590a1adb2cc688556d7141eaf
回滚后（终态）：346351317f44b36c093845ec2aaa6bdf80a7447590a1adb2cc688556d7141eaf   ← 完全一致
$ grep -c "vaccineKey" packages/server/src/services/profile-service.ts
0
```
（回滚**不用 git**，用同一把 Edit 逆向删除 + 哈希核对 ⇒ `profile-service.ts` 本轮净改动 = 0。）

再跑绿（终态）：
```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server profile-output
 ✓  @tm/server  test/integration/profile-output-parser.spec.ts (19 tests) 93ms
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

---

## 4. ③ `page.tsx:92` 单行有界改动取证

### 4.1 `git diff -U0`（任务书要求的原样命令）

```
$ git diff -U0 -- "apps/web/src/app/(user)/profile/page.tsx"
diff --git a/apps/web/src/app/(user)/profile/page.tsx b/apps/web/src/app/(user)/profile/page.tsx
index 23756fd..0ad2863 100644
--- a/apps/web/src/app/(user)/profile/page.tsx
+++ b/apps/web/src/app/(user)/profile/page.tsx
@@ -18,6 +18,6 @@ import { clearToken, clearUser, getUser, setUser, type StoredUser } from '@/lib/
-import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
-import { Button } from '@/components/ui/button';
-import { Input } from '@/components/ui/input';
-import { Label } from '@/components/ui/label';
-import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
-import { Separator } from '@/components/ui/separator';
+import { Avatar, AvatarFallback, AvatarImage } from '@tm/ui';
+import { Button } from '@tm/ui';
+import { Input } from '@tm/ui';
+import { Label } from '@tm/ui';
+import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tm/ui';
+import { Separator } from '@tm/ui';
@@ -92 +92 @@ export default function ProfilePage(): React.JSX.Element {
-      setDailyGoal(profile.data.dailyGoal);
+      setDailyGoal(profile.data.daily_goal);
```

**诚实拆分**（工作区大量未提交，本文件在我开工前就有别的 agent 的改动，所以"整文件 diff"不等于"我的 diff"）：

| hunk | 内容 | 归属 |
|---|---|---|
| `@@ -18,6 +18,6 @@` | 6 行 import 从 `@/components/ui/*` 改指 `@tm/ui` | **不是我改的**，开工前就在工作区；归属表该条的 `predecessorAllowedDiff = {kind:"import-lines-only", applies_to:["T-04"]}` 允许的就是这 6 行 |
| `@@ -92 +92 @@` | **1 行**：`profile.data.dailyGoal` → `profile.data.daily_goal` | **本轮我改的，全轮仅此一行** |

⇒ 我那支 hunk 是 `-92 +92`：删 1 加 1、**0 既有行改写**、无空白/换行抖动。改动只是**属性名**，
`setDailyGoal(...)` 调用、`if (profile.data)` 守卫、依赖数组 `[profile.data]` 全部原样。

### 4.2 三条 ⛔ 的自查

- **零 `as number` / 零局部 cast**（A-34-1⑤）：本轮 `page.tsx` 只改了属性名，未新增任何断言式 cast。
  归零是靠 ① 消索引签名 + ③ 换必填 canonical 键拿到的 —— §2.3 那次中间态实拍就是"不 cast 会怎样"的证据。
- **没顺手改这个页面别的地方**：`page.tsx:265` 的 `value={dailyGoal}`（本地 state）与 `:268` 的
  `update.mutate({ dailyGoal })`（**入参**别名，`update` 的 input parser 本轮未动）都保持原样，那是 T-15 的活。
- **给 T-15 简报的一句话**：该行现在读 canonical `daily_goal`（必填 `number`），与 R-04①② 的"一份真值"同向。

### 4.3 【保留红】`--check-ownership` 终态输出（通道未登记，按任务书不放宽）

```
$ node tools/boundaries.mjs --check-ownership --task T-11 \
    --files "apps/web/src/app/(user)/profile/page.tsx,packages/server/src/trpc/routers/profile.ts,packages/server/test/integration/profile-output-parser.spec.ts" \
    --diff-file /tmp/t11-fix3.patch          # = git diff -U0 -- page.tsx
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
NOTE packages/server/test/integration/profile-output-parser.spec.ts：归属表无条目（no-entry，不阻断）
RED  apps/web/src/app/(user)/profile/page.tsx 由 T-15 独占（当前任务 T-11）— §10.4 第 1 行

--check-ownership task=T-11 触碰 2 个在册文件（清单 3 项 + patch 1 项） → 1 处越界
EXIT=1
```

换用"只含我那一行 hunk"的 scoped patch 再跑一次，**同样判红、文案一字不变（`EXIT=1`）** ⇒ 红的原因是
`tools/ownership.json` 里根本没有 `bounded-edit:A-35-1` 条目（`grep -n "A-35-1" tools/ownership.json` = 0 命中），
与证据形状无关。`routers/profile.ts` 判为在册且归属 `T-11`（不红），spec 判 `no-entry`（不阻断）。

> **E1c 在登 `bounded-edit:A-35-1` 条目**（A-35-1#11 已把这条登记派给 E1c）。本轮不自判自批、不改 `tools/**`、不造表。
>
> 给 E1c 的一个**实测坑**（本轮真跑出来的）：`bounded-edit` 的幅度判据是 `tools/boundaries.mjs:1310`
> `const total = change.added.length + change.removed.length` —— 它数 patch 里该文件的**全部**增删行，
> **不会**先扣掉 `predecessorAllowedDiff` 允许的那 6 行 import。所以对 `page.tsx` 用 `git diff -U0` 原样当证据时
> `total = 14`（6+6 属 T-04 既有行，1+1 才是我的），登记成 `maxDiffLinesFor:{"T-11":1}` 会**误红**。三选一：
> (a) `maxDiffLinesFor:{"T-11":1}` **且** `bounded-edit` 通道先扣 `predecessorAllowedDiff` 允许的行；
> (b) 出口冒烟规定 `--diff-file` 用"本轮增量的 scoped patch"（本轮已备好并被实跑过），条目里写明证据口径；
> (c) 登记 `{"T-11":14}` —— 不推荐，那等于把别人的 6 行也授权给我。

---

## 5. 出口命令真实输出（终态，一次不落地重跑）

### 5.1 `pnpm --filter @tm/web typecheck` —— **本轮硬判据：0 错**

```
### CMD: pnpm --filter @tm/web typecheck
$ tsc --noEmit
EXIT=0
```
（无一条诊断。改动前 = 1 条 `TS2345: 'unknown'`（§1）；只做 ① 时 = 1 条 `'number | undefined'`（§2.3）；③ 之后 = 0。）

### 5.2 `pnpm --filter @tm/server typecheck`

```
### CMD: pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
EXIT=0
```

中途真实红过一次（我新写的用例用 `string` 去索引 `.shape` ⇒ TS7053），已按该文件既有的
`(x as unknown as z.ZodObject<z.ZodRawShape>).shape` 同款取形方式改好，不是放宽断言：
```
test/integration/profile-output-parser.spec.ts(272,14): error TS7053: Element implicitly has an 'any' type because
expression of type 'string' can't be used to index type '{ dailyGoal: ZodOptional<ZodNumber>; … }'.
```

### 5.3 `pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server profile-output`

（按任务书用这条；**不用** `pnpm --filter @tm/server test -- <name>`，那个 `--` 原样传下去根本不过滤。）
```
[A-34-1 出参面] get: hasParser=true type=ZodObject | update: hasParser=false | changePassword: hasParser=false | update._def keys=["procedure","inputs","middlewares","meta","type","resolver"]
 ✓  @tm/server  test/integration/profile-output-parser.spec.ts (19 tests) 93ms
 Test Files  1 passed (1)
      Tests  19 passed (19)
   Duration  1.47s
```
19 支 = fix2 的 15 支（其中 1 支按 ① 改向并加严）+ 本轮键集合钉 4 支。
`[A-34-1 真实输出]` 那行打印的 13 个键逐字可见，`daily_goal` 与 `dailyGoal` 同值 ⇒ 别名唯一生成点未变。

### 5.4 `pnpm --filter @tm/server test`（全套）

```
 ❯  @tm/server  test/trpc-shape.spec.ts (2 tests | 1 failed) 21ms
 Test Files  1 failed | 14 passed (15)
      Tests  1 failed | 352 passed (353)
```
唯一红 = **`trpc-shape` 基线漂移**，与批次3 出口盘面那条"349 用例 / 1 红（唯一红 = trpc-shape 基线）"是同一条，
按计划留 **E3** 一次性再生（A-35-1④ / #14；任务书 ⛔ 禁止我再生）。"是不是我改形状才红的"——**不是**，两条盘证据：
1. 盘上基线的 `profile.get` 至今是 `"input":null,"output":null` + `outputProbes:[{"probe":"(no-parser)",…}]`
   —— 连 fix2 那次挂 parser 都没进基线 ⇒ 红在 fix2 之后就已存在，A-35-1④ 说的正是它。
2. 本次报的**首个差异不在 profile**：`现值:"path":"auth.activate"` / `基线:"path":"auth.login"`，
   受影响清单含 `auth.*`、`review.queue`、`review.undo` ⇒ 基线整体落后于 T-07/T-10 的既成事实，非本轮引入。

### 5.5 `pnpm --filter @tm/web test`（全套）

```
 ✓  @tm/web  test/home-shell.spec.tsx (16 tests) 464ms
 Test Files  1 passed (1)
      Tests  16 passed (16)
```
（与本行改动无关的 React `act(...)` 警告照旧打印，未处理，不在本轮范围。）

---

## 6. 盘面数字对账表（A-32-9）

| 数字 | 上一轮（fix2 交付 / A-35 拍的盘面） | 本轮终态 | 差值与归因 |
|---|---|---|---|
| `@tm/web typecheck` 错误数 | **1**（`:92` `unknown`） | **0** | −1；① 消索引签名 + ③ 换 canonical 必填键，零 cast |
| `@tm/server typecheck` 错误数 | **0** | **0** | 0；中途我自己写红过 1 条 TS7053，已修（§5.2） |
| `profile-output` 用例数 | 15 | **19** | +4，全部来自 ② 的键集合钉新组 |
| `profile-output` 红数 | 0 | **0** | 0（疫苗在位时 5 红，已回滚，§3.3/§3.4） |
| `@tm/server test` 总数 | **349** | **353** | +4，与上一行同源；无第三方增减 |
| `@tm/server test` 红数 | **1**（`trpc-shape` 基线） | **1**（同一条） | 0；留 E3（A-35-1④/#14），本轮未再生基线 |
| `@tm/web test` 总数 / 红 | 16 / 0 | **16 / 0** | 0 |
| 出参 parser 挂载数 | 1（`get`） | 1（`get`） | 0；`update`/`changePassword` 仍不挂（A-34-1③④ 不变） |
| `ProfileGetOutputSchema` 声明键数 | 13（但继承 passthrough ⇒ 带索引签名） | **13**（闭合，`unknownKeys='strip'`） | 键集合一字未增删（§3.2 用例 2 钉 = `PROFILE_DTO_KEYS` + `dailyGoal`） |
| `page.tsx` 本轮改动行数 | 0 | **1**（`:92`） | 在 A-35-1③ 授权幅度内；另有 6 行 import 属 T-04 既有 diff（§4.1） |
| `profile-service.ts`（疫苗对象）净改动 | — | **0** | sha256 前后一致（§3.4） |
| git 写操作 | 0 | **0** | — |

### 6.1 归属对账（`find packages apps -newermt "-40 minutes"` 的实拍）

```
packages/server/test/integration/profile-output-parser.spec.ts   ← 本轮我改
packages/server/src/services/profile-service.ts                  ← 疫苗，已按 sha256 逐字回滚（§3.4）
packages/shared/test/contracts.spec.ts                           ← 并行 agent（T-03/E1b 名下），**不是我**
packages/shared/src/constants/errors.ts                          ← 并行 agent 正在改（任务书预告），**不是我**
apps/web/src/app/(user)/profile/page.tsx                         ← 本轮我改（仅 :92）
packages/server/src/trpc/routers/profile.ts                      ← 本轮我改
```

⇒ `packages/shared/**` 的 mtime 变动全部归属并行中的 T-03/E1b（`constants/errors.ts` 是 A-35-1#2 派给它的）；
本轮对 `packages/shared` 写入次数 = **0**。本轮全套件里没有任何一条红落在并行 agent 名下
（唯一红是 `trpc-shape` 基线，E3 名下）。

---

## 7. 已知限制、契约偏差与待 TPM 拍板项

**越界申请：无新增。**（唯一一次越界写 = A-35-1② 明文要求的疫苗，临时改 `profile-service.ts` 一行、跑完即删、
sha256 与疫苗前一致；该文件归属本就是 `T-11`（`tools/ownership.json:645`）。）
**契约偏差：0 条。** 出参 13 键的名称/类型/必填性一字未增删，只把"闭不闭合"这一属性从 passthrough 改成 strip
—— 这正是 A-35-1① 授权并要求的改动；REST 契约面未动（并由断言钉住，§2.2）。

### 7.1 【请 TPM 知会 E3，别当新缺陷】基线里 profile 系出参面"从盲变可见"的具体形状
`profile.get`：`output: null → ZodObject`、`outputProbes: [(no-parser)] → 真实 parser 探针`，
且形状是**闭合对象**（`unknownKeys='strip'`）；`profile.get` 的入参仍是 `null`（0 个 input parser，第 3 组继续钉）。
按 A-35-1④"从盲变可见属只增"核对即可。⚠ 提醒：基线再生后，"未声明键也能出现在响应里"这类下游依赖
**不会**再由基线覆盖 —— 它只由本轮的键集合钉用例守（§3.2），E3 不必为此加探针。

### 7.2 【仍待 TPM 处置】A-35-1#11 的 `bounded-edit` 幅度口径（本轮实测出坑，见 §4.3 末）
不修这条，批次4 每个"只改一行"的人都会在同一处误红。已给 (a)/(b)/(c) 三候选，我倾向 **(a)**
（`bounded-edit` 先扣 `predecessorAllowedDiff` 允许的行，再按 `maxDiffLinesFor` 判）：它不要求人肉造 scoped patch，
也不会把别人的 6 行算进我的授权。属 `tools/**` = **E1c 名下**，本轮一行未动。

### 7.3 【fix2 遗留、本轮不变】`dailyGoal` 别名的停用是批次4 的事
本轮把 web 侧唯一读**出参**别名的地方（`page.tsx:92`）改成 canonical 读法，但**入参**别名仍在用
（`page.tsx:268` `update.mutate({ dailyGoal })`，`update` 的 input parser 本轮未动）。
"停发别名"的既有裁决（判据② / A-34-1②）没变，是否另开门 = fix2 §5.1 选项 (b)，仍待 TPM。

### 7.4 【登记，不处置】四条不在本轮可写面的既有事实
- **`prettier --check` 仓库级失败，非本轮引入**：本轮两个我名下的文件被 `[warn]` 命中，但我**没跑 `--write`** ——
  同一把尺子在**我一行未动**的文件上同样红：
  ```
  $ npx prettier --check packages/server/src/services/profile-service.ts packages/server/src/trpc/init.ts \
      packages/server/src/routes/review.ts packages/shared/src/contracts/profile.ts
  [warn] packages/server/src/services/profile-service.ts   ← 本轮净 0 改动（疫苗已按 sha256 回滚，§3.4）
  [warn] packages/server/src/trpc/init.ts                   ← T-07 名下，本轮未动
  [warn] packages/server/src/routes/review.ts               ← T-10 名下，本轮未动
  [warn] packages/shared/src/contracts/profile.ts           ← T-03/E1b 名下，本轮只读
  Code style issues found in 4 files.
  ```
  根因是 `.prettierrc.json` 的 `printWidth:100` 与 prettier 把 CJK 字符按宽度 2 计：这些文件里大量
  含中文的 `expect(..., '…')` 单行会被判超宽 ⇒ 要重排的是**既有行**（例：spec 第 77 行 `const token = …`，本轮未动）。
  跑 `--write` 等于替 T-07/T-10/T-03 改它们名下的行，且会把 `page.tsx`（T-15）以外的风格噪声混进本轮 diff。
  仓库根**没有** `format:check` 脚本（只有 `format` = `--write`），所以它不是出口判据。请 TPM 决定要不要单开一轮全仓格式化。
- `profile-dto.spec.ts` 里"旧 `GET /api/profile` 六键一字未动"那条用**空数组**兜 `reviewDates`，
  `array(number)`（`ProfileSummarySchema`）vs `string[]`（`profile.get`）的分歧被恰好放过（假绿嫌疑）。不属我可写面。
- pg 驱动面本机无实例：新用例与 `profile-dto.spec.ts` 一样只在临时 sqlite 上跑（全程 `os.tmpdir()` 建库，
  **绝未**在仓库根 `data.db` / `packages/server/data.db` 上跑写操作或迁移，未跑任何迁移）。
  `reviewDates: z.array(z.string())` 在 pg 侧的实际返回类型要 CI（T-22）真跑 pg 才算覆盖。
- `tools/boundaries.mjs` 正在被 E1c 改：本轮只读调用 `--check-ownership`，未触碰其源码与 `ownership.json`。

### 7.5 铁律自查
git：`commit/push/stash/checkout/reset/clean/restore/add` **零执行**。基线：**未再生**（`TRPC_SHAPE_UPDATE` 未跑）。
§4.6 三个冻结集合、`ts-fsrs` 版本与序列化格式：未触碰。
临时产物都在仓库外（`/tmp/t11-fix3*.patch`、`os.tmpdir()` 下的测试库），仓库内无残留文件。
