#!/usr/bin/env bash
# ===== 明日记忆 Android APK 构建链（无 Gradle：aapt2 → javac → d8 → assemble → zipalign → apksigner → 指纹比对）=====
#
# 覆盖：R-17③（干净克隆一条命令产出**已签名可安装** APK，无人工步骤、无仓库外文件依赖）
#       R-17④ / B-08（工具链与口令全部来自环境变量；脚本内 0 处硬编码口令与绝对路径）
#       RK-13（无 keystore 即失败，**绝不 keytool 自签兜底**；构建后比对签名证书 SHA-256 指纹基线）
#       R-24② / §5.6（产物名 tmword-<版本>.apk 并输出 sha256 供下载页）
#
# 需要的环境变量（缺失 → exit 1 并打印**缺的是哪一个、怎么给**，绝不静默用默认值）：
#   JAVA_HOME          JDK 17+（javac / java / keytool）
#   ANDROID_HOME       Android SDK 根目录（或 ANDROID_SDK_ROOT，二者任一）
#   APK_KEYSTORE_PASS  签名 keystore 口令（CI secret 注入；本脚本不写任何口令字面量）
# 可选：
#   BT                 直接指定 build-tools 目录（覆盖自动发现；§10.2 冒烟命令用的就是这个变量）
#   ANDROID_BUILD_TOOLS 指定 build-tools 版本号（默认取 SDK 里已装的最大版本）
#   ANDROID_PLATFORM   平台 API 号（默认从 AndroidManifest.xml 的 targetSdkVersion 解析）
#   APK_KEYSTORE       keystore 路径（默认 <本目录>/keystore.jks —— 仓库内那一份，严禁重建）
#   APK_KEY_ALIAS      签名别名（默认 agenda）
#   APK_APP_DIST       前端产物目录（默认 <repo>/apps/app/dist，R-17① 的 file:// 产物）
#   APK_VERSION / APK_VERSION_CODE  版本号 / 版本码覆盖（缺省读 mobile-memory/version.json；CI 用）
#   APK_OUT            产物路径（缺省 tmword-<versionName>.apk）
#
# 用法： bash mobile-memory/build-apk.sh [--dry-run] [--skip-app-build] [--assets DIR] [--out FILE]
#                                        [--no-fingerprint] [-h|--help]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
cd "$HERE"

fail() { echo "构建失败：$*" >&2; exit 1; }
warn() { echo "  ! $*" >&2; }
say() { echo "$*"; }

DRY_RUN=0
SKIP_APP_BUILD=0
CHECK_FINGERPRINT=1
ASSETS_SRC=""
OUT_OVERRIDE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --skip-app-build) SKIP_APP_BUILD=1 ;;
    --assets) ASSETS_SRC="${2:-}"; [ -n "$ASSETS_SRC" ] || fail "--assets 需要一个目录参数"; shift ;;
    --out) OUT_OVERRIDE="${2:-}"; [ -n "$OUT_OVERRIDE" ] || fail "--out 需要一个文件路径参数"; shift ;;
    --no-fingerprint) CHECK_FINGERPRINT=0 ;;
    -h|--help) sed -n '1,32p' "${BASH_SOURCE[0]:-$0}"; exit 0 ;;
    *) fail "未知参数：$1（-h 看用法）" ;;
  esac
  shift
done

# ---------- 路径规范化（Windows 下 java/javac 是原生 exe，不认 MSYS 形路径）----------
IS_WIN=""
case "$(uname -s 2>/dev/null || echo Unknown)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT*) IS_WIN=1 ;;
esac
SEP=":"; [ -n "$IS_WIN" ] && SEP=";"

