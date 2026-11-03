# 开发报告 · T-07 微轮（批次3 出口回环修：DEFECT-3 / DEFECT-4）

- 任务号：T-07r7 ｜ 依据：`04-adjudications.md` A-36 的 **#3 / #4 / #6** 三行（任务书原文，四条修法约束逐条照做）
- 上游取证：`04-dev-report-E3.md` §4 `### DEFECT-3`（:90-96）/ `### DEFECT-4`（:98-100）
- 角色卡：`references/roles/dev.md`（后端开发）
- 轮次纪律：**未做任何 git 写操作**；**未跑过 `TRPC_SHAPE_UPDATE=1` 的任何一次**（基线 sha 见 §5）；写库只发生在 `data.db` 的临时副本上（复用 T-07 既有夹具，见 §2 说明）。

## 0. 一句话结论

两处 DEFECT 都按"回环修"落地：`auth.login` 与 `auth.sendCode` 在 `trpc-shape` 的失败明细里**已经不再出现**（A-36 四-2 要求的 0 行）；两条疫苗都真跑过红→绿；共新增 3 条端到端用例（`@tm/server` 353 → 356，计划内 1 红不变）。**两处需要 TPM 拍板**（§8）：`tools/ownership.json` 缺 `bounded-edit:A-36-3` 那一行（门禁按字面判我越界），以及 T-03 名下 `packages/shared/test/contracts.spec.ts:337` 把 DEFECT-3 钉成了断言、必须由该文件的主人翻转。

---

## 1. 改动清单

### 1-1 文件清单（4 个，全部在我的可写面内）

| # | 文件 | 归属通道 | 实际变更（scoped patch 行数） | 内容 |
|---|---|---|---|---|
| 1 | `packages/shared/src/contracts/auth.ts` | `bounded-edit:A-36-3`（A-36-6 派发） | **+43 / -6 = 49 行** | DEFECT-3（登录面摘 `min/max` + 键序还原）+ DEFECT-4（两条人话串常量 + `phoneSchema(message)` 工厂） |
| 2 | `packages/server/src/trpc/routers/auth.ts` | 名下正常写权 | +6 / -1 = 7 行 | `login` 的 JSDoc 补一句"登录面不验强度"的接线说明（**代码零改动**，见 §2-①） |
| 3 | `packages/server/test/integration/auth-register.spec.ts` | 名下（`ownership.json:740`） | +5 / -1 = 6 行 | 把"钉住码串泄漏"的那半句断言改成"码串不得出现"（§3-④） |
| 4 | `packages/server/test/integration/auth-hardening.spec.ts` | 名下（同上） | +115 / -0 = 115 行 | 本轮 3 条新用例（§2-② / §3-③） |
| — | 合计 | — | **+169 / -8 = 177 行** | — |

**未改的东西（负清单，逐条对应任务书禁令）**：`tools/**`（0 行）、`packages/shared/src/constants/**`（0 行，含 `errors.ts` / `limits.ts`）、`apps/**`、`db/**`、任何其他 router/service、`packages/server/test/trpc-shape.baseline.json`（sha 见 §5）。
`RegisterInputSchema` / `ChangePasswordInputSchema` / `ForceUpgradeInputSchema` 对 `PasswordSchema` 的引用**一字未动**（patch 里这三段没有 hunk），R-39② 的三条 ≥8 断言原样保留。

### 1-2 `git diff -U0` 的真实输出（HEAD 相对）

```
$ git diff -U0 -- packages/shared/src/contracts/auth.ts packages/server/src/trpc/routers/auth.ts \
    packages/server/test/integration/auth-register.spec.ts packages/server/test/integration/auth-hardening.spec.ts
（空输出）

$ git status --porcelain -- <同上四个文件>
?? packages/server/src/trpc/routers/auth.ts
?? packages/server/test/integration/auth-hardening.spec.ts
?? packages/server/test/integration/auth-register.spec.ts
?? packages/shared/src/contracts/auth.ts
```

**归因（不是漏跑）**：四个文件在 HEAD 里都是 **未跟踪（`??`）** 状态 → `git diff` 对未跟踪文件按定义无输出。这正是 A-36-6/#13 写明"证据 = agent 自有 scoped patch 经 `--diff-file`，**不收 HEAD diff**"的原因。改前快照 → 改后的 patch 见 §1-3。

### 1-3 scoped patch（改前快照 → 改后；`git diff --no-index -U0` 真实输出，节选 src 两文件全文）

