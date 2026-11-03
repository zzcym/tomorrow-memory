/// <reference types="node" />
/**
 * T-05 `@tm/ui/patterns` 自门禁（vitest workspace 的 `@tm/ui` 项目，environment=jsdom）。
 *
 * 覆盖 §10.2 T-05 六条完成判据里**可在 jsdom + 源码层判定**的部分：
 *  ① 14 件全 props 驱动、包内零 IO（源码扫描 + `depcruise ui-no-io` 双保险）；
 *  ② `RatingBar` 四档 + 撤销位，评分值域只来自 `@tm/shared` 的 `RATING_VALUES`（源码级断言）；
 *  ③ `WordbookList` 左滑删除（pointer events）+ 行内喇叭 + 显式删除回调；
 *  ④ `Heatmap` 三模式 + 滚动区外的点选信息条；
 *  ⑤ `SearchBar` 经 ref 暴露 `focus()`；
 *  ⑥ 375×667 / 412×915 两档的**静态**越宽断言（jsdom 不做布局，见文件末尾的说明）；
 *    判据⑥ 要求的**一条 Playwright 真机尺寸用例本机无内核、未执行**，待 T-22 补（见末尾说明第 2 条）。
 *
 * A-14：`node:fs` 在 `test/**` 里是允许的（本文件读源码做断言，不读业务数据）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ARIA,
  PROGRESS_COPY,
  RATING_LABELS_ORDERED,
  RATING_VALUES,
  RECENT_MAX,
  WORDBOOK_COPY,
  formatStreak,
  type RatingValue,
  type RecentSearchItemDto,
} from '@tm/shared';

import {
  ConfirmSheet,
  EmptyState,
  Flashcard,
  GrowthLine,
  Heatmap,
  LookupResultBar,
  RatingBar,
  RecentSearchPanel,
  ReviewCta,
  SearchBar,
  SkeletonBlock,
  StatCard,
  WordbookList,
  WordDetailCard,
  UiHostProvider,
  fallbackHost,
  type SearchBarHandle,
  type ToastOptions,
  type UiHost,
} from '../src/index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ───────────────────────── 仓库定位与源文件 ───────────────────────── */

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

const PATTERNS_DIR = path.join(REPO_ROOT, 'packages/ui/src/patterns');

const COMPONENTS = [
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
] as const;

const sourceOf = (name: string): string =>
  readFileSync(path.join(PATTERNS_DIR, `${name}.tsx`), 'utf8');

/** 注释里的 `[1,2,3,4]` 是契约说明，不是代码字面量；判据②/③ 的"值域不外泄"只看代码。 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ───────────────────────── 测试用宿主与挂载 ───────────────────────── */

interface SpyHost extends UiHost {
  toasts: Array<{ message: string; options?: ToastOptions | 'info' | 'error' | 'success' }>;
  navigations: string[];
  spoken: string[];
}

function makeHost(): SpyHost {
  const store = new Map<string, string>();
  const toasts: SpyHost['toasts'] = [];
  const navigations: string[] = [];
  const spoken: string[] = [];
  return {
    kv: { get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => void store.set(k, v) },
    speak: (text: string) => void spoken.push(text),
    navigate: (to: string) => void navigations.push(to),
    toast: (message: string, options?: ToastOptions | 'info' | 'error' | 'success') =>
      void toasts.push({ message, options }),
    toasts,
    navigations,
    spoken,
  };
}

let mounted: { root: Root; container: HTMLElement; host: SpyHost } | null = null;

/** 挂一棵真 DOM 树（判据③④⑤要派发 pointer / keydown / focus 事件）。 */
function mount(
  node: React.ReactElement,
): { container: HTMLElement; host: SpyHost; rerender: (next: React.ReactElement) => void } {
  const host = makeHost();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const tree = (child: React.ReactElement): React.ReactElement => (
    <UiHostProvider host={host}>{child}</UiHostProvider>
  );
  act(() => {
    root.render(tree(node));
  });
  mounted = { root, container, host };
  return {
    container,
    host,
    rerender: (next) => {
      act(() => {
        root.render(tree(next));
      });
    },
  };
}

function unmount(): void {
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => {
    root.unmount();
  });
  container.remove();
  mounted = null;
}

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

/** 派发一个带坐标的 pointer 事件（jsdom 无 `PointerEvent` 构造器，用 MouseEvent 同名事件即可）。 */
function pointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  y: number,
): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }),
    );
  });
}

function key(target: Element, keyName: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true }));
  });
}

/* ═════════════ 判据①：props 驱动 + 包内零 IO + 契约齐备 ═════════════ */

