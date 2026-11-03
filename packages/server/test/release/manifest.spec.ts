/**
 * T-21c-iii · N-4（A-47 #105）+ U-4（A-45 #91）—— `scripts/release/restore-drill.mjs` 的 manifest 台账面。
 *
 * 钉死两支（缺一即本轮纸面绿）：
 *  ① 成功演练后 `manifest.json` 同 tag 条目的 `restore_drill` **非 null 且字段齐全**
 *    （U-4 回填：步 5 建条目时 null，主流程末尾对同 file·sha256 条目追加一次更新，仍走唯一产物写点；
 *     台账里该条目**只有一条** —— 回填是原地替换不是重复追加；未演练的无关条目保持 null 不被代填）。
 *  ② 未演练（`restore_drill: null`）/ 结论缺项 → `--manifest-check` **exit 1**；字段齐全 → exit 0。
 *
 * 实现面证据链（改前 → 改后）：改前 schema `:633` 承诺演练结论、实现 `:1075` 从不回填 ⇒ 台账恒 null；
 * 本文件用真跑（spawn 同仓库脚本、真迁移路径、tmpdir 临时实例）钉住回填与其判别力。
 *
 * 数据红线：一切产物只写在 `os.tmpdir()` 下（本 pid 独占目录，afterAll 清理）；仓库根 `data.db` 与
 * `packages/server/data.db` 由被测脚本自身以只读复制方式使用（脚本内有 `legacy_source_untouched` 门），
 * 本文件不打开、不写入任何仓库内路径。演练为缺省 dry-run + `--skip-ddl-parity`（ddl-parity 属 T-25r3
 * 并发面，脚本注释即"只记录不修"，不因其瞬时红判定本轮失败）；pg 侧无本机实例 = 脚本自带显式 SKIP。
 * 本地样例造数的任何数字不进结论 —— 本文件只断言结构/存在性/退出码。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'release', 'restore-drill.mjs');

/** 与 restore-drill.mjs 的 REQUIRED_DRILL_FIELDS 逐字同表（钉 U-4 回填的字段齐全性）。 */
const REQUIRED_DRILL_FIELDS = [
  'restored_integrity',
  'fingerprint_vs_source',
  'backfill_scan_hits',
  'rollback_conclusion_a',
  'rollback_conclusion_b',
  'rollback_conclusion_c',
  'rollback_conclusion_d',
  'executed_at',
  'local_fixture_only',
] as const;

const TMP_ROOT = path.join(os.tmpdir(), `tm-t21c-iii-manifest-${process.pid}`);

interface ManifestEntry {
  tag: string;
  file: string;
  sha256: string;
  restore_drill: Record<string, unknown> | null;
  [k: string]: unknown;
}
interface ManifestDoc {
  entries: ManifestEntry[];
  [k: string]: unknown;
}

function runScript(args: string[], ms: number): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: ms,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const tail = (s: string, n = 15): string =>
  s
    .split('\n')
    .filter(Boolean)
    .slice(-n)
    .join('\n');

function readManifest(dir: string): ManifestDoc {
  const file = path.join(dir, 'manifest.json');
  expect(fs.existsSync(file), `manifest.json 应存在：${file}`).toBe(true);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ManifestDoc;
}

/** 台账条目的演练结论核对（与脚本内 drillIssues 同口径，测试侧独立复算，不 import 脚本）。 */
function drillIssues(entry: ManifestEntry | undefined): string[] {
  if (!entry) return ['条目不存在'];
  const d = entry.restore_drill;
  if (d === undefined) return ['restore_drill 键缺失'];
  if (d === null) return ['restore_drill=null（有备份无演练）'];
  return REQUIRED_DRILL_FIELDS
    .filter((k) => d[k] === undefined || d[k] === null)
    .map((k) => `${k} 缺失/为 null`);
}

/** 手工台账条目：只给 restore_drill 传 null / 残缺对象 / 完备对象三种形态。 */
function handEntry(tag: string, restoreDrill: ManifestEntry['restore_drill']): ManifestEntry {
  return {
    tag,
    kind: 'sqlite',
    driver: 'sqlite',
    file: `pre-release-${tag}.db`,
    size_bytes: 4096,
    sha256: 'ab'.repeat(32),
    created_at: '2026-01-01T00:00:00.000+08:00',
    source_instance: path.join(TMP_ROOT, 'hand-made.db'),
    source_table_counts: { users: 1 },
    local_fixture_only: true,
    restore_drill: restoreDrill,
  };
}

function completeDrill(): Record<string, unknown> {
  const d: Record<string, unknown> = {
    ok: true,
    verdict: 'PASS',
    failed_gates: [],
    restored_integrity: 'ok',
    fingerprint_vs_source: 'EQUAL',
    backfill_scan_hits: 0,
    executed_at: '2026-01-01T00:00:00.000+08:00',
    local_fixture_only: true,
  };
  for (const k of ['a', 'b', 'c', 'd']) d[`rollback_conclusion_${k}`] = `结论(${k})·结构面已证`;
  return d;
}

beforeAll(() => {
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  expect(fs.existsSync(SCRIPT), `被测脚本必须存在：${SCRIPT}`).toBe(true);
});

