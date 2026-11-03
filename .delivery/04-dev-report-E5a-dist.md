# 04-dev-report · #54a E5-dist-rebuild（重建两颗产物 + 「装得上」缺口实测底账）

执行人：构建/前端 agent（简报 `brief-E5a-dist.md` 为唯一判据源）
开工实测时刻：**2026-09-26 05:23:41**（`date` 原文）；收工时刻见 §5 尾部。
档位：内部可用版三档中的「装得上」取证 + 两颗产物真重建。

## 结论一句话

两颗产物已真重建（`pnpm --filter @tm/shared build` / `pnpm --filter @tm/app build`，均 exit 0），
新 `apps/app/dist` **确实带上了 `/register` gate 路由**（旧产物没有，硬证据见 §2-①）；
首屏 gzip **155540 B ≤ 256000 B，余量 100460 B = 39.24%**；
构建后回归面与 A-104 基线逐字对齐（typecheck 六包 0 / 47 files / 1209 passed + 1 skipped / `--all 21/21` / `--dist 1/1`）。
「装得上」的缺口**实测为三样**：① 签名口令 `APK_KEYSTORE_PASS`（本机未设，本颗按 RK-13 不做任何绕过）；
② 本机 `JAVA_HOME` 指向 **Java 8** 而非简报所称"未设"；③ `adb devices` 无任何设备。
且现盘可装的 APK 内嵌的是**比 09-23 dist 更早一代**的前端产物（`index-CxVKGVFf.js`，0 处 `/register`）——
即便拿到口令，也必须重跑 `build-apk.sh` 才能把今天的新 dist 装进去。

---

## 1. 八条硬边界自查

| # | 边界 | 实际 | 证据 |
|---|---|---|---|
| 1 | 只写两颗 dist + `mobile-memory/build/` + 本报告 | ✅ 达成 | §5-② `find -newermt` 命中 102 颗 = `apps/app/dist` 22 + `packages/shared/dist` 80，源码/`tools`/`scripts`/测试/组件 **0 命中** |
| 2 | ⛔ 手改产物凑绿 | ✅ 未改 | 两颗 dist 全部由真构建命令产出；未编辑 dist 内任何文件、未复制改名、未删除任何文件（09-19 的 72 颗孤儿文件我**也没删**，见 §6-待裁-2） |
| 3 | ⛔ git 写操作 | ✅ 未做 | 全程只 `git status --porcelain` / `git check-ignore` 两条只读命令 |
| 4 | 真库三颗只读 | ✅ 零写入 | §5-① `sha256sum -c` 三颗全 OK，size/mtime 与 §0-4 逐字一致 |
| 5 | ⛔ 碰 keystore / 猜口令 / keytool 自签 | ✅ 未做 | `keystore.jks` 只 `ls`+`sha256sum` 读取；`APK_KEYSTORE_PASS` 全程保持 UNSET（打印原文见 §4-②）；未执行任何 `keytool` 写操作；**未设置任何假口令**（设了就会让脚本越过 env 门禁去动 keystore，属禁区） |
| 6 | ⛔ 删旧 APK | ✅ 零删除 | 12 颗 apk/idsig 前后 sha12 逐颗相同（§4-③）；运行前已 `cp -a mobile-memory/build` 到 `%TEMP%\e5a\pre-build-dir` |
| 7 | ⛔ 为测试改 DOM / skip / 放宽断言 | ✅ 未做 | 无源码改动可言（边界 1 已锁死写面） |
| 8 | ⛔ 通读 `.delivery/` 主文档 | ✅ 遵守 | 全程未读任何 `.delivery/*.md` 正文；简报 §1 已给的口径直接引用 |

`git check-ignore -v` 双证（证明我写的确为生成物目录）：
```
.gitignore:82:apps/app/dist/	apps/app/dist/index.html
.gitignore:5:dist/		packages/shared/dist/src/index.js
```

---

## 2. 件1 —— 重建 `packages/shared/dist`

**做了什么**：`pnpm --filter @tm/shared build`（= `tsc -p tsconfig.json`，emit 型，**未**用 `--noEmit` 假装）。

```
$ pnpm --filter @tm/shared build
$ tsc -p tsconfig.json
exit=0
```

| 面 | 前 | 后 | 差 |
|---|---|---|---|
| 文件数 | 152 | 152 | 0 |
| 总字节 | 668350 B | 808327 B | **+139977 B** |
| 最新 mtime | 2026-09-19 14:00:15 | 2026-09-26 05:25（本次） | 产物由 09-19 追平 |
| sha12 变化颗数 | — | **32 颗** | 80 颗被重写，其中 48 颗字节级一致、32 颗内容变了 |

**结构实测（重要）**：`packages/shared/tsconfig.json` 现为 `rootDir: "."` + `include: ["src","test"]`，
所以本次 emit 落在 **`dist/src/**`（76 颗）+ `dist/test/**`（4 颗）= 80 颗**，全部刷成 09-26；
而 `dist/constants/**`、`dist/contracts/**`、`dist/{copy,index,types,utils}.*` 这 **72 颗是旧布局（`rootDir: "src"`）遗留的孤儿**，
本次 tsc 根本不再往那些路径写，mtime 仍停在 09-19，**内容未动**。

