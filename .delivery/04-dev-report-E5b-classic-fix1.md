# 04-dev-report E5b-classic-fix1 — vite.config.ts:187 TS2532 极小修复

- 日期：2026-09-26（TPM 亲跑 tsc 报出该错后派发）
- 任务性质：单文件单行类型错误修复，不改任何判据语义
- 改动文件：**仅 `apps/app/vite.config.ts` 一行**

## 1. 改动内容

`apps/app/vite.config.ts:187`（classic-output writeBundle 守卫内部）：

```diff
-      const scriptAt = externalScripts[0].index ?? -1;
+      const scriptAt = externalScripts[0]?.index ?? -1;
```

原因：本仓 tsconfig 开了 `noUncheckedIndexedAccess`，`externalScripts[0]` 的类型是
`RegExpMatchArray | undefined`，TS 不识别上方 `externalScripts.length !== 1` throw 守卫对它的收窄，
故报 `error TS2532: Object is possibly 'undefined'`。

### 判据语义未变的理由

- `?.` 只作用于**取值方式**，不触碰任何判定分支：`length !== 1` throw、`appDiv < 0 || scriptAt < appDiv`
  throw 两条守卫的表达式与顺序逐字未动。
- 运行时取值完全等价：上面第 174 行的 `externalScripts.length !== 1` throw 保证执行到 :187 时
  `externalScripts[0]` 必存在，`externalScripts[0]?.index` 与 `externalScripts[0].index` 同值；
  若（假想的未来代码演化中）该元素真的缺失，`?.index ?? -1` 得 `-1`，`scriptAt(-1) < appDiv` 成立 →
  **落向 throw 方向**，与守卫「不满足就构建失败」的 fail-closed 方向一致。
- ⛔ 未用 `!` 非空断言（那是骗类型、运行时若缺失会 TypeError 而不是守卫 throw）；
  ⛔ 未放松任何判据（`!== 1` 仍是恰好 1 颗）；⛔ 未重构周围代码（diff 只有这一行）。

## 2. 出口条件实测（原文输出）

### 2.1 tsc

```
$ cd /e/CC/tomorrow-memory/apps/app && npx tsc -p tsconfig.json --noEmit
（无输出）
exit=0
```

### 2.2 测试（正规跑法）

```
$ cd /e/CC/tomorrow-memory && pnpm --filter @tm/app test
...
 Test Files  18 passed (18)
      Tests  472 passed (472)
   Start at  19:11:25
   Duration  14.86s (transform 4.44s, setup 0ms, collect 27.13s, tests 50.69s, environment 17.85s, prepare 3.65s)
exit=0
```

✓ 472 passed / 18 files，与要求一致。

### 2.3 构建 + 产物断言

```
$ cd /e/CC/tomorrow-memory && pnpm --filter @tm/app build
...
[plugin tm-app:classic-output] [classic-output] 判据④ 成立：1 颗经典 <script src>（在 #app 之后、</body> 之前）+ 1 颗经典 <link rel="stylesheet">，0 处 type=module / crossorigin / modulepreload
dist/index.html                   3.09 kB │ gzip:   1.74 kB
dist/assets/index-T4SUTEM1.css   38.63 kB │ gzip:   8.12 kB
dist/assets/index-prq-99Wt.js   606.01 kB │ gzip: 184.07 kB
✓ built in 2.59s
[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：3 个产物文件，无绝对路径资源、无 Chrome84 之后的 API
exit=0
```

`apps/app/dist/index.html` 全部 `<script`/`<link` 行：

```
$ grep -n -o -E '<(script|link)[^>]*>' apps/app/dist/index.html
18:<script>
35:<script>
61:<link rel="stylesheet" href="./assets/index-T4SUTEM1.css">
65:<script src="./assets/index-prq-99Wt.js">
```

禁词扫描：

```
$ grep -c -E 'type="module"|crossorigin|modulepreload' apps/app/dist/index.html
0
grep exit=1   （1 = 零命中）
```

断言成立：
- 外部经典 `<script src>` **恰好 1 颗**（:65，位于 `#app` 之后）；:18/:35 是 head 内联脚本（无 src，不属于外部脚本类，守卫正则天然不匹配）。
- 经典 `<link rel="stylesheet">` **1 颗**（:61）。
- `type="module"` / `crossorigin` / `modulepreload` **0 处**。

### 2.4 守卫反证（node -e 一次性夹具，未碰 apps/app/src/** 与产物）

用与 vite.config.ts 同源的正则、逐字复刻的判定逻辑（含修后的 `?.index??-1`）：

```
$ node -e "...guard 复刻逻辑..."
dist EXTERNAL_SCRIPT_TAG match count = 1
guard(dist) = PASS
guard(fixtureA, 2 scripts) THREW: [classic-output] 期望恰好 1 颗外部 <script src>，实际 2 颗
guard(fixtureB, script before #app) THREW: [classic-output] 入口脚本没有落在 #app 之后（位置 12 vs #app 42）
```

结论：守卫**不是永真**——
- 真产物上 `EXTERNAL_SCRIPT_TAG` 匹配数 = 1，判定 PASS；
- 2 颗外部 script 的夹具命中 `length !== 1` throw 分支；
- 1 颗脚本但位于 `#app` 之前的夹具命中 `scriptAt < appDiv` throw 分支。
两条失败分支均可达，修后写法 `?.` 在正常路径下取值与修前一致（夹具 B 中位置 12 即 `?.index` 实测取到的匹配下标）。

## 3. 纪律自查

- 只改了 `apps/app/vite.config.ts` 的 :187 一行；未动测试、`tools/**`、`mobile-memory/**`、`*.apk`、`apps/app/src/**`（构建重写的 `apps/app/dist/**` 是任务出口条件③明确要求的产物再生成）。
- 全程零 git 写操作（未执行任何 add/commit/stash/checkout/restore/reset）。
- 根 `data.db`（含 `-shm`/`-wal`）未打开、未写入、mtime 未动。
- 本报告路径：`E:\CC\tomorrow-memory\.delivery\04-dev-report-E5b-classic-fix1.md`。

## 4. 未实测项

- 无。四处出口条件均已实跑并贴原文。