canon() {
  local p="$1"
  # MSYS 形路径 /e/xxx → E:/xxx：先走纯 bash 转换，不依赖 cygpath。
  # 理由（本机实测）：PATH 上若有 Anaconda 自带的 cygpath，它把 /e/... 当作相对路径，
  # 拼成 E:\Anaconda3\Library\e\...，于是 JAVA_HOME 怎么指都"找不到 java"。
  case "$p" in
    /[a-zA-Z]/*)
      local rest="${p#/}"
      printf '%s' "$(printf '%s' "$rest" | sed -E 's#^([a-zA-Z])/#\1:/#')"
      return 0
      ;;
  esac
  if [ -n "$IS_WIN" ] && command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p" | tr '\\' '/'
  else
    printf '%s' "$p" | tr '\\' '/'
  fi
}

find_tool() { # dir name → 可执行文件路径（自动补 .exe）
  local dir="$1" name="$2" c
  for c in "$dir/$name" "$dir/$name.exe" "$dir/$name.bat"; do
    [ -f "$c" ] && { printf '%s' "$c"; return 0; }
  done
  return 1
}

# ---------- ① 工具链解析：缺什么就明确失败并打印需要什么（B-08 / R-17③）----------
MISSING=()

JAVA_HOME_RESOLVED="${JAVA_HOME:-}"
[ -n "$JAVA_HOME_RESOLVED" ] || MISSING+=("JAVA_HOME（JDK 17+，用于 javac/java/keytool）")

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$SDK" ] || MISSING+=("ANDROID_HOME 或 ANDROID_SDK_ROOT（Android SDK 根目录，需含 platforms/android-<API>/android.jar 与 build-tools/<ver>/）")

if [ -z "${APK_KEYSTORE_PASS:-}" ]; then
  MISSING+=("APK_KEYSTORE_PASS（签名 keystore 口令。CI 上由 secret 注入，本地由开发者从仓库外双备份处导出为环境变量。本脚本按 RK-13 不提供默认口令、不自动 keytool 生成新证书）")
fi

if [ ${#MISSING[@]} -gt 0 ]; then
  say "缺少必需的构建环境变量（本脚本按 B-08 不接受硬编码回退值）："
  for m in "${MISSING[@]}"; do say "  - $m"; done
  say "示例："
  say "  export JAVA_HOME=/path/to/jdk-17"
  say "  export ANDROID_HOME=/path/to/android-sdk"
  say "  export APK_KEYSTORE_PASS='<从 CI secret / 仓库外备份处取，勿写进任何入库文件>'"
  say "  bash mobile-memory/build-apk.sh"
  exit 1
fi

JAVA_BIN="$(find_tool "$(canon "$JAVA_HOME_RESOLVED")/bin" java)" || fail "JAVA_HOME=$JAVA_HOME_RESOLVED 下找不到 java 可执行文件"
JAVAC_BIN="$(find_tool "$(canon "$JAVA_HOME_RESOLVED")/bin" javac)" || fail "JAVA_HOME=$JAVA_HOME_RESOLVED 下找不到 javac 可执行文件"
JAVA_VER="$("$JAVA_BIN" -version 2>&1 | head -1)"
JAVA_MAJOR="$(printf '%s' "$JAVA_VER" | sed -n 's/.*version "\([0-9]*\)\(\.0\)\{0,1\}.*/\1/p')"
[ -n "$JAVA_MAJOR" ] && [ "$JAVA_MAJOR" -ge 17 ] \
  || fail "JAVA_HOME 指向的 JDK 版本过低（$JAVA_VER）。本构建链要 JDK 17+（javac -source 17；且 keystore 是 PKCS12，JDK 8 的 keytool 读不了）。请 export JAVA_HOME=<JDK 17+ 目录>——脚本不会替你找别的 JDK。"
JAVA_HOME_N="$(canon "$JAVA_HOME_RESOLVED")"
SDK_N="$(canon "$SDK")"
[ -d "$SDK_N" ] || fail "ANDROID_HOME=$SDK 指向的目录不存在"

# build-tools：优先 $BT（§10.2 冒烟命令同名），否则取 SDK 里已装的最大版本
if [ -n "${BT:-}" ]; then BT_N="$(canon "$BT")"
else
  ver="${ANDROID_BUILD_TOOLS:-}"
  if [ -z "$ver" ]; then
    ver="$(ls -1 "$SDK_N/build-tools" 2>/dev/null | sort -V | tail -1 || true)"
    [ -n "$ver" ] || fail "ANDROID_HOME=$SDK_N 下没有 build-tools（需要含 aapt2/zipalign/apksigner.jar/d8.jar 的 34.0.0 或更高）。请安装 SDK build-tools，或用 BT=<目录> 直接指定。"
  fi
  BT_N="$SDK_N/build-tools/$ver"
fi
[ -d "$BT_N" ] || fail "build-tools 目录不存在：$BT_N"
AAPT2="$(find_tool "$BT_N" aapt2)" || fail "build-tools 里找不到 aapt2：$BT_N"
ZIPALIGN="$(find_tool "$BT_N" zipalign)" || fail "build-tools 里找不到 zipalign：$BT_N"
D8_JAR="$BT_N/lib/d8.jar"; APKSIGNER_JAR="$BT_N/lib/apksigner.jar"
[ -f "$D8_JAR" ] || fail "找不到 $D8_JAR（build-tools 不完整）"
[ -f "$APKSIGNER_JAR" ] || fail "找不到 $APKSIGNER_JAR（build-tools 不完整）"

# 平台 jar：默认取 AndroidManifest.xml 的 targetSdkVersion
API="${ANDROID_PLATFORM:-}"
if [ -z "$API" ]; then
  API="$(grep -o 'android:targetSdkVersion="[0-9]*"' "$HERE/AndroidManifest.xml" | head -1 | grep -o '[0-9]*' || true)"
  [ -n "$API" ] || fail "AndroidManifest.xml 里解析不到 android:targetSdkVersion，且未给 ANDROID_PLATFORM"
fi
PLATFORM="$SDK_N/platforms/android-$API/android.jar"
[ -f "$PLATFORM" ] || fail "找不到编译用平台 jar：$PLATFORM（请安装 SDK platform android-$API，或 export ANDROID_PLATFORM=<已装的 API 号>）"

PYTHON="${PYTHON:-}"
if [ -z "$PYTHON" ]; then
  for p in python python3 py; do
    if command -v "$p" >/dev/null 2>&1; then PYTHON="$p"; break; fi
  done
  [ -n "$PYTHON" ] || fail "找不到 python（assemble_apk.py 需要）。请安装 Python 3 或 export PYTHON=<解释器路径>。"
fi

# keystore：仓库内那一份，缺失即停（RK-13 严禁重建）
# 默认签名钥匙 = keystore-v3.jks（在册指纹 29f0b47e… 见 keystore-cert.sha256 的"第三次换签名代"一节）。
# keystore.jks / keystore-v2.jks 是前两代，原地保留仅作历史留档，绝不作默认值
# （用它们签出来的包与基线不符，fingerprint.mjs 会直接红）。
KEYSTORE="${APK_KEYSTORE:-$HERE/keystore-v3.jks}"
[ -f "$KEYSTORE" ] || fail "找不到签名 keystore：$KEYSTORE。按 RK-13 **严禁 keytool 重新生成**（签名标识一变，存量用户无法覆盖安装 = 只能卸载重装并丢本机数据）。请从 CI secret / 仓库外双备份处把**原件**放回该路径，或用 APK_KEYSTORE=<路径> 指到它；CI 上由 secret 落盘。本脚本不会自签兜底。"
KEYSTORE_WIN="$(canon "$KEYSTORE")"
KEY_ALIAS="${APK_KEY_ALIAS:-agenda}"

# ---------- ② 前端产物（R-17①：apps/app 的 dist 是唯一入库 assets 来源）----------
DIST="${APK_APP_DIST:-$REPO_ROOT/apps/app/dist}"
if [ -n "$ASSETS_SRC" ]; then DIST="$ASSETS_SRC"; fi

stage_assets() {
  rm -rf build/assets
  mkdir -p build/assets
  cp -r "$(canon "$DIST")/." build/assets/
  [ -f build/assets/index.html ] || fail "staged assets 里没有 index.html"
}

ensure_dist() {
  if [ ! -f "$(canon "$DIST")/index.html" ]; then
    if [ "$SKIP_APP_BUILD" = "1" ]; then
      fail "前端产物缺失：$DIST/index.html 不存在，而本次带了 --skip-app-build。先跑 pnpm --filter @tm/app build（或去掉该参数让本脚本自己跑）。"
    fi
    say "[0/6] 前置构建 App 前端：pnpm --filter @tm/app build"
    command -v pnpm >/dev/null 2>&1 || fail "找不到 pnpm，无法自动构建 $DIST。请先在仓库根执行：pnpm install && pnpm --filter @tm/app build，或用 APK_APP_DIST=<已构建 dist> 指过去。"
    ( cd "$REPO_ROOT" && pnpm --filter @tm/app build )
    [ -f "$(canon "$DIST")/index.html" ] || fail "pnpm build 跑完仍没有 $DIST/index.html"
  elif [ "$SKIP_APP_BUILD" = "1" ]; then
    say "[0/6] 复用已存在的前端产物：$DIST"
  else
    say "[0/6] 前端产物已在（$DIST）——跳过重复构建；需要强制重建请先 rm -rf 该目录或带 --skip-app-build=0 前先跑 pnpm --filter @tm/app build"
  fi
}

# file:// 前提机检：index.html 里不允许出现以 / 开头的资源引用（R-17① / T-14 判据①）
check_dist_form() {
  local html
  html="$(canon "$DIST")/index.html"
  [ -f "$html" ] || return 0
  if grep -qE '(src|href)="/' "$html"; then
    fail "$html 含以 / 开头的资源引用 —— 在 file:///android_asset 下必然 404（R-17①）。检查 apps/app/vite.config.ts 的 base 是否为 './'。"
  fi
}

# WebView DOM storage 机检（R-17①：App 无 localStorage 就没有登录态）
check_dom_storage() {
  local src="$HERE/src/com/tomorrow/memory/MainActivity.java"
  [ -f "$src" ] || fail "找不到 $src"
  grep -q 'setDomStorageEnabled(true)' "$src" \
    || fail "MainActivity.java 未调用 setDomStorageEnabled(true) —— WebView 没有 localStorage，App 会直接失去登录态（R-17① / T-20 判据③）。"
  say "  DOM storage 检查通过：$(grep -n 'setDomStorageEnabled(true)' "$src" | head -1 | cut -d: -f1)行"
}

# ---------- ③ 产物名与版本号（bug_list #9/#10：禁止日期命名，语义化版本）----------
# 版本号唯一来源 = mobile-memory/version.json。
# APK_VERSION / APK_VERSION_CODE 仍可显式覆盖（CI 用），但不再回落成 dev 或日期。
read_version_json() { # $1 = 字段名
  "${NODE:-node}" -e 'const f=require("fs");try{const j=JSON.parse(f.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j[process.argv[2]]??""))}catch(e){}' \
    "$HERE/version.json" "$1" 2>/dev/null || true
}

VERSION_NAME="${APK_VERSION:-}"
VERSION_CODE="${APK_VERSION_CODE:-}"
if [ -z "$VERSION_NAME" ] || [ -z "$VERSION_CODE" ]; then
  NODE="${NODE:-node}"
  command -v "$NODE" >/dev/null 2>&1 || fail "找不到 node：解析 version.json 需要它（或用 APK_VERSION / APK_VERSION_CODE 显式给值）"
  [ -n "$VERSION_NAME" ] || VERSION_NAME="$(read_version_json versionName)"
  [ -n "$VERSION_CODE" ] || VERSION_CODE="$(read_version_json versionCode)"
fi
VERSION_NAME="${VERSION_NAME#v}"
[ -n "$VERSION_NAME" ] || fail "version.json 里没有 versionName，且未给 APK_VERSION —— 版本号必须显式存在，不许回落成 dev/日期（bug_list #9）。"
case "$VERSION_NAME" in
  [0-9]*.[0-9]*) : ;;
  *) fail "版本号 '$VERSION_NAME' 不是三段式（示例 1.1.0）。bug_list #9 禁止日期式命名。" ;;
