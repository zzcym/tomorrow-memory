import { expect, test } from '@playwright/test';
import { countOf, mockTrpc, ok, payloadOf, seedSignedIn, sharedErrorCopy, trpcError } from './helpers';

/**
 * T-15 判据面 ②：账号安全二级页 `app/(user)/profile/security/page.tsx`（110 行，第 2 轮 A 落盘）
 * 与「我的」页瘦身后的三级导航（94 行）。
 *
 * 覆盖：
 *  - 三级导航：`/profile`（我的）→ 点 `profile-row-security` → `/profile/security`（账号安全）
 *    → 页内 `security-form` 的旧密/新密/确认三输入（修改密码）→ `security-back` 回退。
 *  - 服务端校验提示口径：`password-form-error` 渲染的串**逐字等于** `packages/shared` 的
 *    `TM_ERRORS.WEAK_PASSWORD.copy`（用例现读该文件，不硬编码 ⇒ 页面自造文案必红）。
 *  - 成功态：`security-relogin-notice` 出现 + `security-signout` 主动收尾出口清 token。
 *
 * 阻塞项（写进报告，不算 pass）：旧密码真错（`INVALID_CREDENTIAL`）与"改密后 token 失效"
 * 需要真后端 + 真 `auth_tokens`，属 Phase 5/CI；本用例只打桩 tRPC 线格式。
 */

const PROFILE_GET = {
  nickname: 'e2e 用户',
  phone: '13800138000',
  avatar: '',
  daily_goal: 20,
  totalWords: 120,
  reviewDays: 30,
  streak: 5,
  reviewDates: [],
  pwPolicyVersion: 1,
};

const baseHandlers = {
  'profile.get': () => ok(PROFILE_GET),
  'checkin.status': () => ok({ checkedIn: false, doneToday: 0, dueToday: 3, streak: 5 }),
};

const fields = (page: import('@playwright/test').Page) => ({
  old: page.locator('input[name=oldPassword]'),
  next: page.locator('input[name=newPassword]'),
  confirm: page.locator('input[name=confirmPassword]'),
});

async function fillAndSubmit(page: import('@playwright/test').Page, oldPassword: string, newPassword: string) {
  const f = fields(page);
  await f.old.fill(oldPassword);
  await f.next.fill(newPassword);
  await f.confirm.fill(newPassword);
  await page.getByTestId('password-submit').click();
}

