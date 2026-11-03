"""base.apk(aapt2 产物)+ classes.dex → 未签名未对齐 APK;resources.arsc 保持 STORED"""
import sys, zipfile
src, dex_path, dst = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w") as zout:
    for item in zin.infolist():
        if item.filename == "classes.dex":
            continue
        data = zin.read(item.filename)
        comp = zipfile.ZIP_STORED if item.filename == "resources.arsc" else (item.compress_type or zipfile.ZIP_DEFLATED)
        zi = zipfile.ZipInfo(item.filename, date_time=item.date_time)
        zi.compress_type = comp
        zi.external_attr = item.external_attr
        zout.writestr(zi, data)
    with open(dex_path, "rb") as f:
        zout.writestr("classes.dex", f.read())
print("assembled", dst)