afterAll(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe('restore-drill manifest 台账（U-4 回填 + N-4 判别力）', () => {
  it(
    '支①：成功演练后同 tag 条目 restore_drill 非 null 且字段齐全；未演练的无关条目保持 null、不被代填',
    { timeout: 540_000 },
    () => {
      const outDir = path.join(TMP_ROOT, 'drill-out');
      fs.mkdirSync(outDir, { recursive: true });
      const UNRELATED = 'v-unrelated-0001';
      fs.writeFileSync(
        path.join(outDir, 'manifest.json'),
        JSON.stringify({ schema_version: 1, entries: [handEntry(UNRELATED, null)] }, null, 2),
      );

      const r = runScript(
        [
          '--out',
          outDir,
          '--tag',
          'v-t21c3',
          '--skip-ddl-parity', // T-25r3 并发面，脚本自身口径为显式 SKIP、不算 PASS 也不算本轮失败
          '--skip-pg', // 本机无 PG 实例（脚本本身也会显式 SKIP，这里只是去掉环境依赖）
        ],
        480_000,
      );
      expect(r.status, `演练应 exit 0，实得 ${r.status}：\n${tail(r.out, 40)}`).toBe(0);
      expect(r.out).toContain('[GATE] ② 步 5/台账 restore_drill 已回填且字段齐全');

      const doc = readManifest(outDir);
      const mine = doc.entries.filter((e) => e.tag === 'v-t21c3');
      // 回填 = 原地更新（唯一产物写点 upsertManifest 以 file+sha256 去重），不是第二条条目
      expect(mine.length, `tag=v-t21c3 应恰有 1 条台账条目`).toBe(1);
      const entry = mine[0];
      // `noUncheckedIndexedAccess` 下 `mine[0]` 不收窄 ⇒ 下面三处直用会报 TS18048；早退守卫只做收窄，
      // 不改判据（上一行已经把 `length === 1` 钉死了，这里只是把它告诉类型系统）。
      if (!entry) throw new Error('tag=v-t21c3 应有恰 1 条台账条目（上一行已钉 length===1）');
      expect(entry.restore_drill, 'restore_drill 回填后不得为 null').not.toBeNull();
      expect(drillIssues(entry), '演练结论字段应齐全').toEqual([]);

      const d = entry.restore_drill as Record<string, unknown>;
      expect(d.ok).toBe(true);
      expect(d.verdict).toBe('PASS');
      expect(Array.isArray(d.failed_gates) && (d.failed_gates as unknown[]).length).toBe(0);
      expect(d.restored_integrity).toBe('ok');
      expect(d.fingerprint_vs_source).toBe('EQUAL');
      expect(typeof d.backfill_scan_hits).toBe('number');
      for (const k of ['a', 'b', 'c', 'd'])
        expect(String(d[`rollback_conclusion_${k}`]).length, `rollback_conclusion_${k}`).toBeGreaterThan(
          40,
        );
      expect(typeof d.executed_at).toBe('string');
      expect(typeof d.local_fixture_only).toBe('boolean');
      expect(d.snapshot_sha256).toBe(entry.sha256);

      // 未演练 = null：演练不替无关条目伪造结论
      const other = doc.entries.find((e) => e.tag === UNRELATED);
      expect(other, '预置的无关条目应仍在台账里').toBeDefined();
      expect(other?.restore_drill).toBeNull();
    },
  );

  it(
    '支②：--manifest-check 对 restore_drill=null / 缺项条目 exit 1，字段齐全 exit 0',
    { timeout: 180_000 },
    () => {
      const dirNull = path.join(TMP_ROOT, 'check-null');
      const dirPartial = path.join(TMP_ROOT, 'check-partial');
      const dirFull = path.join(TMP_ROOT, 'check-full');
      for (const [dir, entry] of [
        [dirNull, handEntry('v-null', null)],
        [dirPartial, handEntry('v-partial', { ...completeDrill(), executed_at: null })],
        [dirFull, handEntry('v-full', completeDrill())],
      ] as const) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'manifest.json'),
          JSON.stringify({ schema_version: 1, entries: [entry] }, null, 2),
        );
      }

      const nullRun = runScript(['--manifest-check', '--out', dirNull, '--tag', 'v-null'], 60_000);
      expect(nullRun.status, `未演练条目必须 exit 1：\n${tail(nullRun.out)}`).toBe(1);
      expect(nullRun.out).toContain('有备份无演练');

      const partialRun = runScript(
        ['--manifest-check', '--out', dirPartial, '--tag', 'v-partial'],
        60_000,
      );
      expect(partialRun.status, `缺项结论必须 exit 1：\n${tail(partialRun.out)}`).toBe(1);
      expect(partialRun.out).toContain('executed_at');

      const missingTag = runScript(
        ['--manifest-check', '--out', dirFull, '--tag', 'v-no-such-tag'],
        60_000,
      );
      expect(missingTag.status, '台账无该 tag 条目（有备份无演练面）→ exit 1').toBe(1);

      const fullRun = runScript(['--manifest-check', '--out', dirFull, '--tag', 'v-full'], 60_000);
      expect(fullRun.status, `结论齐全应 exit 0：\n${tail(fullRun.out)}`).toBe(0);
      expect(fullRun.out).toContain('全部条目演练结论完备');
    },
  );
});
