# 开发报告 · T-20（移动端 · **第一轮：只做构建链**）

> 口径：依 `04-adjudications.md` **A-31**（域任务拆两轮、报告优先级高于第二个用例）与简报要求，本轮只交
> **可复现的已签名 APK 构建链 + 无泄密脚本 + 签名指纹基线**。
> 通知 / AlarmManager / 小组件 / Caddyfile CORS / `version-manifest.mjs` / `app.js` hotfix **不在本轮**（清单见 §6）。
> 本报告所有输出为**真跑粘贴**（Git Bash / Windows，2026-09-19 深夜 → 09-20 凌晨）；口令字面量**全文 0 处**。

## 1. 完成清单

| 交付物（简报清单） | 状态 | 文件 | 备注 |
|---|---|---|---|
| 一条命令产出已签名可安装 APK（R-17③） | **done（本机仓库内跑通；"干净克隆"那一半被两个入库缺口卡住 → §3 判据① + §5 越界申请）** | `mobile-memory/build-apk.sh`（58 → **300 行**） | 工具链与口令全走环境变量；删掉 `keytool -genkeypair` 自签兜底；前置 `pnpm --filter @tm/app build` + `dist → build/assets`；产物 `tmword-<版本>.apk` + sha256；`--dry-run/--assets/--out/--skip-app-build/--no-fingerprint` |
| 组装脚本无泄密化 | done | `mobile-memory/scripts/assemble_apk.py`（16 → **90 行**） | 位置参数顺序与旧版逐字兼容（`base / dex… / out`，dex 变长）；新增"base.apk 必含 AndroidManifest.xml + resources.arsc""dex 魔数校验""产出 zip 完整性与条目不丢""resources.arsc 仍为 STORED"四道自检，任一不过 exit 1 |
| 签名证书 SHA-256 指纹基线（RK-13） | done | `mobile-memory/keystore-cert.sha256`（🆕 24 行） | 值 = `a359eb1397551ad8c59a7c7d55e5d93d0204280f76155bcade4314d3acca123c`，**两条独立来源一致**（keystore 内证书 + 现网已签名 `明日记忆.apk` 的 apksigner 输出）→ 非机密，不含私钥/口令 |
| `setDomStorageEnabled(true)` 一处 | **未改动（如实）：该行自 HEAD 起已在 `MainActivity.java:30`，本轮零 diff** | `mobile-memory/src/com/tomorrow/memory/MainActivity.java` | 改为**构建期机检**（`check_dom_storage()`，缺失即 fail），并在 §3 判据③ 登记为待裁决点（字面要求"在 diff 中可见"在本仓库今天不可能成立） |
| 构建后指纹比对，不一致 exit 1（判据⑨） | done | `mobile-memory/scripts/fingerprint.mjs`（🆕 202 行） | 跑 `apksigner verify --print-certs` → 归一化（大小写/冒号不敏感）与基线**集合全等**；`--print-keystore` 只读打印（**不写文件、不生成密钥**）；一律 fail-closed（不一致与环境缺失同为 exit 1） |
| 移植 CDP GUI 测试台 | done（**驱动器已跑通**，场景 JSON 留下一轮） | `mobile-memory/tests/gui-cdp.mjs`（🆕 193 行，母本 142 行） | 逐步语义一字未改；差异只有三处：参数全走环境变量（`CHROME/GUI_CDP_PORT/SHOT_PREFIX/VIEWPORT_W/H/GUI_OUT_DIR`）、缺 Chrome/缺 scenario 参数时明确报错、**R-34③ 失败时先抓 `*_FAIL_stepN_*.png` 再抛错** |

禁触面自查：`apps/app/src/**`、`packages/**`、`apps/{web,app}/**`、`tools/**`、`mobile-agenda/**` 源码、`Caddyfile`、`assets/**`、`app.js`、`AndroidManifest.xml`、`res/**` **一律未改**；未新建分支、未 commit、未 checkout；`data.db` 零写。

## 2. 本轮用到的盘面事实（供后续 agent 少烧轮次）

> 口径说明：B-08 / 判据② 的机检对象是**入库脚本**（`build-apk.sh`、`scripts/*.py`、`scripts/fingerprint.mjs`、
> `tests/gui-cdp.mjs`、`keystore-cert.sha256`）→ 那里 0 命中。本节写的是**本机环境事实**（测试与 CI 需要
> `export` 成什么），不是入库文件里的硬编码路径；口令字面量本文全文 0 处。

