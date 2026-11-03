# 明日记忆 · 内部可用版交付说明（2026-09-27）

档位 = 内部可用版（装得上 / 跑得住 / 测得绿）。**不等于对外发布版** —— 第六节的欠账补齐之前不要对外分发。
本文件是交付面的一页说明；全部证据与裁决在 `04-adjudications.md` 的 A-111 / A-112 两块（行号 554–586）。

## 一、交付物

| 件 | 现值 | 取证 |
| --- | --- | --- |
| Android 包 | `mobile-memory/tmword-internal-20260927.apk` | 316714 B / sha256 `e3434456fb1ad9050dde1cb51c623e6668dd3818dad24f9f36c0871a11120ae3` / mtime 2026-09-27 02:51:49 |
| 签名证书 | SHA-256 `d815bc2c056001e0c0885b2e8fd9e8fc5c5c6cf0b01fb9de3841bfc00aebb5e0`（`CN=Tomorrow Agenda`，keystore-v2 代） | 与 `mobile-memory/keystore-cert.sha256` 基线逐字一致 |
| 包内前端 | `index.html` 3047 B + `assets/index-CArZK6y1.js` 606493 B + `assets/index-T4SUTEM1.css` 38631 B | 与构建当时 `apps/app/dist` 名集合与字节逐颗相同（F-65 判据）；首屏 JS gzip 184011 B ≤ 封顶 256000 |
| 服务端 | `https://tmword.xyz` → Caddy → `127.0.0.1:3001`，`GET /api/version` = `{"name":"tomorrow-memory","version":"2.0.0","latest":"2.0.0","url":""}` | 公网实测 02:44 / 02:56 两次复点同值 |
| 备案 | 赣ICP备2026013161号-1 / 主办单位 曹怡明 | 用户本人 2026-09-26 提供，已落 Web 与 App 页脚 |

旧包 `tmword-internal-20260926b.apk`（312618 B）保留在册不删，但它**不含**注册失败的人话回落（E5c），别再装它。

## 二、装到手机

1. 把 `tmword-internal-20260927.apk` 传到手机（微信文件传输助手 / USB 拷贝都行）。
2. **先卸载已装的旧「明日记忆」**。签名密钥在 09-26 换过一代（用户改判「换签名吧，我之前的数据不要了」），旧代设备上的包无法覆盖安装 —— 不卸载会直接报「与已安装应用签名不符」。
3. 打开该文件，允许「安装未知来源应用」，装完从桌面图标进（新图标五档已换主，不与系统日历/明日日程撞脸）。

首帧已在本机 stock Chromium 两条通道验过非白屏（标题「记不住的，交给明天」+ 查词框 + 底部五 tab），但**真机手测仍欠**（等一台开 USB 调试的机，见第六节）。

## 三、线上现状（2026-09-27 02:56 实测）

| 面 | 值 |
| --- | --- |
| 服务端进程 | pm2 `tm-server-new` online（代码树 `/opt/tm-new` = 与本仓库同代，`tsx src/index.ts` 直跑源码），`pm2 save` 已持久化 |
| 老服务端 | pm2 `tm-server` **stopped 未删** = 一键回退件；老代码树 `/opt/tomorrow-memory` 原封（`auth.ts` 3823 B / `7ee5178717be` / mtime 08-27） |
| Web 前端 | pm2 `tm-web` online 30D，端口 3000 = **老一代 Next.js web**（本次只换服务端；老 web × 新服务端已逐颗实测兼容，但 web 侧新改版未上线） |
| 数据库 | `/opt/tomorrow-memory/data.db` 135168 B / `c5b7bb88d6a2`，WAL 已 checkpoint（`-wal` 0 B），`integrity_check = ok`，14 张表，`_migrations` 8 行 |
| 词典 | 只读共用 `/opt/tomorrow-memory/stardict.db`（1022713856 B，mtime 未变）与 `examples.db` |
| 密钥 | `JWT_SECRET` / `ADMIN_PASSWORD` 的新值**只在** `/opt/tm-new/.env`（0600，root）。我没有抄在任何文件、日志或对话里；要读就 `cat /opt/tm-new/.env` |
| 备份 | 只在盒上 `/opt/tomorrow-memory/backups/pre-sync-20260927/`（311M，四份：两套逐字三颗 + 两份 `VACUUM INTO` 产物 + 代码 tar 325311684 B）。按你的指示**没有拉到本机** |

切换窗口实测：停机 02:43:46 → 接管 02:43:57，**≈11 秒**。业务数据零写入（users 仍 7、`wordbooks.data` 总字符仍 3838、`account_audit_log` 0 行）。

## 四、老用户会看到什么

- **所有人都要重新登录一次**：换 `JWT_SECRET` 的必然结果，不是故障。
- **6 个空密码老号**：直接走「注册」= 激活认领（服务端出口 B 的单条条件写，并发下只有一个赢家），原数据不丢，不需要人工重置。
- **1 个设过密码的老号**：`pw_policy_version = 0` ⇒ 登录后命中强制改密。这是 §4.7 的设计内行为。
- 老代码里那颗万能验证码 `'12345'` 后门，在新服务端**关闭**（要求 `AUTH_DEV_MASTER_CODE` 非空且 `NODE_ENV !== 'production'`，生产两者都不满足）。

## 五、回退（如果线上出问题）

```bash
# 只回进程，不回数据
pm2 stop tm-server-new && pm2 start tm-server && pm2 save
# 需要回数据时：把 backups/pre-sync-20260927/files/live-data.db.snap(+ -shm/-wal)
# 三颗一起 cp 回 /opt/tomorrow-memory/，先停服务端
```
三颗必须**整组**换（WAL 库的 db/shm/wal 不能混代）。回退前先把当前三颗另存一份。

## 六、已知欠账（本窗口不修，按档位裁定）

| 项 | 一句话 |
| --- | --- |
| 真机手测（b2） | 新包在真机上的注册/背词/词本全流程手测 + logcat 补录，等一台开 USB 调试的安卓机 |
| F-74 | 线上没有有道凭据 ⇒ 中英互译增强面为空（查词本身走本地词典，实测正常）。需你在有道后台轮换/新建凭据（历史默认值进过 git 历史，视为已泄漏）后写入 `/opt/tm-new/.env` |
| F-6 | 无告警地址：线上错误目前只有 pm2 日志，没人会被叫醒 |
| U-1 | `keystore-v2.jks` + 口令的**仓库外双备份**还没做（丢了这把钥匙 = 存量用户永远无法覆盖安装） |
| V-2 | 真实恢复演练未做，`backups/manifest.json` 未回填（有备份 ≠ 能恢复） |
| F-63 / F-66 / F-67 / F-68 | 门禁尺子口径、产物陈旧无判据、`build-apk.sh --out` 路径口径、换签名代后三处旧文案 —— 全是工具面，⛔ 影响功能 |
| F-72 | `setAllowFileAccess(true)` 那行**仍未证为白屏根因**（与产物改经典单文件同批到账，单台机无法分离），保持假说 |
| 对外发布 | 档位是内部可用版：协议/隐私政策的最终定稿、应用商店素材、签名密钥托管、告警与恢复演练补齐之前 ⛔ 对外分发 |