describe('判据① patterns 全部 props 驱动、零 IO（§3.5 ui-no-io）', () => {
  it('14 个组件文件 + README + 二级出口都在盘上', () => {
    const onDisk = readdirSync(PATTERNS_DIR).filter((f) => f.endsWith('.tsx')).map((f) => f.replace(/\.tsx$/, ''));
    expect(COMPONENTS.every((c) => onDisk.includes(c))).toBe(true);
    expect(onDisk.length).toBe(COMPONENTS.length);
    expect(existsSync(path.join(PATTERNS_DIR, 'README.md'))).toBe(true);
    const barrel = readFileSync(path.join(PATTERNS_DIR, 'index.ts'), 'utf8');
    for (const name of COMPONENTS) {
      expect(barrel).toContain(`./${name}.js`);
    }
  });

  it('README 契约：每个组件一节 props 表（批次2 出口后不得再改签名）', () => {
    const readme = readFileSync(path.join(PATTERNS_DIR, 'README.md'), 'utf8');
    const sections = readme.split(/\r?\n/).filter((l) => /^## \d+\./.test(l));
    expect(sections.length).toBe(COMPONENTS.length);
    for (const name of COMPONENTS) {
      expect(readme).toContain(`${name}.tsx`);
    }
  });

  it.each(COMPONENTS)('%s.tsx 内无请求 / 无宿主绑定 / 无时钟与随机数', (name) => {
    const src = sourceOf(name);
    expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|axios|useQuery\(/);
    expect(src).not.toMatch(/from ['"](next\/|@trpc\/|node:|react-dom\/)/);
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|window\.location/);
    expect(src).not.toMatch(/Date\.now\(|new Date\(\)|Math\.random\(/);
  });

  it('评分/词本/热力图的数据字面量不落在组件里（值域只来自 @tm/shared）', () => {
    for (const name of ['RatingBar', 'Flashcard', 'WordbookList', 'Heatmap']) {
      const src = stripComments(sourceOf(name));
      expect(src).not.toMatch(/\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*\]/);
      expect(src).not.toMatch(/rating\s*===?\s*\d/);
      expect(src).not.toMatch(/case\s+\d\s*:/);
    }
  });

  it('H-1（A-23-3）：闪卡横滑阈值只来自 @tm/shared，组件内不写 60/64 字面量', () => {
    const src = sourceOf('Flashcard');
    expect(src).toContain('FLASHCARD_SWIPE_THRESHOLD_PX');
    expect(src).not.toMatch(/CARD_SWIPE_SUBMIT_PX/);
    expect(stripComments(src)).not.toMatch(/\b6[04]\b/);
  });
});

/* ═════════════ 判据②：RatingBar 四档同权重 + 撤销位 ═════════════ */

describe('判据② RatingBar（§3.5.4 / §7.4）', () => {
  it('渲染四档、标签与序来自 shared，且没有主推实心档', () => {
    const { container } = mount(<RatingBar onSelect={() => {}} />);
    const buttons = Array.from(container.querySelectorAll('button[type="button"]'));
    expect(buttons).toHaveLength(RATING_VALUES.length);
    expect(buttons.map((b) => b.textContent?.trim())).toEqual([...RATING_LABELS_ORDERED]);
    /* 同权重：四颗按钮在同一 grid 轨道里，类名只差语义色，不允许出现第 5 颗或 `.primary-rate`。 */
    const track = container.querySelector('[role="group"] > div');
    expect(track?.firstElementChild?.parentElement?.className).toContain('grid-cols-4');
    expect(container.innerHTML).not.toMatch(/primary-rate/);
    expect(new Set(buttons.map((b) => b.className.split(' ').filter((c) => /^bg-/.test(c)).join(' '))).size).toBe(
      RATING_VALUES.length,
    );
  });

  it('点第 N 档 → onSelect(RATING_VALUES[N-1])；键盘 ←/→ 走 RATING_KEY_MAP', () => {
    const onSelect = vi.fn();
    const { container } = mount(<RatingBar onSelect={onSelect} intervals={{ [RATING_VALUES[3]]: '4 天后' }} />);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[type="button"]'));
    act(() => buttons[0]?.click());
    expect(onSelect).toHaveBeenLastCalledWith(RATING_VALUES[0]);
    act(() => buttons[3]?.click());
    expect(onSelect).toHaveBeenLastCalledWith(RATING_VALUES[3]);
    onSelect.mockClear();
    key(container.querySelector('[role="group"]') as Element, 'ArrowLeft');
    expect(onSelect).toHaveBeenCalledWith(RATING_VALUES[0]);
    onSelect.mockClear();
    key(container.querySelector('[role="group"]') as Element, 'ArrowRight');
    expect(onSelect).toHaveBeenCalledWith(RATING_VALUES[RATING_VALUES.length - 1]);
    onSelect.mockClear();
    key(container.querySelector('[role="group"]') as Element, String(RATING_VALUES[2]));
    expect(onSelect).toHaveBeenCalledWith(RATING_VALUES[2]);
  });

  it('interval 小字进 aria-label；撤销位只在 remaining>0 时出现', () => {
    const { container } = mount(
      <RatingBar
        onSelect={() => {}}
        intervals={{ [RATING_VALUES[1]]: '2 天后' }}
        undo={{ onUndo: () => {}, remaining: 2 }}
      />,
    );
    const second = container.querySelectorAll('button[type="button"]')[1];
    expect(second?.getAttribute('aria-label')).toBe(ARIA.rating(RATING_VALUES[1], '2 天后'));
    expect(container.querySelector(`button[aria-label="${ARIA.undoRating}"]`)).not.toBeNull();
    expect(container.innerHTML).toContain('2/3');
    unmount();
    const empty = mount(<RatingBar onSelect={() => {}} undo={{ onUndo: () => {}, remaining: 0 }} />);
    expect(empty.container.querySelector(`button[aria-label="${ARIA.undoRating}"]`)).toBeNull();
  });

  it('disabled 用 aria-disabled 而非 disabled（§7.5 不丢焦点）', () => {
    const { container } = mount(<RatingBar onSelect={() => {}} disabled />);
    const button = container.querySelector('button[type="button"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(false);
  });
});

/* ═════════════ 判据③：WordbookList 左滑 + 喇叭 + 显式删除 ═════════════ */

const WB_ITEMS = [
  { word: 'happy', phonetic: '/ˈhæpi/', gloss: 'adj. 快乐的', meta: 'x' },
  { word: 'tomorrow', gloss: '', badge: { label: 'b' } },
];

describe('判据③ WordbookList（§3.6.2 / §3.6.4 / §3.6.7）', () => {
  it('行 = `<a>` + 兄弟 `<button>`，不嵌套交互元素', () => {
    const { container } = mount(
      <WordbookList
        items={WB_ITEMS}
        hrefFor={(word) => `/word/${word}?from=wordbook`}
        onSpeak={() => {}}
        onToggleFavorite={() => {}}
        onDelete={() => {}}
        rowAriaLabel={(word) => `查看 ${word} 的详情`}
        deleteAriaLabel={(word) => `从单词本删除 ${word}`}
        glossFallback="（暂无释义）"
      />,
    );
    const rows = container.querySelectorAll('li');
    expect(rows).toHaveLength(WB_ITEMS.length);
    const first = rows[0] as HTMLElement;
    const anchor = first.querySelector('a') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/word/happy?from=wordbook');
    expect(anchor.getAttribute('aria-label')).toBe('查看 happy 的详情');
    expect(anchor.querySelector('button')).toBeNull();
    expect(first.querySelectorAll(':scope > div:last-child > button')).toHaveLength(3);
    expect(anchor.textContent).toContain('happy');
    /* 首义缺失走 glossFallback，不留空行（§3.6.2） */
    expect(rows[1]?.textContent).toContain('（暂无释义）');
  });

  it('左滑 ≥64px 松手 → onDelete + 撤销 toast（`WORDBOOK_COPY.swipeDelete.undoToast`）', () => {
    const onDelete = vi.fn();
    const onUndoDelete = vi.fn();
    const { container, host } = mount(
      <WordbookList
        items={WB_ITEMS}
        hrefFor={(word) => `/word/${word}`}
        onDelete={onDelete}
        onUndoDelete={onUndoDelete}
        deleteAriaLabel={(word) => `从单词本删除 ${word}`}
      />,
    );
    const row = container.querySelectorAll('li')[0] as HTMLElement;
    const dragLayer = row.querySelector(':scope > div:last-child') as Element;
    pointer(dragLayer, 'pointerdown', 300, 200);
    pointer(dragLayer, 'pointermove', 210, 205);
    pointer(dragLayer, 'pointerup', 210, 205);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete.mock.calls[0]?.[0]).toMatchObject({ word: 'happy' });
    expect(onDelete.mock.calls[0]?.[1]).toBe(0);
    expect(host.toasts[0]?.message).toBe(WORDBOOK_COPY.swipeDelete.undoToast('happy'));
    const action = (host.toasts[0]?.options as ToastOptions | undefined)?.action;
    expect(action?.onClick).toBeTypeOf('function');
    act(() => action?.onClick());
    expect(onUndoDelete).toHaveBeenCalledTimes(1);
  });

  it('未达提交阈值 → 回弹，不删除；纵向位移判为滚动并终止手势', () => {
    const onDelete = vi.fn();
    const { container } = mount(
      <WordbookList items={WB_ITEMS} hrefFor={(word) => `/word/${word}`} onDelete={onDelete} />,
    );
    const row = container.querySelectorAll('li')[0] as HTMLElement;
    const dragLayer = row.querySelector(':scope > div:last-child') as Element;
    pointer(dragLayer, 'pointerdown', 300, 200);
    pointer(dragLayer, 'pointermove', 290, 240);
    pointer(dragLayer, 'pointerup', 290, 240);
    expect(onDelete).not.toHaveBeenCalled();
    expect(row.innerHTML).not.toContain('translateX(-1');
    unmount();
    const second = mount(<WordbookList items={WB_ITEMS} hrefFor={(w) => `/word/${w}`} onDelete={onDelete} />);
    const layer2 = (second.container.querySelectorAll('li')[0] as HTMLElement).querySelector(':scope > div:last-child') as Element;
    pointer(layer2, 'pointerdown', 300, 200);
    pointer(layer2, 'pointermove', 250, 205);
    pointer(layer2, 'pointerup', 250, 205);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('显式删除按钮 = 左滑的等价出口（R-15 ⑥）；喇叭只发音不跳转', () => {
    const onDelete = vi.fn();
    const onSpeak = vi.fn();
    const { container, host } = mount(
      <WordbookList
        items={WB_ITEMS}
        hrefFor={(word) => `/word/${word}`}
        onDelete={onDelete}
        onSpeak={onSpeak}
        deleteAriaLabel={(word) => `从单词本删除 ${word}`}
      />,
    );
    const buttons = Array.from(container.querySelectorAll('li:first-child button')) as HTMLButtonElement[];
    const speaker = buttons.find((b) => b.getAttribute('aria-label') === ARIA.speak('happy'));
    const trash = buttons.find((b) => b.getAttribute('aria-label') === '从单词本删除 happy');
    expect(speaker).toBeDefined();
    expect(trash?.disabled).toBe(false);
    act(() => trash?.click());
    expect(onDelete).toHaveBeenCalledTimes(1);
    act(() => speaker?.click());
    expect(onSpeak).toHaveBeenCalledWith('happy');
    expect(host.navigations).toHaveLength(0);
  });

  it('点行进详情走 `host.navigate`；`onDelete` 缺省时不渲染左滑与删除（§3.6.4）', () => {
    const { container, host, rerender } = mount(
      <WordbookList items={WB_ITEMS} hrefFor={(word) => `#/word/${word}`} />,
    );
    expect(container.querySelector('[data-swipe-open]')).toBeNull();
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();
    act(() => {
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(host.navigations).toEqual([
      ...host.navigations.filter((n) => n !== '#/word/happy'),
      '#/word/happy',
    ]);
    rerender(<WordbookList items={[]} hrefFor={(word) => `#/word/${word}`} loading />);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});

/* ═════════════ 判据④：Heatmap 三模式 + 点选信息条 ═════════════ */

const HEAT_DAYS = [
  { key: '2026-03-01', count: 0 },
  { key: '2026-03-02', count: 1 },
  { key: '2026-03-03', count: 4 },
  { key: '2026-03-04', count: 12 },
  { key: '2026-03-05', count: 2 },
];

function heat(props: Partial<React.ComponentProps<typeof Heatmap>> = {}): React.ReactElement {
  return (
    <Heatmap
      days={HEAT_DAYS}
      today="2026-03-05"
      mode="daily"
      weeks={4}
      legend={{ left: '少', right: '多', ranges: '0–12 词' }}
      ariaLabel="每日背词热力图，最近一年"
      {...props}
    />
  );
}

describe('判据④ Heatmap（§3.7.2 / §3.7.3 / §7.1 唯一豁免）', () => {
  it('三模式受控 + 图例 + 月份轴 + 53 周默认；色阶只用 heat token', () => {
    const onModeChange = vi.fn();
    const { container } = mount(heat({ weeks: 53, monthsAxis: true, onModeChange }));
    const triggers = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(triggers.map((t) => t.textContent)).toEqual(
      (Object.keys(PROGRESS_COPY.heatmapModes) as Array<keyof typeof PROGRESS_COPY.heatmapModes>).map(
        (k) => PROGRESS_COPY.heatmapModes[k],
      ),
    );
    /* 受控：Radix segmented 默认 automatic 激活，键盘 Tab 到第 3 档即回吐 'cumulative'，
       组件自己不改 `mode`（DOM 仍停在 daily 取色）。 */
    act(() => triggers[2]?.focus());
    expect(onModeChange).toHaveBeenLastCalledWith('cumulative');
    expect(triggers[0]?.getAttribute('data-state')).toBe('active');
    expect(container.textContent).toContain('少');
    expect(container.textContent).toContain('多');
    expect(container.textContent).toContain('0–12 词');
    const html = container.innerHTML;
    expect(html).toMatch(/bg-heat-[1-4]/);
    expect(html).toMatch(/border-dashed/);
    expect(html).toMatch(/bg-heat-future/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    /* 格阵横向滚动只允许发生在 `.heatmap-scroll`（§3.7.5-5） */
    expect(container.querySelector('.heatmap-scroll')).not.toBeNull();
  });

  it('点选 → onSelect 带 `label`；信息条在滚动区之外且未点选时无文字', () => {
    const onSelect = vi.fn();
    const { container } = mount(heat({ onSelect, selectedKey: '2026-03-04' }));
    const status = container.querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent).toBe('');
    expect(container.querySelector('.heatmap-scroll')?.contains(status)).toBe(false);
    const cell = Array.from(container.querySelectorAll('[role="gridcell"]')).find(
      (c) => c.getAttribute('aria-label') === PROGRESS_COPY.heatCell('2026-03-04', 12),
    ) as HTMLElement;
    act(() => cell.click());
    expect(onSelect).toHaveBeenCalledWith({
      key: '2026-03-04',
      count: 12,
      label: PROGRESS_COPY.heatCell('2026-03-04', 12),
    });
    unmount();
    const withTip = mount(heat({ tip: '3 月 4 日背了 12 个词', selectedKey: '2026-03-04' }));
    expect(withTip.container.querySelector('[role="status"]')?.textContent).toBe(
      '3 月 4 日背了 12 个词',
    );
  });

  it('格子不进焦点序（§3.7.3），命中区外扩；每周模式下整列一个高格', () => {
    const { container } = mount(heat());
    expect(container.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(0);
    const expand = container.querySelector('[role="gridcell"] > span[aria-hidden="true"]') as HTMLElement;
    expect(expand.style.inset).toBe('-6px');
    unmount();
    const weekly = mount(heat({ mode: 'weekly' }));
    const rows = weekly.container.querySelectorAll('[role="row"]');
    expect(rows.length).toBeLessThanOrEqual(1);
    const big = weekly.container.querySelector('[role="gridcell"]') as HTMLElement;
    expect(parseInt(big.style.height, 10)).toBeGreaterThan(30);
    unmount();
    const cumulative = mount(heat({ mode: 'cumulative' }));
    expect(cumulative.container.innerHTML).toMatch(/bg-heat-[1-4]/);
  });

  it('L0 用虚线框（形状通道）；0 值格与未来格的可访问名区分', () => {
    const { container } = mount(heat());
    const empty = Array.from(container.querySelectorAll('[role="gridcell"]')).find((c) =>
      (c.getAttribute('aria-label') ?? '').includes('没有学习'),
    ) as HTMLElement;
    expect(empty.className).toContain('border-dashed');
    const future = Array.from(container.querySelectorAll('span[aria-hidden="true"].bg-heat-future'));
    expect(future.length).toBeGreaterThan(0);
  });

  it('浏览模式：同数据纯文本 `<table>` 是键盘出口', () => {
    const onBrowseToggle = vi.fn();
    const { container } = mount(
      heat({ onBrowseToggle, browseLabel: '浏览热力图' }),
    );
    const trigger = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('浏览热力图'),
    ) as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    act(() => trigger.click());
    expect(onBrowseToggle).toHaveBeenCalledWith(true);
    expect(container.querySelector('table')).not.toBeNull();
  });
});

/* ═════════════ 判据⑤：SearchBar 暴露 focus() ═════════════ */

describe('判据⑤ SearchBar（§3.1.5 / §7.4）', () => {
  it('ref.focus() 聚焦输入框并全选；blur() 生效', () => {
    const handle = React.createRef<SearchBarHandle>();
    const { container } = mount(
      <SearchBar ref={handle} value="ap" onChange={() => {}} label="查单词" />,
    );
    const input = container.querySelector('input') as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    act(() => handle.current?.focus());
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(2);
    act(() => handle.current?.blur());
    expect(document.activeElement).not.toBe(input);
    expect(handle.current?.getInput()).toBe(input);
  });

  it('role=search + sr-only label + combobox 口径；Esc 走 onClear 且保住焦点', () => {
    const onClear = vi.fn();
    const { container } = mount(
      <SearchBar value="ap" onChange={() => {}} onClear={onClear} label="查单词" panelOpen panelId="recent" />,
    );
    const search = container.querySelector('[role="search"]');
    expect(search).not.toBeNull();
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe('recent');
    expect(container.querySelector('label')?.className).toContain('sr-only');
    act(() => input.focus());
    key(input, 'Escape');
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
  });

  it('hero/list 两档高度 = 50px 与 44px；busy 时放大镜换环', () => {
    const { container } = mount(<SearchBar value="" onChange={() => {}} label="查单词" />);
    expect(container.querySelector('[role="search"] > div')?.className).toContain('h-search');
    unmount();
    const list = mount(<SearchBar value="" onChange={() => {}} label="查单词" size="list" />);
    expect(list.container.querySelector('[role="search"] > div')?.className).toContain('h-tap');
    unmount();
    const busy = mount(<SearchBar value="" onChange={() => {}} label="查单词" busy />);
    expect(busy.container.innerHTML).toMatch(/animate-spinner|animate-breath/);
  });

  /* I-02 判据④的必红反证锚点：焦点环必须**真实存在**于铺满胶囊的 `<input>` 上
     （正向断言，同 ui.spec.tsx 对 button 的口径；负向词表由 focus-ring-not-hidden 闸实现）。
     临时删掉 `focus-visible:outline-*` ⇒ 本条必红。 */
  it('I-02：SearchBar 焦点环 = input 贴胶囊整圈（outline-focus + offset-0），⛔ 被摘', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'packages/ui/src/patterns/SearchBar.tsx'), 'utf8');
    expect(src).toContain('focus-visible:outline-focus');
    expect(src).toContain('focus-visible:outline-offset-0');
    expect(src).toContain('absolute inset-0');
  });
});

/* ═════════════ 判据⑥：两档视口下的越宽静态断言 ═════════════ */

/** 全组件的代表性 props（用于渲染出真实 DOM，再检查内联像素宽度）。 */
function gallery(): React.ReactElement {
  const recent: RecentSearchItemDto[] = Array.from({ length: 25 }, (_, i) => ({
    word: `word${String(i)}`,
    direction: 'auto' as const,
    gloss: '一片很长的中文释义用来验证截断行为是否会把行撑宽到溢出'.slice(0, 40),
    at: 1_700_000_000_000 + i,
  }));
  return (
    <>
      <SearchBar value="hello world" onChange={() => {}} label="查单词" />
      <SearchBar value="" onChange={() => {}} label="查单词" size="list" />
      <LookupResultBar word="hello" phonetic="həˈloʊ" gloss="int. 你好" detailHref="/word/hello" />
      <LookupResultBar word="hello" gloss="" layout="row" detailHref="#/word/hello" partial partialHint="p" />
      <ReviewCta due={7} href="/study" streak={3} />
      <RecentSearchPanel open items={recent} onSelect={() => {}} noGlossLabel="（无释义）" timeLabel={() => '刚刚'} />
      <WordDetailCard
        word="antithesis"
        phonetic="/ænˈtɪθəsɪs/"
        groups={[{ pos: 'n.', meanings: ['对照', '对立', '反义', '第四个', '第五个'] }]}
        examples={[
          { en: 'a very long english example sentence to check wrapping behaviour', zh: '很长的中文例句' },
        ]}
        inflections={[{ tag: 'p:', form: 'hugged' }, { tag: 'zz:', form: 'hidden' }]}
        enDefinition="a contrast between two ideas"
        enDefinitionLabel="英文释义"
        meaningLabel="释义"
        exampleLabel="例句"
        mnemonicState="collapsed"
        mnemonicCollapsedLabel="看记法"
        studyLabel="立即背这个词"
        onStudy={() => {}}
      />
      <Flashcard word="antithesis" phonetic="/x/" side="front" index={3} total={12} onFlip={() => {}} />
      <Flashcard
        word="antithesis"
        side="back"
        index={3}
        total={12}
        groups={[{ pos: 'n.', meanings: ['对照'] }]}
        detailLabel="查这个词"
        onOpenDetail={() => {}}
      />
      <RatingBar onSelect={() => {}} undo={{ onUndo: () => {}, remaining: 1 }} />
      <WordbookList items={WB_ITEMS} hrefFor={(w) => `#/word/${w}`} onDelete={() => {}} onSpeak={() => {}} />
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="本周新增" value={0} />
        <StatCard label="今日待复习" value={128} unit="词" tone="warning" onClick={() => {}} />
        <StatCard label="连续天数" value={7} unit="天" delta="+2" />
      </div>
      <GrowthLine
        data={[
          { date: '2026-03-01', value: 42 },
          { date: '2026-03-02', value: 61 },
          { date: '2026-03-03', value: 96 },
        ]}
        accessibleSummary="近 30 天掌握词数增长曲线：从 42 词增长到 96 词"
        seriesLabels={{ primary: '新增单词' }}
      />
      <Heatmap
        days={HEAT_DAYS}
        today="2026-03-05"
        mode="daily"
        weeks={53}
        legend={{ left: '少', right: '多' }}
        ariaLabel="每日背词热力图，最近一年"
      />
      <EmptyState title="还没有背过词" hint="背完第一轮，这里就有内容了。" primary={{ label: '去背单词', onClick: () => {} }} />
      <SkeletonBlock variant="list-rows" />
      <SkeletonBlock variant="heatmap-grid" />
    </>
  );
}

describe('判据⑥ 375×667 / 412×915：静态越宽断言（无布局引擎，见说明）', () => {
  const VIEWPORTS = [
    { name: '375×667', width: 375 },
    { name: '412×915', width: 412 },
  ];

  it.each(VIEWPORTS)('$name：渲染产出的内联像素宽度与 Tailwind 固定宽度都不越过视口', ({ width }) => {
    const html = renderToStaticMarkup(
      <UiHostProvider host={fallbackHost}>{gallery()}</UiHostProvider>,
    );
    const inline = [...html.matchAll(/(?:width|min-width)\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((m) =>
      Number(m[1]),
    );
    expect(inline.length).toBeGreaterThan(0);
    expect(Math.max(...inline)).toBeLessThan(width);
    const fixed = [...html.matchAll(/\b(?:max-w|w|min-w)-\[(\d+)px\]/g)].map((m) => Number(m[1]));
    expect(fixed.every((px) => px < width)).toBe(true);
    /* 唯一允许横向溢出的地方 = 热力图滚动容器 */
    const parts = html.split('heatmap-scroll');
    expect(parts.length).toBeGreaterThan(1);
    expect(html).not.toMatch(/overflow-x-auto(?![\S\s]*heatmap-scroll)/);
  });

  it('两档视口共用同一份 DOM：断点差异只写在类名里（`max-md:` / `md:`），不复制组件', () => {
    const html = renderToStaticMarkup(
      <UiHostProvider host={fallbackHost}>{gallery()}</UiHostProvider>,
    );
    expect(html).toMatch(/max-md:text-h3-xs|max-md:line-clamp-1/);
    expect(html).toMatch(/md:block|md:hidden|md:hover:outline-2/);
    expect(html).not.toMatch(/dark:/);
  });

  it('包内不引图片资源、不写 `!important`，长串一律 truncate/line-clamp', () => {
    for (const name of COMPONENTS) {
      const src = sourceOf(name);
      expect(src).not.toMatch(/<img|\.png|\.svg['"]|url\(/);
      expect(src).not.toMatch(/!important/);
    }
    const bar = sourceOf('LookupResultBar');
    expect(bar).toMatch(/line-clamp-2|truncate/);
    const wb = sourceOf('WordbookList');
    expect(wb).toMatch(/truncate/);
  });
});

/* ───────────── 判据⑥ 的执行边界（文件开头第 11 行承诺的"末尾说明"在此） ─────────────
 * 1) 本 describe 跑在 jsdom 上，**jsdom 没有布局引擎**：`offsetWidth`/`getBoundingClientRect`
 *    恒为 0，CSS 也不参与盒模型计算。所以这里做的是**静态**越宽断言 ——
 *    从 SSR 串里抽出所有内联 `width`/`min-width` 像素值与 Tailwind 固定宽度类，
 *    逐个与 375 / 412 比对，并确认唯一的横向溢出面是 `.heatmap-scroll`（§3.7.5-5）。
 *    它能证伪"组件写了超过视口的固定宽"，**不能**证明真机无横向滚动条。
 * 2) 判据⑥ 原文还要求"一条 Playwright 尺寸用例"。**本机未安装 Playwright**
 *    （`node_modules/.pnpm` 无 playwright 包、`%LOCALAPPDATA%/ms-playwright` 不存在、
 *    `apps/web/e2e/` 目录尚未由 T-12 建），执行条件不具备，未伪造结果。
 *    与 A-17（T-04 真机首帧未执行）同一处置口径：**375×667 / 412×915 两档的真机
 *    `document.scrollingElement.scrollWidth <= innerWidth` 断言，待 T-22 在装有内核的
 *    环境补一次**（App 侧同样的一条归 T-17 判据⑤，其真机面亦待 T-22）。
 */

/* ═════════════ 其余 9 件：结构与状态（快照式断言） ═════════════ */

describe('LookupResultBar / ReviewCta / RecentSearchPanel（§3.2 / §3.1.5 / §3.3）', () => {
  it('结果条 = role=group + 显式 `<a>`；星标 aria-pressed；TTS 不可用仍保持可点', () => {
    const { container, host } = mount(
      <LookupResultBar
        word="hello"
        phonetic="həˈloʊ"
        gloss="int. 你好"
        detailHref="/word/hello?from=home"
        detailAriaLabel="查看 hello 的完整释义"
        inWordbook
        onToggleFavorite={() => {}}
        ttsUnavailable
        ttsUnavailableHint="点这里安装/切换系统英文语音"
      />,
    );
    expect(container.querySelector('[role="group"]')).not.toBeNull();
    const link = container.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('aria-label')).toBe('查看 hello 的完整释义');
    const star = container.querySelector('button[aria-pressed="true"]') as HTMLButtonElement;
    expect(star.getAttribute('aria-label')).toBe(ARIA.unfavorite('hello'));
    act(() => {
      (link as HTMLAnchorElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(host.navigations).toEqual(['/word/hello?from=home']);
    unmount();
    const tts = mount(
      <LookupResultBar word="hello" detailHref="/word/hello" ttsUnavailable ttsUnavailableHint="装语音" onSpeak={() => {}} />,
    );
    const speaker = Array.from(tts.container.querySelectorAll('button')).find((b) =>
      b.getAttribute('aria-label')?.includes('hello'),
    ) as HTMLButtonElement;
    act(() => speaker.click());
    expect(tts.container.textContent).toContain('装语音');
  });

  it('胶囊是 `<a>`：due / cleared / signedOut 三态与整句 aria-label', () => {
    const { container } = mount(<ReviewCta due={7} href="/study" streak={3} />);
    const link = container.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/study');
    expect(link.textContent).toContain('7');
    expect(link.getAttribute('aria-label')).toContain(formatStreak(3));
    unmount();
    const cleared = mount(<ReviewCta due={0} href="#/study" />);
    expect(cleared.container.textContent).toContain('今天的词背完了');
    unmount();
    const out = mount(<ReviewCta due={2} href="/study" signedIn={false} />);
    expect(out.container.textContent).toContain('登录后可同步');
  });

  it('面板 `open=false` 时整棵子树不渲染；25 条只渲染 RECENT_MAX 条', () => {
    const items: RecentSearchItemDto[] = Array.from({ length: 25 }, (_, i) => ({
      word: `w${String(i)}`,
      direction: 'auto' as const,
      gloss: '',
      at: 1,
    }));
    const { container } = mount(<RecentSearchPanel open={false} items={items} onSelect={() => {}} />);
    expect(container.innerHTML).toBe('');
    const panel = mount(
      <RecentSearchPanel open items={items} onSelect={() => {}} noGlossLabel="（无释义）" />,
    );
    expect(panel.container.querySelectorAll('[data-recent-item]')).toHaveLength(RECENT_MAX);
    expect(panel.container.textContent).toContain('（无释义）');
    const option = panel.container.querySelector('[data-recent-item]') as HTMLButtonElement;
    act(() => option.click());
    unmount();
    const dismissed = mount(<RecentSearchPanel open items={[]} onSelect={() => {}} emptyHint="还没有查询记录" />);
    expect(dismissed.container.textContent).toContain('还没有查询记录');
  });
});

describe('WordDetailCard / Flashcard / SkeletonBlock / EmptyState / ConfirmSheet / StatCard / GrowthLine', () => {
  it('详情卡：无内容的区块整块不渲染；未知词形缩写不上屏；>3 例句折叠', () => {
    const { container } = mount(
      <WordDetailCard
        word="hug"
        groups={[{ pos: 'v.', meanings: ['拥抱', '抱住'] }]}
        inflections={[{ tag: 'p:', form: 'hugged' }, { tag: 'qq:', form: 'secret-form' }]}
        examples={Array.from({ length: 5 }, (_, i) => ({ en: `e${String(i)}`, zh: `中${String(i)}` }))}
        examplesCollapseLabel={(n) => `还有 ${n} 句`}
        inflectionLabel="词形变化"
        mnemonicState="absent"
      />,
    );
    expect(container.innerHTML).not.toContain('qq:');
    expect(container.innerHTML).not.toContain('secret-form');
    expect(container.innerHTML).toContain('hugged');
    expect(container.querySelectorAll('[aria-labelledby="word-detail-en-def"]')).toHaveLength(0);
    const collapsed = Array.from(container.querySelectorAll('li')).filter((li) => li.textContent?.startsWith('e3'));
    expect(collapsed).toHaveLength(0);
    const more = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('还有 2 句'),
    ) as HTMLButtonElement;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    act(() => more.click());
    expect(container.textContent).toContain('e4');
    unmount();
    const empty = mount(<WordDetailCard word="zzz" groups={[{ pos: 'n.', meanings: [] }]} onRetry={() => {}} />);
    expect(empty.container.textContent).toContain(PROGRESS_COPY.fail.title ? '没找到这个词' : '');
    expect(empty.container.querySelectorAll('section')).toHaveLength(1);
  });

  it('详情卡：记法失败态给重试且静态释义仍在；五态 absent 整块不显示', () => {
    const onRetry = vi.fn();
    const { container } = mount(
      <WordDetailCard
        word="hug"
        groups={[{ pos: 'v.', meanings: ['拥抱'] }]}
        mnemonicState="failed"
        mnemonicFailLabel="AI 记法生成失败 · 重试"
        onMnemonicRetry={onRetry}
      />,
    );
    expect(container.textContent).toContain('AI 记法生成失败 · 重试');
    expect(container.textContent).toContain('拥抱');
    act(() => {
      (Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '再试一次') as HTMLButtonElement).click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('闪卡：正/背内容替换（无 3D）、卡内不套 overflow-auto、Space 翻面', () => {
    const onFlip = vi.fn();
    const { container } = mount(
      <Flashcard word="hug" side="front" index={2} total={9} onFlip={onFlip} hint="点击卡片看释义" />,
    );
    expect(container.innerHTML).not.toMatch(/perspective|backface-visibility|transform-style/);
    expect(container.innerHTML).not.toMatch(/overflow-(?:auto|scroll)(?!-x-hidden)/);
    const flip = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === '点击卡片看释义',
    ) as HTMLButtonElement;
    act(() => flip.click());
    expect(onFlip).toHaveBeenCalledTimes(1);
    key(container.firstElementChild as Element, ' ');
    expect(onFlip).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('第 2 张，共 9 张');
    unmount();
    const back = mount(
      <Flashcard
        word="hug"
        side="back"
        index={2}
        total={9}
        groups={[{ pos: 'v.', meanings: ['拥抱'] }]}
        swipeSubmit
        onSwipeRating={() => {}}
      />,
    );
    expect(back.container.textContent).toContain('拥抱');
    expect(back.container.innerHTML).not.toMatch(/overflow-y-auto/);
  });

  it('闪卡：横滑提交走 RATING_VALUES 首末位；无释义态只有重试与跳过', () => {
    const onSwipeRating = vi.fn<(rating: RatingValue) => void>();
    const { container } = mount(
      <Flashcard
        word="hug"
        side="back"
        index={1}
        total={9}
        groups={[{ pos: 'v.', meanings: ['拥抱'] }]}
        swipeSubmit
        testid="fc"
        onSwipeRating={onSwipeRating}
      />,
    );
    /* 手势挂在卡片本体（进度条也是 `div.relative`，所以按根节点的最后一个子节点取）。 */
    const card = container.querySelector('[data-testid="fc"] > div:last-child') as Element;
    expect(card.getAttribute('class')).toContain('touch-pan-y');
    pointer(card, 'pointerdown', 200, 300);
    pointer(card, 'pointermove', 120, 302);
    pointer(card, 'pointerup', 120, 302);
    expect(onSwipeRating).toHaveBeenCalledWith(RATING_VALUES[0]);
    pointer(card, 'pointerdown', 200, 300);
    pointer(card, 'pointermove', 300, 302);
    pointer(card, 'pointerup', 300, 302);
    expect(onSwipeRating).toHaveBeenLastCalledWith(RATING_VALUES[RATING_VALUES.length - 1]);
    unmount();
    const noGloss = mount(
      <Flashcard word="hug" side="back" index={1} total={9} noGloss noGlossHint="不评分也不影响后面的词" onRetryGloss={() => {}} onSkip={() => {}} />,
    );
    expect(noGloss.container.textContent).toContain('这个词暂无释义');
    expect(noGloss.container.textContent).toContain('今天先跳过');
    expect(noGloss.container.innerHTML).not.toMatch(/primary-rate/);
  });

  it('骨架：与真实元素同形同位（role=status + aria-busy + sr-only 文案）', () => {
    const html = renderToStaticMarkup(<SkeletonBlock variant="heatmap-grid" rows={4} label="正在整理学习记录…" />);
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/aria-busy="true"/);
    expect(html).toContain('正在整理学习记录…');
    expect([...html.matchAll(/width:11px/g)]).toHaveLength(28);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('空态：主按钮 1 颗 + 文字链；href 动作走宿主路由', () => {
    const { container, host } = mount(
      <EmptyState
        title="这里没有符合条件的词"
        hint="换个筛选，或者清空搜索看看"
        primary={{ label: '清除筛选', onClick: () => {} }}
        link={{ label: '去查词', href: '/lookup' }}
      />,
    );
    expect(container.querySelectorAll('button')).toHaveLength(1);
    const link = container.querySelector('a') as HTMLAnchorElement;
    act(() => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(host.navigations).toEqual(['/lookup']);
  });

  it('ConfirmSheet：桌面/移动同一份 DOM；pending 锁确认；dismissible=false 时 Esc 不关', () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    mount(
      <ConfirmSheet
        open
        onOpenChange={onOpenChange}
        title="清空最近查询？"
        description="只清这一台设备上的记录。"
        confirmText="清空"
        onConfirm={onConfirm}
        dismissible={false}
        closeLabel="关闭"
        showClose
      />,
    );
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('清空最近查询？');
    expect(dialog.textContent).toContain('只清这一台设备上的记录。');
    const buttons = Array.from(dialog.querySelectorAll('button')) as HTMLButtonElement[];
    const confirm = buttons.find((b) => b.textContent?.trim() === '清空') as HTMLButtonElement;
    act(() => confirm.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    key(dialog, 'Escape');
    expect(onOpenChange).not.toHaveBeenCalled();
    unmount();
    const pendingHost = mount(
      <ConfirmSheet open title="t" confirmText="c" onConfirm={() => {}} pending />,
    );
    void pendingHost;
    const busy = document.body.querySelector('[aria-busy="true"]') as HTMLElement;
    expect(busy.textContent).toContain('c');
    const cancel = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '取消',
    ) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
  });

  it('StatCard：0 显示 0、≥100 走 99+、可点卡是一个 `<button>`', () => {
    const { container } = mount(
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="a" value={0} />
        <StatCard label="b" value={128} unit="词" tone="warning" />
        <StatCard label="c" value={7} onClick={() => {}} valueText="连续 7 天" />
      </div>,
    );
    expect(container.textContent).toContain('0');
    expect(container.textContent).toContain('99+');
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('连续 7 天');
    expect(container.innerHTML).not.toMatch(/shadow-elev-2/);
  });

  it('GrowthLine：纯 SVG + token、role=img + 文本替身；点数不足降级为文字；错误态可重试', () => {
    const html = renderToStaticMarkup(
      <GrowthLine
        data={[
          { date: '2026-03-01', value: 2 },
          { date: '2026-03-02', value: 5 },
          { date: '2026-03-03', value: 9 },
        ]}
        secondary={[
          { date: '2026-03-01', value: 1 },
          { date: '2026-03-02', value: 3 },
          { date: '2026-03-03', value: 4 },
        ]}
        seriesLabels={{ primary: '新增单词', secondary: '复习词数' }}
        accessibleSummary="近 30 天掌握词数增长曲线：从 2 词增长到 9 词"
      />,
    );
    expect(html).toMatch(/role="img"/);
    expect(html).toContain('近 30 天掌握词数增长曲线');
    expect(html).toMatch(/stroke-chart-1/);
    expect(html).toMatch(/<table class="sr-only"/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|recharts/);
    const { container } = mount(
      <GrowthLine data={[{ date: '2026-03-01', value: 1 }]} accessibleSummary="x" tooFewLabel="再多背几天" />,
    );
    expect(container.textContent).toContain('再多背几天');
    expect(container.querySelector('svg')).toBeNull();
    unmount();
    const failed = mount(
      <GrowthLine data={[]} accessibleSummary="x" error onRetry={() => {}} errorTitle="学习情况没拿到" errorBody="再试一次" retryLabel="再试一次" />,
    );
    expect(failed.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(failed.container.textContent).toContain('学习情况没拿到');
  });
});