- 工具链在本机**齐**（但全部在仓库外，只能靠环境变量指认）：SDK `E:/android-build/android-sdk`（`build-tools/34.0.0` + `platforms/android-34` + `platform-tools/adb.exe`）、JDK 17 `E:/android-build/jdk/jdk-17.0.20.1+1`。
- 本机 **`JAVA_HOME` 默认指向 JDK 1.8.0_152**（`D:/program files/java/jdk`）→ 不满足构建（`javac -source 17` 会红，且 JDK 8 的 keytool 读不了 PKCS12 的 `keystore.jks`）。新脚本因此加了 JDK 版本前置检查，报人话而不是丢一串深红。
- `mobile-memory/keystore.jks` 是 **PKCS12**、别名 `agenda`、证书 `CN=Tomorrow Agenda`、序列号 `15b722d52c7cf7c9`、有效期 2026-09-16 → 2054-02-01。
- `apps/app/dist`（T-14 产物）已在盘：`index.html` 3087B + `assets/` 3 文件（约 504KB）；`index.html` 内资源引用全部是 `./assets/…`（无 `/` 开头）→ R-17① 前提成立。

## 3. 判据自查（本轮只要求 ①②③⑨ + ⑧ 登记）

### 判据② 脚本内 0 命中 `E:/android-build` 与明文口令（B-08）—— **通过**

```
$ grep -nE "E:/android-build|<口令字面量>" mobile-memory/build-apk.sh mobile-memory/scripts/assemble_apk.py \
      mobile-memory/scripts/fingerprint.mjs mobile-memory/tests/gui-cdp.mjs mobile-memory/keystore-cert.sha256
GREP_EXIT=1 (1 = 零命中)
```
> `<口令字面量>` = 现 keystore 的明文口令，实际执行时打的就是那串字面量本身；按 B-08 它不出现在本报告里
> （本报告自身也纳入下面的复核）。复核在红掉之后重跑，真实输出：

```
$ grep -rnI --exclude-dir=build "<口令字面量>" mobile-memory/ ; echo EXIT=$?
EXIT=1                      # 本轮 6 个交付物 + mobile-memory 全目录 0 命中
$ grep -c "<口令字面量>" .delivery/04-dev-report-T-20.md
0                           # 本报告自身（本行写完之后再复核一次）
$ grep -rnI --exclude-dir=build "E:/android-build" mobile-memory/ ; echo EXIT=$?
EXIT=1                      # 无仓库外绝对路径
$ grep -c "<口令字面量>" mobile-memory/build-apk.sh …/assemble_apk.py …/fingerprint.mjs …/tests/gui-cdp.mjs …/keystore-cert.sha256
build-apk.sh:0  assemble_apk.py:0  fingerprint.mjs:0  gui-cdp.mjs:0  keystore-cert.sha256:0
```

全库扫（`grep -rnI --exclude-dir={node_modules,.git,dist,build,.next} <两个字面量> .`）在 `mobile-memory/` 之外仍有 4 处命中，**都不在本轮可写面内**，如实列出以免下一轮误判为"已清零"：

| 命中文件 | 谁的面 | 说明 |
|---|---|---|
| `.delivery/00-tech-audit.md:59` | TPM/审计 | B-08 条目正文**引用**了该口令来描述问题，不是可用性泄密之外的新泄漏；是否隐去请 TPM 定 |
| `.delivery/02-tech-design.md:607,857` | TPM/设计 | 同上，是"删除脚本内明文口令"这条要求本身的表述 |
| `mobile-agenda/build-apk.sh:49,51,53` | 另一项目（禁触面，只读） | 旧手写日程 App 的构建脚本仍明文 `pass:<口令>`；判据② 只管 `mobile-memory`，未越界去改 |
| `mobile-agenda/docs/TEST-REPORT.md:138` | 另一项目（只读） | 该问题在对方报告里已登记 |
口令缺失时**明确失败并打印需要什么**（不静默用默认值）——真实退出码：
```
$ env -u APK_KEYSTORE_PASS JAVA_HOME=… ANDROID_HOME=… bash mobile-memory/build-apk.sh --dry-run
缺少必需的构建环境变量（本脚本按 B-08 不接受硬编码回退值）：
  - APK_KEYSTORE_PASS（签名 keystore 口令。CI 上由 secret 注入，本地由开发者从仓库外双备份处导出为环境变量。本脚本按 RK-13 不提供默认口令、不自动 keytool 生成新证书）
示例：
  export JAVA_HOME=/path/to/jdk-17
  export ANDROID_HOME=/path/to/android-sdk
  export APK_KEYSTORE_PASS='<从 CI secret / 仓库外备份处取，勿写进任何入库文件>'
  bash mobile-memory/build-apk.sh
EXIT=1
```
三个环境变量全缺时**一次报全**（`- JAVA_HOME… - ANDROID_HOME 或 ANDROID_SDK_ROOT… - APK_KEYSTORE_PASS…`，同样 exit 1）。
签名调用形态是 `--ks-pass env:APK_KEYSTORE_PASS --key-pass env:APK_KEYSTORE_PASS`（apksigner 原生支持 `env:`），基线读取用 `keytool -storepass:env` → **口令不落命令行、不落日志、不落任何入库文件**。
RK-13 侧：脚本内已无 `-genkeypair`（`grep -nE "genkeypair|-genkey"` → 0 命中），`keytool` 一词只出现在注释与"严禁自签"的报错文案里。