esac
[ -n "$VERSION_CODE" ] || fail "version.json 里没有 versionCode（整数，发版必须 +1，否则无法覆盖安装）。"
case "$VERSION_CODE" in *[!0-9]*) fail "versionCode 必须是整数，收到 '$VERSION_CODE'" ;; esac

VERSION="$VERSION_NAME"
OUT="${OUT_OVERRIDE:-$HERE/tmword-${VERSION}.apk}"
OUT_WIN="$(canon "$OUT")"
# 产物名 = tmword-<versionName>.apk（bug_list #10）。默认带 tmword- 前缀，不会碰到 legacy 手写版
# 那份未提交的 明日记忆.apk；分发名由 CI 显式 --out 指定，本脚本不擅自改名。

say "===== 构建环境（全部来自环境变量，脚本内无绝对路径 / 无口令字面量）====="
say "  JAVA_HOME   = $JAVA_HOME_N"
say "  ANDROID_HOME= $SDK_N"
say "  BT          = $BT_N"
say "  PLATFORM    = $PLATFORM"
say "  PYTHON      = $PYTHON"
say "  KEYSTORE    = $KEYSTORE_WIN (alias=$KEY_ALIAS；口令只从环境变量 APK_KEYSTORE_PASS 经 env: 传入，脚本与日志都不落口令)"
say "  APP DIST    = $(canon "$DIST")"
say "  VERSION     = $VERSION_NAME (versionCode=$VERSION_CODE，来自 version.json)"
say "  OUT         = $OUT_WIN"
say "  DRY_RUN     = $DRY_RUN"

