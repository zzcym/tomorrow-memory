import { expect, test } from '@playwright/test';
import { countOf, mockTrpc, ok, payloadOf, seedSignedIn, sharedErrorCopy, wordbookEntry } from './helpers';

/**
 * T-15 判据面 ①：单词本页 `app/(user)/wordbook/page.tsx`（289 行，第 2 轮 A 落盘）。
 * §10.2 T-15 行要求的 e2e 面：登录态进页 → 列表渲染 / 空态 / 搜索与分组 / 删除（移出）的可观察结果。
 *
 * 跑法：`pnpm --filter @tm/web exec playwright test e2e/wordbook.spec.ts`
 * （配置仍只有 `apps/web/playwright.config.ts` 一份；本文件由 A-41 #59 裁决从 `apps/web/tests/`
 *  **归位**到 `apps/web/e2e/`，由既有的两档视口 project 自动收集，第三档已撤销）。
 *
 * 打桩层与 `e2e/auth-wall.spec.ts` 同源（见 `e2e/helpers.ts` 头注）。
 */

/** `addedAt` 显式拉开差距：默认排序是 `recent`（加入时间倒序），三条必须可判定。 */
const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.parse('2026-09-01T00:00:00Z');
const FIVE = [
  wordbookEntry('pepper', { addedAt: BASE + 3 * DAY, reviewCount: 0 }),
  wordbookEntry('lemon', { addedAt: BASE + 2 * DAY, reviewCount: 2, lastReview: BASE + 1 * DAY }),
  wordbookEntry('epoch', { addedAt: BASE + 1 * DAY, reviewCount: 5, lastReview: BASE - 4 * DAY }),
];

/** 每用例一份可写假数据（`wordbook.remove` 真的从数组里摘掉 ⇒ 断言的是页面重查后的行数）。 */
function freshEntries() {
  return FIVE.map((e) => ({ ...e }));
}

test.describe('单词本页（/wordbook）', () => {
  test('登录态：列表按服务端整数组渲染，行数与总数一致', async ({ page }) => {
    await seedSignedIn(page);
    const calls = await mockTrpc(page, { 'wordbook.list': () => ok(freshEntries()) });

    await page.goto('/wordbook');

    await expect(page.getByTestId('wordbook-list')).toBeVisible();
    await expect(page.getByTestId('wordbook-row')).toHaveCount(3);
    await expect(page.getByTestId('wordbook-row').first()).toContainText('pepper');
    // 首屏确实向服务端要过一次，且没有把别的页面过程当词本数据用。
    expect(countOf(calls, 'wordbook.list')).toBeGreaterThanOrEqual(1);
  });

  test('空态：服务端回空数组时出 `wordbook-empty`，不出列表行', async ({ page }) => {
    await seedSignedIn(page);
    await mockTrpc(page, { 'wordbook.list': () => ok([]) });

    await page.goto('/wordbook');

    await expect(page.getByTestId('wordbook-empty')).toBeVisible();
    await expect(page.getByTestId('wordbook-row')).toHaveCount(0);
  });

  test('未登录：只给登录引导，不发词本查询', async ({ page }) => {
    await seedSignedIn(page, false);
    const calls = await mockTrpc(page, { 'wordbook.list': () => ok(freshEntries()) });

    await page.goto('/wordbook');

    await expect(page.getByTestId('wordbook-signed-out')).toBeVisible();
    expect(countOf(calls, 'wordbook.list')).toBe(0);
  });

  test('搜索：命中数收窄并出实时计数，清空后复原', async ({ page }) => {
    await seedSignedIn(page);
    await mockTrpc(page, { 'wordbook.list': () => ok(freshEntries()) });
    await page.goto('/wordbook');
    await expect(page.getByTestId('wordbook-row')).toHaveCount(3);

    const box = page.getByTestId('wordbook-search').getByRole('combobox');
    await box.fill('pep');
    await box.press('Enter');

    await expect(page.getByTestId('wordbook-row')).toHaveCount(1);
    await expect(page.getByTestId('wordbook-result-count')).toContainText('1');
    await expect(page).toHaveURL(/pep/);

    await page.getByTestId('wordbook-search').getByRole('button').first().click();
    await expect(page.getByTestId('wordbook-row')).toHaveCount(3);
  });

  test('分组（阶段筛选）：切到「新词」只剩 reviewCount 为 0 的那条', async ({ page }) => {
    await seedSignedIn(page);
    await mockTrpc(page, { 'wordbook.list': () => ok(freshEntries()) });
    await page.goto('/wordbook');

    const chips = page.getByTestId('wordbook-filters').getByRole('button');
    await expect(chips).toHaveCount(4, { timeout: 5_000 });
    await chips.nth(1).click();

    await expect(page.getByTestId('wordbook-row')).toHaveCount(1);
    await expect(page.getByTestId('wordbook-row').first()).toContainText('pepper');
  });

  test('删除（移出词本）：行内显式删除按钮发出 `wordbook.remove`，服务端摘除后行消失', async ({ page }) => {
    await seedSignedIn(page);
    const entries = freshEntries();
    const calls = await mockTrpc(page, {
      'wordbook.list': () => ok(entries.map((e) => ({ ...e }))),
      'wordbook.remove': (payload) => {
        const word = (payload as { word?: string; json?: { word?: string } })?.word
          ?? (payload as { json?: { word?: string } })?.json?.word;
        const at = entries.findIndex((e) => e.word === word);
        if (at >= 0) entries.splice(at, 1);
        return ok({ ok: true, removed: at >= 0 });
      },
      'wordbook.add': (payload) => {
        const word = (payload as { word?: string })?.word ?? 'unknown';
        entries.push(wordbookEntry(word));
        return ok({ ok: true, added: true });
      },
    });

    await page.goto('/wordbook');
    await expect(page.getByTestId('wordbook-row')).toHaveCount(3);

    const lemon = page.getByTestId('wordbook-row').filter({ hasText: 'lemon' });
    // 行内控件顺序：星标 → 喇叭 → 删除（`WordbookList.tsx:334/350/364`），删除是最后一颗；
    // 用位置而不是文案定位，免得把 `@tm/shared` 的措辞钉死在前端用例里。
    await lemon.locator('button').last().click();

    await expect.poll(() => countOf(calls, 'wordbook.remove'), { timeout: 8_000 }).toBe(1);
    expect(payloadOf(calls, 'wordbook.remove')).toMatchObject({ word: 'lemon' });
    await expect(page.getByTestId('wordbook-row')).toHaveCount(2);
    await expect(page.getByTestId('wordbook-row').filter({ hasText: 'lemon' })).toHaveCount(0);
  });
});

test('文案真源：改密提示与 `@tm/shared` 的 `TM_ERRORS` 逐字相同（防页面自造口径）', async () => {
  // 本用例不驱动浏览器，只钉住"shared 有这两条定稿文案"这一事实；
  // 页面渲染侧的等值断言在 `e2e/profile.spec.ts`。
  expect(sharedErrorCopy('WEAK_PASSWORD')).toContain('8 位');
  expect(sharedErrorCopy('PASSWORD_MISMATCH')).not.toBe('');
});