抽查健康度（确认不是重复写入撑大的）：
`dist/src/constants/errors.d.ts` 89 行 → 176 行、CR 字节数 0（LF 未变）、顶层 declare 10 → 14 条，
`node --check dist/src/constants/errors.js` exit 0 —— 尺寸增长来自源码真实增长（+JSDoc 进 `.d.ts`），非产物损坏。

⚠ **连带发现**：`packages/shared/package.json` 的 `main`/`types`/`exports` **全部指向 `./src/*.ts`**，
即 `dist/` 没有任何 workspace 内消费者；重建 shared/dist 属产物卫生，不参与 App 打包链路（这条影响本颗"两颗产物"的实际意义，见 §6-待裁-3）。

---

## 3. 件2 —— 重建 `apps/app/dist` + 三条实测

### 3.0 构建本体

```
$ pnpm --filter @tm/app build            # = tsc -p tsconfig.json --noEmit && vite build
START 2026-09-26 05:26:37
BUILD_EXIT=0
END   2026-09-26 05:26:52
vite v6.4.3 building for production...
✓ 248 modules transformed.
✓ built in 7.90s
[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：22 个产物文件，无绝对路径资源、无 Chrome84 之后的 API
```

| 面 | 前（简报 §1 实测，我复核一致） | 后 | 结论 |
|---|---|---|---|
| 文件数 | 22（20 js + 1 css + 1 html） | 22（同构成） | 形态未变 |
| 总字节 | 653547 B | 653746 B | +199 B |
| `index.html` mtime | **2026-09-23 04:29:04** | **2026-09-26 05:26:52** | ✅ 产物追平到今天 |
| `index.html` sha12 | `d086477617bb` | `f32cf72361bb` | 唯一改动 = 入口 chunk 名换 hash（1 行，长度同为 3087 B） |
| js chunk 名 | 20 颗 | 20 颗，**全部改名**（`only_before=20 / only_after=20`） | 内容级重烘焙 |
| `index-T4SUTEM1.css` | 38631 B / `…` | **sha12 与 mtime 均不变**（同名同字节） | Tailwind 产物零漂移 |

### 3-① `register` 命中 —— 简报判据①**不成立**，真判据我另测

**照简报原命令跑，但先说清：它证不了产物新旧。**

```
grep -c register apps/app/dist/assets/*.js   → 6 颗文件命中（新 dist）
grep -o register apps/app/dist/assets/*.js | wc -l → 28 颗 token（新 dist）
```

逐颗 token 计数（`grep -o register <file> | wc -l`，新 dist，20 颗 js 全列）：

| js chunk | register token |
|---|---|
| `index-CFfPi4Hf.js` | 18 |
| `auth-CCOqC3YN.js` | 4 |
| `LoginScreen-5vPVn85C.js` | 3 |
| `WordbookScreen-B3BKAM40.js` | 2 |
| `MeScreen-CcsCFCCI.js` | 1 |
| 其余 15 颗 js | 0 |

**⚠ 旧 dist 实测并非简报 §1 所称的「0 命中」**：旧产物里裸 token `register` = **26 颗**、`/register` 串 = **1 颗**
（那一颗是 `/api/register` 这个**接口**地址，不是路由），`grep -c register` 命中 **同样 6 颗文件**。
⇒ 「命中 ≥1」这个判据**旧产物也满足**，属于**伪判据/假绿**，我按它报"绿"就是骗 TPM。
（简报 §1 那句 "`grep -c register` 0 命中" 应是把 `register` 当成了整词或扫错了面；本机不可复现。）

**能真正证伪"产物还是 #47 之前那份"的四条硬指标**（我为此**在重建前把旧 dist 整颗备份**到
`%TEMP%\e5a\pre-app-dist\`，否则覆盖后再也拿不到对照）：

| 指标 | 旧 dist（09-23） | 新 dist（本次） | 源码现值 |
|---|---|---|---|
| 路由表 `path:"…"` 颗数 | **11** | **11**（见下注） | `ROUTES` 12 条 |
| `kind:"gate"` 计数 | **2** | **3** ✅ | 3（login / upgrade-password / register） |
| 字面量 `"/register"`（带引号，路由常量形态） | **0** | **1** ✅ | `auth-store.ts:50 REGISTER_ROUTE='/register'` |
| ROUTES 里注册那条 | 不存在 | **存在** ✅ | `router.tsx:56` |

新 dist 里那条 gate 的**烘焙原文**（`assets/index-CFfPi4Hf.js`）：
```js
const B_="/login",MD="/register",zD="/upgrade-password"
{path:MD,kind:"gate",load:()=>Dn(()=>import("./LoginScreen-5vPVn85C.js"),__vite__mapDeps([16,12,15]),import.meta.url)}
```
注：路由表里 `path:"…"` 仍是 11 颗，因为 `router.tsx:56` 用的是**导入常量** `REGISTER_ROUTE`，
压缩后成为变量引用 `path:MD`，不落成 `path:"/register"` 字面量 —— 所以**只数 `path:"` 会漏判这条**。
⇒ **给 F-59 的建议判据**：断言 `kind:"gate"` == 3 **且** index chunk 里存在 `"/register"` 字面量 **且** 存在 `{path:<var>,kind:"gate",load:…LoginScreen…}` 一条；⛔ 用裸 `grep -c register`（旧产物也绿）。