if [ "$DRY_RUN" = "1" ]; then
  check_dom_storage
  [ -f "$(canon "$DIST")/index.html" ] && check_dist_form || warn "（dry-run）前端产物未构建，跳过 dist 形态检查"
  say ""
  say "[dry-run] 环境解析完毕，将要执行的命令序列："
  say "  1) $AAPT2 compile --dir res -o build/res.zip"
  say "  2) $AAPT2 link -o build/base.apk -I $PLATFORM --manifest AndroidManifest.xml --version-code $VERSION_CODE --version-name $VERSION_NAME -A build/assets --java build/gen --auto-add-overlay build/res.zip"
  say "  3) $JAVAC_BIN -source 17 -target 17 -encoding UTF-8 -classpath \"$PLATFORM${SEP}build/gen\" -d build/classes @build/sources.txt"
  say "  4) $JAVA_BIN -cp $D8_JAR com.android.tools.r8.D8 --release --min-api 26 --lib $PLATFORM --output build/dex <classes>"
  say "  5) $PYTHON scripts/assemble_apk.py build/base.apk build/dex/classes.dex build/apk/app.unsigned.apk"
  say "  6) $ZIPALIGN -f -p 4 build/apk/app.unsigned.apk build/apk/app.aligned.apk"
  say "  7) $JAVA_BIN -jar $APKSIGNER_JAR sign --ks $KEYSTORE_WIN --ks-key-alias $KEY_ALIAS --ks-pass env:APK_KEYSTORE_PASS --key-pass env:APK_KEYSTORE_PASS --out $OUT_WIN build/apk/app.aligned.apk"
  say "  8) $JAVA_BIN -jar $APKSIGNER_JAR verify --print-certs $OUT_WIN   +   node scripts/fingerprint.mjs --apk $OUT_WIN --baseline keystore-cert.sha256"
  say "[dry-run] 未产出 APK。"
  exit 0