### 判据③ `setDomStorageEnabled(true)` —— **实质满足，字面不成立（登记待裁决）**

- 实况：`mobile-memory/src/com/tomorrow/memory/MainActivity.java:30` 就是 `s.setDomStorageEnabled(true);`，且**该文件在 HEAD 里已经是这一行**（`git show HEAD:mobile-memory/src/com/tomorrow/memory/MainActivity.java | grep -n setDomStorage` → `30:        s.setDomStorageEnabled(true);`）。
- 所以简报里"✏️ MainActivity.java 仅这一处"与判据③"在 diff 中可见"**互相矛盾**：为了造出 diff 而重复写一遍这行是伪改动，我不做。本轮该文件**零改动**。
- 替代取证（机检，不依赖人眼看 diff）：`build-apk.sh` 在编译前跑 `check_dom_storage()`，源码里没有这一句就 `exit 1`：
```
$ bash mobile-memory/build-apk.sh --dry-run
  DOM storage 检查通过：30行
```
- 反向证据（产物侧）：CDP 驱动器在打包产物的页面里实测 `localStorage` 可写可读 → `hasLocalStorage: true`（见 §4 第三段）。

### 判据⑨ 指纹比对 —— **通过（含疫苗）**

`build-apk.sh` 第 6 步之后自动比对；不一致即 `exit 1`（脚本内 `|| fail "签名证书指纹与 keystore-cert.sha256 基线不一致 —— 按 RK-13 禁止发布与挂直链…"`）。

正例（本轮真跑的构建尾部输出）：
```
Signer #1 certificate SHA-256 digest: a359eb1397551ad8c59a7c7d55e5d93d0204280f76155bcade4314d3acca123c
[指纹比对 RK-13 / 判据⑨]
APK      : E:\CC\tomorrow-memory\mobile-memory\tmword-dev.apk
基线     : E:\CC\tomorrow-memory\mobile-memory\keystore-cert.sha256
签名者数 : 1（基线登记 1）
  Signer #1 certificate DN: CN=Tomorrow Agenda
  实际指纹 SHA-256 = a359eb1397551ad8c59a7c7d55e5d93d0204280f76155bcade4314d3acca123c
  基线指纹 SHA-256 = a359eb1397551ad8c59a7c7d55e5d93d0204280f76155bcade4314d3acca123c
✓ 证书指纹与基线一致（沿用同一把签名密钥，存量用户可覆盖安装）。
```
疫苗（错误基线放在系统临时目录，不入库）：
```
$ node scripts/fingerprint.mjs --apk 明日记忆.apk --baseline "$TEMP/wrong-baseline.sha256"
签名证书指纹与基线**不一致** —— 按 RK-13 立即停止发布：禁止挂直链、禁止把该包推给用户。
  基线里没有的签名者：a359eb1397551ad8c59a7c7d55e5d93d0204280f76155bcade4314d3acca123c
  基线里有但产物里没有的：0000000000000000000000000000000000000000000000000000000000000000
  处置：人工找回原 keystore 后重跑；**不要**用新证书再生成一份基线来"对齐"。
EXIT=1
```
**keystore 硬约束自查（严禁重建/换密码/另存副本）**：
- 未跑过任何 `keytool -genkeypair`；未改口令；未新增任何 keystore 副本（`git status --short mobile-memory/` 里除我 6 个文件外无新增 `.jks`）。
- 原件未被触碰（blob 逐字节相同）：
```
HEAD blob : 4b0746949e50099b34087d9f3d192d916b5aa83c
worktree  : 4b0746949e50099b34087d9f3d192d916b5aa83c     ← 相等
```
- 基线与现 keystore **对得上**（两个独立来源一致）→ 按硬约束无需停下报告；顺带证明"现网那批已安装用户手上的签名 = 仓库里这把 = 基线"。