### 3-② 首屏 gzip 实测（TPM 拿去写 F-59 门禁，数字可复算）

**集合口径**（简报 §1 原文）：`index.html` 里 `<script type=module src>` + 同文件 `<link rel=modulepreload href>`。
新 `index.html` 实测抽出的初始资源：

```
<script type="module" crossorigin src="./assets/index-CFfPi4Hf.js">   ← 1 颗
<link rel="modulepreload" …>                                          ← 0 颗（该文件里没有 modulepreload）
<link rel="stylesheet"  href="./assets/index-T4SUTEM1.css">           ← CSS，不计入「首屏 JS」预算
```

⇒ **首屏 js 集合 = 1 颗**。（vite 把初始依赖图全部打进了单颗入口 chunk，懒加载屏走 `__vite__mapDeps` 动态 import，不在首屏集合内。）

**逐颗 `gzip -9 -c <file> | wc -c`：**

| # | 文件 | raw (B) | gzip -9 (B) | 是否首屏集合 |
|---|---|---|---|---|
| 1 | `apps/app/dist/assets/index-CFfPi4Hf.js` | 507075 | **155540** | ✅ |

**求和 vs 预算：**

| 口径 | 求和 (B) | 预算 (B) | 余量 (B) | 余量 % | 判定 |
|---|---|---|---|---|---|
| **首屏 JS（简报 §1 口径）** | **155540** | **256000** | **100460** | **39.24%** | ✅ 达标 |
| （对照）首屏 JS + 首屏 CSS | 163587 | 256000 | 92413 | 36.10% | ✅ 达标 |
| （对照，**非**首屏口径）全部 20 颗 js 之和 | 198391 | 256000 | 57609 | 22.50% | ✅ 达标 |

三种口径都在 250 KB 内 —— 即便 TPM 日后把首屏口径放宽到"全量 js"，门禁也不会红。
**稳定性实测**：入口那颗连测 3 次 `gzip -9` 均为 **155540 B**（确定性，可复算）。
（注：vite 自己日志报的是 `156.65 kB`，它用默认压缩级别；我这里是 `gzip -9` 实测 **155540 B**，两者不冲突，F-59 请引用我这颗，因为命令与数字一一对应。）

**全量 js 逐颗 gzip 从大到小排序（20 颗，给 F-59 定单颗断言目标用）：**

```
  155540   507075  apps/app/dist/assets/index-CFfPi4Hf.js          ← 首屏唯一颗，占全部 js gzip 的 78.4%
    5338    12587  apps/app/dist/assets/StudyScreen-D_1Nmj3C.js
    5274    13519  apps/app/dist/assets/result-row-Chxt8uJz.js
    4287    10710  apps/app/dist/assets/LookupScreen-B-zdWxQk.js
    3623     8721  apps/app/dist/assets/WordbookScreen-B3BKAM40.js
    3402     9504  apps/app/dist/assets/useQuery-CMN_tKpC.js
    3249     9675  apps/app/dist/assets/MeScreen-CcsCFCCI.js
    2756     6790  apps/app/dist/assets/ProgressScreen-BThlo7Fk.js
    2676     6224  apps/app/dist/assets/WordDetailScreen-PXFh4DKm.js
    2107     6185  apps/app/dist/assets/CompletionScreen-C_LF_BSb.js
    1817     4030  apps/app/dist/assets/UpgradePasswordScreen-Cpz6WFzh.js
    1634     3750  apps/app/dist/assets/ChangePasswordForm-CDdy_Dlh.js
    1450     3094  apps/app/dist/assets/progress-data-DG6lJQe_.js
    1334     3214  apps/app/dist/assets/useMutation-BDnGQGV2.js
    1062     1914  apps/app/dist/assets/SecurityScreen-DfCVwLT7.js
    1024     1784  apps/app/dist/assets/LoginScreen-5vPVn85C.js
     537      903  apps/app/dist/assets/due-badge-data-CkrPY91e.js
     444     1001  apps/app/dist/assets/auth-CCOqC3YN.js
     425      678  apps/app/dist/assets/AboutScreen-DKnVXbXm.js
     412      670  apps/app/dist/assets/checkin-_dy80Moh.js
```

**复算命令原文**（我实测跑通，输出 `firstscreen_gzip=155540`，可直接嵌进 F-59）：
```bash
sum=0; while read -r ref; do f="apps/app/dist/${ref#./}";
  sum=$((sum+$(gzip -9 -c "$f" | wc -c))); done < <(
  grep -oE '<script type="module"[^>]*src="[^"]*"|<link rel="modulepreload"[^>]*href="[^"]*"' apps/app/dist/index.html \
  | sed 's/.*="//; s/"$//')
echo $sum
```

