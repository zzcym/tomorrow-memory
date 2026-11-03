import { expect, test, type Page } from '@playwright/test';
import { countOf, mockTrpc, ok, seedSignedIn, sharedCopyPattern, sharedStrings, type TrpcCall } from './helpers';

/**
 * T-15 判据 ①②⑤：背词页 `app/(user)/study/page.tsx`（`§10.2:913` 的第三个 e2e 面，T-15 欠的那一份）。
 *
 *  ① 四档评分与撤销、三模式切换（`?mode=`），**`new`/`selfTest` 不发 `reviewCard`**（网络层断言 0 请求）
 *  ② 完成页 + 「今天已打卡 · 连续 N 天」**常驻可点**（非弹窗）
 *  ⑤ 星标才入库（自动灌入的代码已删）
 *
 * 判据④（词本删除撤销）不在本文件：A-41 #61 裁定"不为测试改产品 DOM"，这里对撤销一律用
 * `role`+可及名定位（`RatingBar` 的 `撤销上一条评分`），定位不到就上报不加 `data-testid`。
 *
 * 跑法：`pnpm --filter @tm/web exec playwright test e2e/study.spec.ts`
 * 夹具与打桩层照抄 `e2e/wordbook.spec.ts`（`page.route` 接管 `/trpc/`，无真后端、不碰 `data.db`）。
 * 文案一律现读 `@tm/shared`（`sharedStrings` / `sharedCopyPattern`），页面若自造口径本文件必红。
 */

/** 三模式各自的假牌组（`?mode=` 的唯一取值源是 `@tm/shared` 的 `QUEUE_MODES`，序 = review/new/selfTest）。 */
type DeckMode = 'review' | 'new' | 'selfTest';
const DECKS: Record<DeckMode, string[]> = {
  review: ['apple', 'bridge', 'cinema'],
  new: ['datum', 'ember'],
  selfTest: ['fjord', 'glacier'],
};
const isDeckMode = (raw: string): raw is DeckMode => raw === 'review' || raw === 'new' || raw === 'selfTest';

