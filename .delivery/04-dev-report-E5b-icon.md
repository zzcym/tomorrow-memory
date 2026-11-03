# E5b 开发报告：mobile-memory 启动图标五档切图与撞脸缺陷修复证据

- 执行者：E5b agent
- 日期：2026-09-26
- 任务范围：仅覆盖写 `mobile-memory/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` 五颗；其余全部为只读取证。未动任何源码、`build-apk.sh`、`*.apk`、`tools/**`、`vibe_images/**`、`.delivery/**` 其它文件。本会话零 git 写操作。

---

## 1. 源图

| 项 | 值 | 来源 |
|---|---|---|
| 路径 | `E:\CC\tomorrow-memory\vibe_images\tmword-launcher-icon_1790420221123_fbc329c6.png` | 任务指定 |
| 尺寸/模式 | `(1024, 1024) RGB` | PIL 实测（原文见 §4） |
| 字节数 | 764645 | `ls -la` 实测 |

## 2. 改前状态与备份（先备份后覆盖，已实证）

改前五颗旧文件 sha256（`sha256sum` 原文）：

```
dcf964199ec36dfd265afc765799580b84632598b4e43cfd0f1a813c2aefb37c *mobile-memory/res/mipmap-hdpi/ic_launcher.png
dcf964199ec36dfd265afc765799580b84632598b4e43cfd0f1a813c2aefb37c *mobile-memory/res/mipmap-mdpi/ic_launcher.png
fc56d12262df37b441c11315fe819ebac7cb84dce851cca046666f92f1d20bfe *mobile-memory/res/mipmap-xhdpi/ic_launcher.png
83537cc15d7018fb2c60a9aa10773beccd72d1fdb0f6799cd536cde232ac9c20 *mobile-memory/res/mipmap-xxhdpi/ic_launcher.png
a18066b7c9b8c012e5443fd147cc374961157cb4194045c2a78c03285110c2b3 *mobile-memory/res/mipmap-xxxhdpi/ic_launcher.png
```

TPM 结论复核（改前实测）：hdpi `dcf964199ec3`、xhdpi `fc56d12262df`、xxhdpi `83537cc15d70`、xxxhdpi `a18066b7c9b8` 与 mobile-agenda 同名颗逐颗一致；mdpi 不同（mm 侧 mdpi 也是 `dcf964199ec3…`，即旧 mdpi 与本项目 hdpi 同图；agenda 侧 mdpi 为 `6887e3f40216…`）。与任务描述一致。

