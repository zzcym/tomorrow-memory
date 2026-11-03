"""base.apk（aapt2 产物）+ classes.dex → 未签名未对齐 APK；resources.arsc 保持 STORED。

用法： python scripts/assemble_apk.py <base.apk> <classes.dex> [<classes2.dex> ...] <out.apk>
  · 位置参数顺序与旧版一致（base / dex... / 输出），多 dex 只是把中间参数留成可变长度，语义未变。
  · 输入输出路径全部由调用方（build-apk.sh）传入；本文件内不含任何绝对路径、口令或仓库外文件依赖（B-08 / R-17③）。
  · 任一校验不过即非零退出并打印原因 —— 不静默产出"看起来成功"的半成品 APK。
"""
import sys
import zipfile

MUST_EXIST_IN_BASE = ("AndroidManifest.xml", "resources.arsc")


def die(msg: str) -> None:
    sys.stderr.write("assemble_apk 失败：%s\n" % msg)
    raise SystemExit(1)


def main(argv):
    args = argv[1:]
    if len(args) < 3:
        die("参数不足。用法：python scripts/assemble_apk.py <base.apk> <classes.dex> [<classes2.dex> ...] <out.apk>")

    src, dst = args[0], args[-1]
    dex_paths = args[1:-1]
    if not dex_paths:
        die("至少需要一个 dex 文件")

    try:
        zin_probe = zipfile.ZipFile(src)
    except (OSError, zipfile.BadZipFile) as exc:
        die("基础 APK 不可读或不是合法 zip：%s（%s）" % (src, exc))

    with zin_probe as zin:
        names = zin.namelist()
        missing = [n for n in MUST_EXIST_IN_BASE if n not in names]
        if missing:
            die("基础 APK 里缺少 %s —— aapt2 link 步骤没产出完整包，先修上一步" % ", ".join(missing))
        if "classes.dex" in names:
            die("基础 APK 已含 classes.dex，与该步骤假设冲突（aapt2 link 不应打包 dex）")

        payload = []
        for item in zin.infolist():
            data = zin.read(item.filename)
            comp = zipfile.ZIP_STORED if item.filename == "resources.arsc" else (item.compress_type or zipfile.ZIP_DEFLATED)
            zi = zipfile.ZipInfo(item.filename, date_time=item.date_time)
            zi.compress_type = comp
            zi.external_attr = item.external_attr
            payload.append((zi, data))

        dex_blobs = []
        for path in dex_paths:
            try:
                with open(path, "rb") as f:
                    blob = f.read()
            except OSError as exc:
                die("dex 文件读不到：%s（%s）" % (path, exc))
            if len(blob) < 8 or blob[:4] != b"dex\n":
                die("%s 不是合法的 dex（魔数不符），d8 步骤可能失败" % path)
            entry = "classes.dex" if len(dex_paths) == 1 else "classes%d.dex" % (len(dex_blobs) + 1)
            dex_blobs.append((entry, blob))

    try:
        with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
            for zi, data in payload:
                zout.writestr(zi, data)
            for entry, blob in dex_blobs:
                zout.writestr(entry, blob)
    except OSError as exc:
        die("写出 %s 失败：%s" % (dst, exc))

    with zipfile.ZipFile(dst) as check:
        bad = check.testzip()
        if bad is not None:
            die("产出 APK 校验失败，坏条目：%s" % bad)
        got = set(check.namelist())
        need = {e for e, _ in dex_blobs} | {zi.filename for zi, _ in payload}
        lost = sorted(need - got)
        if lost:
            die("产出 APK 丢了条目：%s" % ", ".join(lost))
        arsc = check.getinfo("resources.arsc")
        if arsc.compress_type != zipfile.ZIP_STORED:
            die("resources.arsc 未保持 STORED（zipalign -p 4 与 Android 11+ 的 mmap 要求会不满足）")

    print("assembled %s（%d 个原条目 + %d 个 dex）" % (dst, len(payload), len(dex_blobs)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
