/**
 * `GET /api/version` 的取值口径（R-17⑨）。
 *
 * 钉三件事，都是 2026-11 补 url 时定下的：
 *  1. `latest` 来自 `mobile-memory/version.json`（与 build-apk.sh 同一份唯一来源），
 *     不是服务端自己的 2.x 版本号 —— 两套号混用会弹"升到 2.0.0"，而那个 APK 根本不存在；
 *  2. 直链 = `APK_DOWNLOAD_BASE_URL` + `/api/download/tmword-<latest>.apk`，与 app.ts 的下载路由同形；
 *  3. 没有可信版本来源时 `url` 必须是空串（客户端 `normalizeVersionInfo()` 归 null ⇒ 不提示），
 *     宁可静默，也不给一个点了就 404 的"升级"按钮。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, type AppConfig } from '../../src/config.js';
import { createVersionRouter, readApkVersion } from '../../src/routes/version.js';

const tmpFiles: string[] = [];

function writeVersionJson(payload: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-version-'));
  const file = path.join(dir, 'version.json');
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
  tmpFiles.push(dir);
  return file;
}

function cfg(overrides: Partial<AppConfig>): AppConfig {
  return { ...loadConfig(), ...overrides };
}

async function getVersion(config: AppConfig): Promise<Record<string, unknown>> {
  const res = await createVersionRouter(config).request('/api/version');
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

afterEach(() => {
  for (const dir of tmpFiles.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('readApkVersion', () => {
  it('读得出版本号与版本码', () => {
    const file = writeVersionJson({ versionName: '1.4.2', versionCode: 7 });
    expect(readApkVersion(file)).toEqual({ versionName: '1.4.2', versionCode: 7 });
  });

  it('文件不存在 / 形状不对 ⇒ 空串 + null（不许猜）', () => {
    expect(readApkVersion(path.join(os.tmpdir(), 'tm-not-exist.json'))).toEqual({
      versionName: '',
      versionCode: null,
    });
    const bad = writeVersionJson({ versionName: '', versionCode: 'x' });
    expect(readApkVersion(bad)).toEqual({ versionName: '', versionCode: null });
  });
});

describe('GET /api/version', () => {
  it('latest 取 version.json，直链按 base + 下载路由拼出来', async () => {
    const file = writeVersionJson({ versionName: '1.2.0', versionCode: 3 });
    const body = await getVersion(
      cfg({ apkVersionFile: file, apkDownloadBaseUrl: 'https://tmword.xyz/', appLatestVersion: '', apkDownloadUrl: '' }),
    );
    expect(body.latest).toBe('1.2.0');
    expect(body.url).toBe('https://tmword.xyz/api/download/tmword-1.2.0.apk');
    expect(body.latestCode).toBe(3);
  });

  it('显式 APK_DOWNLOAD_URL 优先级最高', async () => {
    const file = writeVersionJson({ versionName: '1.2.0', versionCode: 3 });
    const body = await getVersion(
      cfg({
        apkVersionFile: file,
        apkDownloadBaseUrl: 'https://tmword.xyz',
        apkDownloadUrl: 'https://cdn.example.com/tm.apk',
      }),
    );
    expect(body.url).toBe('https://cdn.example.com/tm.apk');
  });

  it('没有 base ⇒ url 空串（客户端据此不提示）', async () => {
    const file = writeVersionJson({ versionName: '1.2.0', versionCode: 3 });
    const body = await getVersion(cfg({ apkVersionFile: file, apkDownloadBaseUrl: '', apkDownloadUrl: '' }));
    expect(body.latest).toBe('1.2.0');
    expect(body.url).toBe('');
  });

  it('读不到 APK 版本时 latest 退回服务端版本，且 url 必须为空（不弹 404 链接）', async () => {
    const body = await getVersion(
      cfg({
        apkVersionFile: path.join(os.tmpdir(), 'tm-missing-version.json'),
        apkDownloadBaseUrl: 'https://tmword.xyz',
        apkDownloadUrl: '',
        appLatestVersion: '',
      }),
    );
    expect(body.url).toBe('');
    expect(body.latest).toBe(body.version);
  });

  it('本机 version.json 现在就是 1.1.0 / code 2（口径回归）', async () => {
    const body = await getVersion(cfg({ apkDownloadBaseUrl: 'https://tmword.xyz', apkDownloadUrl: '', appLatestVersion: '' }));
    expect(body.latest).toBe('1.1.0');
    expect(body.latestCode).toBe(2);
    expect(body.url).toBe('https://tmword.xyz/api/download/tmword-1.1.0.apk');
  });
});