### 判据① 干净克隆一条命令产出已签名可安装 APK —— **部分通过（本机全绿；克隆面被两处入库缺口卡住）**

**(a) 本仓库内一条命令 → 已签名 APK（真跑，全绿）**
```
$ bash mobile-memory/build-apk.sh        # JAVA_HOME/ANDROID_HOME/APK_KEYSTORE_PASS 由环境给出
  DOM storage 检查通过：30行
[0/6] 前端产物已在（/e/CC/tomorrow-memory/apps/app/dist）——跳过重复构建
  assets 已staged：4 个文件（源：E:/CC/tomorrow-memory/apps/app/dist）
[1/6] aapt2 编译资源 + 链接（含 assets 与 manifest）
[2/6] javac 编译 Java 源码
[3/6] d8 转 dex
[4/6] 组装未对齐 APK（追加 classes.dex；resources.arsc 保持 STORED）
assembled build/apk/app.unsigned.apk（15 个原条目 + 1 个 dex）
[5/6] zipalign
[6/6] 签名（口令经 env: 传入，不出现在命令行明文与任何入库文件里）
…（指纹比对见判据⑨）…
构建完成：E:/CC/tomorrow-memory/mobile-memory/tmword-dev.apk
  sha256 = 29c547d76ca3e8618fc1355ce27e5f0770a59e49008c7985784f1307c557a64e
PIPE_EXIT=0
```
**"可安装"的机器判据（无设备能做到的部分全做了）**：
```
$ zipalign -c -p 4 tmword-dev.apk            → ZIPALIGN_CHECK_EXIT=0
$ apksigner verify tmword-dev.apk            → VERIFY_EXIT=0
$ aapt2 dump badging tmword-dev.apk
package: name='com.tomorrow.memory' versionCode='1' versionName='1.0.0' compileSdkVersion='34'
uses-permission: name='android.permission.INTERNET'
application-label:'明日记忆'
launchable-activity: name='com.tomorrow.memory.MainActivity'
$ python -c "…列 APK 条目…"      → assets/index.html + assets/assets/{index-*.js,index-*.css,ScreenFallback-*.js}
  + classes.dex + META-INF/AGENDA.{SF,RSA} + resources.arsc(compress_type=0 即 STORED)
```
产物里打包的是 **T-14 的 React dist**（4 个文件），不是 legacy 手写 assets —— 这一点用条目清单证明，不靠嘴说。

**(b) 克隆面：`git archive HEAD mobile-memory` 展到临时目录 + 拷入我本轮 6 个文件 + 复用已构建 dist → 跑构建**
- 第一次跑**红**在 aapt2：
```
AndroidManifest.xml:11: error: resource mipmap/ic_launcher (aka com.tomorrow.memory:mipmap/ic_launcher) not found.
error: failed processing manifest.
```
- 归因：**启动器图标 5 个 PNG 不在版本库里**（与 D-01 同一类事故，T-01 的反向纳入只补了 `build-apk.sh` 与 `scripts/`）：
```
$ git check-ignore -v mobile-memory/res/mipmap-hdpi/ic_launcher.png
.gitignore:38:*.png     mobile-memory/res/mipmap-hdpi/ic_launcher.png
$ git ls-files mobile-memory/res/        → 只有 6 个 .xml，**没有任何 mipmap**
```
- 把 5 个 `mipmap-*` 补进那份克隆骨架后**同一条命令全绿**，证明"缺的就只有这 5 个文件"：
```
构建完成：C:/Users/…/cleanclone/mobile-memory/tmword-dev.apk
✓ 证书指纹与基线一致
  sha256 = bbac7e32d1f42f5c59ad3ddae4370a476fbe90a8753cba4326dc3ddad3d5436b
PIPE_EXIT=0
```
- 第二个克隆面缺口（已知、`04-adjudications.md`「待观察」第 1 条已记）：**`build-apk.sh` 与 `scripts/assemble_apk.py` 至今只是 `git add` 进索引、未 commit**（`git status` 显示 `AM`，`git archive HEAD` 的输出里根本没有 `scripts/`）→ 今天任何人 `git clone` 都拿不到打包脚本。修法在 TPM 手上（我不做 git 写操作）。
- 附带事实：**三次构建的 sha256 互不相同**（`29c547d7…` / `bbac7e32…` / 最后一次改动脚本注释后重跑的 `052fe3f085e03ba9c071567a5bab31011daa4c708d82083c06023d9426c473fd`）→ 这条链是"**可复现的构建链**"，**不是**逐字节可复现产物（aapt2/签名时间戳未固定）。判据① 未要求 bit-reproducible，我不越级声称；登记在 §7。
- 最后一次全绿重跑（脚本编码修复后，仓库内，真实粘贴）：
```
$ bash mobile-memory/build-apk.sh
✓ 证书指纹与基线一致（沿用同一把签名密钥，存量用户可覆盖安装）。
-rw-r--r-- 1 … 177536 Sep 20 00:07 E:/CC/tomorrow-memory/mobile-memory/tmword-dev.apk
构建完成：E:/CC/tomorrow-memory/mobile-memory/tmword-dev.apk
  sha256 = 052fe3f085e03ba9c071567a5bab31011daa4c708d82083c06023d9426c473fd
PIPE_EXIT=0
```