```diff
+++ b/packages/shared/src/contracts/auth.ts
@@ -8 +8,3 @@
- *  3. 错误响应体是 `{error, code}`（§4.6），人话由 `constants/errors.ts` 单点提供，本文件不放文案。
+ *  3. 错误响应体是 `{error, code}`（§4.6），人话由 `constants/errors.ts` 单点提供，本文件不放**响应码文案**
+ *     （A-36-4①：唯一的例外是下面两个入参校验的展示串具名常量 —— 它们是 zod 的展示参数，
+ *     不是 §4.6 文案面，`TM_ERRORS`/`TM_ERROR_CODES`/`TM_ERROR_ROWS` 三个面一字不动）。
@@ -15,2 +17,22 @@ import { TmErrorResponseBodySchema } from '../constants/errors.js';
-/** 手机号：11 位、`1[3-9]` 开头，不放宽（R-39②）。 */
-export const PhoneSchema = z.string().regex(PHONE_PATTERN, 'INVALID_PHONE');
+/**
+ * 手机号校验失败的展示串（A-36-4①：两条**逐字还原**基线"改动前"指纹，不合并成一句）。
+ * 出处 = `packages/server/test/trpc-shape.baseline.json` 的 `auth.login`（`:3199`）与
+ * `auth.sendCode`（`:3876`）两段；两串语境不同（登录报格式、发码催输入），合并仍会打穿指纹。
+ * ⚠ 码串 `INVALID_PHONE` 不再充当这里的 message（A-36-4②）；作为**码**它照旧走
+ *    `constants/errors.ts:80` 的 `copy`（服务端 `tmAuthError('INVALID_PHONE')` 那一条路）。
+ */
+const PHONE_LOGIN_COPY = '手机号格式不正确';
+/** 见 `PHONE_LOGIN_COPY` 的注释（发码面的那一条，基线 `:3876` 逐字）。 */
+const PHONE_SEND_CODE_COPY = '请输入正确的手机号';
+
+/**
+ * 手机号 schema 工厂（A-36-4③：判定只有一份）。
+ * 正则只有 `limits.ts` 的 `PHONE_PATTERN`，message 只是**展示参数** ——
+ * 任何面都不得再复制正则或复制第二份判定逻辑。
+ */
+const phoneSchema = (message: string): z.ZodString => z.string().regex(PHONE_PATTERN, message);
+
+/** 手机号：11 位、`1[3-9]` 开头，不放宽（R-39②）。登录/注册/激活/改密面共用。 */
+export const PhoneSchema = phoneSchema(PHONE_LOGIN_COPY);
+/** 发码面的手机号 schema：同一个 `PHONE_PATTERN`，只有展示串不同（A-36-4①"两条不合并"）。 */
+const SendCodePhoneSchema = phoneSchema(PHONE_SEND_CODE_COPY);
@@ -23 +45,16 @@ export const PasswordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX_BYTES)
-/** 登录（本期只有手机号 + 密码；`code` 分支保留形状但通道未接，R-01⑥）。 */
+/**
+ * 登录（本期只有手机号 + 密码；`code` 分支保留形状但通道未接，R-01⑥）。
+ *
+ * ⚠ **登录面的 `password` 只有 `optional()`，不挂强度策略**（A-36-3 修 DEFECT-3）：…（注释全文见文件）
+ * ⚠ 键的**声明顺序**是 `phone → code → password`：…（同上）
+ */
@@ -26 +62,0 @@ export const LoginInputSchema = z.object({
-  password: PasswordSchema.optional(),
@@ -27,0 +64 @@ export const LoginInputSchema = z.object({
+  password: z.string().optional(),
@@ -42 +79 @@ export type RegisterInputDto = z.infer<typeof RegisterInputSchema>;
-export const SendCodeInputSchema = z.object({ phone: PhoneSchema });
+export const SendCodeInputSchema = z.object({ phone: SendCodePhoneSchema });
```

```diff
+++ b/packages/server/src/trpc/routers/auth.ts
@@ -94 +94,6 @@
-  /** R-01①③：手机号 + 密码登录（本期主路径）。 */
+  /**
+   * R-01①③：手机号 + 密码登录（本期主路径）。
+   * `LoginInputSchema.password` **只验"有没有给"、不验强度**（A-36-3 / DEFECT-3）：
+   * 强度与"下次登录强制改密"的判定在 service 侧（`assertPasswordStrength` +
+   * `requiresPasswordUpgrade`），这里挂 `min(8)` 会把存量短密码账号锁死在 zod 层。
+   */
```

```diff
+++ b/packages/server/test/integration/auth-register.spec.ts
@@ -1150 +1150,5 @@
-      expect(trpc.message).toContain('INVALID_PHONE');
+      // A-36-4②（DEFECT-4 的回环修）：zod message 里不得出现全大写码串，必须是入参展示串。
+      // 这里改的是"钉住码串泄漏"那一半（原断言把 bug 钉成了现状），
+      // **不对称**那一半原样保留：message 仍是 issues 序列化串、仍不等于 §4.6 人话（F-10 下一期收敛）。
+      expect(trpc.message).not.toMatch(/\b[A-Z][A-Z0-9_]{2,}\b/);
+      expect(trpc.message).toContain('手机号格式不正确');
```

`packages/server/test/integration/auth-hardening.spec.ts` 的 hunk 是纯追加（`@@ -1033,0 +1034,115 @@`，115 行 0 删），内容全文引在 §2-② / §3-③。
patch 文件产在临时目录（`<TEMP>/t07fix3/scoped.patch`，202 行），本轮结束按简报要求删除；改前快照与 patch 的行数统计见 §1-1（用门禁自己的 `parsePatch` 同一口径复算，非手点）。

---

## 2. DEFECT-3 处置与用例