备份：`cp -p` 到 ASCII 目录 `E:\e5b\icon-bak\`（改后 sha256 与上表逐颗相等，`ls` 原文）：

```
-rw-r--r-- 1 曹怡明 197121  574 Sep 16 15:04 ic_launcher-hdpi.png
-rw-r--r-- 1 曹怡明 197121  574 Sep 16 15:04 ic_launcher-mdpi.png
-rw-r--r-- 1 曹怡明 197121  665 Sep 16 15:04 ic_launcher-xhdpi.png
-rw-r--r-- 1 曹怡明 197121  923 Sep 16 15:04 ic_launcher-xxhdpi.png
-rw-r--r-- 1 曹怡明 197121 1097 Sep 16 15:04 ic_launcher-xxxhdpi.png
dcf964199ec36dfd265afc765799580b84632598b4e43cfd0f1a813c2aefb37c */e/e5b/icon-bak/ic_launcher-hdpi.png
dcf964199ec36dfd265afc765799580b84632598b4e43cfd0f1a813c2aefb37c */e/e5b/icon-bak/ic_launcher-mdpi.png
fc56d12262df37b441c11315fe819ebac7cb84dce851cca046666f92f1d20bfe */e/e5b/icon-bak/ic_launcher-xhdpi.png
83537cc15d7018fb2c60a9aa10773beccd72d1fdb0f6799cd536cde232ac9c20 */e/e5b/icon-bak/ic_launcher-xxhdpi.png
a18066b7c9b8c012e5443fd147cc374961157cb4194045c2a78c03285110c2b3 */e/e5b/icon-bak/ic_launcher-xxxhdpi.png
```

## 3. 切图方法

脚本 `E:\e5b\slice_icons.py`（外部 ASCII 目录，未写入受限面）：PIL 10.2.0；`im.resize((px, px), resample=Image.LANCZOS)`；源图 1024×1024 正方形 → 目标正方形，无裁剪、无比例改变；`out.save(path, format="PNG")`。运行 stdout 原文：

```
wrote E:\CC\tomorrow-memory\mobile-memory\res\mipmap-mdpi\ic_launcher.png (48, 48) RGB
wrote E:\CC\tomorrow-memory\mobile-memory\res\mipmap-hdpi\ic_launcher.png (72, 72) RGB
wrote E:\CC\tomorrow-memory\mobile-memory\res\mipmap-xhdpi\ic_launcher.png (96, 96) RGB
wrote E:\CC\tomorrow-memory\mobile-memory\res\mipmap-xxhdpi\ic_launcher.png (144, 144) RGB
wrote E:\CC\tomorrow-memory\mobile-memory\res\mipmap-xxxhdpi\ic_launcher.png (192, 192) RGB
OK
```

## 4. 证据（全部原文粘贴）

### 4.1 新五颗 sha256 / 字节数 / mtime，与 mobile-agenda 同名五颗逐一比对

`sha256sum` + `stat` 原文：

```
== NEW mobile-memory ==
9c65a37509acd8eb70e3c4a13798175a9a6371ead8b2cc87a89405edcd64a998 *mobile-memory/res/mipmap-hdpi/ic_launcher.png
78bde30cd859a1d5256e3f4ce8aaaf1ea4ccd457ae221e1e66bea0e9a23c6bd4 *mobile-memory/res/mipmap-mdpi/ic_launcher.png
ab66ee34a18b1a0f5a2b5f579965cb0eb96ddbc15ccd5067587c8f3d26fd15bd *mobile-memory/res/mipmap-xhdpi/ic_launcher.png
2f605cc68e926e9dfec9b978064a1b804af8825ba30812782daa3e458c8f4846 *mobile-memory/res/mipmap-xxhdpi/ic_launcher.png
8225ce1dd123a036edf6103d02b76fef065cecced3e7b70d6de6107e4dcbc05e *mobile-memory/res/mipmap-xxxhdpi/ic_launcher.png
mobile-memory/res/mipmap-hdpi/ic_launcher.png 6787 bytes mtime=2026-09-26 18:58:39.141204500 +0800
mobile-memory/res/mipmap-mdpi/ic_launcher.png 3483 bytes mtime=2026-09-26 18:58:39.133216200 +0800
mobile-memory/res/mipmap-xhdpi/ic_launcher.png 11124 bytes mtime=2026-09-26 18:58:39.151387500 +0800
mobile-memory/res/mipmap-xxhdpi/ic_launcher.png 23227 bytes mtime=2026-09-26 18:58:39.166479500 +0800
mobile-memory/res/mipmap-xxxhdpi/ic_launcher.png 39834 bytes mtime=2026-09-26 18:58:39.190564400 +0800
== mobile-agenda ==
dcf964199ec36dfd265afc765799580b84632598b4e43cfd0f1a813c2aefb37c *mobile-agenda/res/mipmap-hdpi/ic_launcher.png
6887e3f402166c80c851334dddc75d04115964254e54564636781ceaaca7dc70 *mobile-agenda/res/mipmap-mdpi/ic_launcher.png
fc56d12262df37b441c11315fe819ebac7cb84dce851cca046666f92f1d20bfe *mobile-agenda/res/mipmap-xhdpi/ic_launcher.png
83537cc15d7018fb2c60a9aa10773beccd72d1fdb0f6799cd536cde232ac9c20 *mobile-agenda/res/mipmap-xxhdpi/ic_launcher.png
a18066b7c9b8c012e5443fd147cc374961157cb4194045c2a78c03285110c2b3 *mobile-agenda/res/mipmap-xxxhdpi/ic_launcher.png
mobile-agenda/res/mipmap-hdpi/ic_launcher.png 574 bytes mtime=2026-09-06 02:52:00.277043300 +0800
mobile-agenda/res/mipmap-mdpi/ic_launcher.png 428 bytes mtime=2026-09-06 02:52:00.271459700 +0800
mobile-agenda/res/mipmap-xhdpi/ic_launcher.png 665 bytes mtime=2026-09-06 02:52:00.279427100 +0800
mobile-agenda/res/mipmap-xxhdpi/ic_launcher.png 923 bytes mtime=2026-09-06 02:52:00.283721700 +0800
mobile-agenda/res/mipmap-xxxhdpi/ic_launcher.png 1097 bytes mtime=2026-09-06 02:52:00.285809600 +0800
```

逐颗前 12 位对照表（mdpi 行按 48/文件名列；两来源：上述 sha256sum 输出 + §4.2 PIL 脚本独立计算，结论一致）：

| 档 | mm 新 sha12 | agenda sha12 | 相同? |
|---|---|---|---|
| mdpi | 78bde30cd859 | 6887e3f40216 | 否 |
| hdpi | 9c65a37509ac | dcf964199ec3 | 否 |
| xhdpi | ab66ee34a18b | fc56d12262df | 否 |
| xxhdpi | 2f605cc68e92 | 83537cc15d70 | 否 |
| xxxhdpi | 8225ce1dd123 | a18066b7c9b8 | 否 |

断言：**0 颗相同**（同一结论的第二来源为 §4.2 校验脚本内 sha256 等值比较，原文 `identical_count_with_agenda = 0` / `ASSERT PASS: 0 of 5 identical to mobile-agenda`）。

### 4.2 PIL 读回 size/mode + PNG 合法性 + 与 agenda 相等性校验（脚本 `E:\e5b\e5b_verify.py` stdout 原文）

```
mipmap-mdpi: size=(48, 48) mode=RGB expected=48x48 size_ok=True png_magic=True sha12_mm=78bde30cd859 sha12_agenda=6887e3f40216 identical=False
mipmap-hdpi: size=(72, 72) mode=RGB expected=72x72 size_ok=True png_magic=True sha12_mm=9c65a37509ac sha12_agenda=dcf964199ec3 identical=False
mipmap-xhdpi: size=(96, 96) mode=RGB expected=96x96 size_ok=True png_magic=True sha12_mm=ab66ee34a18b sha12_agenda=fc56d12262df identical=False
mipmap-xxhdpi: size=(144, 144) mode=RGB expected=144x144 size_ok=True png_magic=True sha12_mm=2f605cc68e92 sha12_agenda=83537cc15d70 identical=False
mipmap-xxxhdpi: size=(192, 192) mode=RGB expected=192x192 size_ok=True png_magic=True sha12_mm=8225ce1dd123 sha12_agenda=a18066b7c9b8 identical=False
identical_count_with_agenda = 0
ASSERT PASS: 0 of 5 identical to mobile-agenda
```

（`size/mode` 由 `Image.open` 读回；PNG 合法性另以 8 字节魔数 `\x89PNG\r\n\x1a\n` 检查 + `im.verify()` 双验，均通过。）

### 4.3 中文路径 GBK 规避

所有 PIL/sha 校验均以 ASCII 脚本文件（`E:\e5b\slice_icons.py`、`E:\e5b\e5b_verify.py`）或在 `cd` 到仓库后使用相对路径的 heredoc 执行；`python -c` 命令行参数中未出现中文绝对路径。

## 5. 顺带取证（只报不改）

### 5.1 两棵树 res 全量同名文件 sha256 对照（stdout 原文）

```
total files mm/res: 11  agenda/res: 15  same-name pairs: 7
mipmap-hdpi/ic_launcher.png | mm=9c65a37509ac agenda=dcf964199ec3 | diff
mipmap-mdpi/ic_launcher.png | mm=78bde30cd859 agenda=6887e3f40216 | diff
mipmap-xhdpi/ic_launcher.png | mm=ab66ee34a18b agenda=fc56d12262df | diff
mipmap-xxhdpi/ic_launcher.png | mm=2f605cc68e92 agenda=83537cc15d70 | diff
mipmap-xxxhdpi/ic_launcher.png | mm=8225ce1dd123 agenda=a18066b7c9b8 | diff
values-night/colors.xml | mm=b2a303f1fe83 agenda=964d59af17ac | diff
values/colors.xml | mm=64186761173b agenda=a2c621ccb540 | diff