### 判据⑧ CORS / `file://` —— **登记待办（本轮不动 `Caddyfile`，不在简报清单内）**

实况（只读取证，供下一轮直接开工）：
- `Caddyfile`（46 行）**通篇没有任何 CORS 指令**，`header` 段只有 CSP/XFO/HSTS 等安全头 → 审计 C-16 说的"`*`"**不在 Caddy 层，在服务层**：
  - `packages/server/src/config.ts:120`：`corsOrigin: str('CORS_ORIGIN', '*')`（**默认值就是 `*`**）
  - `packages/server/src/app.ts:99-100`：`app.use('*', cors(corsOrigins[0] === '*' ? {} : { origin: corsOrigins }))`
- 所以判据⑧"`file://`（`Origin: null`）请求 `https://tmword.xyz` 成功"要**两处同时改**：① 服务端 `CORS_ORIGIN` 生产值显式列白名单且**含字面量 `null`**（架构 §5.6 已定口径：`https://tmword.xyz, https://www.tmword.xyz, null`，`null` 只能配 `credentials:false`，本期 token 走 Header 故可接受）；② `Caddyfile` 若继续放行 `Access-Control-Allow-Origin: *` 会与后端白名单**叠加冲突**（两个 ACAO 头 = 浏览器直接判失败），故 Caddy 侧要么不加 ACAO、要么用 `header_down` 只透传。
- `app.ts`/`config.ts` 归 T-07，`Caddyfile` 归 T-20 下一轮 → 本轮**一行未改**，仅登记。

### 其余判据（④⑤⑥⑦）本轮不做，状态照实

| 判据 | 本轮状态 |
|---|---|
| ④ 真机 2 台冷启动无 `ReferenceError` + 查词→背词→同步 | **未做**（无设备，见 §5） |
| ⑤ 通知到点可达/文案/N=0 不发/点按直达 `#/study`/关开关 24h | **未做**（`ReminderScheduler`/`ReminderReceiver`/`BootReceiver` 未写，下轮） |
| ⑥ 小组件今日待背数 + 进度条 + 点按聚焦 | **未做**（`SearchWidget.java` 与 `res/**` 未动，下轮） |
| ⑦ 旧手写 hotfix APK 覆盖安装 | **未做**（分支与 `app.js:994` hotfix 由 TPM 处理，Q6 定案；我只补了事实：见 §7） |

## 4. 冒烟命令与结果

§10.2 T-20 行的冒烟命令**逐字拆三段**跑（第三段需设备）：

| 命令 | 结果 |
|---|---|
| `bash mobile-memory/build-apk.sh` | **绿**（全文见 §3 判据①(a)，`PIPE_EXIT=0`，产物 177536B） |
| `"$JAVA_HOME/bin/java" -jar "$BT/lib/apksigner.jar" verify mobile-memory/tmword-dev.apk` | **绿**：无输出、`VERIFY_EXIT=0`（`--print-certs` 变体见判据⑨） |
| `adb -s <serial> shell dumpsys package com.tomorrow.memory \| grep versionName` | **未跑通 —— 无设备**：`adb devices` → `List of devices attached`（空表，`ADB_EXIT=0`）。需人工/需设备 |

