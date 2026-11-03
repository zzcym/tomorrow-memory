#!/bin/bash
# ===== 明日日程 APK 构建脚本(无 Gradle:aapt2 → javac → d8 → zipalign → apksigner)=====
# 依赖:JDK 17 + Android build-tools 34 + platforms;android-34(见文件头路径配置)
# 注意:Windows 下 javac/d8 的 classpath 分隔符是 ";"
set -e

JDK="E:/android-build/jdk/jdk-17.0.20.1+1/bin"
SDK="E:/android-build/android-sdk"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
CP="$PLATFORM;build/gen"
APK_NAME="明日记忆.apk"

cd "$(dirname "$0")"
rm -rf build
mkdir -p build/classes build/gen build/dex build/apk

echo "[1/6] aapt2 编译资源 + 链接(含 assets 与 manifest)"
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk \
  -I "$PLATFORM" \
  --manifest AndroidManifest.xml \
  -A assets \
  --java build/gen \
  --auto-add-overlay \
  build/res.zip

echo "[2/6] javac 编译 Java 源码"
find src build/gen -name '*.java' > build/sources.txt
"$JDK/javac" -source 17 -target 17 -encoding UTF-8 \
  -classpath "$CP" \
  -d build/classes \
  @build/sources.txt

echo "[3/6] d8 转 dex"
CLASSES=$(find build/classes -name '*.class' | tr '\n' ' ')
"$JDK/java" -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 26 --lib "$PLATFORM" --output build/dex $CLASSES

echo "[4/6] 组装未对齐 APK(追加 classes.dex;resources.arsc 保持未压缩)"
python scripts/assemble_apk.py build/base.apk build/dex/classes.dex build/apk/app.unsigned.apk

echo "[5/6] zipalign"
"$BT/zipalign" -f -p 4 build/apk/app.unsigned.apk build/apk/app.aligned.apk

echo "[6/6] 签名"
if [ ! -f keystore.jks ]; then
  "$JDK/keytool" -genkeypair -keystore keystore.jks -alias agenda \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass agenda123 -keypass agenda123 \
    -dname "CN=Tomorrow Agenda" >/dev/null 2>&1
  echo "  已生成 keystore.jks(密码 agenda123,请妥善保管以便后续升级安装)"
fi
"$JDK/java" -jar "$BT/lib/apksigner.jar" sign --ks keystore.jks --ks-pass pass:agenda123 --key-pass pass:agenda123 \
  --out "$APK_NAME" build/apk/app.aligned.apk
"$JDK/java" -jar "$BT/lib/apksigner.jar" verify "$APK_NAME"

ls -la "$APK_NAME"
echo "构建完成:$APK_NAME(传到手机直接安装;首次安装允许'未知来源')"