**① 修法（照 A-36-#3 的原文，不加码）**
- `LoginInputSchema.password`：`PasswordSchema.optional()`（含 `min(8)/max(72)`）→ **`z.string().optional()`**。登录面只验"有没有给"。
- 强度策略**没有消失**，仍在服务端两处：`password-policy.assertPasswordStrength()`（注册/改密/强升调用）与 `requiresPasswordUpgrade()`（`password` 非空 + `pw_policy_version=0`）→ 命中的走 `issueTokens()` 的 `upgrade_required` 分支。
- `routers/auth.ts` **零代码改动**：它本来就 `.input(LoginInputSchema)`，摘策略必须发生在 shared 那一份上，在门面再写一份 `z.string().optional()` 才是"造第二份真相"。该文件只补了 6 行注释（§1-3）。
- **R-39② 三面未被改短**（裁决的"不得因本次修改而变短"）：`RegisterInputSchema`/`ChangePasswordInputSchema`/`ForceUpgradeInputSchema` 仍引同一个 `PasswordSchema`；用例里也钉了一条（§2-② 第 4 段）。

**①-b 我在核对时多找到的一条（不是发挥，是 D 项硬核对逼出来的）**
按 A-36 四-2"修完 `auth.login` = 0 行"跑轴级核对时，发现 `auth.login` 还剩 **2 行纯键序差异**：基线 `phoneEmptyStrings` 探针的 `data` 是 `{phone, code, password}`（`trpc-shape.baseline.json:3509-3517`），而 `contracts/auth.ts` 里写的是 `{phone, password, code}` → zod 出参键序跟着 shape 走，快照面上就多这 2 行。E3 的 §4 只点了"password 两 check + phone 文案"两键，没点名这一条（它的 §6 明说临时产物已删、只留 §2/§3/§4）。**处理：把声明顺序还原成 `phone → code → password`**（零语义变化、`LoginInputDto` 类型不受影响）。这是"还原"，不是登记例外；取证与前后对比在 §5。

**② 用例（`packages/server/test/integration/auth-hardening.spec.ts`，sqlite/pg 双驱动各一条）**

```ts
describe(`A-36-3（DEFECT-3）：登录面不验密码强度 · ${driver}`, () => {
  const LEGACY_SHORT_PASSWORD = 'abcd';
  it('`password` 长度 4 的存量账号经 tRPC `auth.login` 进得到 service、被判 `upgrade_required`', async () => {
    const a = await pending(`a36-3-login4-${driver}`, driver, LEGACY_SHORT_PASSWORD);   // pw_policy_version=0 + 真实 bcrypt 串
    expect(a.password.length).toBe(4);
    expect(a.password.length).toBeLessThan(PASSWORD_MIN);
    const wire = await a.h.trpc('auth.login', { phone: a.phone, password: a.password }); // ★ 走 /trpc/* 线上形状
    expect(wire.status, wire.raw).toBe(200);          // ① 没在 zod 层被拒
    expect(wire.error, wire.raw).toBeNull();
    expect(wire.raw).not.toContain('too_small');
    expect(wire.data?.upgrade_required, wire.raw).toBe(true);   // ② 进到了 service 并被升级判定接住
    expect(wire.data?.token, wire.raw).toBe('');
    expect(String(wire.data?.upgradeToken ?? '')).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    expect(wire.data?.phone).toBe(a.phone);
    const rest = await a.h.request('/api/login', { ... });      // ③ REST 门面同判（两端一致，R-17⑧ 不变）
    expect([rest.status, rest.body.upgrade_required], rest.raw).toEqual([200, true]);
    const reg = await a.h.request('/api/register', { ...短密码... }); // ④ 摘登录面 ≠ 放开设密码面
    expect([reg.status, reg.body.code], reg.raw).toEqual([TM_ERRORS.WEAK_PASSWORD.http, 'WEAK_PASSWORD']);
  });
});
```

夹具说明：复用本文件既有 `pending()`（`hashPassword()` 写**真实 bcrypt 串** + `pw_policy_version=0`）与 `h.trpc()`（打 `app.ts` 挂载的 `/trpc/auth.login`，经**生产同款 errorFormatter**），库是 `data.db` 的**只读副本**（`fs.copyFileSync` 到 `<TEMP>/tm-t07-hardening-<pid>/`，`afterAll` 里 `rmSync`）。用例落在这个文件而不是新开 `auth-login-*.spec.ts` 的理由写在文件头注释里：`ownership.json:740` 只登记了 `{auth-register,auth-hardening}.spec.ts` 两条 T-07 路径，新开文件要请 E 轮改 `tools/**`（本轮禁区）；两夹具正好就是这两条用例要的那两件，复用即零重复装配。

**实测**：`Tests 3 passed | 26 skipped (29)`（本文件按 `-t "A-36"` 只跑这 3 条；pg 侧按 A-18-3 显式 SKIP）。疫苗见 §4-A。

---

## 3. DEFECT-4 处置与用例

**① 逐字还原的取证先于动手**（任务书要求的顺序）

```
$ grep -n "手机号格式不正确\|请输入正确的手机号" packages/server/test/trpc-shape.baseline.json
3199:                "message": "手机号格式不正确"      ← auth.login 的 check 轴
3464 / 3475:  "message": "手机号格式不正确"             ← auth.login 的 phoneBad11 / phoneBadPrefix 探针
3876:                "message": "请输入正确的手机号"    ← auth.sendCode 的 check 轴
4141 / 4152:  "message": "请输入正确的手机号"           ← auth.sendCode 的 phoneBad11 / phoneBadPrefix 探针
```
两串**各归各的**，没有合并成一句（`auth.login` 用前者、`auth.sendCode` 用后者），并且两条串在实现里的差集本身就是断言（§3-③ 最后一段）。