移植件 `tests/gui-cdp.mjs` 的驱动器**真跑**（服务打包进 APK 的那份产物，不是 legacy assets）：
```
$ python -m http.server 8645 --bind 127.0.0.1 --directory build/assets &
$ GUI_OUT_DIR="$TEMP/t20-shots" SHOT_PREFIX=t20smoke node tests/gui-cdp.mjs "$TEMP/t20-smoke.json"
--- 冷启动冒烟：产物是否可加载 ---
  => {"title":"明日记忆","rootChildren":-1,"scriptSrcs":["./assets/index-CxVKGVFf.js"],
      "cssHref":["./assets/index-DCkrYQ0D.css"],"hasLocalStorage":true}
[shot] coldstart → C:\Users\…\Temp\t20-shots\t20smoke_coldstart.png（105856B）
EXIT=0
```
读数解释（如实）：`title`/`scriptSrcs`/`cssHref` 证明 **APK 内产物能被 http 侧加载且资源引用是相对路径**（`file://` 前提）；`hasLocalStorage:true` 是判据③ 的运行时侧证。`rootChildren:-1` **不是崩溃**——React 挂载点 id 是 `app`（`grep -o 'id="[a-zA-Z-]*"' apps/app/dist/index.html` → `id="app"`），我的冒烟表达式写的是 `#root`。**挂载是否真的成功、首屏是否有内容，本轮未断言**（属判据④，需真机 + 场景 JSON，下一轮补）。

## 5. 未验证项（一律标"需人工/需设备"，不猜）

| 项 | 为什么没验 | 谁/何时验 |
|---|---|---|
| 真机安装与冷启动（原生安卓 1 台 + 小米 1 台） | 本机 `adb devices` 空表 | **需设备 + 需人工**；PRD §8.2-10 明确"模拟器与 CI 产物不能替代签字" |
| `dumpsys package … versionName` | 同上 | 需设备 |
| 覆盖安装是否成功（同签名升级） | 需真机上先有旧版本 | 需设备；签名侧已由判据⑨ 提前兜住 |
| 小米自启动/省电白名单引导、`POST_NOTIFICATIONS`、`SCHEDULE_EXACT_ALARM` | 通知代码本轮未写 | 下轮 + 需设备 |
| 小组件今日待背数与点按聚焦 | 本轮未写 `SearchWidget`/`res` | 下轮 + 需设备 |
| `file://` 真请求 `https://tmword.xyz`（判据⑧） | CORS 两处未改 + 需真机 WebView | 下轮（Caddyfile）+ T-07（`CORS_ORIGIN` 生产值）+ 需设备 |
| 首页可交互 ≤2s（R-17⑥）、按路由分包 | 未测 | 需设备（或 CDP 场景 + 网络节流，下一轮） |
| 构建 bit-reproducible | 已知不成立（三次 sha256 互不相同） | 本轮不主张；若 QA 要 bit 级需单列需求 |
| APK 内容"是不是 React 版"的**运行**判据 | 本轮只做了条目清单级证明 | 下一轮场景 JSON 里断言 `#app` 有子节点 |

## 6. 下一轮待办清单（T-20 第二轮，按可直接开工的粒度写）

1. `src/com/tomorrow/memory/ReminderScheduler.java` 🆕 + `ReminderReceiver.java` 🆕 + `BootReceiver.java` 🆕
   （R-21①②③⑤⑦：默认 20:30、可整体关闭、文案固定"今天还有 N 个词要背"、N=0 不发、关开关=**取消 alarm 而非忽略**、API 26~30 `setInexactRepeating`+开机重排、API 31+ `setExactAndAllowWhileIdle` 且未授予 `SCHEDULE_EXACT_ALARM` 时退化 inexact + 提示）
2. `WidgetUpdateReceiver.java` 🆕 + `SearchWidget.java` ✏️ + `res/xml/search_widget.xml`/布局/`res/drawable/ic_stat_*` ✏️
   （R-21⑥/R-20③：今日待背数 + 进度条；未登录/无数据显示"登录后可见今日词单"；`PendingIntent` = `MainActivity` + `ACTION_LOOKUP_FOCUS`；**不引入 WorkManager**，§5.6 已定"AlarmReceiver 顺带 updateAppWidget"）