**观察（不判红，只记账）**：首屏 155540 B 里入口一颗独占全部 js gzip 总量的 78.4%，vite 自己抛了
`(!) Some chunks are larger than 500 kB after minification`；简报 §1 引用的定案分包策略是"入口静态引入 shell + 5 个 tab"，
而实测 5 个 tab 全部是**动态 chunk**（`LookupScreen`/`StudyScreen`/`WordbookScreen`/`ProgressScreen`/`MeScreen` 都在懒加载列里）。
是否算偏离定案，交 TPM 裁（改分包要动 `vite.config.ts`/`router.tsx` = 源文件，本颗不许）。

### 3-③ 门禁复跑（新 dist 不带红）

```
$ node tools/boundaries.mjs --dist     → DIST_EXIT=0
OK   dist-artifact-portability  22 个产物文件（js/css/html）：判据① 0 处以 / 开头的资源路径、判据② 0 处 Chrome84 之后的 API
1/1 条通过，全绿

$ node tools/boundaries.mjs --all      → ALL_EXIT=0
21/21 条通过，全绿
```
**现值 vs 基线**：`--dist 1/1` ✅ 对齐、`--all 21/21` ✅ 对齐；新 dist **没有**把资源路径写法或 Chrome84 之后的 API 带红。
`--all` 里与本颗相关的两条顺记：`route-string-preserved` 仍报"消失 2 条：/api/auth/login, /api/auth/register —— 全部在已登记例外内"（不判红）；
`dist-artifact-portability` 明确只数"22 个产物文件"、**不判新旧**（简报 §1 提醒成立，我没把它的 exit 0 当成产物同步的证据——新旧是靠 §3.0 的 mtime/sha12 与 §3-① 的路由证据立的）。

---

## 4. 件3 —— 构建后回归面

| 命令 | 退出码 | 现值 | 基线（A-104 简报 §1） | 对齐 |
|---|---|---|---|---|
| `pnpm -r typecheck` | **0** | `Scope: 6 of 7 workspace projects`，shared/agent/ui/app/server/web 六包全 `Done`，0 错误 | 六包 0 | ✅ |
| `pnpm -r test` | **0** | **47 files / 1209 passed / 1 skipped / 0 failed** | 47 files / 1209+1skip | ✅ |

分包实测明细（`pnpm -r test`，05:29:04 → 05:29:45）：

```
packages/shared   Test Files 1  Tests 68 passed
packages/agent    Test Files 3  Tests 39 passed
packages/ui       Test Files 3  Tests 168 passed
apps/app          Test Files 18 Tests 472 passed        ← 与基线「App 18 files / 472」逐字一致
packages/server   Test Files 21 Tests 446 passed | 1 skipped
apps/web          Test Files 1  Tests 16 passed
合计              Test Files 47 Tests 1209 passed | 1 skipped | failed 0
```

跑法纪律：只用根命令 `pnpm -r test`（未在任何包内裸跑，避免丢 jsdom 的假红）；
每条命令的退出码都用 `echo "EXIT=$?"` 单独取（不经管道），管道后的统计行才用 `sed` 剥 ANSI。

---

## 5. 件4 —— 「装得上」到底差哪几样（本颗核心取证）

### 5-① SDK / JDK 真实可用路径（实测，给下一步装机直接用）

| 需要的东西 | 本机实测路径 | 状态 |
|---|---|---|
| Android SDK 根 | `E:\android-build\android-sdk` | ✅ 存在（`ANDROID_HOME`/`ANDROID_SDK_ROOT` **均未设**，需显式 export） |
| build-tools | `E:\android-build\android-sdk\build-tools\34.0.0`（唯一版本） | ✅ |
| — `aapt2.exe` | 4566296 B，`aapt2 version` = `Android Asset Packaging Tool (aapt) 2.19-10229193` | ✅ 可执行 |
| — `zipalign.exe` | 817432 B | ✅ 存在 |
| — `lib/d8.jar` | 14929869 B，`com.android.tools.r8.D8 --version` = `D8 8.2.2-dev` | ✅ 可执行 |
| — `lib/apksigner.jar` | 1034092 B，`apksigner --version` = `0.9` | ✅ 可执行 |
| platform | `E:\android-build\android-sdk\platforms\android-34\android.jar` | ✅ 26361808 B |
| platform-tools | `E:\android-build\android-sdk\platform-tools\adb.exe` = `1.0.41 / 37.0.1-15733141` | ✅ 可执行，**但 `adb devices` 空表**（无实机/模拟器） |
| **JDK 17** | `E:\android-build\jdk\jdk-17.0.20.1+1`（`bin/javac.exe`、`java.exe`、`keytool.exe`、`jar.exe` 齐），`java -version` = `openjdk 17.0.20.1 … Microsoft-14940689` | ✅ 可用，但**当前没有指向它** |
| `JAVA_HOME` 现值 | **`D:\program files\java\jdk` = Java `1.8.0_152`（JDK 8）** | ❌ **与简报不符**：简报 §1 说 JAVA_HOME 未设，实测**已设但指向 Java 8** |
| keystore | `mobile-memory/keystore.jks` 2584 B / sha12 `932d517755c3` / mtime 09-16 15:05:33；`keystore-cert.sha256` 1805 B | 只读核对，**未碰** |

