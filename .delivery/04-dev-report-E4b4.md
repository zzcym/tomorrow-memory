# 04-dev-report-E4b4 · 查询方向"翻面"集中修（A-89 #342 / 通道 bounded-edit:A-89-E4b4）

- 开工时刻：2026-09-23 03:08:23（两证锚点，见 §6）
- 收工时刻：2026-09-23 04:0x（本轮出口全套实跑 **1 次**，未用第 2 次额度）
- scratch：`C:\Users\曹怡明\AppData\Local\Temp\e4b4\work\`（scoped patch = `e4b4-scoped.patch`）

## §0 落点表（文件:行号 = 改后盘面；额度 = `maxDiffLinesFor["E4b4"]`）

| # | 文件 | 改后落点 | 额度(增+删) | 实耗（`diff -u` 本地口径） | 闸门口径（`--check-ownership` NOTE 行） | 余量 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `packages/shared/src/utils.ts` | `:10` import 加 `type LookupDirectionValue`；`:106-114` 新增 `flipLookupDirection` | 14 | +10/-1 = 11 | +10/-2 = 12 | 在额内 |
| 2 | `packages/shared/test/contracts.spec.ts` | `:172` import 加名；`:1259-1265` 件A 三值哨 | 16 | +8/-0 = 8 | +8/-1 = 9 | 在额内 |
| 3 | `apps/app/src/components/result-row.tsx` | `:88` 起原 `flippedDirection`（旧 `:88-95`）整颗删除 | 10 | +0/-9 = 9 | +0/-10 = 10（**贴顶**） | ≤10 |
| 4 | `apps/app/src/screens/LookupScreen.tsx` | `:34` import 加名；`:213-222` 注释撤除改 2 行 + 调共用件 | 16 | +4/-6 = 10 | +4/-7 = 11 | 在额内 |
| 5 | `apps/web/src/lib/api/lookup-stream.ts` | 旧 `:38-42` 整颗删除；`:23 CJK`、`:33 resolveDirection` 逐字未动 | 12 | +0/-6 = 6 | +0/-7 = 7 | 在额内 |
| 6 | `apps/web/src/lib/hooks/use-lookup.ts` | `:14` 值 import、`:18` 去旧名、`:105-107` 改 `flipLookupDirection(view.applied)` + 依赖数组 | 12 | +4/-4 = 8 | +4/-5 = 9 | 在额内 |
| 7 | `apps/app/test/lookup-screen.spec.tsx` | `:721-736` 件D 反向哨（新增，纯追加） | 24 | +16/-0 = 16 | +16/-0 = 16 | 在额内 |

实耗合计：本地口径 68 / 上限合计 104。闸门两套计数（本地 `diff -u` vs 闸门口径）均在各自上限内；差异申报见 §7-3。

## §1 件A：shared 单点 + 三值哨

`packages/shared/src/utils.ts:106-114`（放在 `detectLanguage` 旁）：

```ts
/**
 * 「换个查询方向」的目标档 = **生效方向**的纯反向（A-89 #342 单点，两端各删本地实现、不留转发壳）。
 * 不按输入字符猜：两端方向链的 `aria-label` 三元（App `DirectionLink` / Web `result-section`）
 * 本就是"非 `zh2en` 即承诺改用中译英"⇒ `auto` 归 `zh2en` 与标签同口径。
 */
export function flipLookupDirection(applied: LookupDirectionValue): LookupDirectionValue {
  return applied === 'zh2en' ? 'en2zh' : 'zh2en';
}
```

- 类型 `LookupDirectionValue` 取自 `./constants/limits.js`（该文件本就从此 import `PASSWORD_MIN` ⇒ 0 循环依赖；未新开模块文件）。
- `packages/shared/src/index.ts:16` 既有 `export * from './utils.js'` ⇒ `@tm/shared` 自动导出，无 index 改动。
- 哨（`contracts.spec.ts:1259-1265`，期望值写字面量、不从实现反推）：

```ts
describe('E4b4 件A：`flipLookupDirection` 三值行为哨（A-89 #342，逐值钉死，期望值不从实现反推）', () => {
  it('zh2en→en2zh、en2zh→zh2en、auto→zh2en（第三档与两颗 aria-label 的承诺同口径）', () => {
    expect(flipLookupDirection('zh2en')).toBe('en2zh');
    expect(flipLookupDirection('en2zh')).toBe('zh2en');
    expect(flipLookupDirection('auto')).toBe('zh2en');
  });
});
```

`LOOKUP_DIRECTIONS`/类型契约面未动。

## §2 件B：App 面

1. `result-row.tsx`：旧 `:88-95` 的 `flippedDirection`（连注释）整颗删除。**禁动清单逐项核对**：`:77-86 resolveDirection` 未动、`:68-75` 键对齐注释未动、`detailHref` 未动、`:307`（改点后行号漂移，aria-label 三元原样）未动、`LOGIN_ROUTE` 相关一切未动（本次 diff 对该文件纯删除、0 新增）。`detectLanguage` 仍被 `resolveDirection:82` 使用 ⇒ import 保留，未产生未用 import。
2. `LookupScreen.tsx:213-222`（改后）：

```tsx
  /**
   * 目标档 = 生效方向的反向，单点在 `@tm/shared` 的 `flipLookupDirection`（A-89 #342），
   * 与 `DirectionLink` 的 `aria-label` 同口径。
   */
  const switchDirection = (): void => {
    if (pending === null) return;
    const next: LookupDirectionValue = flipLookupDirection(pending.applied);
    setPending(planSubmit(pending.text, pending, next));
  };