3. `MainActivity.java` ✏️（§5.6 表的 ①~⑤：`setAllowFileAccess(true)`+`setCacheMode(LOAD_DEFAULT)`、`onNewIntent` 处理 `ACTION_LOOKUP_FOCUS`、`onResume` → `__app.onForeground()`、通知点击 `open=#/study`、`onBackPressed` 先问 `__router.canGoBack()`）+ 内联 `Bridge` 新增 `saveTempToken/readTempToken/setLaunchFocus/getAppVersion/clearToken`（**旧三个方法签名字节码不动**）
4. `AndroidManifest.xml` ✏️：`+POST_NOTIFICATIONS`、`+RECEIVE_BOOT_COMPLETED`、`+SCHEDULE_EXACT_ALARM`、`+<receiver .BootReceiver>`、`versionCode 1→2`、`versionName 1.0.0→2.0.0`（与直链版本号 = tag 一致，R-17⑧）
5. `Caddyfile` ✏️ CORS 段（判据⑧）+ 与服务端 `CORS_ORIGIN` 生产值对齐（**防两个 ACAO 头叠加**）；`packages/server/src/{app,config}.ts` 由 T-07 改，我要提需求不走后门
6. `scripts/version-manifest.mjs` 🆕 + `GET /api/version` 对接（R-17⑨：App 内"有新版本"可关闭且 24h 不再提示；`version.json` 版本号 = git tag，与 T-22 的 apk job 共用同一份 tag 口径）
7. `tests/gui-cdp.mjs` 的**场景 JSON** 与用例集（R-34②：四坑逐条一条用例；§8.3-B/C 机器可判定项）+ 失败截图产物归档
8. `build-apk.sh` 与 CI 的接线口（T-22）：`GIT_TAG` → 产物名与 sha256、`APK_KEYSTORE/APK_KEYSTORE_PASS` secret 注入、指纹比对已是 CI 闸门（本轮交付）、`--out 明日记忆.apk` 供分发名
9. 若下一轮要"新 APK 装不上时回退"：legacy 分支的 hotfix APK 用**同一条链**跑 `--assets mobile-memory/assets --out <hotfix 名>`（我已把 assets 来源参数化，无需再改脚本；但**必须**仍是同一 keystore，判据⑦/§8.3-D 21/22）

## 7. 越界申请 / 契约偏差 / 待裁决点

**越界申请（3 条，全部是"本轮不做判据① 就闭不掉"的入库动作，我无权执行）**
1. `.gitignore:38` 的 `*.png` 误伤 `mobile-memory/res/mipmap-*/ic_launcher.png` → 5 个启动图标不在版本库，干净克隆**必然**在 aapt2 步骤红。`.gitignore` 归 T-01（§10.3），请由其加 3 行反向纳入（`!mobile-memory/res/` + `!mobile-memory/res/**` 或按目录逐条 `!mobile-memory/res/mipmap-*/ic_launcher.png`）并一次性 `git add -f`。**修法与 D-01/T-01 那次完全同构。**
2. `mobile-memory/build-apk.sh` 与 `mobile-memory/scripts/assemble_apk.py` 至今**只在索引里**（`AM`，见「待观察」第 1 条"不得由任何 agent 自行 commit"）→ 请由 TPM 在出口轮 commit。**注意本轮我又把这两个文件改了**（工作区内容 ≠ 索引内容），commit 前需以工作区为准重新 `git add`。
3. 建议 `.gitignore` 增加 `mobile-memory/tmword-*.apk` 与 `.apk.idsig`（产物走 CI artifact/直链，不进版本库）。现状：这两个文件在我工作区是 `??` 未跟踪，我没有删（判据取证物）。

**待裁决点**
- **A（判据③ 字面 vs 事实）**：见 §3 判据③。请选择：接受"现网已满足 + 构建期机检 + 运行时侧证"作为判据③ 的证据；或让架构把判据③ 措辞改为"`setDomStorageEnabled(true)` 在源码与产物中生效且有机检"。我倾向后者（原措辞在"旧壳早就开了 DOM storage"这个事实上必然为假）。
- **B（RK-13 的"仓库外双备份"）**：PRD §9-6 要求"PM/运维确认存放位置与访问人"，至今无人给。我能证明的只有"仓库内这份 = 现网 APK 签名 = 基线"。若线上真实发布走 CI secret，请确认 secret 里那份与仓库这份是**同一个 blob**（`4b074694…`），否则 CI 产物会被判据⑨ 拦下——这是设计意图，但会表现为"CI 突然红"。
- **C（legacy hotfix 的技术口径，给 TPM 的 Q6 执行参考）**：`assets/app.js` 实测 1015 行，`renderRecent()` **只有第 994 行 1 处调用、全文无定义**（文件里 10 个 `function render*` 中不含它）→ 崩溃是**必然**的（`init()` 里就抛）。"最小 hotfix"因此有两个版本：删掉 `:994` 的调用（零新行为，真"最小"）或补一个最近查询渲染函数（是新功能）。简报说"最小 hotfix"，按字面应取**删调用**；但决定权在 Q6 的 owner（TPM），我不动 `app.js`。
- **D（分发名）**：R-17⑧ 要 `明日记忆.apk`，§10.2 冒烟命令与 §5.6⑤ 要 `tmword-<tag>.apk`。我按**默认 `tmword-dev.apk`（与冒烟命令逐字一致）+ CI 用 `--out` 指定分发名**实现，两个口径都保住；如需默认就叫 `明日记忆.apk`，请裁决——注意那会覆盖工作区里那份**未提交的** legacy 手写版产物（我没碰它，mtime 仍是 09-18 04:09 / 58691B）。