**② 落点与四条硬约束的对账**

| 约束（A-36-4 原文） | 落地 | 证据 |
|---|---|---|
| ①还原、不合并 | `PHONE_LOGIN_COPY` / `PHONE_SEND_CODE_COPY` 两个具名常量，各挂各的 schema | §1-3 patch + §5 的 0 行差异 |
| ②码串不得再出现在任何 zod message | `contracts/auth.ts` 里 `'INVALID_PHONE'` 作为 message 的出现次数 = **0**（只剩注释里的 2 处引用性说明）；码仍走 `tmAuthError('INVALID_PHONE')` → `errors.ts:80` 的 `copy`，那条路一字未动（`password-policy.ts:121` 现状即正例） | `grep -n "INVALID_PHONE" packages/shared/src/contracts/auth.ts` → 21/22 行（都是注释）；§4-B 疫苗红 |
| ③单一真相不破 | 只有 `phoneSchema(message)` 一个工厂 + `limits.ts` 的 `PHONE_PATTERN`；**没有**新增正则、**没有**第二份判定；两串常量落在 `contracts/auth.ts`（非 §4.6 冻结面），`TM_ERRORS`/`TM_ERROR_CODES`/`TM_ERROR_ROWS` 三个面一字未动（我的 patch 不含 `packages/shared/src/constants/**` 的任何 hunk） | 正则唯一性实测：`grep -rn '1\[3-9\]' packages/shared/src packages/server/src apps/web/src` → 只有 `limits.ts:24` 是真正则，另两处是注释；`@tm/shared` 套件的 §4.6 快照/文案面用例全绿（§6-4） |
| ④疫苗端到端 | 走 `/trpc/*` HTTP 客户端（不是 `safeParse`），断言 message 不含全大写码串 + 逐字等于人话串 | §3-③ + §4-B |

**③ 用例（同上文件，2 条）**

```ts
const BAD_PHONES = ['', '1380013800', 'abcdefghijk'];
const UPPERCASE_CODE = /[A-Z][A-Z0-9_]{2,}/;     // INVALID_PHONE / BAD_REQUEST / SMS_NOT_CONFIGURED 都算
const LOGIN_COPY = '手机号格式不正确';             // 基线 :3199 逐字
const SEND_CODE_COPY = '请输入正确的手机号';       // 基线 :3876 逐字
const issuesOf = (message: string) => { … JSON.parse(线上传来的 issues 序列化串) … };

it('`auth.login` 的 message 逐字 = 「手机号格式不正确」，且不含任何全大写码串', async () => {
  for (const phone of BAD_PHONES) {
    const wire = await h.trpc('auth.login', { phone, password: 'abcdefghij' });
    expect(wire.status).toBe(400);
    const message = String(wire.error?.message ?? '');
    expect(message).not.toBe('');
    expect(message).not.toMatch(UPPERCASE_CODE);          // ← 码串不得出现（A-36-4②）
    const issues = issuesOf(message);
    expect(issues[0]?.message).toBe(LOGIN_COPY);          // ← 逐字等于（toBe，不是 toContain）
    expect(issues[0]?.path).toEqual(['phone']);
  }
});

it('`auth.sendCode` 的 message 逐字 = 「请输入正确的手机号」：两条不合并、判定只有一份', async () => {
  … 同一批坏号 → issues[0].message === SEND_CODE_COPY、不含码串 …
  expect(SEND_CODE_COPY).not.toBe(LOGIN_COPY);            // 两条各自独立
  … 同一坏号分别打 login / sendCode，各拿自己那句 …
  const okWire = await h.trpc('auth.sendCode', { phone: uniquePhone() });  // 合法号不在 zod 这一关报格式错
  expect(issuesOf(String(okWire.error?.message ?? '')).map(i => i.message)).not.toContain(SEND_CODE_COPY);
});
```

**关于"逐字等于"的一格诚实说明（不藏）**：zod 失败在 tRPC 面上今天**整体**仍是"issues 序列化串当 message"（改动前后皆然，A-36-4 末已把它登记为 F-10 下一期欠账）。所以 `wire.error.message` 这个**整串**不可能等于人话串；能逐字相等的是**客户端真正渲染的那一格文案**（`apps/web/src/components/login-dialog.tsx:50/:67` 是 `toast.error(err.message)`，它吃的是这一格）。因此断言分两层写：整串层只判"不含任何全大写码串 + 不含 `INVALID_PHONE`"，`issues[0].message` 层判 `toBe(逐字)`。这不是放宽——疫苗（§4-B）证明把 message 换回码串后这两层都会红。

**④ 顺带必须改的一条既有断言（我的名下面内）**
`auth-register.spec.ts:1150` 原为 `expect(trpc.message).toContain('INVALID_PHONE')` —— 它把 A-36-4② 判为 bug 的那次泄漏**钉成了现状**（`PhoneSchema` 是共用的，`auth.register` 也吃到那句 message）。按"码串不得出现在 zod message"改为"不得含全大写码串 + 须含人话串"，**同一用例的"两端形状不对称"那一半原样保留**（`not.toBe(TM_ERRORS.INVALID_PHONE.copy)` 不删）。这条改动是裁决的必然结果，不是我为凑绿放宽：§4-B 的红就是它先响的。