test.describe('账号安全页（/profile/security）', () => {
  test('三级导航：我的 → 账号安全 → 修改密码表单，并能回退', async ({ page }) => {
    await seedSignedIn(page);
    await mockTrpc(page, baseHandlers);

    await page.goto('/profile');
    await expect(page.getByTestId('profile-page')).toBeVisible();

    await page.getByTestId('profile-row-security').click();
    await expect(page).toHaveURL(/\/profile\/security/);
    await expect(page.getByTestId('profile-security')).toBeVisible();

    // 第三级：改密表单的三个字段 + 提交钮（`ChangePasswordForm` 与强制改密共用同一组件）。
    const f = fields(page);
    await expect(f.old).toBeVisible();
    await expect(f.next).toBeVisible();
    await expect(f.confirm).toBeVisible();
    await expect(page.getByTestId('password-submit')).toBeVisible();

    await page.getByTestId('security-back').click();
    await expect(page.getByTestId('profile-page')).toBeVisible();
    expect(page.url()).not.toMatch(/\/profile\/security/);
  });

  test('新密码不足 8 位：字段级提示逐字等于 `@tm/shared` 的 `WEAK_PASSWORD.copy`（前端未自造口径）', async ({ page }) => {
    await seedSignedIn(page);
    const calls = await mockTrpc(page, {
      ...baseHandlers,
      'auth.changePassword': () => trpcError('密码强度不足', 'WEAK_PASSWORD'),
    });

    await page.goto('/profile/security');
    await fillAndSubmit(page, 'RightPass123', 'abc');

    const expected = sharedErrorCopy('WEAK_PASSWORD');
    await expect(page.getByRole('alert').filter({ hasText: expected })).toHaveCount(1);
    await expect(page.locator('input[name=newPassword]')).toHaveAttribute('aria-invalid', 'true');
    // 表单在客户端就按同一口径拦下（实测：不发请求），所以这里 0 次调用**是结论不是漏跑**。
    expect(countOf(calls, 'auth.changePassword')).toBe(0);
    expect(expected).toContain('8 位');
  });

  /**
   * 判据面：**服务端 §4.6 码（无字段归属）→ 页面按 `@tm/shared` 定稿串给出表单级提示**。
   *
   * 这条一度挂着 `test.skip`，理由是"打桩复现不了 v11 错误线格式"（旧 T-15 报告 §5-D2）。
   * **该理由已失效**：T-15r2c 查清缺件在桩不在页面 —— `e2e/helpers.ts` 的 `trpcError()` 少了
   * v11 的**数字协议码** `error.code`（`isTRPCErrorResponse()` 要 `typeof code === 'number'` 才把
   * `error.data` 挂上 `TRPCClientError.data`），且 `mockTrpc` 回 4xx 会让 `httpBatchLink` 把整个
   * batch 数组当**非批量**负载解。两处都由 T-15r2c 在 `helpers.ts` 修好（该轮名下
   * `profile.spec.ts:130` 即 1.1s 转绿）⇒ 本轮按 A-41「skip 不得跨轮遗留」把它恢复成正常断言，
   * 判的是页面把码翻译成 `TM_ERRORS.TOO_MANY_REQUESTS.copy`（429 无 `clientAction` ⇒ 不碰凭据）。
   */
  test('服务端码（无字段归属）：表单级 `password-form-error` 渲染 shared 定稿串', async ({ page }) => {
    await seedSignedIn(page);
    const calls = await mockTrpc(page, {
      ...baseHandlers,
      'auth.changePassword': () => trpcError('操作过于频繁', 'TOO_MANY_REQUESTS'),
    });

    await page.goto('/profile/security');
    // 输入全部过客户端这一关 ⇒ 屏幕上那句话只能由服务端码翻译而来（页面只能翻译、不能自造）。
    await fillAndSubmit(page, 'RightPass123', 'abcdefgh');

    await expect.poll(() => countOf(calls, 'auth.changePassword'), { timeout: 8_000 }).toBe(1);
    expect(payloadOf(calls, 'auth.changePassword')).toMatchObject({ oldPassword: 'RightPass123', newPassword: 'abcdefgh' });
    const shown = page.getByTestId('password-form-error');
    await expect(shown).toBeVisible({ timeout: 8_000 });
    await expect(shown).toHaveText(sharedErrorCopy('TOO_MANY_REQUESTS'));
  });

  /**
   * 曾经用"预期失败"钉法（`test.fail` 注解）钉住的已知缺陷（`packages/ui/src/auth/ChangePasswordForm.tsx`：
   * 服务端回 `WEAK_PASSWORD` 而客户端这一关已过（新密码 ≥8 位）时，字段级与表单级两条出口
   * 都不出话 ⇒ 屏幕上 0 条提示，违反 §3.9.4「失败必给人话」）。
   *
   * T-06r 第 2 轮已交回并判绿修好该组件 ⇒ 本用例的钉法**必须撤销**（A-41 #62 禁止两个 agent
   * 同轮换同一断言，故此前压着；A-41 另立规："预期失败"注解不得跨轮遗留）。
   * 这里起它是**正常断言**：服务端 §4.6 码 → 页面按 `@tm/shared` 定稿串给出可见提示。
   */
  test('服务端回 `WEAK_PASSWORD`（客户端长度已合规）：必须仍有可见提示', async ({ page }) => {
    await seedSignedIn(page);
    const calls = await mockTrpc(page, {
      ...baseHandlers,
      'auth.changePassword': () => trpcError('密码强度不足', 'WEAK_PASSWORD'),
    });

    await page.goto('/profile/security');
    await fillAndSubmit(page, 'RightPass123', 'abcdefgh');
    await expect.poll(() => countOf(calls, 'auth.changePassword'), { timeout: 8_000 }).toBe(1);

    const expected = sharedErrorCopy('WEAK_PASSWORD');
    await expect(page.getByRole('alert').filter({ hasText: expected })).toHaveCount(1);
  });

  test('两次输入不一致：提示同样取自 `@tm/shared` 的 `PASSWORD_MISMATCH.copy`', async ({ page }) => {
    await seedSignedIn(page);
    const calls = await mockTrpc(page, {
      ...baseHandlers,
      'auth.changePassword': () => trpcError('两次不一致', 'PASSWORD_MISMATCH'),
    });

    await page.goto('/profile/security');
    const f = fields(page);
    await f.old.fill('RightPass123');
    await f.next.fill('BrandNewPass1');
    await f.confirm.fill('BrandNewPass2');
    await page.getByTestId('password-submit').click();

    await expect(page.getByRole('alert').filter({ hasText: sharedErrorCopy('PASSWORD_MISMATCH') })).toHaveCount(1, {
      timeout: 8_000,
    });
    expect(countOf(calls, 'auth.changePassword')).toBe(0);
  });

  test('改密成功：出重登告知条，`security-signout` 清掉本地 token', async ({ page }) => {
    await seedSignedIn(page);
    const calls = await mockTrpc(page, {
      ...baseHandlers,
      'auth.changePassword': () => ok({ ok: true, token: 'tk-e2e-t15' }),
    });

    await page.goto('/profile/security');
    await fillAndSubmit(page, 'RightPass123', 'BrandNewPass1');

    await expect(page.getByTestId('security-relogin-notice')).toBeVisible({ timeout: 8_000 });
    expect(countOf(calls, 'auth.changePassword')).toBe(1);

    await page.getByTestId('security-signout').click();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('tm_token')))
      .toBeFalsy();
  });
});
