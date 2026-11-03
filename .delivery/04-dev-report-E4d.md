# 04-dev-report-E4d · 三件一轮（shared typecheck 清零 + F-56① + F-58 真号上 App 页脚）

- 轮次：批次4 · **E4d**（实现 agent A-100 通道）
- 开工实测时钟：**2026-09-26 03:21:48**（`date` 实测，我第一次落盘的动作）；收工实测时钟：**2026-09-26 03:51:10**（`date` 实测，出口闸 + 两颗分类器在"当前盘面闸脚本第四版"上逐字复跑、全 exit 0 的那一次；日志 `...\logs\E10-…log`，完整时间线见 §10）
- 简报：`C:\Users\曹怡明\AppData\Local\Temp\e4d\a100-brief-E4d.md`（本报告的每条判据都按它逐字对账）
- scratch：`C:\Users\曹怡明\AppData\Local\Temp\e4d\a100-work\`（所有日志在 `...\a100-work\logs\`，scoped patch 在 `...\a100-work\e4d.patch`）
- 改动面：**仅简报 §1 的六颗通道文件**，未碰任何其它文件（自证见 §8）

三件全部落地、全部实测绿、出口闸 exit 0。下面逐件对账。

---

## 0. 盘面复核（简报的 file:line 原文与盘面一致）

开工前逐字复核简报抄文，**全部与盘面一致，无一处不符**：

| 简报位 | 盘面 | 结论 |
|---|---|---|
| §2 A-1 `contracts.spec.ts:1240` | `const hits = (SHARED_SRC[key].match(/with_progress/g) ?? []).length;` | 一致 |
| §2 A-2 `contracts.spec.ts:1253` | `const hits = (copySrc.match(new RegExp(\`['"\`]${label}['"\`]\`), 'g') ?? []).length;` | 一致（`'g'` 确实在 `new RegExp(...)` 右括号外） |
| §2 先例形状 `:202`/`:489`/`:508` | `SHARED_SRC[key]!.includes(...)` / `const src = SHARED_SRC[key]!;` ×2 | 一致（照此写） |
| §3 `packages/agent/tsconfig.json:6` | `"include": ["src", "test", "../shared/src"]`（整文件 7 行） | 一致 |
| §4 `copy.ts:142` | `  footerLine1: '© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1',` | 一致 |
| §4 `.delivery/03-ui-spec.md:1466` | `\| 页脚第 1 行（12px，\`--ink-muted\`） \| \`© 2026 明日记忆 · 赣ICP备2026013161号-1\` \|` | 一致 ⇒ 逐字口径按 `:1466`（未从 `:500` 图示抄文案） |
| §4 `me-screen.spec.tsx` 八颗字面量/翻面钉 `:1184`/`:1237`/`:1921`/`:1955`/`:1958`/`:1972`/`:1988`/`:2022` | 逐字一致 | 一致 |
| §4 必留钉 `:1945-1947`/`:1957`/`:1959`(断言本体) | 逐字一致 | 已原样保留（见 §1.3 patch 里它们是 context 行） |
| §4 `MeScreen.tsx:761/:762`、`:457`/`:463` | `<p>{BRAND.footerLine1}</p>` / `<p className="mt-1">{BRAND.footerLine2}</p>` / `const showSettingsSections = !signedIn \|\| showGoal;` / `const showFooter = showSettingsSections \|\| fetchFailed;` | 一字未动（复证见 §5.3） |
| §4 `footer-note.tsx:5-6` | 注释两行原文 | 一致；`:13` `ICP_NUMBER` / `:14` `ICP_HREF` / `:21` 外链一字未动 |

六颗文件的开工 sha256 也与简报 §1 表（`a100-channel-pre.txt`）**逐颗一致**（我在 03:21:48 落的复核：`3bae7ee9…`/`39efe0aa…`/`cc309ea3…`/`cd7d6c2b…`/`53f9bd7e…`/`35b7e95f…`，见 §7 表）。

---

## 1. 三件改前/改后原文对照（scoped patch 全文）

patch 生成方式（⛔ `git diff`）：对 `C:\Users\曹怡明\AppData\Local\Temp\e4d\pre-A100\` 的开工前备份逐颗 `diff -u --label a/<仓库相对路径> --label b/<相对路径>`，六段合订为
`C:\Users\曹怡明\AppData\Local\Temp\e4d\a100-work\e4d.patch`（21014 B / 258 行）。

每颗文件的 +/− 行合计 vs 额度：

| 文件 | +/− 合计 | 额度 | 余 |
|---|---|---|---|
| `packages/shared/test/contracts.spec.ts` | 4（+2/−2） | 8 | 4 |
| `packages/agent/tsconfig.json` | 2（+1/−1） | 2 | 0 |
| `packages/shared/src/constants/copy.ts` | 2（+1/−1） | 6 | 4 |
| `apps/app/src/screens/MeScreen.tsx` | 24（+12/−12） | 32 | 8 |
| `apps/app/test/me-screen.spec.tsx` | 38（+19/−19） | 52 | 14 |
| `apps/web/src/components/home/footer-note.tsx` | 4（+2/−2） | 6 | 2 |

patch 全文：

```diff
--- a/packages/shared/test/contracts.spec.ts
+++ b/packages/shared/test/contracts.spec.ts
@@ -1237,7 +1237,7 @@
   it('常量在位且全 shared 产出面该字面量恰出现一次', () => {
     expect([WORDBOOK_PROGRESS_QUERY, WORDBOOK_PROGRESS_QUERY_ON]).toEqual(['with_progress', '1']);
     for (const key of MY_OUTPUT_KEYS) {
-      const hits = (SHARED_SRC[key].match(/with_progress/g) ?? []).length;
+      const hits = (SHARED_SRC[key]!.match(/with_progress/g) ?? []).length;
       expect(hits, `${key} 提到 with_progress ${hits} 次`).toBe(key === '../src/contracts/wordbook.ts' ? 1 : 0);
     }
   });
@@ -1250,7 +1250,7 @@
     expect([SETTINGS_COPY.rows.appearance, SETTINGS_COPY.rows.about]).toEqual(['外观', '关于']);
     const copySrc = SHARED_SRC['../src/constants/copy.ts']!;
     for (const label of ['外观', '关于']) {
-      const hits = (copySrc.match(new RegExp(`['"\`]${label}['"\`]`), 'g') ?? []).length;
+      const hits = (copySrc.match(new RegExp(`['"\`]${label}['"\`]`, 'g')) ?? []).length;
       expect(hits, `copy.ts 里 ${label} 的字面量声明处 ${hits} 份（第二份就可分叉）`).toBe(1);
     }
   });
--- a/packages/shared/src/constants/copy.ts
+++ b/packages/shared/src/constants/copy.ts
@@ -139,7 +139,7 @@
   domain: 'tmword.xyz',
   /** 首页 slogan（`<h1>`，22px/700）。 */
   slogan: '记不住的，交给明天',
-  footerLine1: '© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1',
+  footerLine1: '© 2026 明日记忆 · 赣ICP备2026013161号-1',
   footerLine2: '明天再记，也不算晚。',
 } as const;
 
--- a/apps/app/src/screens/MeScreen.tsx
+++ b/apps/app/src/screens/MeScreen.tsx
@@ -127,16 +127,16 @@
  *       `showGoal`，**不再**与 F/H 两区同门——F/H 的访客可见性自 T-19g-iv 起按 §3.8.5 `:998` 拆门（见文末"未登录"段）。
  *
  *  6. **H 区页脚（§3.8.1:959 + §3.1 口径 `:466`，T-19g-iii）**
- *     - 两串逐字 = `BRAND.footerLine1`（`© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1`）与
+ *     - 两串逐字 = `BRAND.footerLine1`（`© 2026 明日记忆 · 赣ICP备2026013161号-1`）与
  *       `BRAND.footerLine2`（`明天再记，也不算晚。`），顺序照 `:959` 那串的书写顺序（备案号在前、态度话在后）。
  *     - §3.1 的 App 侧口径是"页脚收进「我的」底部（App 首页不放页脚）"⇒ **本区就是 App 侧唯一落点**；
  *       `packages/ui` 里没有现成的 `FooterNote` 组件（全仓唯一实现是 Web 的
  *       `apps/web/src/components/home/footer-note.tsx`），本轮在屏内用两行 `text-xs` 落地，
  *       "组件未上收为 ui pattern"这一句复述进交付报告。
- *     - ⚠ 备案号是**占位串**：`F-32`（PM + 发布前法务项）已记账，屏内不许把它改写成任何"看起来像真号"的东西、
- *       也不许抄 §3.1 图示里的 `蜀ICP备XXXXXX号`（那份与 shared 不一致，两处都是占位）。
- *       Web 侧 `footer-note.tsx:5-6` 走的是另一条口径（"合规字段不许回退成模板"，它用线上真号 + 工信部外链），
- *       与本轮 App 侧裁定相反 ⇒ 分叉一并登记，屏内 0 备案号自造、0 外链。
+ *     - 备案号是**真号** `赣ICP备2026013161号-1`（主办单位：曹怡明，个人主体）：用户本人 2026-09-26 提供，A-98 #415 ⇒ `F-32` 闭；
+ *       屏内仍 0 备案号自造、0 外链（历史成因保留：不许抄 §3.1 图示那份与 shared 不同源的过期串，现在也不许抄）。
+ *       Web 侧 `footer-note.tsx:5-6` 走的是另一条口径（"合规字段不许回退成模板"，它渲染裸备案号 + 工信部外链），
+ *       与 App 侧"两行裸文本、0 外链"并存 ⇒ 次序与外链两面差继续挂着（D5 / #421② 未裁），本轮不动。
  *     - R-25①：本页不出现任何"数据/同步/缓存"式运维信息，唯一例外仍是 D 区下方那颗人话
  *       `已同步 · 20:31`（`SyncBadge`）；禁词 `云端`/`本地`/`已连接`/`未连接` 屏内 0 处（I-04 全树扫）。
  *
