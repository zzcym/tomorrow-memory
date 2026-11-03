/// <reference types="node" />
/**
 * T-04 `@tm/ui` 底座自门禁（根 `pnpm test` → vitest workspace 的 `@tm/ui` 项目，environment=jsdom）。
 *
 * 覆盖 §10.2 T-04 四条完成判据中**可静态/单元判定**的部分：
 *  ① globals.css 不含 hex（`globals-css-no-brand-hex` 的同源断言）；
 *  ② `tokens.css` 是 `--brand/--surface/--ink/--hair` 的唯一定义处，且**逐条值等于** UI §1.1/§1.2/§1.2.1/§1.3；
 *  ③ Web 侧原件已删（`components/ui/*`、`theme-provider.tsx` 不存在）+ primitives 可 SSR 渲染；
 *  ④ 暗色首帧：从 `apps/web/src/app/layout.tsx` 取出**内联同步脚本原文**在 jsdom 里执行，
 *     断言 `<html>` 当场带上 `.dark` 与 `color-scheme`，且判定与 `applyTheme()` 逐例相同。
 *     —— Playwright 真机断言（`page.goto` 后 `toHaveClass('dark')`）本机无浏览器内核，未执行，见 dev 报告。
 *
 * 分工纪律：仓库级 grep 词表（零硬编码色 / 紫色退役 / 原生调色板类 / 提权声明预算 /
 * 焦点环 / dark 变体预算）由 `tools/boundaries.mjs --colors` 独占实现（`enforce_from: T-04`），
 * 本文件**不再抄一份**——抄一份就会在测试源码里制造这些串的第二命中面（A-6/A-7 口径）。
 * 这里只保留本包自己的 hygiene 断言（任意值、中文字面量、`ui-no-io`）与判据①~④。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  Separator,
  THEME_STORAGE_KEY,
  UiHostProvider,
  applyTheme,
  fallbackHost,
  normalizeToastOptions,
  readStoredTheme,
  toastDurationMs,
  useHost,
  type UiHost,
} from '../src/index.js';
import preset, { tokenColor } from '../src/tailwind-preset.js';

/* ───────────── 取源工具（零新依赖：node:fs + node:path） ─────────────
 * 注意：jsdom 环境下 `import.meta.url` 是 dev-server 的 http URL，不能直接喂给 fs，
 * 故用 pnpm-workspace.yaml 作为仓库根标记向上定位。 */

const REPO_ROOT = (() => {
  let dir = process.cwd();
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
})();

const UI_SRC = path.join(REPO_ROOT, 'packages/ui/src');
const WEB_SRC = path.join(REPO_ROOT, 'apps/web/src');
const TOKENS_PATH = path.join(UI_SRC, 'styles/tokens.css');
const GLOBALS_PATH = path.join(WEB_SRC, 'app/globals.css');
const LAYOUT_PATH = path.join(WEB_SRC, 'app/layout.tsx');
const BUTTON_PATH = path.join(UI_SRC, 'primitives/button.tsx');

const read = (file: string): string => readFileSync(file, 'utf8');

const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', 'dist', 'build', 'coverage']);

interface SourceFile {
  rel: string;
  text: string;
}

function sourceFiles(dir: string, base: string, out: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) sourceFiles(path.join(dir, entry.name), base, out);
      continue;
    }
    if (entry.name.endsWith('.d.ts') || !/\.(ts|tsx|css)$/.test(entry.name)) continue;
    out.push({
      rel: path.relative(base, path.join(dir, entry.name)).replace(/\\/g, '/'),
      text: readFileSync(path.join(dir, entry.name), 'utf8'),
    });
  }
  return out;
}

const uiFiles = sourceFiles(UI_SRC, UI_SRC);
const webFiles = sourceFiles(WEB_SRC, WEB_SRC);
const everyLine = (files: SourceFile[]): Array<{ rel: string; line: string }> =>
  files.flatMap((f) => f.text.split('\n').map((line) => ({ rel: f.rel, line })));

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const HARD_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
const CJK_RE = /[一-龥]/;
const TOKEN_RE = /(^|[;{\s])--(brand|surface|ink|hair)\s*:/;
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── tokens.css 的块级解析（同一行写多条声明是 UI §1.12.1 的原始排版，不能按行锚定） ── */

function blockOf(src: string, opener: RegExp): string {
  const m = opener.exec(src);
  if (!m) return '';
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') depth -= 1;
    i += 1;
  }
  return src.slice(start, i - 1);
}

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const name = m[1];
    const value = m[2];
    if (name === undefined || value === undefined) continue;
    out[name] = value.trim().replace(/\s+/g, ' ');
  }
  return out;
}