```

`:213-218` 那段"刻意不走"注释整段撤除（它正是旧名在 App 源码里的最后一处指称）。
3. C-6 两颗钉（`:644-659`、`:709-718`）：**一字未改**（件D 对该文件是 +16/-0 纯追加，闸门账面可证）。

## §3 件C：Web 面

1. `lookup-stream.ts` 旧 `:38-42` 删除（连注释）。`:23 const CJK` 与 `:33 resolveDirection` 逐字未动（F-54 口径，本轮不碰）。
2. `use-lookup.ts` 改后关键行：

```ts
:14  import { WORD_MAX_LENGTH, flipLookupDirection } from '@tm/shared';   // 值 import 与既有风格同（:13 为 type import）
:18  import { resolveDirection, toHomeLookupView, toRecentItem, type HomeLookupView } from '../api/lookup-stream';
:105 const switchDirection = React.useCallback((): void => {
:106   setOverride(flipLookupDirection(view.applied));
:107 }, [view.applied]);
```

3. `result-section.tsx` 两颗 aria-label 未动（sha256 两证覆盖，见 §6）。

### §3-x 改判前后请求对表（§3③ 要求的专节：这是目的，不是副作用）

以英文词 `Happy`（首查命中，服务端判英译中）为例：

| 步 | 改前（喂请求侧 `direction`） | 改后（喂视图生效侧 `view.applied`） |
| --- | --- | --- |
| 首查 | 请求 `{word:'Happy', direction:'auto'}`；`view.applied='en2zh'`；标签「改用中译英查询」 | 同左（首查路径不变） |
| 点方向链① | `flippedDirection('auto','Happy')` → CJK 不命中 → `override='en2zh'` ⇒ **换发的请求只是 auto→en2zh，结果同一颗词**——嘴上承诺"中译英"、手里还是英译中 | `flipLookupDirection('en2zh')` → `override='zh2en'` ⇒ 请求 `{word:'Happy', direction:'zh2en'}`——**动作 = 标签承诺** |
| 点方向链②（原地死循环处） | `flippedDirection('en2zh','Happy')` → 又算回 `'en2zh'` ⇒ override 不变、查询键不变、**点了没反应**（App 侧 C-6 那轮红的 Web 同型） | 结果多半空态（`applied='zh2en'` 分支），链上再点 → `flipLookupDirection('zh2en')='en2zh'` ⇒ **两档可来回**，每档都是新查询键、真发请求 |
| 中文词 zh2en 命中后点链 | `flippedDirection(direction,'快乐')`→`'en2zh'`（此档两版行为相同） | `flipLookupDirection('zh2en')='en2zh'`（不变） |

与 §3.1.2 标签承诺的一致性：`result-section.tsx:206/:244` 的 aria-label 按 `view.applied === 'zh2en' ? 改用英译中 : 改用中译英` 计算，即"非 zh2en 一律承诺中译英"；改后 `flipLookupDirection` 的 `auto→zh2en` 与 `en2zh→zh2en` 恰是该三元的另一侧 ⇒ 函数输出恒等于标签承诺的档位。React Query 键为 `{word, direction}`，方向变 ⇒ 键变 ⇒ 必再发请求，无"点了不动"。

## §4 件D：屏侧 grep 反向哨（源码原文）

`apps/app/test/lookup-screen.spec.tsx:721-736`（追加于文件末；**未**把 Web 两颗塞进 `SOURCES`）：

```tsx
describe('E4b4 件D：「翻面」两端 0 第二份实现反向哨（A-89 #342 单点上收 `@tm/shared`）', () => {
  it('App 四源 + Web 两源的 code 面 `flippedDirection` 命中 0（旧名连转发壳都不许留）', () => {
    /* ⚠ 不放进 `SOURCES`（那颗被上面的用例遍历用着）：哨内部自列 Web 两颗，同源 `codeOnly()` 剥注释。 */
    const WEB_SOURCES = [
      '../../web/src/lib/api/lookup-stream.ts',
      '../../web/src/lib/hooks/use-lookup.ts',
    ].map((p) => {
      const text = readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
      return { path: p, code: codeOnly(text) };
    });
    for (const source of [...SOURCES, ...WEB_SOURCES]) {
      expect(source.code, source.path).not.toMatch(/flippedDirection/);
    }
  });
});
```

- 断言原文 = `expect(source.code, source.path).not.toMatch(/flippedDirection/)`，覆盖面 = App 4 源（既有 `SOURCES`）+ Web 2 源，共 6 颗，全绿 ⇒ 两端 code 面 0 第二份实现、0 转发壳。
- ⚠ Web 两颗的相对路径深度与任务书不符（书写 `../../../` 实测解析到仓库根下不存在的 `web/`，`readFileSync` ENOENT；实际应为 `../../`）。这是简报路径笔误而非设计变更，语义（读那两颗源）一字未动。申报 §7-1。
- 全仓 `grep -rn "flippedDirection" apps/ packages/`（`--include=*.ts --include=*.tsx`）现命中 = 上面哨自身的 2 行（it 标题串 + 正则字面量，哨的构件本体，非实现非转发壳），源码/注释面 0 命中。申报 §7-2。

## §5 出口判据（全套实跑 1 次；原始输出见 scratch 各 log，此处贴尾部关键行）

1. `pnpm --filter @tm/shared test` → exit 0：**Test Files 1 passed (1) / Tests 68 passed (68)**（基线 67 + 件A 1 = 68，只增不减，0 failed）✅
2. `pnpm --filter @tm/app test`（必须 `--filter @tm/app`，本轮未裸跑 vitest）→ exit 0：**Test Files 18 passed (18) / Tests 470 passed (470)**（基线 469 + 件D 1 = **470**，0 failed）✅
3. `pnpm --filter @tm/web test` → exit 0：**Test Files 1 passed (1) / Tests 16 passed (16)**（与 TPM 基线逐字同数，本轮未动 Web 测试面）✅
4. `pnpm --filter @tm/app typecheck` = exit 0；`--filter @tm/web typecheck` = exit 0；`--filter @tm/server typecheck` = exit 0 ✅
5. `pnpm --filter @tm/app build` → exit 0；`find apps/app/dist -type f | wc -l` = **22**；build log 尾部：`[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：22 个产物文件，无绝对路径资源、无 Chrome84 之后的 API` ✅（未新开模块、未引入新 API）
6. `node tools/boundaries.mjs --check-ownership --task E4b4 --files packages/shared/src/utils.ts,packages/shared/test/contracts.spec.ts,apps/app/src/components/result-row.tsx,apps/app/src/screens/LookupScreen.tsx,apps/web/src/lib/api/lookup-stream.ts,apps/web/src/lib/hooks/use-lookup.ts,apps/app/test/lookup-screen.spec.tsx --diff-file %TEMP%\e4b4\work\e4b4-scoped.patch` → **exit 0**，输出尾部：

```
PATCH 7 个文件的 diff 参与判定
--check-ownership task=E4b4 触碰 7 个在册文件（清单 7 项 + patch 7 项） → 无越界
```

   patch 文件段数 = 7 = `--files` 项数（F-52 满足）。NOTE 行标签复现 F-43 第二形态（见 §7-4），额度按 `maxDiffLinesFor["E4b4"]` 判定，逐颗在额内（§0 表）。✅
7. `node tools/boundaries.mjs --self-test` → exit 0，尾部：**boundaries --self-test：157/157 通过**（本轮未碰 `tools/`）✅

scoped patch 生成口径：以开工时刻 03:08:23 为锚，逐颗反向还原 pre 像（从当前盘面精确逆换本轮各改点，逆换处要求唯一命中，任一不唯一即报错退出）后 `diff -u` 拼接，存 `work/e4b4-scoped.patch`；全程未用 `git diff` 自证、未做任何 git 操作。

## §6 两证

**证一 sha256**（`work/sha256-baseline.txt` 开工 03:08:2x 落，收工 `sha256sum -c` → exit 0，**13/13 全 OK**）：
`data.db`、`data.db-shm`、`data.db-wal`（三颗 sidecar 齐验，F-46 口径）、`packages/server/data.db`、`tools/boundaries.mjs`、`tools/ownership.json`、`.delivery/01-prd.md`、`.delivery/02-tech-design.md`、`.delivery/03-ui-spec.md`、`.delivery/04-adjudications.md`、`apps/web/src/app/(user)/about/page.tsx`、`apps/web/src/components/home/result-section.tsx`、`apps/app/src/screens/MeScreen.tsx`。
本轮真库 0 打开（无任何 sqlite 访问；测试跑的是各自 in-memory/临时面）。

**证二 文件窗口**（`find -newermt '2026-09-23 03:08:23'`）：
- 基线（开工瞬间全仓）：0 命中（现场干净起算）。
- 收工 `-maxdepth 1`：命中 1 项 = `./.git`（目录本体，非文件；本轮 0 git 操作，属并发面其他角色所致，申报 §7-5）。**根面文件命中 = 0**。
- 收工全仓（排除 `.git/`、`node_modules/`）：30 项，逐颗分类：
  - 我名下 7 颗源文件：§0 表 1–7 ✅
  - gitignored 构建噪声 22 颗：`apps/app/dist/index.html` + `apps/app/dist/assets/*.js|css` ×21（出口 5 build 产物）✅
  - gitignored 噪声 1 颗：`apps/web/tsconfig.tsbuildinfo`（出口 4 web typecheck 副产物）✅
  - scratch/报告均在本目录之外（系统临时区 + 本报告），无其他命中。

## §7 申报

1. **件D Web 路径深度**：任务书写 `../../../web/src/...`，实测（scratch `path-probe.mjs`，node `new URL` 语义与 vitest 一致）解析到仓库根下不存在的 `web/` ⇒ ENOENT；本仓布局正确深度是 `../../web/src/...`（`apps/app/test/` → `apps/` → `apps/web`）。已按任务书语义（读 `lookup-stream.ts` + `use-lookup.ts` 两颗）用正确深度落地，出口 2 的 470 全绿证明哨真的读到了两颗源并在断言。若 TPM 坚持逐字三 `../`，该哨必红，请回批。
2. **旧名残留 grep 口径**：`flippedDirection` 在 `apps/` `packages/` 的源码/注释面 0 命中；仅存的 2 处命中都在件D 哨内部（it 标题描述串 + 反向断言正则），是任务书件D 要求存在的哨本体，无法也不必消除（删了就没有哨）。`.delivery/` 历史报告与 `tools/ownership.json` reason 字段里的旧名是 TPM/前轮记账文本，未动。
3. **计数口径差异**：闸门 NOTE 行的 ± 行数每颗比本地 `diff -u` 多 1 删行（疑为闸门把 hunk 边界/context 转换计入），两套数字均 ≤ 各颗上限；`result-row.tsx` 闸门口径 +0/-10 = 10 恰贴上限（额度 10，判据是 ≤，不违规，按 E4b3b D1 口径如实报贴顶）。
4. **F-43 第二形态复现确认**：`contracts.spec.ts` NOTE 标签打 `bounded-edit:A-74-235`、`result-row.tsx` 打 `bounded-edit:A-82-E4b2`，实际卡的是 E4b4 额度（16/10）——按数字不按名字，未动闸门。
5. **`./.git` 出现在 maxdepth-1 窗口**：目录 mtime 新于开工锚点，非本轮所为（本轮 git 写 0、git 读 0），属并发工作面；文件级根面命中为 0。
6. **未加 Web 测试**（§3⑤ 额度未开）：Web 侧正确性 = 件A shared 三值哨 + 件D grep 反向哨 + 既有 16 颗全绿共同覆盖；无"必须先斩后奏"的加颗。
7. 未改我未点名的任何哨/钉/串：C-6 两颗钉、两颗 aria-label、`copy.ts:901-902` 两串、`CJK`、`resolveDirection`（两端）、`LOOKUP_DIRECTIONS` 均逐字未动（sha256/patch 可复核）。

## §8 结论

E4b4 七条出口第 1 套全绿（68/470/16/三 typecheck 0/22 产物+dist-guard/闸门 exit 0 无越界/157 self-test），两端"翻面"实现已删净、单点 `flipLookupDirection` 上收 `@tm/shared`，Web 动作首次等于 aria-label 承诺，两证闭合，唯二偏差是简报路径笔误（件D 深度，已按语义落地并申报）与 `result-row.tsx` 额度贴顶。