⇒ **装机要设的正确值**（我把这两条 export 实测喂给脚本，env 门禁只抱怨口令，说明工具链解析面是通的）：
```bash
export JAVA_HOME='E:/android-build/jdk/jdk-17.0.20.1+1'
export ANDROID_HOME='E:/android-build/android-sdk'      # 或 ANDROID_SDK_ROOT；BT 可用 build-tools/34.0.0
```

### 5-② 缺口令的报错原文（命令与输出都逐字贴）

命令原文：
```
$ APK_KEYSTORE_PASS set? [UNSET]
$ env JAVA_HOME='E:/android-build/jdk/jdk-17.0.20.1+1' ANDROID_HOME='E:/android-build/android-sdk' \
      bash mobile-memory/build-apk.sh --dry-run
```
输出原文（**DRYRUN_EXIT=1**，逐条点名 `APK_KEYSTORE_PASS`）：
```
缺少必需的构建环境变量（本脚本按 B-08 不接受硬编码回退值）：
  - APK_KEYSTORE_PASS（签名 keystore 口令。CI 上由 secret 注入，本地由开发者从仓库外双备份处导出为环境变量。本脚本按 RK-13 不提供默认口令、不自动 keytool 生成新证书）
示例：
  export JAVA_HOME=/path/to/jdk-17
  export ANDROID_HOME=/path/to/android-sdk
  export APK_KEYSTORE_PASS='<从 CI secret / 仓库外备份处取，勿写进任何入库文件>'
  bash mobile-memory/build-apk.sh
```
**判读**：`MISSING` 数组里**只**有口令这一条 ⇒ 给定 JDK17 + SDK 后，`JAVA_HOME`、`ANDROID_HOME` 两样**已齐**；
唯一缺的就是口令。⛔ 未用 `--no-fingerprint`、⛔ 未猜/试口令、⛔ 未 `keytool` 生成证书。

### 5-③ 到签名前一步能走多远 —— **实测：0 步，一行构建都没跑**

这是本颗最重要的**负结论**，简报 §2-件4-③ 的"如果脚本仍然跑完了 ①–⑤"那个假设**不成立**：

`build-apk.sh` 的环境检查在 **line 90–99**（`exit 1`），而 aapt2/javac/d8/assemble/zipalign 是 **line 101 之后**才解析、
line 216 起才在 `DRY_RUN≠1` 分支里执行的。⇒ 口令缺失时脚本**在任何工具解析/任何构建步骤之前**就退了。

实测零写入证明（`--dry-run` 跑完后）：
```
$ diff <运行前 mobile-memory/build 快照> <运行后>   → 无差异
$ find mobile-memory/build -type f -newermt '2026-09-26 05:23:00' | wc -l  → 0
```
所以 `build/apk/app.unsigned.apk` / `app.aligned.apk` **本次没有被新产出**，盘上那两颗仍是 **09-20 00:07:15 的历史件**：

| 文件 | 字节 | mtime | sha12 | 与简报 §0-6 对照 |
|---|---|---|---|---|
| `mobile-memory/build/apk/app.aligned.apk` | 169063 | 2026-09-20 00:07:15 | `2b814f5bfa4c` | 字节 ✅ 与简报值一致，未覆盖 |
| `mobile-memory/build/apk/app.unsigned.apk` | 169060 | 2026-09-20 00:07:15 | `483694ff1cdb` | 字节 ✅，未覆盖 |
| `mobile-memory/build/base.apk` | 162322 | 2026-09-20 00:07:13 | `48a9e29a0938` | 字节 ✅，未覆盖 |
| `mobile-memory/tmword-dev.apk` | 177536 | 2026-09-20 00:07:15 | `052fe3f085e0` | 字节 ✅，未覆盖 |
| `mobile-memory/tmword-dev.apk.idsig` | 5496 | 2026-09-20 00:07:15 | `9a8c328cb231` | 未覆盖 |
| `mobile-memory/明日记忆.apk` | 58691 | 2026-09-18 04:09:52 | `fd4857dbd7a6` | 字节 ✅，未覆盖 |
| `mobile-memory/明日记忆.apk.idsig` | 5496 | 2026-09-18 04:09:52 | `a3bf71218d15` | 简报未列这颗 |
| `mobile-agenda/build/apk/app.aligned.apk` | 126760 | 09-19 14:47:10 | `452dd6c7d69d` | 简报"4 颗"实为 **5 颗** |
| `mobile-agenda/build/apk/app.unsigned.apk` | 126756 | 09-19 14:47:09 | `1049a8f179ee` | 同上 |
| `mobile-agenda/build/base.apk` | 66716 | 09-19 14:47:06 | `e3df0613ffe4` | 同上 |
| `mobile-agenda/明日日程.apk` | 136919 | 09-19 14:47:10 | `a84fd451f4a7` | 同上 |
| `mobile-agenda/明日日程.apk.idsig` | 5497 | 09-19 14:47:10 | `e9d519b6f7a4` | 同上 |