fi

rm -rf build
mkdir -p build/classes build/gen build/dex build/apk

check_dom_storage
ensure_dist
check_dist_form
stage_assets
say "  assets 已staged：$(find build/assets -type f | wc -l) 个文件（源：$(canon "$DIST")）"

say "[1/6] aapt2 编译资源 + 链接（含 assets 与 manifest）"
"$AAPT2" compile --dir res -o build/res.zip
"$AAPT2" link -o build/base.apk \
  -I "$PLATFORM" \
  --manifest AndroidManifest.xml \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  -A build/assets \
  --java build/gen \
  --auto-add-overlay \
  build/res.zip

say "[2/6] javac 编译 Java 源码"
find src build/gen -name '*.java' > build/sources.txt
CP="$PLATFORM${SEP}build/gen"
# -J-Duser.language=en：Windows 控制台下 javac 的中文提示会经管道变乱码（取证时读不清）
"$JAVAC_BIN" -J-Duser.language=en -J-Duser.country=US -source 17 -target 17 -encoding UTF-8 \
  -classpath "$CP" \
  -d build/classes \
  @build/sources.txt

say "[3/6] d8 转 dex"
CLASSES=$(find build/classes -name '*.class' | tr '\n' ' ')
"$JAVA_BIN" -cp "$D8_JAR" com.android.tools.r8.D8 --release --min-api 26 --lib "$PLATFORM" --output build/dex $CLASSES

