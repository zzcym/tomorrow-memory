/**
 * `GET /api/version`（§10.2 T-07 行的 🆕`routes/version.ts` / R-17⑨ / §5.5 第 4 步）
 *
 * 两个用途，互不冲突：
 *  1. **App 的"有新版本"提示数据源**（R-17⑨）：`latest` + `url`（+ 可选 `notes`），
 *     未配置 `APK_DOWNLOAD_URL` 时 `url` 给空串 → 客户端 `normalizeVersionInfo()` 归一为
 *     `null`，即"不提示、不阻塞"（离线语义与缺配置同一处理，绝不编造下载直链）；
 *  2. **发布自检**：`version` 回服务端自身版本号，运维/清单脚本据此确认线上跑的是哪个包
 *     （§10.2 判据⑦ 的 curl 实录读的就是这个端点必须 200）。
 *
 * 未登录可读、无凭据要求（R-17⑨ 的"启动第 4 步"发生在登录之前）；
 * 响应里**没有任何用户数据**，故不需要 `auth` 中间件，也不受强制改密门禁影响。
 */

import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { PROJECT_ROOT, type AppConfig } from '../config.js';
import type { AuthEnv } from '../middleware/auth.js';

/** 服务端版本号：读 `packages/server/package.json`，读不到回落 `'unknown'`（不硬编码第二份版本真相）。 */
function readServerVersion(): string {
  try {
    const file = path.join(PROJECT_ROOT, 'packages', 'server', 'package.json');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version.length > 0 ? parsed.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 读 APK 版本清单（`mobile-memory/version.json`，与 `build-apk.sh` 同一份唯一来源）。
 * 读不到就返回空串 —— 此时 `latest` 退回服务端版本，等价于"不提示"，绝不猜一个版本号。
 */
export function readApkVersion(file: string): { versionName: string; versionCode: number | null } {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      versionName?: unknown;
      versionCode?: unknown;
    };
    const versionName = typeof parsed.versionName === 'string' ? parsed.versionName.trim() : '';
    const versionCode =
      typeof parsed.versionCode === 'number' &&
      Number.isInteger(parsed.versionCode) &&
      parsed.versionCode > 0
        ? parsed.versionCode
        : null;
    return { versionName, versionCode };
  } catch {
    return { versionName: '', versionCode: null };
  }
}

export interface VersionPayload {
  name: 'tomorrow-memory';
  /** 当前服务端版本（发布自检用） */
  version: string;
  /** App 侧最新可用版本（R-17⑨ 的比较基准；未配置时等于服务端版本 → 不会误提示） */
  latest: string;
  /** APK 直链；未配置为空串，客户端据此不提示 */
  url: string;
  /** APK 版本码（可选，排查"该升但没升"时用；客户端当前不读它） */
  latestCode?: number | null;
  notes?: string;
}

export function createVersionRouter(config: AppConfig): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();
  const serverVersion = readServerVersion();
  // 三个新字段在旧测试夹具里可能没有（新增配置项不该把无关用例打崩）⇒ 一律用 ?? 兜底。
  const apk = readApkVersion(config.apkVersionFile ?? '');

  // latest 的优先级：显式环境变量 > version.json（APK 真实版本）> 服务端版本。
  // ⚠ 只有前两种来源才允许自动拼下载直链：服务端版本（如 2.0.0）与 APK 版本是两套号，
  //   拿它拼出来的 `tmword-2.0.0.apk` 必然 404，会让客户端弹一个点了就死的提示。
  const apkVersionKnown = apk.versionName !== '' || config.appLatestVersion !== '';
  const latest = config.appLatestVersion || apk.versionName || serverVersion;

  // 直链优先级：显式 APK_DOWNLOAD_URL > 站点前缀 + 版本号拼出的下载路由（app.ts 的 /api/download/:file）。
  // 两者都不可用 → 空串 → 客户端 normalizeVersionInfo() 归 null → 不提示（不编造直链）。
  const base = (config.apkDownloadBaseUrl ?? '').replace(/\/+$/, '');
  const url =
    (config.apkDownloadUrl ?? '') !== ''
      ? config.apkDownloadUrl
      : apkVersionKnown && base !== ''
        ? `${base}/api/download/tmword-${latest}.apk`
        : '';

  const payload: VersionPayload = {
    name: 'tomorrow-memory',
    version: serverVersion,
    latest,
    url,
    latestCode: apk.versionCode,
    ...(config.appReleaseNotes ? { notes: config.appReleaseNotes } : {}),
  };

  r.get('/api/version', (c) => c.json(payload, 200 as ContentfulStatusCode));
  return r;
}