⇒ **盘上 apk/idsig 实为 12 颗，不是简报 §0-6 说的 9 颗**（差在 `.idsig` 与 `mobile-agenda` 计数）；**12 颗全部原样保留，一颗没删、没被覆盖**（前后 sha12 逐颗相同）。
（备份动作仍照 §0-6 做了：`cp -a mobile-memory/build %TEMP%\e5a\pre-build-dir`，结果证明用不上。）

**再加一条装机必须知道的硬事实**（`unzip` 只读探针，未解包到盘）：现盘可安装的 `tmword-dev.apk` 内嵌的**不是 09-23 那份 dist，而是更早一代**：
```
APK 内 assets：index-CxVKGVFf.js(470504 B) / index-DCkrYQ0D.css(35260 B) / ScreenFallback-C0xg2Hh0.js(462 B) / index.html(3087 B)
内嵌入口 gate 数 = 2      （源码/今天新 dist = 3）
内嵌入口 "/register" 串数 = 0   （连 /api/register 都没有）
内嵌入口 raw 470504 B     （今天新 dist 入口 507075 B，差 36571 B）
```
⇒ 「装机只差口令」这个说法要打个折：**口令只解决"签名"那一步**；APK 的产物代际差了两代，
拿到口令后**必须整链重跑** `build-apk.sh`（让它把今天的新 `apps/app/dist` 打进 assets），
而不是"把现有 APK 签一下"。顺带记一个观察（未深查、⛔ 未改）：`build/base.apk` 里的 asset 条目名是
`assets\ScreenFallback-…`（**反斜杠**），而终包 `tmword-dev.apk` 是 `assets/…`（正斜杠）—— Windows aapt 打包的分隔符差异，
对 `file:///android_asset/` 解析是否有影响属装机面风险，见 §6-待裁-4。

### 5-④ Manifest 版本现值（`grep -n`，未改）

```
mobile-memory/AndroidManifest.xml:2  <manifest xmlns:android="http://schemas.android.com/apk/res/android"
mobile-memory/AndroidManifest.xml:3      package="com.tomorrow.memory"
mobile-memory/AndroidManifest.xml:4      android:versionCode="1"
mobile-memory/AndroidManifest.xml:5      android:versionName="1.0.0">
mobile-memory/AndroidManifest.xml:7      <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="34"/>
```
| 键 | 现值 |
|---|---|
| `package` | `com.tomorrow.memory` |
| `versionCode` | **1** |
| `versionName` | **1.0.0** |
| `minSdkVersion` | 26 |
| `targetSdkVersion` | **34**（与本机 SDK 的 `build-tools/34.0.0` + `platforms/android-34` 匹配，装机面无缺口） |

**「装得上」缺口最终清单（三样，按阻塞顺序）**：
1. **`APK_KEYSTORE_PASS` 口令**（唯一硬阻塞；RK-13 禁止自签兜底，只能从 CI secret / 仓库外双备份取原件）。
2. **`JAVA_HOME` 必须重指 JDK 17**（本机现指 Java 8）。⚠ 这条**本颗无法实测**：脚本 line 90 的口令门禁在 line 105 的版本检查**之前**，
   不设口令走不到版本检查；设任何假口令又属"猜口令"禁区。⇒ 结论来自读码（line 103–106 `[ "$JAVA_MAJOR" -ge 17 ] || fail`）+ 两版 `java -version` 实测，**已登记为未实测**（§7）。
3. **无已连接设备/模拟器**（`adb devices` 空表）—— 签好名也装不上去，装机验证还差实机。

---

## 6. 件5 —— 收工两证

### 6-① 完整性复点（真库三颗 + 四颗工具面）

```
$ sha256sum -c %TEMP%\e5a\db-before.sha256        （基线 = 开工 05:23:41 前取）
data.db: OK
data.db-shm: OK
data.db-wal: OK
SHA_CHECK_EXIT=0
```

| 文件 | 预期（简报 §0-4 / §1） | 收工实测 | 判定 |
|---|---|---|---|
| `data.db` | 253952 B / `6595517661cc` / 09-18 04:05:38 | 253952 B / `6595517661cc…` / 09-18 04:05:38 | ✅ 只读 |
| `data.db-shm` | 32768 B / `2bceb8907276` / 09-17 00:53:01 | 32768 B / `2bceb8907276…` / 09-17 00:53:01 | ✅ 只读 |
| `data.db-wal` | **424392 B** / `88ed3fe2b2ce` / 09-18 04:09:16 | 424392 B / `88ed3fe2b2ce…` / 09-18 04:09:16 | ✅ 只读，**wal 未删、未 checkpoint、未读写打开** |
| `tools/boundaries.mjs` | `51570e64c932`（223388 B） | `51570e64c932` / 223388 B | ✅ 我没动它（mtime 03:48:55 = TPM 写 F-59 的时点，早于我开工） |
| `tools/ownership.json` | `74b7b6214b7a` | `74b7b6214b7a` / 120119 B | ✅（mtime 04:42:01 同样早于我开工） |
| `package.json` | 简报未给预期值 | sha12 `5c70b5d21c1d`，mtime **09-19 11:29:26** | ✅ 早于我开工 05:23:41 ⇒ 非我所改（**无开工前基线可比**，见 §7-未实测-5） |
| `vitest.workspace.ts` | 简报未给预期值 | sha12 `82d1aa5d4f6e`，mtime **09-20 01:12:03** | ✅ 同上 |