STILL IDENTICAL count: 0
only in mobile-memory/res: ['drawable/widget_go_bg.xml', 'drawable/widget_search_bg.xml', 'layout/widget_search.xml', 'xml/search_widget.xml']
only in mobile-agenda/res: ['drawable/widget_bg.xml', 'layout/widget_large.xml', 'layout/widget_medium.xml', 'layout/widget_row.xml', 'layout/widget_small.xml', 'xml/widget_large.xml', 'xml/widget_medium.xml', 'xml/widget_small.xml']
```

补充（跨名对照， mm/res 任一文件 × agenda/res 任一文件全对哈希）：

```
cross-name identical pairs (any file in mm/res vs any in agenda/res): 0
```

结论（双来源：同名配对脚本 + 跨名全对脚本）：本次改完后，两棵树 res 下**已无任何内容相同的文件**（含不同名的），小组件背景图不同源（`widget_search_bg.xml` radius=22dp 带 stroke，`widget_bg.xml` radius=16dp 带 stroke，`widget_go_bg.xml` radius=16dp 纯色 `#0F6B5C`，均不等值）。

### 5.2 「明日日程」残留取证（只列证据，未改）

- 全仓库工具级检索 `mobile-memory/` 目录 `明日日程`：**No matches found**（Grep 原文）。
- Python 逐文件扫描（\u 转义核对，输出 `E:\e5b\probe\residual-check.json` 关键结果原文）：