---

## 4. 疫苗（真实跑，红→绿两段）

命令统一：`pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server <文件> -t "<过滤>"`
（简报点名的坑复现过：`pnpm --filter @tm/server test -- <名字>` 不产生过滤，所以全程用 `exec vitest` 那条。）

### 4-A：DEFECT-3 疫苗 = 把 `min` 加回登录面

临时改动（**用完已删**）：`packages/shared/src/contracts/auth.ts`
```diff
-  password: z.string().optional(),
+  password: z.string().min(PASSWORD_MIN).optional(),
```

**红（真实输出，截掉 tRPC 内部栈 8 行，标记处为原样略）**
```
   × A-36-3（DEFECT-3）：登录面不验密码强度 · sqlite > `password` 长度 4 的存量账号经 tRPC `auth.login` 进得到 service、被判 `upgrade_required` 119ms
     → {"error":{"message":"[\n  {\n    \"code\": \"too_small\",\n    \"minimum\": 8,\n    \"type\": \"string\",\n    \"inclusive\": true,\n    \"exact\": false,\n    \"message\": \"String must contain at least 8 character(s)\",\n    \"path\": [\n      \"password\"\n    ]\n  }\n]",
        "code":-32600,"data":{"code":"BAD_REQUEST","httpStatus":400,"stack":"TRPCError: …(原样略：8 行 tRPC inputValidatorMiddleware 栈)…","path":"auth.login"}}}: expected 400 to be 200 // Object.is equality

 FAIL   @tm/server  test/integration/auth-hardening.spec.ts > A-36-3（DEFECT-3）：登录面不验密码强度 · sqlite > `password` 长度 4 的存量账号经 tRPC `auth.login` 进得到 service、被判 `upgrade_required`
AssertionError: {"error":{"message":"[ …too_small / minimum:8 / path:["password"] … ]","code":-32600,"data":{"code":"BAD_REQUEST","httpStatus":400,…,"path":"auth.login"}}}: expected 400 to be 200 // Object.is equality
- Expected
+ Received
- 200
+ 400
 ❯ test/integration/auth-hardening.spec.ts:1067:37
   1067|       expect(wire.status, wire.raw).toBe(200);

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 26 skipped (29)
```
红得正是 DEFECT-3 的病灶：**4 位密码在 `auth.login` 的 zod 层被 `too_small` 拒掉**，根本到不了 service。

**绿（删除临时改动后）**
```
 ✓  @tm/server  test/integration/auth-hardening.spec.ts (29 tests | 26 skipped) 302ms

 Test Files  1 passed (1)
      Tests  3 passed | 26 skipped (29)
```

### 4-B：DEFECT-4 疫苗 = 把 message 换回 `INVALID_PHONE`

临时改动（**用完已删**）：`contracts/auth.ts` 两条常量都改成 `'INVALID_PHONE'`。

**红 1（新用例，2 条全红）**
```
 FAIL   @tm/server  test/integration/auth-hardening.spec.ts > A-36-4（DEFECT-4）：非法手机号的 tRPC 错误面是人话、不是码串 · sqlite > `auth.login` 的 message 逐字 = 「手机号格式不正确」，且不含任何全大写码串
 FAIL   @tm/server  test/integration/auth-hardening.spec.ts > A-36-4（DEFECT-4）…  · sqlite > `auth.sendCode` 的 message 逐字 = 「请输入正确的手机号」：两条不合并、判定只有一份
AssertionError: phone= 不得含码串: expected '[\n  {\n    "validation": "regex",\n …' not to match /[A-Z][A-Z0-9_]{2,}/

- Expected:
/[A-Z][A-Z0-9_]{2,}/
+ Received:
"[
  {
    \"validation\": \"regex\",
    \"code\": \"invalid_string\",
    \"message\": \"INVALID_PHONE\",
    \"path\": [
      \"phone\"
    ]
  }
]"
 ❯ test/integration/auth-hardening.spec.ts:1132:53

 Test Files  1 failed (1)
      Tests  2 failed | 27 skipped (29)
```

**红 2（既有"已知偏差"用例同时响，见 §3-④）**
```
 ❯ test/integration/auth-register.spec.ts:1153:32
   1151|       // 这里改的是"钉住码串泄漏"那一半（原断言 `toContain('INVALID_PHONE')` 把 bug 钉成了现状…
   1153|       expect(trpc.message).not.toMatch(/\b[A-Z][A-Z0-9_]{2,}\b/);
   1154|       expect(trpc.message).toContain('手机号格式不正确');
 Test Files  1 failed (1)
      Tests  1 failed | 23 skipped (24)
```

**绿（恢复两条人话串之后）**
```
 ✓  @tm/server  test/integration/auth-hardening.spec.ts (29 tests | 26 skipped)
      Tests  3 passed | 26 skipped (29)
```
恢复后复核：`grep -n "INVALID_PHONE" packages/shared/src/contracts/auth.ts` → 只有 21/22 两行注释（说明"码串不再充当 message"），**无 message 位**。

---

## 5. D 项：`trpc-shape` 硬核对（真实输出）

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server trpc-shape
 FAIL   @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面）