### 6-② 写盘面归因（`find -newermt '2026-09-26 05:23:00'`）

命令原文：
```bash
find apps packages tools scripts mobile-memory -type f -newermt '2026-09-26 05:23:00' \
  ! -path '*/node_modules/*' ! -path '*/.next/*' ! -path '*/coverage/*' ! -name '*.tsbuildinfo' | sort
```

| 命中面 | 颗数 | 归因 | 允许？ |
|---|---|---|---|
| `apps/app/dist/**` | **22** | 件2 真 `vite build` 产出（20 js + 1 css + 1 html） | ✅ §0-1 允许面 |
| `packages/shared/dist/**` | **80** | 件1 真 `tsc` emit（`dist/src/**` 76 + `dist/test/**` 4） | ✅ §0-1 允许面 |
| **合计** | **102** | — | ✅ **全部在允许面内** |
| `tools/**` / `scripts/**` / `apps/**`（dist 外）/ `packages/**`（shared/dist 外）/ `mobile-memory/**` | **0** | 一颗没写 | — |
| `mobile-memory/build/**` | **0** | dry-run 在 env 门禁就退，未产出任何东西 | ✅（允许但没用上） |

**追加的全仓扫描**（把 `apps packages tools scripts mobile-memory` 五根扩到整仓，防"面外漏报"）：
```
find . -type f -newermt '2026-09-26 05:23:00' (同样剪 node_modules/.next/coverage/*.tsbuildinfo)  → 104 颗
  102 颗 = 上面两颗 dist
  + .delivery/04-adjudications.md  (624656 B, mtime 05:26:17)
  + .delivery/status.json          (151804 B, mtime 05:27:45)
```
⇒ **这 2 颗不是我写的，如实申报**：我全程没有对 `.delivery/` 下除本报告外的任何写动作，
两颗的时间戳落在我跑构建/门禁期间（05:26:17 我正在等 `vite build`，05:27:45 我在跑 `--all`），
文件名正是 TPM 的裁决台账与状态板（简报 §0-1 与 §1 都点明 TPM 正在并发写 F-59/台账，§0-3 也说工作区满是多角色未提交改动）。
本报告 `.delivery/04-dev-report-E5a-dist.md` 写入时刻在两者之后，见本节末。

**收工时刻**：`date` 实测 = **2026-09-26 05:39:11**（本段落盘前的最后一步取值；会话窗 05:23:41 → 05:39:11）。

---

## 7. 待裁 / 未尽 / 未实测（没做到的就写没做到）

### 待裁（需要 TPM 裁，我一颗源码都没顺手改）

1. **简报 §2-件2-① 的判据是伪判据（最该裁的一条）**：`grep -c register … ≥1` 在**旧产物上也成立**
   （旧 26 token / 6 颗命中，新 28 token / 6 颗命中），简报 §1 说的"旧 dist `grep -c register` 0 命中"本机**不可复现**。
   若 F-59 照这条写断言，产物倒回 09-23 那份照样绿。
   ⇒ 建议改用 §3-① 的四指标（`kind:"gate"` == 3、`"/register"` 字面量、ROUTES 那条 gate、chunk 集与 `index.html` 入口名互证）。
   **请裁：F-59 用哪套判据；简报 §1 那句"0 命中"是否需要更正台账。**
2. **`packages/shared/dist` 里 72 颗 09-19 孤儿**（旧 `rootDir:"src"` 布局遗留：`dist/constants/**`、`dist/contracts/**`、`dist/{copy,index,types,utils}.*`）。
   现 tsconfig 永不再写这些路径，`tsc` 也不会删它们。清理要么删 dist 子树（在我允许面内，但**不在任何判据里，且 §0-2 严禁"删掉判据点名的文件"**，我不擅动），
   要么改 `packages/shared/tsconfig.json`（源文件，本颗不许）。⇒ **请裁：本颗是否清、由谁清。**
3. **`@tm/shared` 的 `exports` 全指 `./src/*.ts`，`dist/` 零消费者** ⇒ "重建 shared 产物"对本颗交付的实际价值需裁：
   它是 F-59/门禁的必需项，还是只是盘面卫生？（我照简报做了，exit 0，没造成任何破坏。）
4. **`build/base.apk` 内 asset 名用反斜杠**（`assets/assets\ScreenFallback-C0xg2Hh0.js`）而终包用正斜杠 —— 是否需要装机前修 `build-apk.sh` 的分隔符处理？改它 = 动源文件，超出本颗面。
5. **`JAVA_HOME` 台账值与本机实况不符**：简报 §1 说"未设"，实测**已设为 Java 8**（`D:\program files\java\jdk`）。
   这比"未设"更危险（未设→报 MISSING；已设 8→走 `javac -source 17` 那条路会撞 line 106 的 fail）。⇒ 请更新台账与 CI 说明。
6. **APK 计数**：简报 §0-6 记 9 颗，实测 **12 颗**（`mobile-memory` 7 + `mobile-agenda` 5；差在 `明日记忆.apk.idsig` 与 agenda 的 4→5）。
   12 颗我全留，但台账口径建议同步。