/** `@tm/shared` 的四档名（忘记/困难/良好/轻松，`RATING_VALUES` 序）与「撤销上一条评分」可及名。 */
const RATING_LABELS = sharedStrings('rating.ts', 'RATING_LABELS');
const UNDO_NAME = sharedCopyPattern(/undoRating:\s*'([^']+)'/, 'ARIA.undoRating');
const FAVORITE_NAME = sharedCopyPattern(/favorite:\s*\(word:\s*string\):\s*string\s*=>\s*`([^`]+)`/, 'ARIA.favorite');
/** 「今天已打卡 · 连续 N 天」——`CHECKIN_COPY.done` 的定稿形状，N 由服务端给。 */
const CHECKED_IN_LINE = sharedCopyPattern(/(?:^|\n)\s*done:\s*\(n:\s*number\):\s*string\s*=>\s*`([^`]+)`/, 'CHECKIN_COPY.done');

interface StudyState {
  calls: TrpcCall[];
  /** 词本成员（服务端态）：判据⑤ 看的就是它有没有被页面自己偷偷写。 */
  book: string[];
}

/**
 * 起一份可写的假后端：`review.queue`（按 mode 分牌组）/ `review.reviewCard` / `review.undo`
 * / `checkin.status` / `checkin.create` / `wordbook.{list,add,remove}`。
 * 未列出的过程由 `mockTrpc` 兜 `NOT_FOUND`（与 `e2e/wordbook.spec.ts` 同口径）。
 */
async function studyFixture(page: Page): Promise<StudyState> {
  const state: StudyState = { calls: [], book: ['zulu'] };
  const checkin = { checkedIn: false, streak: 11 };

  state.calls = await mockTrpc(page, {
    'review.queue': (payload) => {
      const mode = String((payload as { mode?: string })?.mode ?? 'review');
      const words = isDeckMode(mode) ? DECKS[mode] : DECKS.review;
      return ok({
        mode,
        total: words.length + 4,
        dueToday: words.length,
        dailyGoal: 20,
        // `hasCard` 逐字照抄成员判定：`new`/`selfTest` 的词默认都不在词本里（判据⑤ 的起点）。
        queue: words.map((word) => ({ word, gloss: `${word} 的释义`, hasCard: state.book.includes(word) })),
      });
    },
    'review.reviewCard': (payload) => {
      const at = Date.now();
      return ok({
        rating: (payload as { rating?: number })?.rating ?? 1,
        // 4 天后：`minutesUntil()` 解析得 `5760` 分钟 ⇒ `formatReviewInterval` 出「4 天后」。
        due: new Date(at + 4 * 24 * 60 * 60 * 1000).toISOString(),
        reviewedAt: at,
        state: 2,
      });
    },
    'review.undo': (payload) => {
      const word = String((payload as { word?: string })?.word ?? '');
      const at = DECKS.review.indexOf(word);
      // 页面拿到 `index` 后落回 `index - 1` ⇒ 服务端这里回的是"这张卡后面的那个位置"。
      return ok({ index: at + 1, remaining: 2 });
    },
    'checkin.status': () => ok({ checkedIn: checkin.checkedIn, doneToday: 3, dueToday: 0, streak: checkin.streak, dailyGoal: 20 }),
    'checkin.create': () => {
      checkin.checkedIn = true;
      checkin.streak += 1;
      return ok({ checkedIn: true, doneToday: 3, dueToday: 0, streak: checkin.streak, dailyGoal: 20 });
    },
    'wordbook.list': () => ok(state.book.map((word) => ({ word, gloss: `${word} 的释义`, addedAt: Date.now(), lastReview: null, reviewCount: 0 }))),
    'wordbook.add': (payload) => {
      const word = (payload as { word?: string; json?: { word?: string } })?.word
        ?? (payload as { json?: { word?: string } })?.json?.word;
      if (word && !state.book.includes(word)) state.book.push(word);
      return ok({ ok: true, added: true });
    },
    'wordbook.remove': (payload) => {
      const word = (payload as { word?: string })?.word;
      const at = word ? state.book.indexOf(word) : -1;
      if (at >= 0) state.book.splice(at, 1);
      return ok({ ok: true, removed: at >= 0 });
    },
  });
  return state;
}

/** 卡面（`@tm/ui/patterns/Flashcard` 的 `testid`）。 */
const card = (page: Page) => page.getByTestId('study-card').first();
/** 四档按钮：评分成功后可及名会追加「，下次 4 天后」⇒ 用 `^(档名|…)(，|$)` 两头都吃。 */
const ratingButtons = (page: Page) =>
  page.getByTestId('study-rating').getByRole('button', { name: new RegExp(`^(${RATING_LABELS.join('|')})(，|$)`) });
const radios = (page: Page) => page.getByRole('radiogroup').getByRole('radio');
const queueModesOf = (calls: TrpcCall[]) =>
  calls.filter((call) => call.proc === 'review.queue').map((call) => (call.payload as { mode?: string })?.mode);

test.describe('背词页（/study）', () => {
  test('判据①：四档按钮齐、评分发出 `reviewCard`、撤销窗口可点并发出 `review.undo`', async ({ page }) => {
    await seedSignedIn(page);
    const { calls } = await studyFixture(page);

    await page.goto('/study');
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText('apple');

    // 四档 = `RATING_VALUES` 的四档，命名逐字取自 `@tm/shared`（英文术语一律不出现）。
    await expect(ratingButtons(page)).toHaveCount(4);
    await expect(page.getByTestId('study-rating')).toHaveCount(1);

    // 第三档（`良好` = 3）：评分即推进到下一张（R-11②）。
    await ratingButtons(page).nth(2).click();
    await expect.poll(() => countOf(calls, 'review.reviewCard')).toBe(1);
    const rated = calls.find((call) => call.proc === 'review.reviewCard')?.payload as { word?: string; rating?: number };
    expect(rated).toMatchObject({ word: 'apple', rating: 3 });
    await expect(card(page)).toContainText('bridge');

    // 撤销窗口只在"已走到下一张"后挂出（R-11④）：用可及名定位，不给产品 DOM 加 `data-testid`。
    const undo = page.getByRole('button', { name: UNDO_NAME });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect.poll(() => countOf(calls, 'review.undo')).toBe(1);
    expect(calls.find((call) => call.proc === 'review.undo')?.payload).toMatchObject({ word: 'apple' });
    await expect(card(page)).toContainText('apple');
    // 撤完窗口收起，且撤销没有额外触发一次评分。
    await expect(undo).toHaveCount(0);
    expect(countOf(calls, 'review.reviewCard')).toBe(1);
  });

  test('判据①：三模式切换走 `?mode=`，`new`/`selfTest` 全程 0 条 `reviewCard`（网络层）', async ({ page }) => {
    await seedSignedIn(page);
    const { calls } = await studyFixture(page);

    await page.goto('/study');
    await expect(radios(page)).toHaveCount(3);
    await expect(card(page)).toContainText('apple');

    // 切「学新词」：地址是唯一真源 ⇒ `?mode=new`，牌组换掉、本轮重新开始。
    await radios(page).nth(1).click();
    await expect(page).toHaveURL(/mode=new/);
    await expect(card(page)).toContainText('datum');

    await ratingButtons(page).nth(0).click();
    await expect(card(page)).toContainText('ember');

    // 切「随机自测」：走 URL 也认（分享链接可直达）。
    await radios(page).nth(2).click();
    await expect(page).toHaveURL(/mode=selfTest/);
    await expect(card(page)).toContainText('fjord');
    await ratingButtons(page).nth(3).click();
    await expect(card(page)).toContainText('glacier');
    // 走完最后一张落完成页 —— 三模式的完成路径同一条（判据②）。
    await ratingButtons(page).nth(3).click();
    await expect(page.getByTestId('study-summary')).toBeVisible();

    // ★ 本用例的正题：两个非复习模式**一条评分请求都没发**（R-12④ 的客户端那一半）。
    expect(countOf(calls, 'review.reviewCard')).toBe(0);
    expect(countOf(calls, 'review.undo')).toBe(0);
    await expect(page.getByRole('button', { name: UNDO_NAME })).toHaveCount(0);
    // 取数确实按三种 mode 各要过 ⇒ 不是"根本没进牌组"造成的假 0。
    const modes = queueModesOf(calls);
    expect(modes).toContain('review');
    expect(modes).toContain('new');
    expect(modes).toContain('selfTest');
  });

  test('判据②：走完最后一张落常驻完成页，打卡一行不用弹窗即可点，打卡后转「今天已打卡 · 连续 N 天」', async ({ page }) => {
    await seedSignedIn(page);
    const { calls } = await studyFixture(page);

    await page.goto('/study');
    for (let i = 0; i < DECKS.review.length; i += 1) await ratingButtons(page).nth(1).click();

    const summary = page.getByTestId('study-summary');
    await expect(summary).toBeVisible();
    // **非弹窗**：完成页上没有任何模态层，打卡那一行是完成页 DOM 的一部分（常驻，不随滚动消失）。
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(summary.locator('[data-testid="summary-checkin"]')).toHaveCount(1);

    const checkInRow = page.getByTestId('summary-checkin');
    await expect(checkInRow).toBeEnabled();
    await checkInRow.click();
    await expect.poll(() => countOf(calls, 'checkin.create')).toBe(1);

    await expect(summary).toContainText(CHECKED_IN_LINE);
    // 连的是服务端给的天数（打卡前后 11 → 12），不是页面自己编的。
    await expect(summary).toContainText('12');
    // 已打卡后这一行仍在（常驻），只是按钮收起为已完成态。
    await expect(checkInRow).toBeVisible();
    await expect(checkInRow).toBeDisabled();
    // 复习模式那三张该有三次评分（打卡不是靠"没发请求"蒙过去的）。
    expect(countOf(calls, 'review.reviewCard')).toBe(DECKS.review.length);
  });

  test('判据⑤：整轮翻面/评分都不写词本（自动灌入已删），点星标才发 `wordbook.add`', async ({ page }) => {
    await seedSignedIn(page);
    const { calls } = await studyFixture(page);

    // 从 `new` 进：两张卡服务端都回 `hasCard: false`（词本里没有）。
    await page.goto('/study?mode=new');
    await expect(card(page)).toContainText('datum');
    await card(page).click(); // 翻到背面（星标只长在卡背，R-14③）
    const star = page.getByRole('button', { name: FAVORITE_NAME }).first();
    await expect(star).toHaveAttribute('aria-pressed', 'false');

    // 走完第一张 → 第二张也翻面：全程没有任何"查中即写词本"的路径。
    await ratingButtons(page).nth(3).click();
    await expect(card(page)).toContainText('ember');
    await card(page).click();
    // 读成员关系发生过（`wordbook.list` 是星标态的唯一来源），**写**一次都没有 ⇒ 自动灌入的代码确实不在了。
    expect(countOf(calls, 'wordbook.list')).toBeGreaterThanOrEqual(1);
    expect(countOf(calls, 'wordbook.add')).toBe(0);
    expect(countOf(calls, 'wordbook.remove')).toBe(0);

    // 显式点星标 ⇒ 这一次才入库，且入的是**这张卡**的词。
    await page.getByRole('button', { name: FAVORITE_NAME }).first().click();
    await expect.poll(() => countOf(calls, 'wordbook.add')).toBe(1);
    expect(calls.filter((call) => call.proc === 'wordbook.add')[0]?.payload).toMatchObject({ word: 'ember' });
    // 服务端成员关系回来后可及态跟着翻（判据⑤ 的"入库"是真的落库了）。
    await expect(page.getByRole('button', { name: FAVORITE_NAME }).first()).toHaveAttribute('aria-pressed', 'true');
  });
});