Error: appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.logout, auth.register, profile.get, profile.update, review.queue, review.undo
 ❯ test/trpc-shape.spec.ts:390:13

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

**结论（要的那一条）**：`受影响 procedure` 清单里 **`auth.login` 与 `auth.sendCode` 均已不出现**；全文对 `auth.login` 的 2 处 grep 命中都来自那句位置性上下文（`基线:  "path": "auth.login",`，是 +7 新 path 把行号推歪的产物），不是轴级差异。

修复**前**（只改 #3/#4、未还原键序）同一条命令的清单还含 `auth.login`；为了不把"第一处位置差异"误读成轴级差异，我用临时审计件按 **path 对齐、逐 procedure 打差异行** 复核（该件跑完即删，未进 patch、未留在盘上）：

```
[AXIS-AUDIT] 共有 procedure 22 条，差异行 4041：
auth.login @348   现值:         "password": "",   基线:         "code": "",
auth.login @349   现值:         "code": "",       基线:         "password": ""
=== 还原键序之后 ===
[AXIS-AUDIT] 共有 procedure 22 条，差异行 4039：
=== auth.* 差异行（grep -c "^auth\."）：0 ===
=== 每路径差异行数 ===
   3582 profile.get
    457 profile.update
[AXIS-AUDIT] 新增 path：auth.activate, auth.changePassword, auth.forceChangePassword, auth.logout, auth.register, review.queue, review.undo
```

对照 A-36 四-2 的四条：`+7 path` ✅（清单逐字是那 7 条）、`profile.get` 三轴 ✅（3582 行，含 `output` / `outputProbes` / `nMiddlewares 2→3`）、`profile.update` 三键 ✅（457 行）、**`auth.login` 0 键 / `auth.sendCode` 0 键 ✅**。
`profile.*` 那两轴与 `+7 path` **仍然是红** = 计划内、留给出口轮 E3′ 的那一次再生，**我没有去修**。

**未再生基线（硬核对）**：
```
$ sha256sum packages/server/test/trpc-shape.baseline.json
9cc6b3191dc34f5c…          ← 与 A-36 盘面记的 `9cc6b319…` 一致，一字未动
$ ls -la --time-style=+%Y-%m-%dT%H:%M packages/server/test/trpc-shape.baseline.json
2026-09-19T16:28           ← 修改时间早于本轮（本轮 05:0x）
```
全程 **0 次** `TRPC_SHAPE_UPDATE=1`，那唯一一次再生额度仍完整留给 E3′。

---

## 6. 出口命令真实输出（7 条）

### 6-1 `node tools/boundaries.mjs --check-ownership --task T-07 --diff-file <自有 scoped patch>`

```
$ node tools/boundaries.mjs --check-ownership --task T-07 --diff-file <TEMP>/t07fix3/scoped.patch
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 4 个文件的 diff 参与判定
RED  packages/shared/src/contracts/auth.ts 由 T-03 独占（当前任务 T-07）— §10.3

--check-ownership task=T-07 触碰 4 个在册文件（清单 0 项 + patch 4 项） → 1 处越界
OWNERSHIP_EXIT=1
```
**这是红的，且我不动手修**：`tools/ownership.json` 里**还没有** A-36-6 授予我的那一行 `bounded-edit:A-36-3`（登记处 `tools/**` 是我的禁区）。需要的就是这一行（照 `ownership.json:518-524` 的 A-35-1 那条的写法）：
```json
{ "path": "packages/shared/src/contracts/auth.ts", "owner": "T-03", "readers": ["T-07"],
  "reason": "A-36-6：DEFECT-3/4 同因修复一轮做完，owner=T-07 微轮，对 contracts/auth.ts 走 bounded-edit:A-36-3；证据=agent 自证 scoped patch，不收 HEAD diff",
  "handoff": true, "actions": ["bounded-edit:A-36-3"], "maxDiffLinesFor": { "T-07": 49 } }
```
`49` = §1-1 实测的本文件变更行数（+43/-6）。

**对照实验（证明红点确实只在"没登记"，不在我改的内容）**：同一份 patch 换成 T-03 身份判定 →
```
$ node tools/boundaries.mjs --check-ownership --task T-03 --diff-file <同一 patch>
RED  packages/server/src/trpc/routers/auth.ts 由 T-07 独占（当前任务 T-03）— §10.3
RED  packages/server/test/integration/auth-register.spec.ts 由 T-07 独占（当前任务 T-03）— …
RED  packages/server/test/integration/auth-hardening.spec.ts 由 T-07 独占（当前任务 T-03）— …
--check-ownership task=T-03 触碰 4 个在册文件（清单 0 项 + patch 4 项） → 3 处越界
```
即：`contracts/auth.ts` 在 T-03 名下**不红**，其余三个文件在 T-07 名下**不红**（6-1 的那一次只红 1 处）。两条合起来把"谁的行归谁"钉清了。

### 6-2 `pnpm --filter @tm/server typecheck`
```
$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
SERVER_TYPECHECK_EXIT=0
```

### 6-3 `pnpm --filter @tm/server test`（全套）
```
 Test Files  1 failed | 14 passed (15)
      Tests  1 failed | 355 passed (356)
   Duration  16.20s
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/server@2.0.0 test: `vitest run --root ../.. --project @tm/server`
Exit status 1
```
红项清单（**只有 1 条**）：`FAIL @tm/server test/trpc-shape.spec.ts > T-08 判据① …`（计划内，留给 E3′，见 §5）。本轮新增的 3 条用例都在通过的 355 里。