**契约偏差**：无（本轮不碰任何接口契约；`GET /api/version` 的对接留下一轮，届时按 T-07 已交付的形状消费，不改形状）。

## 8. 盘面数字对账表（A-32-9 口径：简报数字 vs 实测，逐条归因）

| # | 简报/文档口径 | 我实测 | 归因 |
|---|---|---|---|
| 1 | T-20 在 `02-tech-design.md` 第 857 行 | **857 行**（表格单行，判据 ①~⑨ 共 9 条） | 一致 |
| 2 | 本轮交付 6 件 | 6 件全部落盘，其中 **5 件有实际改动**（`MainActivity.java` 零改动，理由见判据③） | 一致（差异已申报，不是漏做） |
| 3 | 本轮只要求判据 ①②③⑨ + ⑧ 登记 | ②⑨ **通过**；① **部分通过**（本机全绿、克隆面 2 个入库缺口）；③ **实质通过/字面不成立**；⑧ 已登记 | 见 §3 |
| 4 | `mobile-memory` 旧构建脚本 58 行 / `assemble_apk.py` 16 行 | 300 行 / 90 行 | 新增的是"环境变量解析 + 缺失即报 + dist staging + 自检 + 签名口令 env: + 指纹比对 + sha256"，无功能膨胀 |
| 5 | 移植母本 `mobile-agenda/tests/gui-cdp.mjs`（142 行） | 193 行（+51） | 增量只有"参数化校验 + 失败截图(R-34③) + 用法注释"；步骤执行器逐字未改 |
| 6 | PRD R-20⑦：`assets/app.js` 1015 行、`app.js:994` | **1015 行**、**第 994 行**且全文唯一 | 一致（顺带发现"无定义"→ 见待裁决 C） |
| 7 | §5.6：manifest 目标 `versionCode 2 / versionName 2.0.0` | 现仍是 **1 / 1.0.0**（`aapt2 dump badging` 实测） | `AndroidManifest.xml` 不在本轮清单 → 下一轮第 4 项 |
| 8 | 现网产物 `明日记忆.apk` | 58691B、mtime 2026-09-18 04:09、**未被我改动**；新产物 `tmword-dev.apk` 177536B | 两者共存，我没有覆盖任何未提交产物 |
| 9 | 签名基线 | 一个值 `a359eb13…acca123c`，两源一致；keystore blob `4b074694…` HEAD=worktree | RK-13 硬约束达成 |
| 10 | T-14 产物（简报"只消费它的 dist"） | `dist/index.html` 3087B + 3 个 assets，全部 `./` 相对引用；挂载点 `#app` | 一致（`rootChildren:-1` 的误读已在 §4 更正） |

## 9. 给测试（Phase 5）的提示

- **本轮唯一可信的自动化面**是"构建链 + 签名指纹"，不是 App 功能：`bash mobile-memory/build-apk.sh` 绿 + `fingerprint.mjs` 绿 = 构建链与密钥没被换；**这不等于 App 能跑**（判据④⑤⑥⑦ 本轮未做，别当成已交付）。
- 重点回归位：
  1. **谁把 `keystore-cert.sha256` 改了都必须红**（疫苗已跑：错基线 → exit 1）。CI 接上后请把它当发布门禁而不是告警。
  2. `build-apk.sh` 的 5 个 fail 分支：缺 `JAVA_HOME`/`ANDROID_HOME`/`APK_KEYSTORE_PASS`、JDK<17、keystore 不存在 —— 逐个验，**每个都要看到"打印需要什么"而不是堆栈**。
  3. 判据① 的完整闭环要等 `.gitignore` 的 PNG 反向纳入 + 脚本 commit 之后，**在那之前任何"CI 能出 APK"的结论都不成立**。
  4. 产物内容验证请断言 `assets/index.html` 里出现 `id="app"` 且 `assets/assets/*.js` 是 React 包（防"打包了 legacy 手写版"的静默回退）。
- 我没测到、需要设备的：全部（真机安装、通知、小组件、覆盖安装、`file://` 跨域）。
- 我在 Windows Git Bash 下跑的；Linux CI 上的差异点主要是 classpath 分隔符（脚本已按 `uname` 自动切 `;`/`:`）与 `python` 命令名（`PYTHON` 可覆盖）——CI 首跑请重点看这两处。