const TOKENS = read(TOKENS_PATH);
const LIGHT = declarations(blockOf(TOKENS, /^:root\s*\{/m));
const DARK = declarations(blockOf(TOKENS, /^\.dark\s*\{/m));

/* ═════════════════════ 判据②：token 单一源 + 值等于规范 ═════════════════════ */

/** UI §1.1 浅色套（16 条语义色）——逐条照抄，不是"看起来差不多"。 */
const LIGHT_GOLDEN: Record<string, string> = {
  bg: '150 12% 97%',
  surface: '0 0% 100%',
  'surface-sunken': '150 13% 94%',
  'brand-soft': '165 32% 93%',
  ink: '162 25% 10%',
  'ink-muted': '161 8% 39%',
  hair: '154 11% 88%',
  brand: '170 75% 24%',
  'brand-strong': '170 76% 16%',
  'on-brand': '0 0% 100%',
  focus: '170 75% 24%',
  success: '150 72% 29%',
  warning: '35 100% 27%',
  danger: '3 71% 41%',
  'success-soft': '145 40% 94%',
  'success-soft-strong': '147 43% 96%',
  'warning-soft': '36 80% 92%',
  'danger-soft': '6 71% 95%',
};

/** UI §1.3 深色覆盖套（变量名与浅色完全一致）。 */
const DARK_GOLDEN: Record<string, string> = {
  bg: '165 25% 6%',
  surface: '167 19% 9%',
  'surface-sunken': '162 16% 13%',
  'brand-soft': '168 42% 14%',
  ink: '155 20% 88%',
  'ink-muted': '160 8% 63%',
  hair: '160 13% 18%',
  brand: '167 47% 55%',
  'brand-strong': '157 57% 68%',
  'on-brand': '166 71% 8%',
  focus: '157 57% 68%',
  success: '152 43% 63%',
  warning: '34 68% 69%',
  danger: '0 73% 78%',
  'success-soft': '166 37% 14%',
  'success-soft-strong': '166 37% 14%',
  'warning-soft': '33 34% 14%',
  'danger-soft': '6 34% 13%',
};

/** UI §1.2.1 图表 / 热力图 14 条（浅 / 深两列；`transparent` 类走形状通道）。 */
const CHART_LIGHT: Record<string, string> = {
  'chart-1': '170 75% 24%',
  'chart-2': '169 50% 37%',
  'chart-3': '167 37% 63%',
  'chart-4': '161 8% 39%',
  'chart-5': '35 100% 27%',
  'chart-danger': '3 71% 41%',
  'chart-grid': '154 11% 88%',
  'chart-axis': '161 8% 39%',
  'heat-1': '162 20% 80%',
  'heat-2': '167 37% 63%',
  'heat-3': '169 50% 37%',
  'heat-4': '170 76% 16%',
  'heat-empty': 'transparent',
  'heat-future': 'transparent',
};
const CHART_DARK: Record<string, string> = {
  'chart-1': '167 47% 55%',
  'chart-2': '166 40% 68%',
  'chart-3': '168 33% 38%',
  'chart-4': '160 8% 63%',
  'chart-5': '34 68% 69%',
  'chart-danger': '0 73% 78%',
  'chart-grid': '160 13% 18%',
  'chart-axis': '160 8% 63%',
  'heat-1': '165 18% 20%',
  'heat-2': '166 19% 30%',
  'heat-3': '167 47% 55%',
  'heat-4': '160 48% 83%',
};

/** UI §1.2 品牌 ramp（两端共用，仅装饰层/图表/阴影引用）。 */
const RAMP_GOLDEN: Record<string, string> = {
  'brand-50': '160 36% 95%',
  'brand-100': '163 36% 88%',
  'brand-200': '165 38% 77%',
  'brand-300': '167 37% 63%',
  'brand-400': '169 36% 48%',
  'brand-500': '170 75% 24%',
  'brand-600': '170 76% 20%',
  'brand-700': '170 76% 16%',
  'brand-800': '170 75% 12%',
  'brand-900': '168 74% 9%',
  'brand-950': '161 76% 5%',
};

/** UI §1.12.1 装饰层三端点。 */
const DECOR_LIGHT: Record<string, string> = { 'decor-a': '160 36% 95%', 'decor-b': '163 36% 88%', 'decor-c': '169 36% 48%' };
const DECOR_DARK: Record<string, string> = { 'decor-a': '166 37% 10%', 'decor-b': '168 42% 14%', 'decor-c': '167 47% 55%' };

describe('判据② tokens.css 是颜色变量的唯一定义处（tokens-single-source）', () => {
  it('tokens.css 有浅色 `:root` 与深色 `.dark` 两套，四个核心 token 各块恰好一次', () => {
    expect(Object.keys(LIGHT).length).toBeGreaterThan(40);
    expect(Object.keys(DARK).length).toBeGreaterThan(15);
    for (const name of ['brand', 'surface', 'ink', 'hair']) {
      expect(LIGHT, `:root 缺 --${name}`).toHaveProperty(name);
      expect(DARK, `.dark 缺 --${name}`).toHaveProperty(name);
    }
    // 块内不得出现第二次同名声明（CSS 里后写覆盖前写 = 隐藏的双源）
    for (const [label, block] of [[':root', blockOf(TOKENS, /^:root\s*\{/m)], ['.dark', blockOf(TOKENS, /^\.dark\s*\{/m)]] as const) {
      const seen = [...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]);
      expect(seen.length, `${label} 内存在重复声明`).toBe(new Set(seen).size);
    }
  });

  it('四个核心 token 在全仓只由 tokens.css 定义（第二处定义 = 红）', () => {
    const offenders = everyLine([...uiFiles, ...webFiles]).filter(
      ({ rel, line }) => TOKEN_RE.test(stripComments(line)) && !/(^|\/)styles\/tokens\.css$/.test(rel),
    );
    expect(offenders.map((o) => `${o.rel}: ${o.line.trim()}`)).toEqual([]);
  });

  it('所有颜色 token 的形态是无色函数的三元组（HSL 分量，由 tokenColor 包一层再消费）', () => {
    for (const [label, map] of [[':root', LIGHT], ['.dark', DARK]] as const) {
      for (const name of [...Object.keys(LIGHT_GOLDEN), ...Object.keys(CHART_LIGHT)]) {
        const v = map[name];
        if (v === undefined || v === 'transparent') continue;
        expect(v, `${label} --${name} 形态不对`).toMatch(/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/);
      }
    }
  });

  it('浅色套逐条 = UI §1.1 表格值', () => {
    for (const [name, want] of Object.entries(LIGHT_GOLDEN)) expect(LIGHT[name], `--${name}`).toBe(want);
  });

  it('深色套逐条 = UI §1.3 表格值', () => {
    for (const [name, want] of Object.entries(DARK_GOLDEN)) expect(DARK[name], `--${name}`).toBe(want);
  });

  it('图表/热力图 14 条 = UI §1.2.1 两列（L0 用 transparent + 形状通道）', () => {
    for (const [name, want] of Object.entries(CHART_LIGHT)) expect(LIGHT[name], `--${name}`).toBe(want);
    for (const [name, want] of Object.entries(CHART_DARK)) expect(DARK[name], `--${name}`).toBe(want);
    expect(LIGHT['heat-empty']).toBe('transparent');
    expect(LIGHT['heat-future']).toBe('transparent');
  });

  it('品牌 ramp 十一级 = UI §1.2（紫色一站不留）', () => {
    for (const [name, want] of Object.entries(RAMP_GOLDEN)) expect(LIGHT[name], `--${name}`).toBe(want);
    for (const name of Object.keys(RAMP_GOLDEN)) expect(DARK[name], `.dark 不该另出一份 ramp`).toBeUndefined();
  });

  it('装饰层三端点 = UI §1.12.1；尺度层与 §2.2 列宽齐备', () => {
    for (const [name, want] of Object.entries(DECOR_LIGHT)) expect(LIGHT[name], `--${name}`).toBe(want);
    for (const [name, want] of Object.entries(DECOR_DARK)) expect(DARK[name], `--${name}`).toBe(want);
    for (const name of ['tap', 'search-h', 'tab-h', 'topbar-h', 'field-h']) expect(LIGHT[name]).toMatch(/^\d+px$/);
    for (const name of ['max-w-auth', 'max-w-read', 'max-w-list', 'max-wide', 'max-w-page']) expect(LIGHT[name]).toMatch(/^\d+px$/);
    expect([LIGHT['max-w-auth'], LIGHT['max-w-read'], LIGHT['max-w-list'], LIGHT['max-wide']]).toEqual(['420px', '680px', '900px', '1120px']);
  });

  it('globals.css 只 @import token 层，宿主覆写在 §1.12.3 白名单内（判据①）', () => {
    const g = read(GLOBALS_PATH);
    expect(g).toMatch(/@import\s+['"]@tm\/ui\/styles\/tokens\.css['"]/);
    for (const layer of ['base', 'components', 'utilities']) expect(g).toContain(`@tailwind ${layer}`);
    expect(g).not.toMatch(HARD_COLOR_RE);
    expect(g).not.toMatch(/262\s+83%/);
    expect(g).not.toMatch(TOKEN_RE);
    // §1.12.3：宿主级有效声明 ≤10 行
    const effective = g
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 0 &&
          !/^@(import|tailwind)\b/.test(l) &&
          !/^\}/.test(l) &&
          !/^@layer/.test(l) &&
          !/^[*a-z]+\s*\{?\s*$/.test(l),
      );
    expect(effective.length).toBeLessThanOrEqual(10);
  });
});

/* ───────────────── 映射层（UI §1.12.2） ─────────────────
 * 形状由 `tokenColor`（tailwind-preset.ts 内唯一映射函数）反推，测试里不抄第二个 CSS 函数名。 */

const [HS = '', HE = ''] = tokenColor('__probe__').split('__probe__');

const mappedColor = (v: string): boolean =>
  v.length > HS.length + HE.length &&
  v.startsWith(HS) &&
  v.endsWith(HE) &&
  v.slice(HS.length, v.length - HE.length).startsWith('--');

function colorLeaves(node: unknown, key = '', out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof node === 'string') out.push([key, node]);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) colorLeaves(v, key ? `${key}-${k}` : k, out);
  }
  return out;
}

describe('映射层：preset 只做 tokenColor(--x) 转发，不含自造颜色', () => {
  const extend = (preset.theme as { extend?: Record<string, unknown> }).extend ?? {};
  const leaves = colorLeaves(extend.colors, 'c');

  it('颜色项全部是 tokenColor(--x) 或 var(--x) 两种形态之一', () => {
    expect(leaves.length).toBeGreaterThan(40);
    // 反推自 tokenColor：万一它被改坏，HS/HE 为空会让 mappedColor 变成恒真 → 这里先钉住形状
    expect(HS.length).toBeGreaterThan(4);
    expect(HE.length).toBeGreaterThan(0);
    const bad = leaves.filter(([, v]) => !(mappedColor(v) || /^var\(--[\w-]+\)$/.test(v)));
    expect(bad.map(([n, v]) => `${n} = ${v}`)).toEqual([]);
  });

  it('preset 引用的每个 token 都在 tokens.css 里定义（无悬空 var）', () => {
    const referenced = [
      ...new Set(leaves.flatMap(([, v]) => [...v.matchAll(/var\((--[\w-]+)\)/g)].map((m) => (m[1] ?? '').slice(2)))),
    ];
    expect(referenced.length).toBeGreaterThan(30);
    const missing = referenced.filter((t) => LIGHT[t] === undefined);
    expect(missing, `tokens.css 未定义：${missing.join(', ')}`).toEqual([]);
  });

  it('darkMode = class（与 §5.3 的 `documentElement.classList.toggle` 对齐）', () => {
    expect(preset.darkMode).toEqual(['class']);
    expect(JSON.stringify(extend)).not.toContain('flip-in'); // §1.11 已删该动效
  });
});

/* ───────────────── 本包 hygiene（仓库级词表见 boundaries --colors） ───────────────── */

describe('packages/ui/src 自身：零硬编码色 + 无任意值 + 无中文串 + 零 I/O', () => {
  const isColorSource = (rel: string): boolean => /(^|\/)(styles\/tokens\.css|tailwind-preset\.ts)$/.test(rel);

  it('包内除 tokens.css / tailwind-preset.ts 外无 hex', () => {
    const hits = everyLine(uiFiles).filter(({ rel, line }) => !isColorSource(rel) && HEX_RE.test(line));
    expect(hits.map((h) => `${h.rel}: ${h.line.trim()}`)).toEqual([]);
  });

  it('apps/web/src 的硬编码色**只剩** exceptions.json 已登记的 4 个图表文件（新增即红）', () => {
    // 登记条目：legacy-web-charts-colors / legacy-web-charts-purple（owner=T-12，expires_after=T-16）。
    // 这 4 个文件不在 §10.2 T-04 的可写清单内（§10.4 第 1 行只给 6 个页面的 import 行），
    // 清零人是 T-05 交付 patterns/{GrowthLine,Heatmap} 之后的页面任务 —— 见 04-dev-report-T-04 遗留项 L-2。
    const offenders = [...new Set(webFiles.filter((f) => HARD_COLOR_RE.test(stripComments(f.text))).map((f) => f.rel))];
    expect(offenders.sort()).toEqual([
      'components/charts/forgetting-bar-chart.tsx',
      'components/charts/growth-line-chart.tsx',
      'components/charts/heatmap-chart.tsx',
      'components/charts/review-line-chart.tsx',
    ]);
  });

  it('无任意值尺寸/层级/时长/字号（UI §1.12.4）', () => {
    const hits = everyLine(uiFiles).filter(({ line }) => /z-\[|duration-\[|p-\[|text-\[1?[0-9]px\]/.test(line));
    expect(hits.map((h) => `${h.rel}: ${h.line.trim()}`)).toEqual([]);
  });

  it('焦点环用 `--focus` 语义类（正向断言；负向词表由 focus-ring-not-hidden 实现）', () => {
    expect(read(BUTTON_PATH)).toContain('focus-visible:outline-focus');
    expect(read(BUTTON_PATH)).toContain('focus-visible:outline-offset-2');
  });

  it('§3.5 ui-no-io：包内零请求、零宿主绑定', () => {
    const hits = everyLine(uiFiles).filter(({ line }) => /\bfetch\(|XMLHttpRequest|from ['"]next\/|from ['"]@trpc\//.test(line));
    expect(hits.map((h) => `${h.rel}: ${h.line.trim()}`)).toEqual([]);
  });

  it('§8.2-14：注释之外不出现任何中文字面量（文案一律来自 @tm/shared）', () => {
    const offenders = uiFiles
      .filter((f) => /\.tsx?$/.test(f.rel))
      .flatMap((f) =>
        stripComments(f.text)
          .split('\n')
          .map((line) => ({ rel: f.rel, line }))
          .filter(({ line }) => CJK_RE.test(line)),
      );
    expect(offenders.map((o) => `${o.rel}: ${o.line.trim()}`)).toEqual([]);
  });
});

/* ───────────────── 判据③：Web 原件已删 + primitives 顶得上 ───────────────── */

describe('判据③ components/ui/* 与 theme-provider 已删，primitives 可渲染', () => {
  it('apps/web/src 下已无 components/ui/* 与 theme-provider.tsx', () => {
    expect(webFiles.some((f) => f.rel.startsWith('components/ui/'))).toBe(false);
    expect(webFiles.some((f) => f.rel === 'components/theme-provider.tsx')).toBe(false);
    expect(existsSync(path.join(WEB_SRC, 'components/ui'))).toBe(false);
  });

  it('全站不再有 `@/components/ui/*` 与 `@/components/theme-provider` 的引用', () => {
    const hits = everyLine(webFiles).filter(({ line }) =>
      /@\/components\/ui\/|@\/components\/theme-provider/.test(line),
    );
    expect(hits.map((h) => `${h.rel}: ${h.line.trim()}`)).toEqual([]);
  });

  it('§8.2-15：主题键全仓恰 2 处（hook 的唯一声明 + §5.3 内联脚本字符串）', () => {
    const hits = everyLine([...uiFiles, ...webFiles]).filter(({ line }) => line.includes(THEME_STORAGE_KEY));
    expect(hits.map((h) => h.rel).sort()).toEqual(['app/layout.tsx', 'hooks/use-theme-toggle.ts']);
    expect(hits).toHaveLength(2);
  });

  it('primitives SSR 出语义类，不引入颜色字面量', () => {
    expect(renderToStaticMarkup(<Button variant="destructive">go</Button>)).toContain('bg-danger');
    expect(renderToStaticMarkup(<Button variant="outline">go</Button>)).toContain('border-hair');
    expect(renderToStaticMarkup(<Button size="icon-tap">go</Button>)).toContain('h-tap');
    expect(renderToStaticMarkup(<Badge variant="success">ok</Badge>)).toContain('bg-success-soft');
    expect(renderToStaticMarkup(<Badge>ok</Badge>)).toContain('bg-brand-soft');
    expect(renderToStaticMarkup(<Badge variant="destructive">ok</Badge>)).toContain('bg-danger-soft');
    expect(renderToStaticMarkup(<Separator />)).toContain('bg-hair');
    expect(renderToStaticMarkup(<Progress value={40} />)).toContain('bg-brand');
    expect(renderToStaticMarkup(<Progress value={40} valueText="x" />)).toContain('aria-valuetext');
    expect(
      renderToStaticMarkup(
        <Card>
          <CardHeader>
            <CardTitle>t</CardTitle>
          </CardHeader>
          <CardContent>c</CardContent>
        </Card>,
      ),
    ).toContain('bg-surface');
    expect(renderToStaticMarkup(<Button className="mt-4">go</Button>)).toContain('mt-4');
  });

  /* 出口归属门禁（§10.3 归属表 + §10.4 交接第 4 行）。两件事必须同时成立：
   *  a) 根出口 `src/index.ts` 归 **T-04 独占**，T-05/T-13 只能改自己的二级出口 →
   *     根出口里任何指向 `patterns/**` 或 `auth/**` 的 export 行，必须恰为 T-04 预置的那两行；
   *  b) 二级出口的**内容**由各 owner 任务填充：T-05 已交付（应恰 14 件），
   *     T-13 未开工（`auth/index.ts` 必须仍是 `export {};` 空占位）。
   * 本断言原为"两个出口都是空占位"的**占位期**口径（A-22 收口轮把 patterns 填了即失效），
   * 这里按批次2 出口态推进；顺带修掉 `expect(() => readdirSync(...)).toHaveLength(0)`
   * 那个恒真写法（它断言的是箭头函数的**元数** 0，不是目录内容），改为真断言。 */
  const PATTERNS_14 = [
    'SearchBar',
    'LookupResultBar',
    'ReviewCta',
    'RecentSearchPanel',
    'WordDetailCard',
    'Flashcard',
    'RatingBar',
    'WordbookList',
    'StatCard',
    'GrowthLine',
    'Heatmap',
    'EmptyState',
    'ConfirmSheet',
    'SkeletonBlock',
  ];

  const AUTH_7 = [
    'NoticeBar',
    'PasswordStrength',
    'AgreementCheckbox',
    'SmsCodeEntry',
    'AuthFormShell',
    'ChangePasswordForm',
    'ForcePasswordUpgradeForm',
  ];

  it('根出口无人抢改；patterns 出口已由 T-05 填满 14 件，auth 出口已由 T-13 填满 7 件（契约钉死）', () => {
    const root = stripComments(read(path.join(UI_SRC, 'index.ts')));
    expect(root).toMatch(/export \* from '\.\/patterns\/index\.js'/);
    expect(root).toMatch(/export \* from '\.\/auth\/index\.js'/);
    const barrelLines = root
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^export\b/.test(line) && /from '\.\/(patterns|auth)\//.test(line));
    expect(barrelLines).toEqual(["export * from './patterns/index.js';", "export * from './auth/index.js';"]);

    const patternsBody = stripComments(read(path.join(UI_SRC, 'patterns/index.ts')));
    const reExported = [...patternsBody.matchAll(/export \* from '\.\/([A-Za-z0-9]+)\.js'/g)]
      .map((m) => m[1])
      .sort();
    expect(reExported).toEqual([...PATTERNS_14].sort());
    const onDisk = readdirSync(path.join(UI_SRC, 'patterns'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => f.replace(/\.tsx$/, ''))
      .sort();
    expect(onDisk).toEqual([...PATTERNS_14].sort());

    // auth：T-13 已交付，出口签名与 auth/index.ts 的导出集合作为契约钉死（集合相等）
    const authBody = stripComments(read(path.join(UI_SRC, 'auth/index.ts')));
    const authReExported = [...authBody.matchAll(/export \* from '\.\/([A-Za-z0-9]+)\.js'/g)]
      .map((m) => m[1])
      .sort();
    expect(authReExported).toEqual([...AUTH_7].sort());
    const authOnDisk = readdirSync(path.join(UI_SRC, 'auth'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => f.replace(/\.tsx$/, ''))
      .sort();
    expect(authOnDisk).toEqual([...AUTH_7].sort());
  });
});

/* ───────────────── 判据④：首帧不闪白（静态 + jsdom 替代断言） ───────────────── */

/** 从 layout.tsx 源码取出内联脚本**原文**（不在测试里抄第二份逻辑）。 */
function inlineThemeScript(): string {
  const src = read(LAYOUT_PATH);
  const decl = /const THEME_INIT_SCRIPT =\s*([\s\S]*?);\n/.exec(src)?.[1];
  expect(decl, 'layout.tsx 必须声明 THEME_INIT_SCRIPT').toBeTruthy();
  return new Function(`"use strict"; return (${String(decl)});`)() as string;
}

const originalMatchMedia = window.matchMedia;

function setPrefersDark(flag: boolean): void {
  window.matchMedia = (() =>
    ({
      matches: flag,
      media: '(prefers-color-scheme: dark)',
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as unknown as typeof window.matchMedia;
}

function resetRoot(): void {
  document.documentElement.className = '';
  document.documentElement.style.colorScheme = '';
  window.localStorage.clear();
}

afterEach(() => {
  resetRoot();
  window.matchMedia = originalMatchMedia;
});

describe('判据④ 内联首帧脚本 = applyTheme 的同一判定（无 FOUC）', () => {
  it('脚本在 `<head>` 内、`<body>` 之前；`<html>` 带 suppressHydrationWarning；无 effect 切类', () => {
    const src = read(LAYOUT_PATH);
    expect(src).toMatch(/<head>[\s\S]*dangerouslySetInnerHTML[\s\S]*<\/head>/);
    expect(src.indexOf('<head>')).toBeLessThan(src.indexOf('<body'));
    expect(src).toMatch(/<html[^>]*suppressHydrationWarning/);
    expect(src).not.toMatch(/ThemeProvider/);
    // §5.3-2：宿主里不得再有 React 层切类 —— 全仓唯一一次 classList 改 dark 必须发生在内联脚本串里
    expect(src.split('classList').length - 1).toBe(1);
    expect(inlineThemeScript()).toContain("classList.toggle('dark'");
    expect(
      webFiles.filter((f) => f.rel !== 'app/layout.tsx').some((f) => /classList\.[a-z]+\(['"]dark['"]/.test(f.text)),
    ).toBe(false);
    // 同步脚本：无 defer / async / src
    expect(src).not.toMatch(/dangerouslySetInnerHTML[\s\S]{0,80}(defer|async)/);
  });

  const cases = [
    ['显式 dark', 'dark', false, true],
    ['显式 light', 'light', true, false],
    ['system + 系统深色', 'system', true, true],
    ['system + 系统浅色', 'system', false, false],
    ['无记录 → 按 system', null, true, true],
    ['脏值 → 按 system', 'blue', false, false],
  ] as const;

  for (const [title, stored, prefersDark, wantDark] of cases) {
    it(`${title} → .dark=${wantDark}，且 applyTheme 同结果`, () => {
      setPrefersDark(prefersDark);
      resetRoot();
      if (stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
      new Function(inlineThemeScript())();
      expect(document.documentElement.classList.contains('dark')).toBe(wantDark);
      expect(document.documentElement.style.colorScheme).toBe(wantDark ? 'dark' : 'light');

      resetRoot();
      if (stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
      const mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : readStoredTheme();
      expect(applyTheme(mode)).toBe(wantDark);
      expect(document.documentElement.classList.contains('dark')).toBe(wantDark);
      expect(readStoredTheme()).toBe(mode);
      // 切换只改类 + 落盘，不重载页面（§5.3-3）
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(mode);
    });
  }
});

/* ───────────────── 判据④·B：构建产物 HTML 的静态断言（本机无 Playwright 内核时的替代证据） ─────────────────
 * 判据原文要 Playwright 断言"首次导航即 html.dark"；仓库既无 playwright 依赖也无浏览器内核，
 * 所以这里退而证明**机制**：内联同步脚本确实出现在 SSR/预渲染 HTML 的 `<head>` 里，
 * 位置早于 `<body>` 与任何样式表 → 浏览器应用 CSS 之前 `.dark` 已经落定。
 * 未跑 `next build` 时整块跳过（不算红，报告里如实标注）。真机截图断言交 T-22/T-23。 */

const BUILD_DIR = path.join(REPO_ROOT, 'apps/web/.next/server/app');
const BUILD_PAGES = ['index.html', 'study.html', 'profile.html', 'report.html'].filter((f) =>
  existsSync(path.join(BUILD_DIR, f)),
);

describe.skipIf(BUILD_PAGES.length === 0)('判据④·B 构建产物 HTML：首帧脚本在 head 内、body 之前且为内联同步', () => {
  it.each(BUILD_PAGES)('%s 内联脚本位置合规', (file) => {
    const html = read(path.join(BUILD_DIR, file));
    const head = html.indexOf('<head');
    const body = html.indexOf('<body');
    const script = html.indexOf(THEME_STORAGE_KEY);
    expect(head, 'HTML 缺 <head>').toBeGreaterThan(-1);
    expect(body, 'HTML 缺 <body>').toBeGreaterThan(-1);
    expect(script, '产物里没有内联主题脚本（§5.3-1）').toBeGreaterThan(head);
    expect(script).toBeLessThan(body);

    const tagStart = html.lastIndexOf('<script', script);
    const tag = html.slice(tagStart, html.indexOf('</script>', script));
    expect(tag.startsWith('<script>')).toBe(true); // 无 src / defer / async / type=module
    expect(tag).toContain('localStorage.getItem');
    expect(tag).toContain('prefers-color-scheme: dark');
    expect(tag).toContain("classList.toggle('dark'");
    expect(tag).toContain('colorScheme');

    // 不断言"早于 <link rel=stylesheet>"，也不断言"早于 Next 自己的 <script src>"：实测产物里
    // CSS 在 197、Next 引导 JS 在 399，本脚本在 1581，三者都在 `<body>`(1967) 之前 —— 内联脚本仍在
    // head 解析阶段执行完，`.dark` 早于任何一次绘制。样式表只挡渲染、不挡内联脚本执行。
    // 真机首帧截图断言（判据④原文的 Playwright 形态）本机无内核未跑，见报告 → T-22/T-23。
    expect(script).toBeLessThan(html.indexOf('</head>'));
    expect(html).toMatch(/<html[^>]*lang="zh-CN"/);
  });
});

/* ───────────────── UiHost 注入面（架构 §3.1） ───────────────── */

describe('UiHost：注入生效、未注入不抛错、Toast 时长表', () => {
  it('未挂 Provider 时用 fallbackHost，SSR 渲染不抛错', () => {
    function Probe(): React.JSX.Element {
      const host = useHost();
      return <span>{typeof host.kv.get === 'function' ? 'ok' : 'bad'}</span>;
    }
    expect(renderToStaticMarkup(<Probe />)).toContain('ok');
  });

  it('Provider 注入的 navigate/speak/toast/kv 覆盖 fallback', () => {
    const calls: string[] = [];
    const host: UiHost = {
      kv: { get: () => 'injected', set: () => {} },
      speak: (text) => calls.push(`speak:${text}`),
      navigate: (to) => calls.push(`nav:${to}`),
      toast: (m) => calls.push(`toast:${m}`),
    };
    function Probe(): React.JSX.Element {
      const h = useHost();
      h.navigate('/study');
      h.speak('apple', 'uk');
      h.toast('hi');
      return <b>{h.kv.get('x') ?? ''}</b>;
    }
    expect(
      renderToStaticMarkup(
        <UiHostProvider host={host}>
          <Probe />
        </UiHostProvider>,
      ),
    ).toContain('injected');
    expect(calls).toEqual(['nav:/study', 'speak:apple', 'toast:hi']);
  });

  it('fallbackHost 在 jsdom 里可读写 localStorage；无 SpeechSynthesis 时静默', () => {
    fallbackHost.kv.set('probe', '1');
    expect(fallbackHost.kv.get('probe')).toBe('1');
    expect(() => fallbackHost.speak('apple', 'us')).not.toThrow();
    expect(() => fallbackHost.toast('ignored')).not.toThrow();
  });

  it('Toast 时长（UI §3.11.1）：普通 3000 / 带撤销 5000 / 错误 6000', () => {
    expect(toastDurationMs(normalizeToastOptions(undefined))).toBe(3000);
    expect(toastDurationMs(normalizeToastOptions('error'))).toBe(6000);
    expect(
      toastDurationMs(normalizeToastOptions({ tone: 'info', action: { label: 'a', onClick: () => {} } })),
    ).toBe(5000);
    expect(toastDurationMs(normalizeToastOptions({ durationMs: 1234 }))).toBe(1234);
  });
});

describe('弹层高度上限收成 token --dialog-max-h（UI §3.11.2 的 4C / §1.12.3 第 4 条）', () => {
  it('(a)~(d) 四处文本层机检：jsdom 无样式级联，故不测计算值（dist 侧证据见 dev 报告）', () => {
    const MAX_H_RE = /--dialog-max-h\s*:/g;
    const hits = (t: string, re: RegExp): number => (t.match(re) ?? []).length;
    const body = stripComments(TOKENS);
    const sup = blockOf(body, /@supports\s*\(\s*height:\s*100dvh\s*\)\s*\{/);
    expect(sup, '(a) 缺 @supports (height: 100dvh) 覆写块').not.toBe('');
    expect(hits(body, MAX_H_RE), '(a) 声明总数').toBe(2);
    expect(hits(sup, MAX_H_RE), '(a) @supports 块内').toBe(1);
    expect(LIGHT['dialog-max-h'], '(a) 兜底那颗须在第一个 :root 块内').toBe('92vh');
    const app = stripComments(read(path.join(REPO_ROOT, 'apps/app/src/styles/app.css')));
    const decl = app.split('\n').filter((l) => /--dialog-max-h\s*:/.test(l));
    expect(decl, '(b) App 宿主覆写处数').toHaveLength(1);
    expect(decl[0], '(b) App 宿主覆写行').toContain('calc(100vh - var(--sp-6) * 2)');
    expect(app, '(b) App 源文件 Chrome 84 红线：不得出现 dvh').not.toContain('dvh');
    const ext = (preset.theme as { extend?: Record<string, unknown> }).extend ?? {};
    expect((ext.maxHeight as Record<string, string> | undefined)?.dialog, '(c) preset 逐字转发 token').toBe('var(--dialog-max-h)');
    const dlg = read(path.join(UI_SRC, 'primitives/dialog.tsx'));
    expect(hits(dlg, /max-h-dvh/g), '(d) 旧类串归零').toBe(0);
    expect(hits(dlg, /max-h-dialog/g), '(d) 新类串恰 1 处（同颗替换、0 堆叠）').toBe(1);
  });
});