say "[4/6] 组装未对齐 APK（追加 classes.dex；resources.arsc 保持 STORED）"
PYTHONIOENCODING=utf-8 "$PYTHON" scripts/assemble_apk.py build/base.apk build/dex/classes.dex build/apk/app.unsigned.apk

say "[5/6] zipalign"
"$ZIPALIGN" -f -p 4 build/apk/app.unsigned.apk build/apk/app.aligned.apk

say "[6/6] 签名（口令经 env: 传入，不出现在命令行明文与任何入库文件里）"
"$JAVA_BIN" -jar "$APKSIGNER_JAR" sign \
  --ks "$KEYSTORE_WIN" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass env:APK_KEYSTORE_PASS \
  --key-pass env:APK_KEYSTORE_PASS \
  --out "$OUT" build/apk/app.aligned.apk
"$JAVA_BIN" -jar "$APKSIGNER_JAR" verify --print-certs "$OUT_WIN"

if [ "$CHECK_FINGERPRINT" = "1" ]; then
  say "[指纹比对 RK-13 / 判据⑨]"
  export JAVA_HOME="$JAVA_HOME_RESOLVED"
  export BT="$BT_N"
  NODE="${NODE:-node}"
  command -v "$NODE" >/dev/null 2>&1 || fail "找不到 node，无法运行指纹比对脚本 scripts/fingerprint.mjs（判据⑨ 要求不一致即 exit 1）。请 export NODE=<路径> 或安装 Node 18+。"
  "$NODE" "$HERE/scripts/fingerprint.mjs" --apk "$OUT" --baseline "$HERE/keystore-cert.sha256" || fail "签名证书指纹与 keystore-cert.sha256 基线不一致 —— 按 RK-13 禁止发布与挂直链，人工找回原 keystore 后才可继续"
fi

sha=""
if command -v sha256sum >/dev/null 2>&1; then
  sha="$(sha256sum "$OUT_WIN" | awk '{print $1}')"
elif command -v node >/dev/null 2>&1; then
  sha="$(node -e 'const c=require("crypto"),f=require("fs");process.stdout.write(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))' "$OUT")"
else
  warn "无 sha256sum / node，跳过产物哈希输出（R-17⑧ 下载页需要它）"
fi
ls -la "$OUT_WIN"
say "构建完成：$OUT_WIN"
[ -n "$sha" ] && say "  sha256 = $sha"
say "  传到手机直接安装；已签名证书指纹见上方 verify --print-certs 与 keystore-cert.sha256 基线比对结果。"