@@ -153,13 +153,13 @@
  * 收起后 F「外观」「关于」与 H 页脚照常可见可点。
  * 访客态的可见面：顶栏标题 + B 区引导条（未收起时）+ F 区「外观」「关于」两行 + H 区页脚两串。
  * `:998` 只点名访客隐藏 F 中「我的查询历史」「修改密码」两行 ⇒ 本屏有源三行里访客只藏「修改密码」一行；
- * 页脚对访客常驻 = TPM 裁定（企业法定公示、与登录态无关），非 §3.8.5 推导。G 区访客仍不画（F-34 待裁）。
+ * 页脚对访客常驻 = TPM 裁定（备案号是个人主办单位的法定公示、与登录态无关），非 §3.8.5 推导。G 区访客仍不画（F-34 待裁）。
  * 「已登录但档案拉取失败」（`:1001`）自 T-19g-v 起整页降级为一个错误卡：
  * `SETTINGS_COPY.fetchFail.{title,body,retry,signOut}` 四槽 + `@tm/ui` `EmptyState` 装配（形状照
  * `StudyScreen.tsx:630-648` 先例，串一律 `SETTINGS_COPY.*`、**不借 `STUDY_COPY.fetchFail`**）；
  * 主按钮 = `void profile.refetch()`，次按钮「退出登录」复用 G 区既有 `ConfirmSheet` 链（不新增第二套
  * 确认层）。在途（`isPending`）不出这张卡（loading 支不在本轮）；该支不画 C/D/E/F/G，但 **H 页脚照画**
- * （F-36 已裁 = A-86 #320 选项 6A：备案号是企业法定公示、穿透 `:1001` 整页降级支；门已拆成 `:457` 的
+ * （F-36 已裁 = A-86 #320 选项 6A：备案号是个人主办单位的法定公示、穿透 `:1001` 整页降级支；门已拆成 `:457` 的
  * `showSettingsSections` 与 `:463` 的 `showFooter` 两颗，E4b6 落地）。首屏骨架（`:1000` 第三行）不在本轮。
  *
  * Chrome84 红线（§5.1 / `tm-app:dist-guard`）：本文件不用 `structuredClone` / `Object.hasOwn` /
@@ -448,7 +448,7 @@
    *   故访客态实际只隐藏「修改密码」单行，「外观」「关于」两行与 H 区页脚必须看得见。
    * - 已登录但档案没到手（在途 / 拉取失败）⇒ 本门为假（F 区不渲染）：跟 `:1001` 的整页降级口径；
    *   拉取失败支的 H 页脚改由 `:463` 单独放行（F-36 已裁 6A，A-86 #320），在途支仍不画页脚（M-06 钉着）。
-   * ⚠ 页脚对访客常驻 = **TPM 裁定**（备案号是企业法定公示、与登录态无关），**非 §3.8.5 推导**；
+   * ⚠ 页脚对访客常驻 = **TPM 裁定**（备案号是个人主办单位的法定公示、与登录态无关），**非 §3.8.5 推导**；
    *   上一版注释里"门把静态的「关于」与页脚挡在登录后面是规范没逐字写的判断、登记待裁"那一缺陷已由本门拆掉。
    * ⚠ 简报口径"页脚无条件渲染"与"拉取失败支 F-03/L-03 既有整表空钉不翻转"的不可兼得已由 A-86 #320
    *   选项 6A 裁定（F-36 闭）：备案号穿透 `:1001` 降级支 ⇒ 页脚另立 `:463` `showFooter`，与登录门分离。
@@ -457,7 +457,7 @@
   const showSettingsSections = !signedIn || showGoal;
 
   /**
-   * H 区页脚的门（用户 2026-09-22/23 裁 6A，A-86 #320）：备案号是企业法定公示、与数据态无关 ⇒
+   * H 区页脚的门（用户 2026-09-22/23 裁 6A，A-86 #320）：备案号是个人主办单位的法定公示、与数据态无关 ⇒
    * `:1002` 整页降级支**保留页脚**（F-03/L-03 于本轮翻面）；在途支仍不画（6A 没裁 loading 面，M-06 钉着）。
    */
   const showFooter = showSettingsSections || fetchFailed;
@@ -484,7 +484,7 @@
 
       {fetchFailed ? (
         /* §3.8.5:1001「整页降级为一个错误卡」：本支不画 C/D/E/F/G（各门天然全假），但 H 页脚照画 ——
-         * F-36 已由 A-86 #320 裁定选项 6A（备案号是企业法定公示、穿透整页降级支），放行点 = `:463` `showFooter`。
+         * F-36 已由 A-86 #320 裁定选项 6A（备案号是个人主办单位的法定公示、穿透整页降级支），放行点 = `:463` `showFooter`。
            装配照 StudyScreen.tsx:630-648 的 EmptyState 先例；四槽一律 SETTINGS_COPY.fetchFail.*，
            不借 STUDY_COPY.fetchFail（主语不同：账号信息 vs 学习情况，copy.ts:585-586 已裁定两键不合并）。
            次按钮「退出登录」在本支必现（:1001"仅在已登录态出现"，本支门就是 signedIn）；
@@ -754,8 +754,8 @@
 
       {showFooter ? (
         /* H 区（§3.8.1:959 + §3.1 的 App 侧口径"页脚收进「我的」底部"）：两串逐字来自 shared BRAND，
-           备案号是占位串（F-32 已记发布前法务项），屏内不许改写成"看起来像真号"的东西、也不加外链。
-           访客常驻 = TPM 裁定（备案号是企业法定公示、与登录态无关），**非 §3.8.5 推导**；
+           备案号是真号 `赣ICP备2026013161号-1`（用户本人 2026-09-26 给，A-98 #415，F-32 已闭），屏内 0 自造号、也不加外链。
+           访客常驻 = TPM 裁定（备案号是个人主办单位的法定公示、与登录态无关），**非 §3.8.5 推导**；
            「已登录但档案没到手」的 :1002 整页降级支也画 = 用户 2026-09-22/23 裁 6A（A-86 #320，F-36 已裁）。 */
         <footer className="mt-2 text-center text-xs leading-relaxed text-ink-muted">
           <p>{BRAND.footerLine1}</p>
--- a/apps/app/test/me-screen.spec.tsx
+++ b/apps/app/test/me-screen.spec.tsx
@@ -31,7 +31,7 @@
  *    四槽逐字 + 必过 `ConfirmSheet` 二次确认 + 清凭据只经 `auth-store.signOut()` + 落点是登录页 +
  *    未登录那颗不存在）；
  *  - L 组（T-19g-iii）：H 区页脚（§3.8.1:959 两串逐字 = `BRAND.footerLine1/2`、`text-xs leading-relaxed`、
- *    占位备案号不许被改写成"看起来像真号"、禁词 0 命中）。
+ *    备案号是真号（用户本人 2026-09-26 给，A-98 #415，F-32 闭）、屏 0 自造号、禁词 0 命中）。
  *
  * T-19g-iii 的**判据翻面账**（照 A-06 既有先例，改钉必须留痕）：
  *  - A-05 的"屏自写 `<button>` 三颗" → **五颗**（F 区行件 1 + G 区触发钮 1，源码各只写一次）；
@@ -83,7 +83,7 @@
  *    跟着换源的三颗钉（本文件 A-07 正向清单两颗、J-01 两颗串源，`about-screen.spec.tsx` 的 B-01 期望源）
  *    **期望值一个字没放宽**，用例条数不变；
  *  - **件2（6A，改判轮 ⇒ 翻了 F-03 与 L-03 两颗）**：`已登录但档案拉不到` 的 `:1002` 整页降级支
- *    **保留 H 区页脚（含备案号）** —— 备案号是企业法定公示、与数据态无关，`:1002` 那句"整页降级为一个
+ *    **保留 H 区页脚（含备案号）** —— 备案号是个人主办单位的法定公示、与数据态无关，`:1002` 那句"整页降级为一个
  *    错误卡"管的是**内容区**（用户 2026-09-22/23 裁定 ⇒ F-36 结清）。翻面形状：F-03 的整表钉尾部补两串
  *    页脚字面量（备案号在前，照访客半支）+ 它那颗 `footer` 0 → 恰 1 颗；L-03 拉取失败半支同翻为
  *    恰 1 颗 + 两串逐字。**范围收窄**：`:694` 那颗 `showSettingsSections` 门没动（降级支 F 区三行仍
@@ -1181,7 +1181,7 @@
   '跟随系统', // :957 外观行右值：缺省档人话
   '关于', // :957 行标题逐字（访客可见）
   '›', // 「关于」行 chevron
-  '© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1', // :959 页脚第一串（F-32 占位号，不许改写）
+  '© 2026 明日记忆 · 赣ICP备2026013161号-1', // :959 页脚第一串（真号，用户本人 2026-09-26 给，F-32 已闭）
   '明天再记，也不算晚。', // :959 页脚第二串
 ];
 
@@ -1218,7 +1218,7 @@
      * 与当年撤 `statCards` 禁借同一先例），":1001 整页降级"就是本支的形状 ⇒ 空表钉翻为错误卡整表钉。
      * 期望值照 A-74 #231 写 §3.8.5 `:1001` 文案列的**原文字面量**，不从 shared 反推。
      * ── 判据翻面账（E4b6 件2：用户 2026-09-22/23 裁 6A，A-86 #320，F-36 已裁）────────
-     * 本支的 H 页脚由"不画"翻为"**保留**"：备案号是企业法定公示、与数据态无关，而 `:1001`
+     * 本支的 H 页脚由"不画"翻为"**保留**"：备案号是个人主办单位的法定公示、与数据态无关，而 `:1001`
      * "整页降级为一个错误卡"管的是**内容区** ⇒ 下面的整表钉尾部补两串页脚字面量（备案号在前，
      * 照 L-03 访客半支的既有形状，仍不从 shared 反推），`footer` 那颗从 0 翻为恰 1 颗。
      * C/D/E/F/G 与 `sync-badge` 的反查 0 命中**一颗没撤**（页脚不是同步行）；在途支仍不画页脚（M-06）。 */
@@ -1234,7 +1234,7 @@
       '检查网络后再试一次，你的数据没有改动。',
       '再试一次',
       '退出登录', // :1001"次按钮仅在已登录态出现"—— 本支门就是已登录，必现
-      '© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1', // :959 页脚第一串（6A 起降级支也画；字面量，不反推 shared）
+      '© 2026 明日记忆 · 赣ICP备2026013161号-1', // :959 页脚第一串（6A 起降级支也画；真号字面量，不反推 shared）
       '明天再记，也不算晚。', // :959 页脚第二串
     ]);
     // 四串各恰取 shared 的一个槽（串不许在屏内漂成第二份）
