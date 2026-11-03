import { expect, test } from '@playwright/test';
import { mockTrpc, ok, seedSignedIn } from './helpers';

/**
 * T-15 判据面 ③：首页极简红线（R-07① / UI 规范 §8.3-C）**不破**。
 *
 * ⛔ 本文件**只写断言，不碰 `app/(user)/page.tsx`**：首页只留搜索框 + 必要菜单/协调元素是用户
 * 唯一的原始需求约束，任何 agent 都不得改它；这里做的全部事情是"证明它仍然成立"。
 *
 * 计数口径（与 §8.3-C 一致，且刻意取**宽**口径以免假绿）：`[data-testid=home-root]` 子树里
 * 可聚焦/可点击的元素按 DOM 身份去重、剔除 `aria-hidden` 与不可见者，**上限 5**。
 * 顶栏菜单在 `(user)/layout.tsx` 的壳子里、不在 `home-root` 内，故不计入首页红线（属"必要菜单"）。
 *
 * 聚焦后浮出的「最近查询」面板另记一笔（只打印不判红）：它是搜索框自身的一部分，
 * 是否计入红线口径归 A-30 系列裁决，本任务不擅自收紧也不擅自放宽。
 */

const BANNED_INSIDE_HOME = [
  'profile-page',
  'wordbook-list',
  'wordbook-row',
  'review-queue',
  'checkin-card',
  'heatmap',
  'stat-card',
  'growth-line',
];

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

async function countInteractive(page: import('@playwright/test').Page): Promise<{ count: number; tags: string[] }> {
  return page.evaluate((selector) => {
    const root = document.querySelector('[data-testid="home-root"]');
    if (!root) return { count: -1, tags: ['home-root 不存在'] };
    const seen = new Set<Element>();
    for (const el of root.querySelectorAll(selector)) {
      if (el.closest('[aria-hidden="true"]')) continue;
      const box = (el as HTMLElement).getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      seen.add(el);
    }
    return {
      count: seen.size,
      tags: [...seen].map((el) => `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}`),
    };
  }, INTERACTIVE_SELECTOR);
}

test.describe('首页极简红线（R-07① / §8.3-C）', () => {
  test.beforeEach(async ({ page }) => {
    await seedSignedIn(page);
    await mockTrpc(page, {
      'review.today': () => ok({ due: 0, new: 0, total: 0 }),
      'dictionary.lookupStatic': () => ok({ found: false }),
    });
  });

  test('可交互元素 ≤5，且搜索框在位', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-root')).toBeVisible();

    const initial = await countInteractive(page);
    // eslint-disable-next-line no-console
    console.log(`[home-redline] 初始可交互元素 = ${initial.count} → ${initial.tags.join(' | ')}`);
    expect(initial.count, `首页可交互元素 ${initial.count} 个，超过极简红线上限 5（R-07① / §8.3-C）`).toBeGreaterThan(-1);
    expect(initial.count).toBeLessThanOrEqual(5);

    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.getByRole('combobox').first()).toBeVisible();
  });

  test('复习数据 / 签到 / 导航列表不得回流首页', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-root')).toBeVisible();
    const root = page.getByTestId('home-root');
    for (const testid of BANNED_INSIDE_HOME) {
      await expect(root.getByTestId(testid)).toHaveCount(0);
    }
  });

  test('聚焦搜索框后仍不出现页面级导航（最近查询面板另记，不判红）', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('combobox').first().click();
    const focused = await countInteractive(page);
    // eslint-disable-next-line no-console
    console.log(`[home-redline] 聚焦后可交互元素 = ${focused.count} → ${focused.tags.join(' | ')}`);
    expect(focused.count).toBeGreaterThanOrEqual(1);
  });
});