### 6-4 `pnpm --filter @tm/shared test`
```
 FAIL   @tm/shared  test/contracts.spec.ts > 判据①：§3.3.1 四契约 + auth + review-queue 六份文件 > 凭据：入参域与出参新增可选键
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
- false
+ true
 ❯ test/contracts.spec.ts:337:93
   337|     expect(LoginInputSchema.safeParse({ phone: '13800000000', password…

 Test Files  1 failed (1)
      Tests  1 failed | 49 passed (50)
```
**这条红是我的改动造成的、但文件不在我的可写面**（`packages/shared/test/**` = T-03）。它断言的正是 DEFECT-3 的病灶本身：`LoginInputSchema.safeParse({password:'short'})` 必须 `false`。修法只有一行（翻转成 `true` 并补一句"登录面不验强度"），**由 T-03 微轮或 TPM 直接派**，见 §8-①。**我没有为了让它变绿而放宽任何规则**。

### 6-5 `pnpm --filter @tm/shared typecheck`
```
$ pnpm --filter @tm/shared typecheck
$ tsc -p tsconfig.json --noEmit
SHARED_TYPECHECK_EXIT=0
```

### 6-6 `node tools/boundaries.mjs --copy`
```
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 76 处）；需人工复核词命中 126 处（不判红，UI §8.2-9 明示由走查确认）
1/1 条通过，全绿
COPY_EXIT=0
```

### 6-7 `node tools/boundaries.mjs --tokens`
```
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根
OK   tokens-single-source       4 处定义全部在 tokens.css
OK   globals-css-no-brand-hex   0 命中（扫描 apps/web/src；例外豁免 0 处）
2/2 条通过，全绿
```

---

## 7. 盘面数字对账表（A-32-9 口径：简报/裁决数字 vs 实测，逐条归因）

| 上游写的数字 | 出处 | 我实测到的 | 归因 |
|---|---|---|---|
| `@tm/server` 今天 **353** 用例 | A-36 四-3 | **356** | 差 **+3** = 本轮新增的 3 条用例（§2-② 一条 + §3-③ 两条）。其余一条没多、没少 |
| 计划内 **1 红**（trpc-shape） | A-36 四-3 / E3 §3 | **1 红 = trpc-shape** | 与简报一致；且失败明细里 `auth.*` 两个 procedure 已消失（§5）。这 1 红**只在 E3′ 再生后才转绿**，本轮不该转 |
| `auth.login` 两键 / `auth.sendCode` 一键变化 | E3 §4 DEFECT-3/4 | 修后 **0 键 / 0 键** | 轴级实测（§5：`grep -c "^auth\." = 0`） |
| （未点名）`auth.login` 另有 **2 行纯键序**差异 | 本轮 §2-①-b 新取证 | 修后 0 行 | E3 只留了 §2/§3/§4 做记录、临时产物已删，故这条没进它的表；不修就违反 A-36 四-2 的"`auth.*` 必须 0 行"。已按"还原"处理，**未登记例外** |
| `+7 path` | A-36 四-2 | 7 条，逐字为 `auth.activate / auth.changePassword / auth.forceChangePassword / auth.logout / auth.register / review.queue / review.undo` | 计划内，未动 |
| `profile.get` 三轴 / `profile.update` 三键仍红 | A-36 四-2 | 3582 行 / 457 行差异 | 计划内（E3′ 的再生范围），**本轮没碰** |
| 基线 sha `9cc6b319…` 一字未动、再生额度保留 | A-36 盘面 | `9cc6b3191dc34f5c…`、mtime 2026-09-19T16:28 | 一致；`TRPC_SHAPE_UPDATE` 跑了 **0 次** |
| `@tm/shared` 用例数（未给数字） | — | **50**（49 绿 + 1 红） | 用例数未变（我没往 shared 加用例）；那 1 红是 §6-4 的越界项 |
| `--copy` 例外豁免 **76** 处 / 复核词 **126** 处 | 本轮实测（无上游数字可比） | 76 / 126 | 与上游无冲突；我只往 `contracts/auth.ts` 加了 2 个中文串常量，**没有新增例外登记、没有改扫描器** |
| `--self-test` 139/139 | A-36-18（E1c 名下） | **未跑** | 不是本轮出口判据；且 `tools/boundaries.mjs` 此刻有并行 agent 在改（见 §8-③），跑了也不是干净数字 |
| scoped patch 幅度（cap）| A-36-6/#13 | 4 文件 +169/-8 = 177 行，其中 `contracts/auth.ts` **49 行** | `ownership.json` 尚无 A-36-3 条目 ⇒ 门禁无法按幅度判、按"独占"直接红（6-1）。**未走 `predecessorAllowedDiff` 回落通道**，所以没有"绿灯但说不清走了哪条道"的假绿 |

---

## 8. 越界申请与待 TPM 拍板