@@ -1915,10 +1915,10 @@
 
 /* ═════════════════ L 组 · H 区页脚（T-19g-iii） ═════════════════ */
 
-describe('L 组 · H 区页脚（§3.8.1:959 两串逐字 + §3.1 的 App 侧口径"页脚收进「我的」底部"；F-32 占位号不许改写）', () => {
+describe('L 组 · H 区页脚（§3.8.1:959 两串逐字 + §3.1 的 App 侧口径"页脚收进「我的」底部"；F-32 已闭：备案号是真号）', () => {
   it('L-01 两串逐字 = BRAND.footerLine1 / footerLine2，备案号在前、态度话在后，几何 text-xs leading-relaxed text-ink-muted', async () => {
-    // 期望值 = `:959` + shared `BRAND` 那两格的原文照抄（占位号一字不动，见 L-02）
-    expect(BRAND.footerLine1).toBe('© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1');
+    // 期望值 = `:959` + shared `BRAND` 那两格的原文照抄（真号逐字，用户本人 2026-09-26 给，见 L-02）
+    expect(BRAND.footerLine1).toBe('© 2026 明日记忆 · 赣ICP备2026013161号-1');
     expect(BRAND.footerLine2).toBe('明天再记，也不算晚。');
     seedNormalSession();
     mountScreen();
@@ -1939,9 +1939,9 @@
     expect(signOutWrap.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
   });
 
-  it('L-02 占位备案号不许被改写：屏 0 自造号、0 外链，上屏那颗逐字等于 shared（含 XXXXXX 占位段），也不抄 §3.1 图示那份', async () => {
+  it('L-02 备案号不许被自造或替换：屏 0 自造号、0 外链，上屏那颗逐字等于 shared（真号、0 占位段残留），也不抄 §3.1 图示那份', async () => {
     const code = screenCode();
-    // 屏不许出现任何"看起来像真号"的东西：备案号字样、6 位以上连续数字（占位段是 X 不是数字）都不许有
+    // 屏代码（剥掉注释后）不许出现任何备案号形状：备案号字样、6 位以上连续数字（真号只住在注释与 shared 里）都不许有
     expect(code, '屏自造了备案号').not.toMatch(/ICP|备案/);
     expect(code, '屏出现 6 位以上连续数字（疑似真号）').not.toMatch(/[0-9]{6,}/);
     expect(code, '屏不许给备案号开外链').not.toMatch(/beian|miit\.gov\.cn|<a /);
@@ -1952,28 +1952,28 @@
     expect(texts).toContain(BRAND.footerLine1);
     expect(texts).toContain(BRAND.footerLine2);
     const joined = texts.join('');
-    expect(joined).toContain('XXXXXX'); // 占位段还在 ⇒ 没被静悄悄换成"看着像真号"的东西
-    // 两处已知的"另一个号"都不许出现：§3.1 图示的 `蜀ICP备XXXXXX号` 与 Web 页脚那颗线上真号
+    expect(joined).not.toContain('XXXXXX'); // 占位段不许残留 ⇒ 屏上就是真号，不是模板
+    // §3.1 图示那份过期串（蜀字头）仍不许上屏；Web 页脚那颗与本串已同引同一真号（口径差只剩前缀与外链）
     expect(joined).not.toMatch(/蜀ICP/);
-    expect(joined).not.toMatch(/赣ICP[0-9]/);
-    expect(all('a[href]')).toHaveLength(0); // 页脚不带外链（F-32 的发布前法务项由 TPM 统一裁定，屏不擅自办）
+    expect(joined).toContain('赣ICP备2026013161号-1'); // 翻正面：上屏文本逐字含真号（用户本人 2026-09-26 给，A-98 #415）
+    expect(all('a[href]')).toHaveLength(0); // 页脚不带外链（App 侧页脚就是两行裸文本；#421② 未裁 ⇒ 屏不擅自加）
   });
 
   it('L-03 降级面与禁词：访客态与拉取失败态页脚都常驻（各恰 1 颗、备案号在前），已登录态全树禁词 0 命中（R-25① / :962；E4b6 件2 翻失败半）', async () => {
     mountScreen();
     await settle();
     /* T-19g-iv 翻转（访客那半）：页脚摘掉**登录门** ⇒ 访客态 `footer` 恰 1 颗、两串逐字在屏上、
-       顺序 = §3.8.1 :959 书写顺序（备案号在前、态度话在后）。页脚常驻是 TPM 裁定（备案号是企业
+       顺序 = §3.8.1 :959 书写顺序（备案号在前、态度话在后）。页脚常驻是 TPM 裁定（备案号是个人主办单位的
        法定公示、与登录态无关），非 §3.8.5 推导；期望值写字面量，不从 shared 反推（A-74 #231）。 */
     const footers = all('footer');
     expect(footers).toHaveLength(1);
     expect(
       Array.from(footers[0]!.querySelectorAll('p')).map((el) => String(el.textContent ?? '').trim()),
-    ).toEqual(['© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1', '明天再记，也不算晚。']);
+    ).toEqual(['© 2026 明日记忆 · 赣ICP备2026013161号-1', '明天再记，也不算晚。']);
     expect(visibleTexts()).toEqual(GUEST_VISIBLE_TEXTS);
     unmount();
     /* 拉取失败那半（E4b6 件2 翻面：用户 2026-09-22/23 裁 6A，A-86 #320，F-36 已裁）：旧钉
-       `toHaveLength(0)` 是裁定前照 `:1001` 逐字"整页降级为一个错误卡"做的口径；备案号是企业法定公示、
+       `toHaveLength(0)` 是裁定前照 `:1001` 逐字"整页降级为一个错误卡"做的口径；备案号是个人主办单位的法定公示、
        与数据态无关 ⇒ 本支**保留页脚**，翻为恰 1 颗 + 两串逐字、备案号在前（形状照上面的访客半支）。
        在途半支仍不画页脚，由 M-06 钉住（6A 只裁了拉取失败这一支，没裁 loading 面）。 */
     seedNormalSession();
@@ -1985,7 +1985,7 @@
     expect(failedFooters).toHaveLength(1);
     expect(
       Array.from(failedFooters[0]!.querySelectorAll('p')).map((el) => String(el.textContent ?? '').trim()),
-    ).toEqual(['© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1', '明天再记，也不算晚。']);
+    ).toEqual(['© 2026 明日记忆 · 赣ICP备2026013161号-1', '明天再记，也不算晚。']);
     unmount();
     getOutcome = success(SERVER_GOAL);
     seedNormalSession();
@@ -2019,7 +2019,7 @@
   '跟随系统',
   '关于',
   '›',
-  '© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1',
+  '© 2026 明日记忆 · 赣ICP备2026013161号-1',
   '明天再记，也不算晚。',
 ];
 
--- a/packages/agent/tsconfig.json
+++ b/packages/agent/tsconfig.json
@@ -3,5 +3,5 @@
   "compilerOptions": {
     "outDir": "dist"
   },
-  "include": ["src", "test", "../shared/src"]
+  "include": ["src", "../shared/src"]
 }
--- a/apps/web/src/components/home/footer-note.tsx
+++ b/apps/web/src/components/home/footer-note.tsx
@@ -2,8 +2,8 @@
  * 首页页脚（UI §3.1.2 F / R-22 ③）：一句产品态度话 + 12px 备案信息。
  *
  * 态度话取自 `@tm/shared` 的 `BRAND.footerLine2`（唯一真源）。
- * 备案号用**线上真实号**（现 `app/(user)/layout.tsx` 页脚那一串），不用 `BRAND.footerLine1`
- * 里的占位串 `冀ICP备2024XXXXXX号-1` —— 合规字段不许回退成模板，见报告「待裁决点 3」。
+ * 备案号与 `BRAND.footerLine1` 现在**同引真号** `赣ICP备2026013161号-1`（用户本人 2026-09-26 给，A-98 #415，F-32 已闭），
+ * 但 Web 页脚只渲染**裸备案号**（不带 `© 2026 明日记忆 · ` 前缀，§3.1.2 的 Web 口径）⇒ 这里仍走本地 `ICP_NUMBER`；合规字段不许回退成模板。
  * 窄屏不吸底：底部留白 = tab 高 + 安全区（§3.1.3 末条 / §2.4）。
  */
 
```

> 上面这段 diff 是从 `C:\Users\曹怡明\AppData\Local\Temp\e4d\a100-work\e4d.patch` **逐字节程序化贴入**（`node` 读文件替换代码块，非手抄）；两份内容以该 patch 文件为唯一真相，出口闸跑的就是它。

---

## 2. 件A 判据逐条对账（shared typecheck 清零 + 永真哨转真哨）

| # | 命令（在 `E:\CC\tomorrow-memory` 根） | exit | 结果 | 日志绝对路径（实测时钟在文件首尾行） |
|---|---|---|---|---|
| A-0 改前基线（我亲跑复核简报） | `pnpm --filter @tm/shared typecheck` | **2** | 恰好两条错：`test/contracts.spec.ts(1240,21) TS2532` / `(1253,71) TS2554`，全 shared 只有这两条 | `...\e4d\a100-work\logs\A0-pre-shared-typecheck.log`（START 03:22:14 / END 03:22:16）；TPM 同口径基线 `...\e4d\a100-pre-shared-typecheck.log` |
| A-3① 改后 | `pnpm --filter @tm/shared typecheck` | **0** | `tsc -p tsconfig.json --noEmit` 无输出 | `...\logs\A1-post-shared-typecheck.log`（START 03:23:00 / END 03:23:03） |
| A-3② 改后单测 | `pnpm --filter @tm/shared test` | **0** | `Test Files 1 passed (1)` / `Tests 68 passed (68)` —— **68 不减、0 新增红** | `...\logs\A2-post-shared-test.log`（START 03:23:09 / END 03:23:16）；基线 `...\e4c3-iii\e4c3-2-pkg-shared-test.log`（1 file / 68 tests，02:13:06） |
| A-3③ 修好的哨仍绿 | 同上 + 独立计数复算 | **0** | `:1250` 那颗（`['外观','关于']`）与 `:1254 toBe(1)` 在 global 正则下仍绿；我用同一条 global 正则脱离 vitest 复算 copy.ts ⇒ `外观 => 1 份`、`关于 => 1 份` | `...\logs\E4-icp-scan-and-pins.log`（末段「件A 判据3」，03:38:14→03:38:15）；简报 03:02:58 实测的声明处 `copy.ts:526`/`:527` 与盘面一致 |
| A-3④ 必红反证 | 见 §3 三段 | 红→**1** | 探针在位时 `外观 … 2 份` 红 | 见 §3 |
| A-3⑤ `pnpm -r typecheck` | 件A 落地后跑（shared 修好 ⇒ 另外 5 颗第一次真跑） | **0** | 6 of 7 全 `Done`：shared / ui / agent / app / server / web，**没有冒出任何新的类型错**（简报"冒出就停手"那条没触发） | `...\logs\A5-root-typecheck-postA.log`（START 03:24:27 / END 03:24:43）；改前根口径基线 `...\e4c3-iii\e4c3-2-root-typecheck.log`（shared Failed、其余从未跑） |

要点：
- `:1240` 用 `SHARED_SRC[key]!`（照 `:202`/`:489`/`:508` 先例形状），**没用 `?.`**（不放水）。
- `:1253` 把 `'g'` 移进 `new RegExp(...)` 的构造函数 ⇒ 那颗"抄出第二份就红"的哨从本轮起是**真哨**（此前 `match()` 非 global 退化，返回值长度恒 1，`:1254 toBe(1)` 永真）。

---

## 3. 件A 的探针反证三段（规矩 #10）

| 段 | 内容 | 证据 |
|---|---|---|
| ① 种前 sha | `packages/shared/src/constants/copy.ts` = `39efe0aa2a2f6928b1c564a435f6cd9d9c1a1d1a8f1e2ebbd4fdaf9598612b73`（47421 B / mtime 2026-09-23 02:24:46）——与简报 §1 通道表逐字一致；我在 03:21:48 复核过 | `...\e4d\a100-channel-pre.txt` + 我 03:21 的复核输出 |
| ② 种探针跑红 | 在 `copy.ts` **文件末尾**加一行 `export const __E4D_PROBE = '外观';`（`diff` 复核：相对备份恰好 **+1 行、0 删除**，见 `...\a100-work\probe-diff.txt`）。此刻 sha=`6a019989c5e27101c7839b6e6216bc5a4bf48d5761111e99ec0093eb21440755`。跑 `pnpm --filter @tm/shared test` ⇒ **EXIT=1**，红的是那颗哨本体：<br>`AssertionError: copy.ts 里 外观 的字面量声明处 2 份（第二份就可分叉）: expected 2 to be 1`<br>位置 `❯ test/contracts.spec.ts:1254:69`，`Tests 1 failed | 67 passed (68)` | `...\logs\A3-probe-shared-test-RED.log`（START 03:23:49，日志第 2 行就地记了探针在位时的 sha） |
| ③ 删除并证复原 | **原样删掉那一行** ⇒ sha 回到 `39efe0aa2a2f6928b1c564a435f6cd9d9c1a1d1a8f1e2ebbd4fdaf9598612b73`，`diff -u` 对备份**空输出**（DIFF_EXIT=0）、`wc -c` 47421 B 一字不差，重跑 `@tm/shared test` ⇒ `68 passed`/EXIT=0 | `...\logs\A4-postprobe-shared-test.log`（START 03:24:19 / END 03:24:22，第 2 行记复原 sha） |

探针与 件C 的先后：**探针在件C 之前**（03:23:49 跑红、03:24:19 复原并核 sha），件C 的 `copy.ts:142` 落地在 03:26:43。
所以 §2/§3 里"复原"比的是**开工前 sha（`39efe0aa…`）**，不是件C 落地后的 sha；件C 落地后 `copy.ts` 现盘 sha 为 `8248bbae2703ac40b1ef6bed7ab96849a7092dd74d8783a55310e3d53024b46a`（见 §7 表）。探针没有留在盘面（§5.1 的 ICP/`XXXXXX` 扫描可反查：`copy.ts` 只剩 `:142` 一颗真号行）。

---

## 4. 件B —— F-56①：`packages/agent/tsconfig.json` 摘掉 `include` 里的 `test`

### 4.1 判据对账

| # | 命令 | exit | 结果 | 日志（实测时钟在首尾行） |
|---|---|---|---|---|
| B-1a 改前 | `pnpm --filter @tm/agent typecheck` | **0** | 仅回显 `$ tsc -p tsconfig.json --noEmit`（无错） | `...\logs\B1-pre-agent-typecheck.log`（03:24:59→03:25:02）；TPM 基线 `...\e4c3-iii\e4c3-2-typecheck-agent.log`（32 B，同形状） |
| B-1b 改后 | `pnpm --filter @tm/agent typecheck` | **0** | 同上，仍 exit 0 | `...\logs\B3-post-agent-typecheck.log`（03:25:36→03:25:39） |
| B-2 单测不误伤 | `pnpm --filter @tm/agent test` | **0** | `Test Files 3 passed (3)` / `Tests 39 passed (39)`（fsrs 11 + assessment 15 + orchestrator-intent 13）——**39 不减**，证明 vitest 不吃 tsconfig 的 `include` | `...\logs\B5-post-agent-test.log`（03:25:55→03:26:05）；基线 `...\e4c3-iii\e4c3-2-pkg-agent-test.log`（3 files / 39 tests） |
| B-3 产物面复算 | `npx tsc -p packages/agent/tsconfig.json --outDir "C:\Users\曹怡明\AppData\Local\Temp\e4d\a100-work\agent-probe-pre"`（改前）与 `... \agent-probe-post`（改后），`--noEmitOnError` 下两次 tsc 都 **EXIT=0** | 0 | **改前 3 颗 `*.spec.js`** / **改后 0 颗**；改后目录仍有 152 个文件、`agent/src/**` 与 `shared/src/**` 正常产出 ⇒ 摘的是 test，不是 src | `...\logs\B2-pre-agent-outdir-probe.log`（03:24:59→03:25:19）+ 清单 `...\logs\B2-pre-spec-list.txt`<br>`...\logs\B4-post-agent-outdir-probe.log`（03:25:39→03:25:42）+ 清单 `...\logs\B4-post-spec-list.txt`（**空文件 = 0 颗**） |
| B-4 根单测合计不减 | `pnpm --filter @tm/shared --filter @tm/agent --filter @tm/app --filter @tm/web --filter @tm/ui test`（简报允许"至少 agent+shared+app 三包对账"，我多跑两颗） | **0** | shared 1 file/68、agent 3/39、ui 3/168、web 1/16、app 18/470 ⇒ **26 files / 761 tests 全绿** | `...\logs\D1-five-package-test-reconcile.log`（START 03:36:08 / END 03:36:35）。⚠ **未跑 `pnpm -r test`**：它会拉起 `@tm/server` 测试面，而本真库三颗（`data.db`/`-shm`/`-wal`）在我的只读冻结面上（跑 server 测试有改 mtime/写 wal 的风险）⇒ 按简报给的"至少三包对账"这条做，缺的 server 一颗登记在 §9 |
| — 未跑真 build | 简报 ⛔ `pnpm --filter @tm/agent build`：**我没跑**。旁证 `packages\agent\dist` 目录 mtime 收工仍是 **2026-09-19 11:20:42**（本轮所有类型/产物复算都靠 `--outDir` 指进 scratch） | — | — | `...\logs\E5-final-freeze-and-dist-recheck.log`（START 03:43:26，含 `stat` + `ls -la packages/agent/dist` 原文） |

产物清单原文（`*.spec.js`）：

```
改前（agent-probe-pre）：
/tmp/e4d/a100-work/agent-probe-pre/agent/test/assessment.spec.js
/tmp/e4d/a100-work/agent-probe-pre/agent/test/fsrs.spec.js
/tmp/e4d/a100-work/agent-probe-pre/agent/test/orchestrator-intent.spec.js      → 3 颗

改后（agent-probe-post）：
（find -name '*.spec.js' 空输出）                                              → 0 颗
```

### 4.2 F-61 已知代价（简报要求在报告里登记的一句话）

**`@tm/agent` 的 3 颗 spec 文件（`test/assessment.spec.ts` + `test/fsrs.spec.ts` + `test/orchestrator-intent.spec.ts`，共 453 行）自本轮起退出 typecheck 覆盖面**（`build`/`typecheck` 共用同一颗 tsconfig ⇒ 摘 `test` 后两者都不再检它们），**由 F-61 跟踪**。本轮按简报禁条未做任何补回动作：⛔ 未新建第二份 tsconfig、⛔ 未改 `packages/agent/package.json` 的 `build`/`typecheck`/`test` 语义、⛔ 未在 `include` 外玩花样（`include` 只有 `["src", "../shared/src"]` 一删一增 = 2 行，恰好在额度内）。它们的运行时面仍有 B-2 的 39 颗测试守着（vitest 走自己的 transform，不吃 `include`）。

### 4.3 一件如实登记的反常（我没有据此改做任何决策）

`packages/agent/tsconfig.json` 是六颗里唯一**被 git 跟踪**的一颗，而它的 **HEAD 与 index 版本已经是目标态** `["src", "../shared/src"]`（即 HEAD 里没有 `test`），只有**开工前工作区那一版**带着 `test`。⇒ 我的这一改让该文件从"工作区相对 HEAD 反向漂移"变回**与 HEAD/index 一致**，所以现在 `git status --porcelain -- packages/agent/tsconfig.json` 是**空**（见 §8 表）。这不影响本轮判据（我改的就是简报 §3 指定的 `:6` 那一行，产物/类型/单测三条证据都是实测），但这颗文件"改前 ≠ HEAD、改后 == HEAD"的形状我不动 judgement，原样报给 TPM 复核。

---

## 5. 件C —— F-58 真号上「我的」页脚

**真号口径唯一来源**：`.delivery/03-ui-spec.md:1466`（§6.4 定稿文案总表）⇒ `© 2026 明日记忆 · 赣ICP备2026013161号-1`。`footerLine2`、`slogan` 一字未动；⛔ 未从 `:500` ASCII 图示抄文案（图示只管备案号这一维，`:506` 交底 bullet 已读）。

### 5.1 落稿顺序（简报 §4 判据4 要求的那份中间态红日志）

顺序**照简报做**：C-1（只落 `copy.ts:142`）→ **跑 `@tm/app test` 留红档** → 再落 C-3 翻面 → 全绿。

| 步 | 时钟 | 盘面 | 结果 | 日志 |
|---|---|---|---|---|
| ① 只落 C-1 | 03:26:43（`copy.ts` mtime） | 测试侧仍是旧占位号字面量 | `pnpm --filter @tm/app test` ⇒ **EXIT=1**，`Test Files 1 failed \| 17 passed (18)`、`Tests 9 failed \| 461 passed (470)` | `...\logs\C1-app-test-RED-literal-nails.log`（START 03:26:54 / END 03:27:45，日志第 2/3 行就地记了当时 `copy.ts`（`8248bbae…` = 已落 C-1）与 `me-screen.spec.tsx`（`cd7d6c2b…` = 开工前 sha，证明"只动了 shared 那一行"）） |
| ② 再落 C-2/C-3/C-4 | 03:32–03:35 | 八颗翻完 | `pnpm --filter @tm/app test` ⇒ **EXIT=0**，`Test Files 18 passed (18)` / `Tests 470 passed (470)` | `...\logs\C2-app-test-GREEN.log`（START 03:35:26 / END 03:35:47） |

红档里六颗字面量钉的落点（**逐颗对账**，`❯` 行是断言位，不是常量声明行）：

```
me-screen.spec.tsx:1197  F-01  ← :1184 GUEST_VISIBLE_TEXTS 里的旧号字面量
me-screen.spec.tsx:1231  F-03  ← :1237 降级支整表钉里的旧号字面量
me-screen.spec.tsx:1334  G-03  ← :1184（同一颗共用常量）
me-screen.spec.tsx:1481  H-04  ← :1184
me-screen.spec.tsx:1921  L-01  ← :1921 自身（toBe 旧号）
me-screen.spec.tsx:1955  L-02  ← :1955 toContain('XXXXXX')
me-screen.spec.tsx:1972  L-03  ← :1972 toEqual([旧号, 态度话])
me-screen.spec.tsx:2037  M-01  ← :1184
me-screen.spec.tsx:2068  M-02  ← :2022 GUEST_BASE_VISIBLE_TEXTS 里的旧号字面量
```

**如实登记两处"没被独立观测到"**（不是漏做，是断言短路）：
- `:1988`（拉取失败半支的同形状 `toEqual`）住在 L-03 里 `:1972` **之后** ⇒ L-03 在 `:1972` 就 fail 退出，`:1988` 那一条在同一轮没被独立打印。它是 `:1972` 的同形状复制（本次 patch 里两颗都翻了，见 §1 的两个 `).toEqual([...])` hunk）。
- `:1958`（`not.toMatch(/赣ICP[0-9]/)`）住在 `:1955` **之后** ⇒ 同一条用例在 `:1955` 先红，`:1958` 的"旧反向哨遇真号必红"没被独立打印。它现在已翻成正面钉 `toContain('赣ICP备2026013161号-1')`，且正面绿在 §5.2。
⇒ 简报要求的"六颗字面量钉全红"里，**字面量五颗（:1184/:1237/:1921/:1972/:2022）在红档里各有独立断言位**（`:1988` 与 `:1955/:1958` 因同用例短路未独立显形）；这点我不粉饰，请 TPM 若要"逐颗独立红"的形状就下一轮单开探针轮。

### 5.2 件C 判据对账

| # | 命令 | exit | 结果 | 日志（实测时钟在首尾行） |
|---|---|---|---|---|
| C-1 主判据 | `pnpm --filter @tm/app test` | **0** | `Test Files 18 passed (18)` / `Tests 470 passed (470)` —— 与基线 `...\e4c3-iii\e4c3-2-pkg-app-test.log`（18/470）**逐数对齐、不减** | `...\logs\C2-app-test-GREEN.log`（145-146 行是合计；START/END 记时钟） |
| C-2a shared 不减 | `pnpm --filter @tm/shared --filter @tm/web test` | **0** | `shared: 1 file / 68 passed`、`web: 1 file / 16 passed`（web 基线 `...\e4c3-iii\e4c3-2-pkg-web-test.log` = 16 tests ⇒ footer-note 只改注释、纹丝不动，跑一遍证明） | `...\logs\C3-shared-web-test.log`（START 03:35:54 / END 03:36:00） |
| C-2b 五包合计 | 同 §4.1 B-4 | **0** | 26 files / 761 tests 全绿 | `...\logs\D1-five-package-test-reconcile.log` |
| C-3 真号全仓扫 | 简报原命令 `grep -rn "ICP备" apps packages --include=*.ts --include=*.tsx \| grep -v node_modules \| grep -v dist` | 0 | 输出 13 行，**只剩真号 + 测试字面量**：`copy.ts:142`（真源）、`MeScreen.tsx:130/:136/:757`（全在注释）、`me-screen.spec.tsx:1184/1237/1921/1958/1972/1988/2022`（钉）、`footer-note.tsx:5`（注释）+ `:13 ICP_NUMBER`。**0 处 `XXXXXX` 残留在该扫描面上** | `...\logs\E4-icp-scan-and-pins.log`（03:38:14→03:38:15，全文见下面 §5.4） |
| C-4 正面证据（上屏 == shared） | 见 vitest `L-01`（`expect(lines).toEqual([BRAND.footerLine1, BRAND.footerLine2])`，`:1933`，一颗没动） | **0** | 该用例绿 ⇒ 屏上两串**逐字等于**变号后的 shared 真源。`L-02` 的 `not.toContain('XXXXXX')` 与 `toContain('赣ICP备2026013161号-1')` 也绿 | `...\logs\C2-app-test-GREEN.log` |
| C-5 探针免做 | 简报明令"不许改盘面做探针"⇒ 我用的是**只动 C-1 不动 C-3** 的中间态当红证（§5.1），未临时改渲染行 | — | — | `...\logs\C1-app-test-RED-literal-nails.log` |

**必留钉一颗没松**（patch 里它们是 context 行）：`:1945 not.toMatch(/ICP\|备案/)`、`:1946 not.toMatch(/[0-9]{6,}/)`、`:1947 not.toMatch(/beian\|miit\.gov\.cn\|<a /)`、`:1957 not.toMatch(/蜀ICP/)`、`:1959` 断言本体 `expect(all('a[href]')).toHaveLength(0)`（只改同行注释措辞）、`:789-790` 的 BRAND 引用正向钉、`:1933` 同源钉 —— 全绿，且我没改过它们的逻辑。`test.skip`/`test.fail`/`waitForTimeout` 0 处（A-08 那颗自禁哨本身就扫这颗，仍绿）。

### 5.3 comment-only 分类器实测（收工前跑，两颗都 exit 0）

```
$ node "$TEMP/e4b4/a94-comment-only-check.mjs" "$TEMP/e4d/a100-work/e4d.patch" apps/app/src/screens/MeScreen.tsx 32
TARGET apps/app/src/screens/MeScreen.tsx  段内 +12/-12 合计 24 / 额度 32 OK
GREEN 全部 +/- 行都是注释或空行
EXIT_MeScreen=0

$ node "$TEMP/e4b4/a94-comment-only-check.mjs" "$TEMP/e4d/a100-work/e4d.patch" apps/web/src/components/home/footer-note.tsx 6
TARGET apps/web/src/components/home/footer-note.tsx  段内 +2/-2 合计 4 / 额度 6 OK
GREEN 全部 +/- 行都是注释或空行
EXIT_footer=0
```

日志：`...\logs\E1-comment-only.log`（START 03:37:15 / END 03:37:15）。

渲染面 0 碰的旁证（同 `E4-icp-scan-and-pins.log`）：对备份 diff 出的 12 条 `+` 行全部落在 `*` / JSX `{/* … */}` 跨度内；`sed -n '761,762p'` 与 `sed -n '457p;463p'` 改前/现盘**逐字相同**（`<p>{BRAND.footerLine1}</p>`、`<p className="mt-1">{BRAND.footerLine2}</p>`、`const showSettingsSections = !signedIn || showGoal;`、`const showFooter = showSettingsSections || fetchFailed;`）。App 侧页脚仍是**两行裸文本、0 外链**（未加任何 `<a>`/href）。

### 5.4 全仓真号扫描输出（原样贴）

```
apps/app/src/screens/MeScreen.tsx:130: *     - 两串逐字 = `BRAND.footerLine1`（`© 2026 明日记忆 · 赣ICP备2026013161号-1`）与
apps/app/src/screens/MeScreen.tsx:136: *     - 备案号是**真号** `赣ICP备2026013161号-1`（主办单位：曹怡明，个人主体）：用户本人 2026-09-26 提供，A-98 #415 ⇒ `F-32` 闭；
apps/app/src/screens/MeScreen.tsx:757:            备案号是真号 `赣ICP备2026013161号-1`（用户本人 2026-09-26 给，A-98 #415，F-32 已闭），屏内 0 自造号、也不加外链。
apps/app/test/me-screen.spec.tsx:1184:  '© 2026 明日记忆 · 赣ICP备2026013161号-1', // :959 页脚第一串（真号，用户本人 2026-09-26 给，F-32 已闭）
apps/app/test/me-screen.spec.tsx:1237:      '© 2026 明日记忆 · 赣ICP备2026013161号-1', // :959 页脚第一串（6A 起降级支也画；真号字面量，不反推 shared）
apps/app/test/me-screen.spec.tsx:1921:    expect(BRAND.footerLine1).toBe('© 2026 明日记忆 · 赣ICP备2026013161号-1');
apps/app/test/me-screen.spec.tsx:1958:    expect(joined).toContain('赣ICP备2026013161号-1'); // 翻正面：上屏文本逐字含真号（用户本人 2026-09-26 给，A-98 #415）
apps/app/test/me-screen.spec.tsx:1972:    ).toEqual(['© 2026 明日记忆 · 赣ICP备2026013161号-1', '明天再记，也不算晚。']);
apps/app/test/me-screen.spec.tsx:1988:    ).toEqual(['© 2026 明日记忆 · 赣ICP备2026013161号-1', '明天再记，也不算晚。']);
apps/app/test/me-screen.spec.tsx:2022:  '© 2026 明日记忆 · 赣ICP备2026013161号-1',
apps/web/src/components/home/footer-note.tsx:5: * 备案号与 `BRAND.footerLine1` 现在**同引真号** `赣ICP备2026013161号-1`（用户本人 2026-09-26 给，A-98 #415，F-32 已闭），
apps/web/src/components/home/footer-note.tsx:13:const ICP_NUMBER = '赣ICP备2026013161号-1';
packages/shared/src/constants/copy.ts:142:  footerLine1: '© 2026 明日记忆 · 赣ICP备2026013161号-1',
```

补一条 `XXXXXX` 全仓扫（含测试面）：**只剩 1 处**，就是反占位钉本体 `me-screen.spec.tsx:1955 expect(joined).not.toContain('XXXXXX')`。旧占位号 `冀ICP备2024XXXXXX号-1` 与图示过期串 `蜀ICP备XXXXXX号` 在 `.ts/.tsx` 面上已 **0 命中**。`packages/shared/dist/**` 里的过期串是构建产物，我按简报 ⛔ 未手改（E5 重建 dist 时自然翻新）。

### 5.5 C-3 的 12 行标题/注释：一颗我刻意没动（如实登记）

简报列的 12 颗是 `:33`/`:34`/`:86`/`:1221`/`:1918`/`:1920`/`:1942`/`:1944`/`:1956`/`:1959`(仅注释)/`:1966`/`:1976`。
我改了其中 **11 颗**（patch 可见）。**`:33` 未动**：那颗是 L 组 doc bullet 的前半句（`- L 组（T-19g-iii）：H 区页脚（§3.8.1:959 两串逐字 = BRAND.footerLine1/2、text-xs leading-relaxed、`），**不携带任何"占位号/企业主体"措辞**；占位口径在同一 bullet 的 `:34`（已改）。改 `:33` 只能是重排换行、白白吃额度 ⇒ 按"不改无过期措辞的行"处理，请 TPM 复核这条是否算偏离。

另：`MeScreen.tsx:137` 的"不许抄 §3.1 图示那份"我按 C-2 第 2 条**作为历史成因保留**了句意，但把它携带的**字面串 `蜀ICP备XXXXXX号` 换成了描述式写法（"那份与 shared 不同源的过期串"）** —— 目的是让 C-3 判据3 的"0 处 `XXXXXX` 残留"与 C-2 的"保留此句"能同时成立（原文两者会互斥）。`:1957` 那颗 `not.toMatch(/蜀ICP/)` 的断言本体一字未动 ⇒ 图示串仍然上不了屏。

---

## 6. 出口命令（原样贴，含 exit 0）

```
$ node tools/boundaries.mjs --check-ownership --task E4d \
    --files packages/shared/test/contracts.spec.ts,packages/shared/src/constants/copy.ts,apps/app/src/screens/MeScreen.tsx,apps/app/test/me-screen.spec.tsx,packages/agent/tsconfig.json,apps/web/src/components/home/footer-note.tsx \
    --diff-file "C:\Users\曹怡明\AppData\Local\Temp\e4d\a100-work\e4d.patch"
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 6 个文件的 diff 参与判定
NOTE packages/shared/test/contracts.spec.ts：走动作通道 bounded-edit:A-74-235，实际授权来源 = maxDiffLinesFor["E4d"]（不是通道名里那个旧裁决号）（按实际 diff 判定：+2/-2 行）
NOTE packages/shared/src/constants/copy.ts：走动作通道 bounded-edit:A-74-235，实际授权来源 = maxDiffLinesFor["E4d"]（不是通道名里那个旧裁决号）（按实际 diff 判定：+1/-1 行）
NOTE apps/app/src/screens/MeScreen.tsx：走动作通道 bounded-edit:A-82-E4b2，实际授权来源 = maxDiffLinesFor["E4d"]（不是通道名里那个旧裁决号）（按实际 diff 判定：+12/-12 行）
NOTE apps/app/test/me-screen.spec.tsx：走动作通道 bounded-edit:A-88-E4b6，实际授权来源 = maxDiffLinesFor["E4d"]（不是通道名里那个旧裁决号）（按实际 diff 判定：+19/-19 行）
NOTE packages/agent/tsconfig.json：走动作通道 bounded-edit:A-99-E4d，实际授权来源 = maxDiffLinesFor["E4d"]（不是通道名里那个旧裁决号）（按实际 diff 判定：+1/-1 行）
NOTE apps/web/src/components/home/footer-note.tsx：走动作通道 bounded-edit:A-99-E4d，实际授权来源 = maxDiffLinesFor["E4d"]（不是通道名里那个旧裁决号）（按实际 diff 判定：+2/-2 行）

--check-ownership task=E4d 触碰 6 个在册文件（清单 6 项 + patch 6 项） → 无越界
EXIT=0
```

日志：`...\logs\E2-exit-ownership-gate.log`（START 03:37:22 / END 03:37:22）。额度全在硬顶内（`me-screen.spec.tsx` +19/−19=38 ≤ 52；`MeScreen.tsx` 24 ≤ 32；`tsconfig.json` 2 = 2）。
未做的事：⛔ 不带 `--diff-file` 跑过、⛔ 换过 `--task` 值、⛔ 往 `tools/ownership.json` 加过东西、⛔ 拆成多次 patch。

---

## 7. 冻结面收工复核：**10/11 OK**（唯一红的是别人在收工段改的 `tools/boundaries.mjs`）+ 六颗现盘两证

**第一次收工复核（03:37:32，我所有闸门/测试都跑完之后）⇒ 11/11 全 OK：**

```
$ sha256sum -c "$TEMP/e4d/a100-anchor.pure.txt"
data.db: OK
data.db-shm: OK
data.db-wal: OK
tools/boundaries.mjs: OK
tools/ownership.json: OK
packages/agent/src/deps.ts: OK
packages/agent/test/fsrs.spec.ts: OK
apps/web/playwright.config.ts: OK
package.json: OK
vitest.workspace.ts: OK
packages/shared/src/types.ts: OK
EXIT_SHA=0
```

日志：`...\logs\E3-frozen-sha-and-scope.log`（START 03:37:32）。**真库三颗 `data.db`/`-shm`/`-wal` 到这一步仍与锚逐字一致** ⇒ 本轮对它们 0 写打开、0 DDL/DML、0 checkpoint、0 删 wal、0 mtime 变化。

**但我按"收工前再跑一次"的纪律又复跑了多轮，盘面变了（不是我变的）：**

| 复跑实测时钟 | 结果 | 日志 |
|---|---|---|
| 03:43:26 | **10/11 OK**，唯一 `tools/boundaries.mjs: FAILED`（EXIT=1） | `...\logs\E5-final-freeze-and-dist-recheck.log` |
| 03:43:59 | 同上（仍 10/11，真库三颗 + `ownership.json` 全 OK） | `...\logs\E7-frozen-sha-final-two-runs.log` |
| 03:47:34 | 同上；该日志只留了 `-c` 的**尾部**，末行是 `packages/shared/src/types.ts: OK` + `WARNING: 1 computed checksum did NOT match`。⚠️ 里面那行 `EXIT=0` 是**尾部 `tail` 的退出码**，**不是** `sha256sum -c` 的（后者实为 1，即"1 颗不匹配"）；同段 `stat` 实测 `boundaries.mjs` mtime 已推进到 **03:47:28** | `...\logs\E8-final-closeout-check.log` |
| **03:50:47→03:50:48** | 收工终证：全量 `-c` 输出 + **显式捕获退出码** ⇒ `SHA_EXIT=1`（11 颗里 **10 OK / 1 FAILED**，唯一红仍是 `tools/boundaries.mjs`），六颗现盘 sha 与下表**逐字一致**（0 漂移） | `...\logs\E9-closeout-frozen-sha-with-correct-exit.log` |

现场取证（E5/E7/E6/E8/E9/E10 六份日志同一颗）：`tools/boundaries.mjs` 在我 03:37:32 那次 11/11 之后被外部改过 **四次**，mtime/大小序列实测为：
`03:41:36`（214202 B）→ `03:43:38`（214379 B，sha `35436eacfb6cbaa6…`）→ `03:47:28` → `03:48:55`（现盘 **223388 B**，sha `51570e64c932faed…`），全部 ≠ 锚 `48ee7b46773699a9…`；该文件**未被 git 跟踪**（`?? tools/boundaries.mjs`），所以我无法用 HEAD 侧对照，只能给"它在我 03:37:32 那次 11/11 之后被改过四次"这一条 mtime 序列。
**这颗不在我的可写面上（简报 §0 第 3 条禁写），我一次都没打开过它**（对它只有 `node tools/boundaries.mjs --check-ownership` 的执行动作与 `stat`/`sha256sum` 只读动作）⇒ 判定为**外部角色（TPM 落 A-99/A-100 判据）在收工段并发修改**，如实登记，不自行"修回"（改它会踩我的禁写面）。

关键后果我已经补测：**出口闸与两颗分类器在新版 `boundaries.mjs`（03:43:38 版）上重跑，仍然全绿**——

```
$ node tools/boundaries.mjs --check-ownership --task E4d --files <六颗> --diff-file "$TEMP/e4d/a100-work/e4d.patch"
--check-ownership task=E4d 触碰 6 个在册文件（清单 6 项 + patch 6 项） → 无越界
EXIT=0
$ node "$TEMP/e4b4/a94-comment-only-check.mjs" ... MeScreen.tsx 32        → GREEN, EXIT1=0
$ node "$TEMP/e4b4/a94-comment-only-check.mjs" ... footer-note.tsx 6      → GREEN, EXIT2=0
```

日志：`...\logs\E6-exit-gate-rerun-after-external-boundaries-change.log`（START/END 均 03:43:50，含被检文件的 `stat`+`sha256sum` 现场）。

外部又改了两次（03:47:28 / 03:48:55，现盘 223388 B）之后，我在 **03:51:10** 把出口闸与两颗分类器**逐字再复跑一次**（同一份 `e4d.patch`，未重造；patch 实测 258 行 / 21014 B / mtime 03:37:09）：

```
tools/boundaries.mjs size=223388 mtime=2026-09-26 03:48:55…  sha=51570e64c932faed…  （≠ 锚）
--check-ownership task=E4d 触碰 6 个在册文件（清单 6 项 + patch 6 项） → 无越界     EXIT=0
TARGET apps/app/src/screens/MeScreen.tsx  段内 +12/-12 合计 24 / 额度 32 OK  GREEN   EXIT1=0
TARGET apps/web/src/components/home/footer-note.tsx  段内 +2/-2 合计 4 / 额度 6 OK  GREEN EXIT2=0
```

日志：`...\logs\E10-gate-rerun-on-4th-external-boundaries-change.log`（START/END 均 03:51:10）。
⇒ **§5/§6 的出口判据在"当前盘面（闸脚本第四版）"依然成立**；请 TPM 复核这颗的差异是否就是本轮判据要的新闸，若是，请把锚表 `a100-anchor.pure.txt` 里那颗的 sha 更新掉。

六颗现盘 sha256 / 大小 / mtime（改后两证）：

| 文件 | sha256（前 12） | 大小 | mtime |
|---|---|---|---|
| `packages/shared/test/contracts.spec.ts` | `a85529cb73f2…` | 71503 B | 2026-09-26 03:22:56 |
| `packages/shared/src/constants/copy.ts` | `8248bbae2703…` | 47421 B | 2026-09-26 03:26:43 |
| `apps/app/src/screens/MeScreen.tsx` | `9756f7cc913e…` | 48579 B | 2026-09-26 03:32:18 |
| `apps/app/test/me-screen.spec.tsx` | `ab4e8be34142…` | 121414 B | 2026-09-26 03:35:11 |
| `packages/agent/tsconfig.json` | `e70953dd466a…` | 132 B | 2026-09-26 03:25:24 |
| `apps/web/src/components/home/footer-note.tsx` | `55c8634cc738…` | 1209 B | 2026-09-26 03:32:30 |

（全 sha 在 `...\logs\E3-frozen-sha-and-scope.log` 的「六颗现盘 sha256 + mtime」段；**收工终证 `...\logs\E9-…log`（03:50:47）里同一颗六串逐字节复现** ⇒ 03:37:32 之后我的六颗面上再没有过一次写入。）
注：`contracts.spec.ts` 从 71502 B → 71503 B 是 `:1240` 加了 1 个 `!`；`copy.ts` 47421 B → 47421 B 是 `冀ICP备2024XXXXXX号-1`(20 字符) 与 `赣ICP备2026013161号-1`(20 字符) 等长替换后恰好同大小（sha 变了 ⇒ 内容确实换了，不是"改了个寂寞"）。

---

## 8. 越界自证（只读 git）

`git status --porcelain`（全仓，03:43:26 实测计数）里**认不出我的名字**：工作区满是别的角色的未提交改动（**88 条 ` M`、94 条 `??`**，含 `.delivery/`、`apps/app/`、`packages/shared/test/`、`packages/ui/`、`tools/` 整目录未跟踪），而简报第 4 条也明令 ⛔ 用 `git diff` 自证。所以我用两颗梯子：

1. **scoped patch**（§1）：对 `pre-A100\` 备份做的 6 段 diff ⇒ 归属闸确认"清单 6 项 + patch 6 项、无越界"（§6），且 `PATCH` 行数与我的额度逐颗对齐。这条是自证的**主证**：本轮全部改动只可能来自这六颗。
2. **逐颗定点 `git status --porcelain -- <path>`**（只读，允许）：

| 文件 | 跟踪态 | 定点 status |
|---|---|---|
| `packages/shared/test/contracts.spec.ts` | untracked（`packages/shared/test/` 整目录未跟踪） | `?? packages/shared/test/contracts.spec.ts` |
| `packages/shared/src/constants/copy.ts` | untracked（`packages/shared/src/constants/` 未跟踪） | `?? packages/shared/src/constants/copy.ts` |
| `apps/app/src/screens/MeScreen.tsx` | untracked（`apps/app/` 未跟踪） | `?? apps/app/src/screens/MeScreen.tsx` |
| `apps/app/test/me-screen.spec.tsx` | untracked | `?? apps/app/test/me-screen.spec.tsx` |
| `packages/agent/tsconfig.json` | **tracked** | **空**（改后与 HEAD/index 一致，见 §4.3） |
| `apps/web/src/components/home/footer-note.tsx` | untracked（`apps/web/src/components/home/` 未跟踪） | `?? apps/web/src/components/home/footer-note.tsx` |
| `.delivery/04-dev-report-E4d.md` | untracked（`.delivery/` 整目录未跟踪） | 落在 `?? .delivery/` 内 |

⇒ 我动过的文件集 ⊆ **六颗通道 + 本报告 + scratch**，多出来的 0 颗。
另外两件"我没做"的自证：⛔ 任何 git 写操作（无 `commit`/`push`/`stash`/`checkout`/`restore`/`reset`/`add`，全部 git 调用只有 `status`/`ls-files`/`show`/`check-ignore` 这类只读）；⛔ 未通读 `04-adjudications.md`（563101 B）/`01-prd.md`（365739 B）/`02-tech-design.md`（254151 B）；`03-ui-spec.md` 只按简报给的 `:500`/`:506`/`:1466` 三处点读。

---

## 9. 待裁 / 未尽 / 未实测（如实登记，不擅自办）

1. **未裁项一颗没动**（简报 §7）：两端页脚**次序**差（Web 先态度话、App 先备案号）= D5 未裁 ⇒ 没统一；App 页脚**工信部外链** = #421② 未裁 ⇒ 没加（`:1959` 那颗 `a[href] === 0` 仍绿）；`© 2026` 年份与"主办单位名上屏"= 未裁 ⇒ 屏上仍然只有 shared 那两串（我把"曹怡明／个人主体"只写在**注释**里，0 上屏）。F-6 告警地址、U-1 keystore 备份、线上生产库只读访问、V-2 恢复演练：**未实测，待 Phase 7**（本轮判据不涉及，也没拿本地数据凑）。
2. **未跑 `pnpm -r test`（全仓 1207 合计）**：为保护真库只读面三颗，我按简报 §3 件B 判据4 的"至少 agent+shared+app 三包对账"路线跑了**五包**（26 files / 761 tests，§4.1 B-4）。缺 `@tm/server` 一颗（基线 `...\e4c3-iii\e4c3-2-0-root-test.log` = 47 files / 1207 passed | 1 skipped）。本轮改动面无 server 侧（server 不引 `BRAND`/`footerLine*`，`grep` 已证），但"全仓合计"这一条**我没有实测证据**，登记为未尽项，请 TPM 决定是否在安全盘面补跑。
3. **件A #5 的"新错一律不许修"没触发**：`pnpm -r typecheck` 五颗从没跑过的包（ui/agent/app/server/web）**0 新错**、exit 0（§2 A-3⑤）⇒ 不需要另派一轮。
4. **`packages/shared/dist/**` 里仍是过期串**：构建产物，简报 ⛔ 手改 ⇒ 待 E5 重建 dist 自然翻新（本轮只读它、没碰任何 `dist`）。
5. **六颗字面量钉的两处断言短路**（`:1988`、`:1958` 在同用例里被前面的红挡在先，中间态红档没独立显形）：见 §5.1 末段，形状与额度都合规，但"逐颗独立红"要单开探针轮才拿得到。
6. **`packages/agent/tsconfig.json` 改后 == HEAD/index**（§4.3）：本轮按简报指令做了 `:6` 一删一增，产物/类型/单测三条实测齐全；这颗唯一 tracked 文件的"改前相对 HEAD 反向漂移"我不上报 judgement，只登记形状，是否需要在归属/审计面上单独记一笔请 TPM 定。
7. **C-3 的 12 颗里 `:33` 未动**（§5.5）与 **C-2 的 `:137` 字面串改写为描述式**（§5.5 末段）：两处都是为了让"0 处 `XXXXXX` 残留"和"保留此句/保留该钉"两条判据同时成立；句意、口径、钉的逻辑均未放宽。请 TPM 复核这两处是否算偏离简报。
8. **冻结面里的一颗 `tools/boundaries.mjs` 在我收工段被外部改了四次**（实测 mtime 序列 03:41:36 → 03:43:38 → 03:47:28 → 03:48:55，大小 214202 → 214379 → … → 223388 B，现盘 sha `51570e64c932faed…` ≠ 锚 `48ee7b46773699a9…`）：
   - 它**在我的禁写面上**（简报 §0 第 3 条），我全程只 `node` 执行它 + `stat`/`sha256sum` 只读，**0 次写打开**；我也**没有**把它"修回"锚值（那会踩我的禁写面）。
   - 直接后果：冻结面 `sha256sum -c` 从 03:37:32 的 **11/11 OK** 变成 **10/11 OK**（唯一红就是这颗；真库三颗 `data.db`/`-shm`/`-wal` 与 `tools/ownership.json` 到 03:50:47 仍逐字 OK ⇒ 我只读承诺未破）。
   - 我已做的补救是**换证据而不是换盘面**：出口闸 + 两颗分类器在最新版脚本（03:48:55 / 223388 B）上逐字复跑，`EXIT=0 / EXIT1=0 / EXIT2=0`（`logs\E10`，03:51:10）；03:43:50 那次同样全绿（`logs\E6`）。⇒ 本轮出口判据不依赖某一份闸脚本的字节。
   - **请 TPM 决定**：(a) 若这四次改动就是本轮新判据，请把 `a100-anchor.pure.txt` 第 4 行的 sha 更新掉，好让 11/11 复绿；(b) 若不该动，这是并发落笔，请核对该颗的改动内容。**我在这一点上停手，不自作主张**。

---

## 10. 本轮时间线（全部 `date` 实测，无占位）

| 时钟 | 动作 | 证据 |
|---|---|---|
| 03:21:48 | 开工：读简报、复核六颗 sha 与通道表一致 | 首次 sha 输出 |
| 03:22:14→16 | 件A 改前基线 typecheck exit 2（复核简报 A-0） | `logs\A0` |
| 03:22:56 | 落 A-1（`:1240` 加 `!`）、A-2（`'g'` 移进 `new RegExp`） | `logs\A1` |
| 03:23:00→03 | `@tm/shared typecheck` **exit 0** | `logs\A1` |
| 03:23:09→16 | `@tm/shared test` 68 passed | `logs\A2` |
| 03:23:29 | `copy.ts` 末尾种探针（+1 行） | `probe-diff.txt` |
| 03:23:49→52 | **必红反证**：`外观 … 2 份`，EXIT=1 | `logs\A3` |
| 03:24:19 之前一步（A4 日志 START 实测锚） | 删探针 ⇒ sha 复原 `39efe0aa…`、对备份 `diff` 空输出 | `logs\A4` 第 2 行 + `probe-diff.txt` |
| 03:24:19→22 | 复原后 `@tm/shared test` 68 passed | `logs\A4` |
| 03:24:27→43 | `pnpm -r typecheck` exit 0（六包全 Done，0 新错） | `logs\A5` |
| 03:24:59→03:25:19 | 件B 改前：typecheck exit 0 + `--outDir` 复算（3 颗 spec.js） | `logs\B1`/`B2` |
| 03:25:24 | 落 件B（`:6` 一删一增） | `logs\B3` |
| 03:25:36→42 | 件B 改后：typecheck exit 0 + `--outDir` 复算（**0 颗 spec.js**） | `logs\B3`/`B4` |
| 03:25:55→03:26:05 | `@tm/agent test` 39 passed | `logs\B5` |
| 03:26:43 | **落 C-1**（`copy.ts:142` → 真号），测试侧未动 | `logs\C1` 第 2 行 sha |
| 03:26:54→03:27:45 | **件C 中间态必红**：9 failed（六颗字面量钉在守号） | `logs\C1` |
| 03:32:18 | 落 C-2（`MeScreen.tsx` 12 行注释）；03:32:30 落 C-4（`footer-note.tsx:5-6` 注释） | §7 表 mtime |
| 03:35:11 | 落 C-3（`me-screen.spec.tsx` 8 翻 + 11 行标题/注释） | §7 表 mtime |
| 03:35:26→03:35:47 | `@tm/app test` **470 passed / EXIT=0** | `logs\C2` |
| 03:35:54→03:36:00 | shared 68 + web 16 全绿 | `logs\C3` |
| 03:36:08→03:36:35 | 五包合计 26 files / 761 tests 全绿 | `logs\D1` |
| 03:36:35→56 | 最终 `pnpm -r typecheck` exit 0 | `logs\D2` |
| 03:37:15 | comment-only 分类器两颗 **exit 0**（GREEN） | `logs\E1` |
| 03:37:22 | 出口命令 `--check-ownership --task E4d --diff-file` **exit 0** | `logs\E2` |
| 03:37:32 | 冻结面 `sha256sum -c` **11/11 OK** + `git status` 自证（此时 `tools/boundaries.mjs` 仍与锚一致） | `logs\E3` |
| 03:38:14→15 | ICP 真号扫描 + 渲染行/两颗门旁证 + 件A 哨计数复算 | `logs\E4` |
| 03:39:01→03:42:5x | 合订 scoped patch（258 行 / 21014 B）、写本报告 | `e4d.patch` + 本文件 |
| **03:41:36**（外部） | `tools/boundaries.mjs` 被**别的角色**改写（214202 B）——我 0 次写它 | `logs\E5` 的取证段 |
| 03:43:26 | 收工复跑 `sha256sum -c` ⇒ **10/11 OK**，唯一红 = `tools/boundaries.mjs`（真库三颗 + `ownership.json` 仍 OK）；同跑 `dist` mtime 旁证 + git 计数 | `logs\E5` |
| **03:43:38**（外部） | 同一颗又被改一次（现盘 214379 B / sha `35436eac…` ≠ 锚 `48ee7b46…`） | `logs\E6` 首段 |
| 03:43:50 | **出口闸 + 两颗分类器在新版闸脚本上复跑 ⇒ 全部 exit 0** | `logs\E6` |
| 03:43:59 | 再跑一次 `-c` 复核：仍 10/11（除那颗外部文件外全 OK） | `logs\E7` |
| 03:44:3x→收工 | 把上述两次复跑与新时间戳回填进本报告（§1/§3/§4/§5/§7/§8/§10） | 本文件 |