```
mobile-memory/AndroidManifest.xml: residual_count=0, own_name_count=2
  line 12: android:label="明日记忆"
  line 29: android:label="明日记忆·查词"
mobile-memory/res/xml/search_widget.xml: residual_count=0, own_name_count=0
sweep_all_mobile_memory_for_residual: []   （mobile-memory 全目录 0 命中）
```

- 包名（Read 原文）：`mobile-memory/AndroidManifest.xml:3  package="com.tomorrow.memory"`；`mobile-agenda/AndroidManifest.xml:3  package="com.tomorrow.agenda"` —— 两者本就不同。
- `res/xml/search_widget.xml` 全文无任何 label/文字字段（10 行 appwidget-provider 配置，Read 核对）。
- 结论：mobile-memory 侧**无「明日日程」残留字样**；manifest 中两处中文 label 均为本项目自有名「明日记忆」/「明日记忆·查词」，非残留。（双来源：Grep 工具检索 + unicode 转义脚本扫描，结果一致。）

## 6. 纪律自查

- 本次唯一写入仓库的文件：五颗 `mobile-memory/res/mipmap-*/ic_launcher.png` + 本报告。
- git：未执行任何 git 命令（无 add/commit/stash/checkout/restore/reset）。
- `data.db`（含 -shm/-wal）：全程未以脚本或命令打开；收尾时 `stat` 记录（只读取）如下，mtime 仍为 2026-09-17/18，本会话未触碰：

```
data.db 253952 bytes mtime=2026-09-18 04:05:38.198449400 +0800
data.db-shm 32768 bytes mtime=2026-09-17 00:53:01.561551800 +0800
data.db-wal 424392 bytes mtime=2026-09-18 04:09:16.857435000 +0800
```

- 中间脚本/证据文件均落 ASCII 路径：`E:\e5b\slice_icons.py`、`E:\e5b\e5b_verify.py`、`E:\e5b\icon-bak\*`、`E:\e5b\probe\residual-check.json`。

## 7. 未实测项（明确声明）

- 新图标在真机/模拟器上的显示效果、圆角蒙版裁切表现：**未实测**（本 agent 无设备安装权限，且禁改 apk）。
- APK 重新构建后图标是否生效：**未实测**（禁触 `build-apk.sh`/`*.apk`，需 TPM 另行安排构建验证）。
- mobile-agenda 侧图标是否会被该 App 自身后续任务再改：**未实测**，本报告仅证明当下 0/5 相同。