**① 【必须拍板 / 阻塞 `@tm/shared` 全绿】`packages/shared/test/contracts.spec.ts:337`（T-03 名下，我没动）**
该行的 `expect(LoginInputSchema.safeParse({ phone:'13800000000', password:'short' }).success).toBe(false)` 钉的就是 DEFECT-3 的病灶。裁决 #3 把登录面摘策略定为"回环修"，那这一行的**唯一正确修法就是翻转**。申请由 T-03 下一微轮（或 TPM 直派）改这一处：
```diff
-    expect(LoginInputSchema.safeParse({ phone: '13800000000', password: 'short' }).success).toBe(false);
+    // A-36-3：登录面只验"有没有给"，强度在 service 侧 → 存量短密码必须能过 zod（DEFECT-3 的回归钉子）
+    expect(LoginInputSchema.safeParse({ phone: '13800000000', password: 'short' }).success).toBe(true);
+    // 同一条用例内补一句 R-39② 三面未变短（防有人反过来把建密码面的 ≥8 也摘了）
+    expect(RegisterInputSchema.safeParse({ phone: '13800000000', password: 'short' }).success).toBe(false);
+    expect(ChangePasswordInputSchema.safeParse({ oldPassword: 'abcd1234', newPassword: 'short' }).success).toBe(false);
```
我**没有**替 T-03 改，`@tm/shared test` 因此报 1 红（§6-4）。E3′ 的开工前置（`@tm/server` 全套复跑）不受影响，但"三套 typecheck/test 全绿"的口径要先解决这条。

**② 【必须拍板 / 阻塞 `--check-ownership` 转绿】`tools/ownership.json` 缺 `bounded-edit:A-36-3` 那一行**
条目文本见 §6-1（`maxDiffLinesFor: { "T-07": 49 }` = 我的实测幅度）。登记处 `tools/**` 是我的禁区，故红着交回来。请派 E1/E1c 或 T-03（该文件名义 owner）加这一行；加完复跑 `--check-ownership --task T-07 --diff-file <我的 patch>` 即可转绿，**代码零改动**。
⚠ 提醒 E3′：A-36 四-1 的开工前置写的是"T-07 微轮已合 + `@tm/server` 全套复跑"，这两件本轮都真做到了（§5/§6-3）；但上面 ①② 两条账面红没闭合前，"再生一次"是否放行由 TPM 决定。

**③ 【只注明，不处置】三个并行 agent 的面**
本轮 `@tm/server`（14/15 文件绿）与 `@tm/shared`（除 §8-① 全绿）的实测里，**没有看到** `tools/boundaries.mjs`+E1c 报告、`contracts/wordbook.ts`+`errors.ts`、`services/search-history-service.ts` 三个面引入的红或半截改动被我的运行路径吃到；我对它们一个字没改（`errors.ts` / `contracts/wordbook.ts` 不在我的 patch 里）。若它们稍后落改动，`--copy`（§6-6）与 `--check-ownership`（§6-1）需按各自口径复跑。

**④ 【给架构师 fix3 的一句话，A-36-4 末已派，我只是把它落到代码上】**
`contracts/auth.ts` 文件头第 3 条已从"本文件不放文案"改成"不放**响应码文案**（例外：入参校验的展示串具名常量）"，与实现不再自相矛盾。**技术设计 §4.6 那边的正式打戳仍归架构师 fix3**，代码注释不替代文档。

**⑤ 【给 E3′/QA 的提示（Phase 5 唯一输入）】**
- `auth.login` 的"0 行"包含我额外还原的**键序**那一格：再生时若看到 `auth.login @348/@349` 两行 `password`/`code` 互换，那是有人把 `LoginInputSchema` 的声明顺序改回去了，不是基线漂。
- 端到端只覆盖了 `/trpc/*` 的 HTTP 形状；`createCallerFactory` 直调会剥掉 `data`、且**不跑 errorFormatter**（`auth-register.spec.ts:436-439` 已写明），故没拿它做取证。
- 我没测的：pg 驱动（本机无实例，按 A-18-3 显式 SKIP，CI/T-22 必须真跑）；`auth.sendCode` 合法手机号那一条只断言"不在 zod 关报格式错"，其 `SMS_NOT_CONFIGURED` 业务语义由既有 `legacy-apk.spec.ts` 钉着，本轮没碰。
- F-10（zod 失败在 tRPC 面上是"JSON blob 当 message"）**仍然是原状**，本轮按裁决只做"码串不得充当文案"，没越前去收敛门面。

**⑥ 【交件前的终态自查（真实输出，05:18）】**
```
$ grep -n "password: z.string()\|PHONE_LOGIN_COPY = \|PHONE_SEND_CODE_COPY = \|regex(PHONE_PATTERN" packages/shared/src/contracts/auth.ts
24:const PHONE_LOGIN_COPY = '手机号格式不正确';
26:const PHONE_SEND_CODE_COPY = '请输入正确的手机号';
33:const phoneSchema = (message: string): z.ZodString => z.string().regex(PHONE_PATTERN, message);
64:  password: z.string().optional(),            ← 登录面无 min/max（两处疫苗临时改动均已删除）
$ ls packages/server/test/ | grep -i "tmp\|audit"
(无)                                              ← §5 的临时审计件已删
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server auth-hardening -t "A-36"
 Test Files  1 passed (1)
      Tests  3 passed | 26 skipped (29)
```
临时目录（scoped patch / 改前快照 / 日志）已按简报要求删除；§1-3 与 §6-1 的输出即其真实内容的留档。