7. **入口 chunk 507075 B 与"分包定案"的关系**（§3-② 末）：定案写"入口静态引入 shell + 5 个 tab"，实测 5 个 tab 全为动态 chunk、入口独占首屏 100%。
   首屏虽达标（155540 B ≤ 250 KB），但若 F-59 还想约束"入口单颗尺寸"，需要动 `vite.config.ts`/`router.tsx` ⇒ 请裁是否另开一颗。

### 未实测（明确做不到，不用"应该没问题"糊）

1. **签名 APK 未产出** —— 本机无 `APK_KEYSTORE_PASS`，按 §0-5 不猜、不自签、不绕。**「装得上」本颗仍是 ❌，我没把它变绿。**
2. **`build-apk.sh` 的 ①–⑤（aapt2/javac/d8/assemble/zipalign）一步都没真跑** —— 口令门禁在 line 90–99，早于所有工具解析；
   `--dry-run` 与真跑在这一点上同命。⇒ "到签名前一步能走多远"的实测答案是 **0 步**（负结论，见 §5-③），
   不是"走了 5 步只差第 6 步"。工具可用性我只能用 `aapt2 version` / `D8 --version` / `apksigner --version` 这类**不产出 APK 的版本探针**旁证。
3. **Java 8 那条失败模式未能实测**（原因见 §5 缺口清单第 2 条：走不到 line 106）。仅静态推断 + `java -version` 双实测。
4. **覆盖安装 / 真机首帧未验证**：`adb devices` 空表，无设备无模拟器；`versionCode` 仍为 1（未 bump，⛔ 我改它），
   与现盘 `tmword-dev.apk`（versionCode 若同为 1）能否覆盖安装，需真机 UAT，本颗**完全未接触**。
5. **`package.json` / `vitest.workspace.ts` 无开工前 sha 基线**（简报只给了 boundaries.mjs 与 ownership.json 的预期值）。
   我只能用"mtime 早于开工 + `-newermt` 全仓扫描 0 命中"反证未改，做不到"逐字复点对齐预期值"。

### 未尽（做了但不算完）

1. 件1 的"新旧 sha12 差异颗数"我给了 32，但**没做**"逐颗 why"归因（例如 `copy.d.ts` 22252→45267 B 我抽查了 `errors.d.ts` 的 89→176 行证明是源码增长，其余 31 颗未逐颗核）。
2. `--all` 里 `password-write-points` 仍写"待 T-06/T-07 落库方法"、`route-string-preserved` 有 2 条已登记例外 —— 我照旧不判红、也未复核其台账正确性。

---

## 8. 出口命令退出码汇总（三条，日志留 `%TEMP%\e5a\logs\`）

| 出口组 | 命令 | 退出码 | 对齐基线 |
|---|---|---|---|
| 1 | `pnpm --filter @tm/shared build` | **0** | 新基线（产物 09-19 → 09-26） |
| 1 | `pnpm --filter @tm/app build` | **0** | 新基线（产物 09-23 → 09-26，带 `/register`） |
| 1 | `node tools/boundaries.mjs --dist` | **0** | `1/1` ✅ |
| 1 | `node tools/boundaries.mjs --all` | **0** | `21/21` ✅ |
| 2 | `pnpm -r typecheck` | **0** | 六包 0 ✅ |
| 2 | `pnpm -r test` | **0** | 47 files / 1209 + 1skip ✅ |
| 取证 | `… bash mobile-memory/build-apk.sh --dry-run`（无口令） | **1** | 预期 1 ✅（点名 `APK_KEYSTORE_PASS`） |
| 3 | `sha256sum -c`（真库三颗） | **0** | 三颗全 OK ✅ |

日志件（全部在 `C:\Users\曹怡明\AppData\Local\Temp\e5a\logs\`，另有 ASCII 镜像 `C:\temp\e5a\logs\` 供 python 侧读取）：
`shared-dist-{before,after}.txt`、`shared-dist-hashes-{before,after}.txt`、`shared-build.log`、
`app-dist-{before,after}.txt`、`app-dist-hashes-{before,after}.txt`、`app-build.log`、
`register-evidence-before.txt`、`register-route-proof.txt`、`app-register-after.txt`、
`firstscreen-gzip.txt`、`boundaries-dist.log`、`boundaries-all.log`、`typecheck.log`、`test-root.log`、
`apk-inventory.txt`、`apk-inventory-agenda.txt`、`apk-unchanged-check.txt`、`apk-assets-listing.txt`、`apk-embedded-dist-check.txt`、
`toolchain-inventory.txt`、`dryrun-no-pass.log`、`dryrun-A.log`、`manifest-versions.txt`、
`integrity-check.txt`、`newermt-raw.txt`、`newermt-repowide.txt`、`build-{before,after}-dryrun.txt`、`db-before.sha256`。
旧 dist 整颗备份：`C:\Users\曹怡明\AppData\Local\Temp\e5a\pre-app-dist\`（22 颗）；`mobile-memory/build` 运行前副本：`…\e5a\pre-build-dir\`。
