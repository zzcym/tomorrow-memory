/**
 * T-19e + T-19g-ii 判据自证（App「我的」屏 `#/me`）—— `apps/app/test/me-screen.spec.tsx`。
 *
 * 宿主形态照 `security-screen.spec.tsx`（同批最新、夹具最干净）：`QueryClientProvider` +
 * `UiHostProvider` 直渲**本屏**，**不启** `startRouter()`（A-44 #86：挂载与生产入口由 TPM 串行收口），
 * 网络只 stub `global.fetch`（`data/rest-fetcher.ts` 的唯一出口），会话一律用 `auth-store.signIn()`
 * 播种（唯一写点），全文件 fake timers + `vi.setSystemTime` 推进（**0 `waitForTimeout`**）。
 *
 * 本屏的数据面 = `data/queries/` 的**三个既有单点**（T-19g-ii 起，屏内仍 0 端点字面量、0 `fetch`）：
 * `profile`（GET/PUT `/api/profile`）、`checkin`（GET `/api/checkin/status`，经 `useDueBadge` 与
 * 同键只读订阅）、`review`（GET `/api/review/queue`，`useDueBadge` 内部那颗待背数）。
 * 出现第四种端点即本屏越界（stub 直接回 404，用例再钉计数）。
 *
 * 分组（与交付报告 §件2 的用例账一一对应）：
 *  - A 组：源码哨兵（屏剥注释后 CJK 0 / 0 裸存储 API / 0 新端点 / Chrome84 四禁 / DOM 钩子不扩面 /
 *    0 自算状态码与 flag / 三格定稿串"屏只从 shared 取"的正反哨 / 本 spec 自禁项）；
 *  - B 组：E 区渲染面（滑杆 + 当前值 + 刻度 + 保存钮，串逐字等于 `SETTINGS_COPY.dailyGoal.*`）；
 *  - C 组：**R-19② 的"取消静默保存"**（未提交 ⇒ 0 写、0 toast、0 假装成功；`onBlur` 不保存；拖回原值即撤销）；
 *  - D 组：保存 + toast（恰一次 PUT、体只有 `daily_goal`、成功 toast 逐字 = `savedToast(n)`、失效重取后
 *    回到"与服务端同一个数"；失败不洗成成功、草稿留着可重试；pending 只发一次；401 仍只走单点）；
 *  - E 组：止血阀 `passwordUpgradeEnforce=off` 的软告知入口行（只有 `auth-store` 那枚派生位能点亮它，
 *    两槽逐字 = `SETTINGS_COPY.upgradeTodo.entry` / `.cta`，点击 = `#/security`，硬门禁那一支不借用）；
 *  - F 组：访客与拉取失败（不 redirect、不画半截滑杆；T-19g-v 起 `:1001` 错误卡已接线 ⇒ F-03 翻为整表钉）；
 *  - G 组（T-19g-ii）：C 区三张统计卡（§3.8.1:954 逐字 + :961 三落点 + 访客/失败不出假 0）；
 *  - H 组（T-19g-ii）：B 区账号头（§3.8.1:953：昵称 / `maskPhone` 脱敏 / 头像回落，头像非交互）；
 *  - I 组（T-19g-ii）：D 区打卡常驻（§3.8.1:955 两态整串 + `VERBS.goStudy` 落点 + :962 同步行只出现一次、禁词 0 命中）；
 *  - J 组（T-19g-iii）：F 区设置列表（§3.8.1:957 的**有源三行**逐字 + 相对次序 + `min-h-[56px]`/末行不描边的
 *    结构面 + 外观行的 `THEME_STORAGE_KEY` 写键与档位 + 两颗落点；**反向哨**：无源三串 0 命中，
 *    即 `自动收藏`/`每日提醒时间`/`我的查询历史` 因盘面无数据源本轮不渲染）；
 *  - K 组（T-19g-iii）：G 区退出登录（§3.8.1:958 单独一行危险色、不混进 F 列表 + `SETTINGS_COPY.signOut`
 *    四槽逐字 + 必过 `ConfirmSheet` 二次确认 + 清凭据只经 `auth-store.signOut()` + 落点是登录页 +
 *    未登录那颗不存在）；
 *  - L 组（T-19g-iii）：H 区页脚（§3.8.1:959 两串逐字 = `BRAND.footerLine1/2`、`text-xs leading-relaxed`、
 *    备案号是真号（用户本人 2026-09-26 给，A-98 #415，F-32 闭）、屏 0 自造号、禁词 0 命中）。
 *
 * T-19g-iii 的**判据翻面账**（照 A-06 既有先例，改钉必须留痕）：
 *  - A-05 的"屏自写 `<button>` 三颗" → **五颗**（F 区行件 1 + G 区触发钮 1，源码各只写一次）；
 *  - A-07 禁借清单里的 `AUTH_COPY` 与 `signOut(` 两颗**移出**：`:957` 的「修改密码」行标签在 shared
 *    只有 `AUTH_COPY.changePassword.title` 这一份声明点（它同时就是落点 `/security` 那一屏的 H1），
 *    而 G 区的动作按 §3.8.2:973 与派单裁定**必须**是 `auth-store.signOut()`（全仓唯一清凭据函数）；
 *    同清单里 `signedOut`/`fetchFail`/`guestGuide` 等其余禁借**原样保留**。
 *
 * T-19g-iv 的**判据翻面账**（访客态可见性窄修，按 §3.8.5 `:998` 原文）：
 *  - F-01 / G-03 / H-04 访客支的三颗 `visibleTexts() === [顶栏标题]` 整表钉翻面为字面量正向整表钉
 *    （期望值出处见 `GUEST_VISIBLE_TEXTS` 的定义处注释）：旧钉把"访客态 F/G/H 全区隐藏"这一缺陷钉成
 *    期望值，与 `:998`（访客只藏 F 中「我的查询历史」「修改密码」两行）相反；
 *  - L-03 访客那半从"0 颗页脚"翻为"页脚恰 1 颗 + 两串 = `:959` 字面量、备案号在前"；**拉取失败半支不动**
 *    （`:1001` 整页降级，F-03 的整表空钉同门不翻，简报明令）；
 *  - 新增 J-05：访客 F 区「外观」「关于」两行逐字/次序/`min-h-[56px]` 结构正向钉 + 「修改密码」0 命中
 *    且全程无指向 `/security` 的导航反向钉；
 *  - K-02（访客/失败态 0「退出登录」）**保持不动**（G 区访客语义 = PM 待裁项 F-34）；
 *  - 已登录三行齐全 + 次序 = 外观/修改密码/关于 由既有 J-01 钉，未动。
 *
 * T-19g-v 的**判据翻面账**（`:998` 引导条 + `:1001` 错误卡接线）：
 *  - `GUEST_VISIBLE_TEXTS` 增补 `:998` 五串（字面量，出处见常量注释）⇒ F-01 / G-03 / H-04 / L-03
 *    四颗访客整表钉随之含引导条（这是"新格接线"的必然面，不是放松）；
 *  - H-04 的"guestGuide 不上屏"两判据翻为"引导条整表在屏 + B 区头不在"；
 *  - F-03 由"整表空（宁缺勿造）"翻为 `:1001` 错误卡五串整表钉 + C/D/E/F/G/H 反查 0 命中；
 *  - K-02 访客半不动，**失败半**翻为"全树恰一颗『退出登录』且它住在错误卡里"（简报"K-02 不动"与
 *    `:1001`"次按钮仅在已登录态出现"不可兼得 —— 按规范原文做，差异申报交付报告 §0）；
 *  - A-05 屏自写 `<button>` 五颗 → **八颗**（引导条三颗）；A-07 `fetchFail`/`guestGuide` 移出禁借、
 *    转正向清单，`AUTH_COPY` 计数 2→4，`STUDY_COPY` 新列禁借（本轮装配照 StudyScreen 先例但串不借）；
 *  - A-03 `fetch(` 禁扫前先摘 `.refetch(` 调用位（react-query 重取出口，非裸 fetch），并正向钉它恰一颗；
 *  - 其余既有钉（G-04 / H-01~03 / J 组 / K-01/03~06 / L-01/02 等）**一颗未动**；M 组为纯新增。
 *
 * E4b2 件3 的**判据翻面账**（F-29「我的」页三格降级解耦，真修）：
 *  - G-04 由"C 与 D 整段不渲染（`statCardsAll() === 0`、`buttons() === 5`）"翻为**按格取源**的整表钉：
 *    `checkin/status` 拉失败时档案源两格（`stat-words` / `stat-review-days`）必须在位、读屏全串与 G-01
 *    逐字同值，只有打卡源那一格（`stat-streak`）与 D 区整行不画 ⇒ 可点面 5 → **7**；
 *    旧钉撤走的原因是它把屏侧共门缺陷钉成期望值（`词本 N 词` 与打卡无关却共亡），
 *    **"不假 0"的下限一颗没撤**（`连续 0 天` / 带真数的 `stat-streak` / `CHECKIN_COPY.notDone.headline`
 *    / `VERBS.goStudy` 四处仍 0 命中，M-06 的口径不放松）；
 *  - 纯新增 G-05（打卡**永不应答**那一档，旧屏同一颗共门也会整段不画）与 G-06（反方向：档案在途未回、
 *    打卡已回 ⇒ 只画连续格与 D 行，且 `:1001` 错误卡不许出现）；两颗都用本轮新增的"永不应答"闸
 *    `holdCheckin` / `holdProfile`（夹具位 `stubFetch` 内 2 行分支，默认桩形与既有 65 颗的走位一字不改）；
 *  - F-03 / M-04 / M-06 三颗整表钉（`:1001` 降级支与在途不出卡）**未动也未放松**，盘面复跑原样绿；
 *  - G-01 / G-02 / G-03 / H 组 / L-03 的常态与访客整表钉未动 ⇒ 用例数 65 → **67**。
 *
 * E4b6 件1／件2 的**判据翻面账**（A-86 #320 的 5A＋6A 合并成一轮，通道 `bounded-edit:A-88-E4b6`）：
 *  - **件1（5A，不是翻面）**：`外观`/`关于` 两颗行标题从**位置借键** `SETTINGS_COPY.groups[2]`/`groups[4]`
 *    换成 shared 的 F 区**专用键** `SETTINGS_COPY.rows.appearance`/`.about`（值逐字相同；`copy.ts` 里两颗
 *    模块级 const 单点声明 ⇒ `groups` 与 `rows` 同引一颗，全仓 0 第二份 `'外观'`/`'关于'` 字面量）。
 *    跟着换源的三颗钉（本文件 A-07 正向清单两颗、J-01 两颗串源，`about-screen.spec.tsx` 的 B-01 期望源）
 *    **期望值一个字没放宽**，用例条数不变；
 *  - **件2（6A，改判轮 ⇒ 翻了 F-03 与 L-03 两颗）**：`已登录但档案拉不到` 的 `:1002` 整页降级支
 *    **保留 H 区页脚（含备案号）** —— 备案号是个人主办单位的法定公示、与数据态无关，`:1002` 那句"整页降级为一个
 *    错误卡"管的是**内容区**（用户 2026-09-22/23 裁定 ⇒ F-36 结清）。翻面形状：F-03 的整表钉尾部补两串
 *    页脚字面量（备案号在前，照访客半支）+ 它那颗 `footer` 0 → 恰 1 颗；L-03 拉取失败半支同翻为
 *    恰 1 颗 + 两串逐字。**范围收窄**：`:694` 那颗 `showSettingsSections` 门没动（降级支 F 区三行仍
 *    `settingRows()` 0 命中）、`sync-badge` 仍 0 命中（页脚不是同步行）、**在途支仍不画页脚**
 *    （M-06 一颗未动、原样绿 —— 它红了就是把门做成了无条件常驻，属改多了）。
 *  - 因此上面 T-19g-iv 账里"L-03 拉取失败半支不动"、T-19g-v 账与 E4b2 账里"F-03 …H 页脚反查 0 命中 /
 *    F-03 整表钉未动"那几句**自本轮起过期**，以本段为准（历史账原文照留 —— 那是账，不是现状）。
 */
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, UiHostProvider, type UiHost, type ToastTone } from '@tm/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AUTH_COPY,
  BRAND,
  CHECKIN_COPY,
  DAILY_GOAL_DEFAULT,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  DAILY_GOAL_UI_MAX,
  DAILY_GOAL_UI_MIN,
  DAILY_GOAL_UI_STEP,
  NAV_ITEMS,
  PLAIN_TERMS,
  SETTINGS_COPY,
  SYNC_COPY,
  THEME_MODE_LABELS,
  TM_ERRORS,
  VERBS,
  formatCount,
  maskPhone,
} from '@tm/shared';
import MeScreen, { GOAL_SLIDER } from '../src/screens/MeScreen.js';
import { profileKeys } from '../src/data/queries/profile.js';
import { resetAuthHandling } from '../src/data/rest-fetcher.js';
import { formatClock, resetVersionPrompt, setSyncFailed, setSyncedAt } from '../src/data/startup.js';
import {
  LOGIN_ROUTE,
  attachAuthSignals,
  getAuthSnapshot,
  notePasswordUpgradeRequired,
  refreshFromStorage,
  signIn,
} from '../src/lib/auth-store.js';
import { SESSION_KEYS } from '../src/lib/token-bridge.js';
import { commitLocation, installRouterGlobals, resetRouterForTest, routeFor } from '../src/router.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ═════════════════ 夹具 ═════════════════ */

const ME_PATH = '/me';
const SECURITY_PATH = '/security';
/** F 区「关于」行的落点（`router.tsx:52` 登记的 secondary；屏侧常量 `ABOUT_ROUTE` 与它同值）。 */
const ABOUT_PATH = '/me/about';
const PHONE = '13800000001';
const NORMAL_TOKEN = 'tk-normal-19e';
/** 服务端那一刻的每日目标（UI 域内的合法落点，且 ≠ `DAILY_GOAL_DEFAULT`，好分辨"跟的是服务端那一份"）。 */
const SERVER_GOAL = 20;
/** 拖到的目标值（步进 5 的合法落点）。 */
const NEW_GOAL = 35;
/** `profile.get` 运行时随 `passthrough()` 带的统计键（C 区前两格的唯一数字源，`profileProgressOf` 读它们）。 */
const TOTAL_WORDS = 128; // ≥100：显示走 formatCount 的 99+，读屏全串仍带真数
const REVIEW_DAYS = 34;
/** `GET /api/checkin/status` 的默认桩形：已打卡 + 连续 12 天（C 区第三格与 D 区同源）。 */
const STREAK_DAYS = 12;

interface ProfileBody {
  user_id: number;
  phone: string;
  nickname: string;
  avatar: string;
  daily_goal: number;
  updated_at: number;
  hasPassword: boolean;
  pwPolicyVersion: number;
  totalWords: number;
  reviewDays: number;
}

const profileBody = (goal: number): ProfileBody => ({
  user_id: 7,
  phone: PHONE,
  nickname: 'tm',
  avatar: '',
  daily_goal: goal,
  updated_at: 0,
  hasPassword: true,
  pwPolicyVersion: 1,
  totalWords: TOTAL_WORDS,
  reviewDays: REVIEW_DAYS,
});

interface EndpointOutcome {
  status: number;
  body: unknown;
}

const success = (goal: number): EndpointOutcome => ({ status: 200, body: profileBody(goal) });
const serverErrorOf = (code: keyof typeof TM_ERRORS, status = 500): EndpointOutcome => ({
  status,
  body: { error: TM_ERRORS[code].copy, code },
});

/** `GET /api/profile`：默认成功给 `SERVER_GOAL`；可被用例改写成失败或"越界值"。 */
let getOutcome: EndpointOutcome = success(SERVER_GOAL);
/** `GET /api/checkin/status`（经 `useDueBadge` 与屏内同键订阅）：默认"已打卡 · 连续 12 天"。 */
let checkinOutcome: EndpointOutcome = { status: 200, body: { checkedIn: true, streak: STREAK_DAYS } };
/** E4b2 件3（F-29 按格取源降级）新增两颗"永不应答"闸：只造"在途未回"这一档，不改任何默认桩形。 */
let holdCheckin = false;
let holdProfile = false;
/** `GET /api/review/queue`（`fetchDueCount` 的专用口径：走 `DueCountSchema` 那一支）。 */
let queueOutcome: EndpointOutcome = {
  status: 200,
  body: { dueToday: 0, streak: STREAK_DAYS, dailyGoal: SERVER_GOAL, doneToday: 0 },
};
/** `PUT /api/profile`：`ok` 回写入后的档案，`fail` 回服务端拒绝，`down` 直接抛网络断。 */
let putMode: 'ok' | 'fail' | 'down' = 'ok';
let putOutcome: EndpointOutcome = success(NEW_GOAL);
let holdPut = false;
let holders: Array<(value: Response) => void> = [];
/** D-07 用的生产入口同款接线句柄（`attachAuthSignals()`，`main.tsx:145` 的同一条），`afterEach` 必拆。 */
let detachAuthSignals: (() => void) | null = null;

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
  authorization: string | null;
}

let fetchCalls: FetchCall[] = [];
let toastCalls: Array<{ message: string; tone: ToastTone | '' }> = [];
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let mounted = false;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(): void {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const parsed =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    fetchCalls.push({
      url,
      method,
      body: parsed,
      authorization: headers.Authorization ?? null,
    });
    // 本屏的数据面只有那三个既有单点；出现别的（含两条改密口）= 本屏越界。
    if (url.includes('/api/checkin/status')) {
      if (holdCheckin) return new Promise<Response>(() => undefined);
      return jsonResponse(checkinOutcome.status, checkinOutcome.body);
    }
    if (url.includes('/api/review/queue')) {
      return jsonResponse(queueOutcome.status, queueOutcome.body);
    }
    if (!url.includes('/api/profile')) {
      return jsonResponse(404, { error: 'wrong endpoint', code: 'NOT_FOUND' });
    }
    if (method === 'PUT') {
      if (holdPut) {
        return new Promise<Response>((resolve) => {
          holders.push(resolve);
        });
      }
      if (putMode === 'down') throw new TypeError('network down');
      if (putMode === 'fail') return jsonResponse(putOutcome.status, putOutcome.body);
      // 服务端语义要装得像：写成功的下一发 GET 必须回同一个数（否则"失效重取"这条判据是假的）
      const written = Number((parsed as { daily_goal?: unknown } | undefined)?.daily_goal);
      const next = Number.isFinite(written) ? written : NEW_GOAL;
      getOutcome = success(next);
      return jsonResponse(200, profileBody(next));
    }
    if (holdProfile) return new Promise<Response>(() => undefined);
    return jsonResponse(getOutcome.status, getOutcome.body);
  });
  vi.stubGlobal('fetch', fn);
}

function releaseHolders(): void {
  const pending = holders;
  holders = [];
  for (const resolve of pending) resolve(jsonResponse(200, profileBody(NEW_GOAL)));
}

const host: UiHost = {
  kv: {
    get: (key: string) => localStorage.getItem(key),
    set: (key: string, value: string) => localStorage.setItem(key, value),
  },
  speak: () => {},
  navigate: (to: string) => {
    fetchCalls.push({ url: `navigate:${to}`, method: 'NAVIGATE', body: undefined, authorization: null });
  },
  toast: (message: string, options?: unknown) => {
    const raw =
      typeof options === 'string' ? options : ((options as { tone?: ToastTone } | undefined)?.tone ?? '');
    toastCalls.push({ message, tone: (raw ?? '') as ToastTone | '' });
  },
};

function mountScreen(): void {
  resetRouterForTest(ME_PATH);
  client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <UiHostProvider host={host}>
          <MeScreen />
        </UiHostProvider>
      </QueryClientProvider>,
    );
  });
}

async function settle(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
  }
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function unmount(): void {
  if (!mounted) return;
  mounted = false;
  act(() => root.unmount());
  container.remove();
}

function q<T extends Element>(selector: string): T | null {
  return container.querySelector<T>(selector);
}

function all<T extends Element>(selector: string): T[] {
  return Array.from(container.querySelectorAll<T>(selector));
}

function screenRoot(): HTMLElement | null {
  return q<HTMLElement>('[data-testid=me-screen]');
}

function slider(): HTMLInputElement | null {
  return q<HTMLInputElement>('input[type=range]');
}

function buttons(): HTMLButtonElement[] {
  return all('button');
}

function buttonByLabel(label: string): HTMLButtonElement | null {
  return buttons().find((el) => el.textContent?.trim() === label) ?? null;
}

function countButtonsLabeled(label: string): number {
  return buttons().filter((el) => el.textContent?.trim() === label).length;
}

function goalSection(): HTMLElement | null {
  return q<HTMLElement>('section');
}

/** C 区计数卡（StatCard 的 `testid` prop 是既有契约面，允许用）。 */
function statCard(testid: string): HTMLButtonElement | null {
  return q<HTMLButtonElement>(`button[data-testid=${testid}]`);
}

function statCardsAll(): HTMLButtonElement[] {
  return all('button[data-testid^=stat-]');
}

/** D 区那一行的宿主容器（含 `去背单词` 按钮的 flex 行）。 */
function checkinRow(): HTMLElement | null {
  const cta = buttonByLabel(VERBS.goStudy);
  return cta ? cta.closest('div') : null;
}

/** F 区的行（`:957` 的有序列表 ⇒ `ul[role=list] > li`）；本轮恰三行，顺序即规范那串的相对次序。 */
function settingRows(): HTMLElement[] {
  return all('[role=list] > li');
}

/** 按行标题取 F 区某行的可点面（行内那颗 button；0 新 testid，靠 `:972` 的 title 槽定位）。 */
function settingRowButton(title: string): HTMLButtonElement | null {
  for (const li of settingRows()) {
    const btn = li.querySelector('button');
    if (btn && String(btn.textContent ?? '').trim().startsWith(title)) return btn;
  }
  return null;
}

/** 某行右侧的 `trailing` 面（chevron 装饰那颗 / value 那颗人话）：取行内除标题槽之外的最后一个 span。 */
function settingRowTrailing(title: string): HTMLElement | null {
  const btn = settingRowButton(title);
  if (!btn) return null;
  const spans = Array.from(btn.querySelectorAll('span'));
  return spans.length > 0 ? (spans[spans.length - 1] as HTMLElement) : null;
}

/** G 区二次确认层：radix `Dialog` 挂在 `document.body` 的 portal 上（`container` 里查不到），照 study-screen 的定位法。 */
function signOutSheet(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[data-testid=me-signout]');
}

function buttonsIn(scope: Element): HTMLButtonElement[] {
  return Array.from(scope.querySelectorAll('button'));
}

/** `applyTheme()` 在 jsdom 上的唯一可观测副作用面（`<html>` 的 `.dark` 类名 + `color-scheme`）。 */
function htmlDarkClass(): boolean {
  return document.documentElement.classList.contains('dark');
}

/** 只挑出写到主题键上的那几次存储写（别的键由 token-bridge / host.kv 写，不算主题账）。 */
function themeWrites(calls: Array<readonly [unknown, unknown]>): string[] {
  return calls
    .filter((call) => call[0] === THEME_STORAGE_KEY)
    .map((call) => String(call[1]));
}

/** 渲染树上的可见文本（读屏面与禁词面都用它，不看 class）。 */
function visibleTexts(scope: Element = container): string[] {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = String(node.nodeValue ?? '').trim();
    if (text) texts.push(text);
    node = walker.nextNode();
  }
  return texts;
}

function dirtyMarkShown(): boolean {
  return visibleTexts().some((text) => text.includes(SETTINGS_COPY.dailyGoal.dirtyMark));
}

async function dragSliderTo(value: number): Promise<void> {
  const el = slider();
  expect(el).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, String(value));
    el!.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

async function saveNewGoal(n: number = NEW_GOAL): Promise<void> {
  await dragSliderTo(n);
  const save = buttonByLabel(SETTINGS_COPY.dailyGoal.save);
  expect(save).not.toBeNull();
  await click(save!);
  await settle();
}

function getCalls(): FetchCall[] {
  return fetchCalls.filter((call) => call.url.includes('/api/profile') && call.method === 'GET');
}

function putCalls(): FetchCall[] {
  return fetchCalls.filter((call) => call.method === 'PUT');
}

/** 播种：唯一写点 `signIn()`（本文件不直接写存储）。 */
function seedNormalSession(token = NORMAL_TOKEN): void {
  signIn({ token, phone: PHONE, nickname: 'tm' });
}

/** 止血阀 off 的形状：服务端发了正常 token，同时把"仍该改密"标在会话上（软告知位）。 */
function seedAdvisorySession(): void {
  signIn({ token: NORMAL_TOKEN, phone: PHONE, nickname: 'tm', upgrade_required: true });
}

function seedUpgradeOnlySession(): void {
  signIn({ token: '', phone: PHONE, upgradeToken: 'up-token-visitor' });
}

/* 源码哨兵：先剥注释再扫（屏文件头大量"不写 xxx / 不许 xxx"的注释提到禁词本身）。 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const readSrc = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const screenCode = (): string => stripComments(readSrc('../src/screens/MeScreen.tsx'));
const profileQueriesCode = (): string => stripComments(readSrc('../src/data/queries/profile.ts'));
/** 仓库根相对 `apps/app/test/` 要回退三层（写错一层的代价：A-06 直接 ENOENT）。 */
const sharedCopyCode = (): string =>
  stripComments(readSrc('../../../packages/shared/src/constants/copy.ts'));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-21T12:00:00+08:00'));
  fetchCalls = [];
  toastCalls = [];
  holders = [];
  holdPut = false;
  putMode = 'ok';
  putOutcome = success(NEW_GOAL);
  getOutcome = success(SERVER_GOAL);
  checkinOutcome = { status: 200, body: { checkedIn: true, streak: STREAK_DAYS } };
  holdCheckin = false;
  holdProfile = false;
  queueOutcome = {
    status: 200,
    body: { dueToday: 0, streak: STREAK_DAYS, dailyGoal: SERVER_GOAL, doneToday: 0 },
  };
  localStorage.clear();
  /* T-19g-iii：`<html>` 是全局节点，不随 container 拆 ⇒ 主题那一层副作用（`.dark` 类名 + color-scheme）
     必须逐条重置，否则上一条用例点出来的档位会漂到下一条（`useThemeToggle` 的挂载同步效应到它）。 */
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  notePasswordUpgradeRequired(false);
  refreshFromStorage();
  resetAuthHandling();
  resetVersionPrompt(); // 同步/待背数 store 是模块级单例：每条用例从全零起步
  installRouterGlobals();
  stubFetch();
});

afterEach(() => {
  releaseHolders();
  unmount();
  notePasswordUpgradeRequired(false);
  if (detachAuthSignals) {
    detachAuthSignals();
    detachAuthSignals = null;
  }
  resetVersionPrompt();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ═════════════════ A 组 · 源码哨兵 ═════════════════ */

describe('A 组 · 源码哨兵（零自造 / 三个既有读点+一条写点 / Chrome84 / 定稿串只从 shared 取）', () => {
  it('A-01 判据①：屏剥注释后 CJK 字面量 0 命中（一个字都不自造；三卡/打卡行今天也只从 shared 取）', () => {
    expect(screenCode(), 'MeScreen.tsx 含中文字面量').not.toMatch(/[一-龥]/);
  });

  it('A-02 不新开存储通路：屏剥注释后 0 裸 localStorage/sessionStorage/setItem/getItem/kvSet/桥面', () => {
    const code = screenCode();
    for (const banned of [
      'localStorage',
      'sessionStorage',
      'setItem',
      'getItem',
      'removeItem',
      'kvSet',
      'kvGet',
      'AndroidBridge',
      'token-bridge',
      'native/bridge',
      /* T-19g-iii：G 区的清凭据只准经 `auth-store.signOut()`（其文件头第 3 条纪律"清凭据只有一个函数"），
         所以屏连转发性的一端都不许自己碰：这两颗一旦出现在屏源码，就是第二套清法。 */
      'clearStoredSession',
      'saveSessionToken',
      'clearCredential',
    ]) {
      expect(code, `屏内命中存储面 ${banned}`).not.toContain(banned);
    }
  });

  it('A-03 0 新端点、0 自发起请求：读写只经 data/queries/profile.ts 既有单点，且那份文件未被本轮扩面', () => {
    /* T-19g-v 微翻面（口径不放松）：`fetch(` 禁词是包含扫，会误撞 react-query 的重取出口
       `profile.refetch()` —— `:1001` 主按钮「再试一次」的裁定动作就是它（StudyScreen :642 同形先例），
       那是 query 单点的重取、不是第二颗裸 fetch。故先把 `.refetch(` 调用位摘掉再跑禁词，
       并在下面正向钉它**恰一颗**（多一颗 = 屏自己起了第二路请求）。裸 `fetch(` 依旧 0 命中。 */
    const code = screenCode().replace(/\.refetch\(/g, '');
    for (const banned of [
      '/api/',
      'fetch(',
      'apiGet',
      'apiPut',
      'apiPost',
      'XMLHttpRequest',
      'profileDtoLegacyAlias',
    ]) {
      expect(code, `屏内命中 ${banned}`).not.toContain(banned);
    }
    expect(screenCode().match(/\.refetch\(/g) ?? [], 'refetch 调用位不许超过一颗').toHaveLength(1);
    // camel 别名 `dailyGoal` 屏侧 0 处"裸读"：它只允许作为 shared 文案槽的路径前缀出现
    // （SETTINGS_COPY.dailyGoal.savedToast / .sliderAria / .value(…)），独立成变量就是自造第二份状态。
    expect(code.replace(/SETTINGS_COPY\.dailyGoal/g, ''), '屏读了 camel 别名').not.toContain('dailyGoal');
    // 屏侧对既有单点的引用各恰一次（T-19g-ii 起多 `useDueBadge()` 与同键只读订阅 `checkinStatusQueryOptions()` 各一次）
    expect(code.match(/profileQueryOptions\(\)/g) ?? []).toHaveLength(1);
    expect(code.match(/updateProfile\(/g) ?? []).toHaveLength(1);
    expect(code.match(/useDueBadge\(\)/g) ?? []).toHaveLength(1);
    expect(code.match(/checkinStatusQueryOptions\(\)/g) ?? []).toHaveLength(1);
    // 数据层那一份一字未动：`/api/profile` 仍恰两处（GET + PUT）、`/api/me` 一处、本文件不产 mutation 工厂
    const queries = profileQueriesCode();
    expect(queries.match(/'\/api\/profile'/g) ?? []).toHaveLength(2);
    expect(queries.match(/'\/api\/me'/g) ?? []).toHaveLength(1);
    expect(queries.match(/'\/api\/avatar'/g) ?? []).toHaveLength(1);
    expect(queries.match(/export function \w+MutationOptions/g) ?? []).toHaveLength(0);
    // `checkin.ts` 同样未被扩面：`/api/checkin/status` 一处、`POST /api/checkin` 一处（屏只读不写打卡）
    const checkinQueries = stripComments(readSrc('../src/data/queries/checkin.ts'));
    expect(checkinQueries.match(/'\/api\/checkin\/status'/g) ?? []).toHaveLength(1);
    expect(checkinQueries.match(/'\/api\/checkin'/g) ?? []).toHaveLength(1); // 只配整串，不含 status
    // 屏只发契约键 daily_goal（camel 别名仍只有 shared 那一份）
    expect(code).toContain('daily_goal');
  });

  it('A-04 Chrome84 / §5.1 红线：屏 0 命中四禁与逻辑赋值，0 顶层 await', () => {
    const code = screenCode();
    for (const banned of [
      'structuredClone',
      'Object.hasOwn',
      '.at(',
      'requestIdleCallback',
      ':has(',
      '@container',
      'text-wrap',
      '||=',
      '&&=',
      '??=',
    ]) {
      expect(code, `屏命中 ${banned}`).not.toContain(banned);
    }
    expect(code, '屏有顶层 await').not.toMatch(/^await\s/m);
  });

  it('A-05 DOM 钩子不扩面 + 不启路由 + 不成第二份状态码/flag 处理', () => {
    const code = screenCode();
    expect(code.match(/data-testid/g) ?? []).toHaveLength(1); // 只有屏根那一颗
    expect(code).toContain('me-screen');
    for (const banned of [
      'startRouter',
      'htmlFor',
      'getElementById',
      'querySelector',
      'required',
      '<form',
      '<select',
      '<textarea',
      'window.',
      'document.',
      'handleAuthError(',
      '.status',
      '=== 401',
      '401',
      '403',
      'pwPolicyVersion',
      'FEATURE_FLAG',
      'passwordUpgradeEnforce',
      'localStorage',
    ]) {
      expect(code, `屏内命中 ${banned}`).not.toContain(banned);
    }
    // 登录态与软告知都只读 auth-store 的派生位（§4.7 明令代码内不得读止血阀）
    expect(code).toContain('useAuthSnapshot');
    /* T-19g-iii 判据翻面账（照 A-06 先例留痕）：屏自写 `<button>` 由三颗 → **五颗**。
       新增的两颗是 F 区行件（局部 `SettingRow` 内部那一颗，三行共用同一个源码位）与 G 区退出登录触发钮；
       F 区"三行"在源码上只贡献一次 `<button`，因为它们是同一个组件的三个调用点。
       三张计数卡仍是 @tm/ui StatCard 内部渲染的按钮，不在此面。 */
    expect(code.match(/<button/g) ?? []).toHaveLength(8);
    /* T-19g-v 判据翻面账：五颗 → **八颗**。新增的三颗都在 `:998` 访客引导条（主按钮「登录」、
       次按钮「注册」、下方收起文字「先不用，继续本机使用」，源码各写一次）；
       `:1001` 错误卡用 `@tm/ui` EmptyState 装配，它的两颗按钮由 ui 内部渲染、不记在屏源码账上。 */
    expect(code.match(/<input/g) ?? []).toHaveLength(1); // 唯一那颗 range（ui 无 slider primitive）
    /* T-19g-iii：主题持久化的单点纪律 —— 屏不许出现第二份键名，也不许直调 `applyTheme`/`readStoredTheme`
       （那两件事都归 `@tm/ui` 的 `useThemeToggle()`：它内部才写 `THEME_STORAGE_KEY='tm:theme'`）。 */
    expect(code, "屏自造主题键名 'tm:theme'").not.toContain("'tm:theme'");
    expect(code, '屏绕过 useThemeToggle 直调 applyTheme').not.toContain('applyTheme');
    expect(code.match(/useThemeToggle\(\)/g) ?? []).toHaveLength(1);
    /* F/G/H 三区的落点字面量：屏对 `router.tsx` 零 diff（A-44 #86 先例）⇒ 同值常量各恰一颗，
       这颗 `ABOUT_ROUTE` 已进交付报告的 E4 路由字面量总账。 */
    expect(code.match(/ABOUT_ROUTE/g) ?? []).toHaveLength(2); // 一颗声明 + 一处使用（关于行的落点）
  });

  it('A-06 正向钉：三格已逐字上收 @tm/shared（= §3.8.1:954 原文照抄，走样即红）⇒ 屏只从 statCards 取串', () => {
    /* ── 判据翻面账（T-19g-ii 撤旧钉①）───────────────────────────────────────
     * T-19e 原文的"屏侧仍 0 计数卡"那一半（banned = ['StatCard', 'formatStreak',
     *   'profileProgressOf', 'useDueBadge', 'Wordbook', 'Progress']）钉的是"本轮没越界去接三卡"；
     * T-19g-ii 的任务**正是**接三卡 ⇒ 按派工单把 screenCode() 禁词那半句整段删除，
     * 正向钉（三格逐字 = §3.8.1 原文照抄）**原样保留**，标题同步改成现状。
     */
    // 期望值 = §3.8.1 分区 C 那一行的原文照抄（N 是数字位），不是从 shared 反推回来的。
    const specRowCells = ['词本 N 词', '累计复习 N 天', '连续 N 天'];
    const { statCards } = SETTINGS_COPY;
    const cells = [statCards.words, statCards.reviewDays, statCards.streak];
    for (const probe of ['0', '12', '100']) {
      expect(
        cells.map((cell) => cell.value(Number(probe))),
        `探针 ${probe}：shared 的三格与 §3.8.1 那一行不符`,
      ).toEqual(specRowCells.map((cell) => cell.replace('N', probe)));
    }
    expect(cells.map((cell) => cell.label)).toEqual(['词本', '累计复习', '连续']);
    expect(cells.map((cell) => cell.unit)).toEqual(['词', '天', '天']);
    // §3.8.1:961 的三个落点（单词本 tab / 学习情况 / 热力图）不许住进 shared
    for (const cell of Object.values(statCards)) expect(Object.keys(cell).sort()).toEqual(['label', 'unit', 'value']);
    const copy = sharedCopyCode();
    for (const label of ['词本', '累计复习', '连续']) {
      // 这三串今天**必须**在 shared 独立成串（屏只能从这里取，不许自造第二份）
      expect(new RegExp(`["'\`]${label}["'\`]`).test(copy), `shared 缺独立常量 ${label}`).toBe(true);
    }
    const code = screenCode();
    // 屏侧正哨：三格各取各的槽（label/unit/value 三个面都从 statCards 走；屏内 0 中文自造由 A-01 钉）
    for (const slot of ['statCards.words', 'statCards.reviewDays', 'statCards.streak']) {
      expect(code, `屏没从 shared 的 ${slot} 取串`).toContain(`SETTINGS_COPY.${slot}`);
    }
    // "连续 N 天"的唯一拼接是 shared 的 formatStreak（经 statCards.streak.value），屏 0 自引
    expect(code, '屏自引了 formatStreak（应只经 SETTINGS_COPY.statCards.streak.value）').not.toContain('formatStreak');
  });

  it('A-07 不借用别处文案：屏只用派定给本屏的槽（T-19g-v 起 `fetchFail`/`guestGuide` 随接线移出禁借、转正向钉；`STUDY_COPY` 新列禁借）', () => {
    const code = screenCode();
    /* ── 判据翻面账（T-19g-v 撤旧钉②，照 T-19g-iii 撤 `AUTH_COPY` 的先例）─────────────
     * 禁借清单里 `fetchFail` / `guestGuide` 两颗**移出**：它们是 T-19e "错误卡与引导条本轮不做"
     * 时代的产物，本轮（T-19g-v）正是这两格的交付轮；串只从 `SETTINGS_COPY.fetchFail.*` /
     * `SETTINGS_COPY.guestGuide.*` 与 `AUTH_COPY.submit.login/.register`（shared :604-605 点名
     * 的既有声明点）取，本用例下方正向清单接管。`STUDY_COPY` 为本轮**新增**禁借：`:1001` 的
     * 装配照 StudyScreen 先例，但串不许借 §3.7 那份（copy.ts:585-586 已裁定两键不合并）。
     * 其余禁借（`signedOut` / 各屏 COPY 组等）**原样保留**。
     */
    for (const banned of [
      'PROGRESS_COPY',
      'STUDY_COPY',
      'AUTH_COPY.wall',
      'AUTH_COPY.forceUpgrade',
      'AUTH_COPY.switchTo',
      'AUTH_COPY.cardActions',
      'AUTH_COPY.legacyApk',
      'AUTH_COPY.sms',
      'AUTH_COPY.registerMethodNotice',
      'AUTH_COPY.accountBoundaryNotice',
      'AUTH_COPY.helpRecoveryAnswer',
      'WORDBOOK_COPY',
      'LOOKUP_COPY',
      'TM_ERRORS',
      'NOTICE_',
      'emptyTitle',
      'signedOut',
    ]) {
      expect(code, `屏内命中借用串 ${banned}`).not.toContain(banned);
    }
    /* T-19g-v 计数面：`AUTH_COPY` 出现四颗 = import 1 + `changePassword.title`（F 区行标签，
       T-19g-iii 放开）+ `submit.login` + `submit.register`（:998 两颗按钮，本轮放开）；
       多一颗就是又借了 AUTH_COPY 的别的槽。 */
    expect(code.match(/AUTH_COPY/g) ?? [], '屏借用了 AUTH_COPY 的别的槽').toHaveLength(4);
    expect(code.match(/AUTH_COPY\.changePassword\.title/g) ?? []).toHaveLength(1);
    expect(code.match(/AUTH_COPY\.submit\.(login|register)/g) ?? []).toHaveLength(2);
    for (const used of [
      'SETTINGS_COPY.dailyGoal.label',
      'SETTINGS_COPY.dailyGoal.value(',
      'SETTINGS_COPY.dailyGoal.save',
      'SETTINGS_COPY.dailyGoal.savedToast(',
      'SETTINGS_COPY.dailyGoal.sliderAria(',
      'SETTINGS_COPY.dailyGoal.sliderValueText(',
      'SETTINGS_COPY.dailyGoal.dirtyMark',
      'SETTINGS_COPY.upgradeTodo.entry',
      'SETTINGS_COPY.upgradeTodo.cta',
      'SETTINGS_COPY.statCards.words',
      'SETTINGS_COPY.statCards.reviewDays',
      'SETTINGS_COPY.statCards.streak',
      'CHECKIN_COPY.done(',
      'CHECKIN_COPY.notDone.headline',
      'VERBS.goStudy',
      'maskPhone(',
      'NAV_ITEMS.find',
      // ↓ T-19g-iii（F/G/H 三区）新点名的正哨：三串行标签、G 区四槽与动作、H 区两串，各只从这一份取
      //（E4b6 件1 起『外观』『关于』两颗从 `groups[2]`/`groups[4]` 换成 A-86 #320 的 5A **专用键** `rows.*`）
      'SETTINGS_COPY.rows.appearance',
      'SETTINGS_COPY.rows.about',
      'AUTH_COPY.changePassword.title',
      'THEME_MODE_LABELS[theme]',
      'SETTINGS_COPY.signOut.title',
      'SETTINGS_COPY.signOut.body',
      'SETTINGS_COPY.signOut.confirm',
      'SETTINGS_COPY.signOut.cancel',
      'VERBS.signOut',
      'signOut()',
      'BRAND.footerLine1',
      'BRAND.footerLine2',
      // ↓ T-19g-v（:998 引导条 + :1001 错误卡）新点名的正哨：九槽与装配件，各只从这一份取
      'SETTINGS_COPY.guestGuide.headline',
      'SETTINGS_COPY.guestGuide.subtitle',
      'SETTINGS_COPY.guestGuide.continueAsGuest',
      'AUTH_COPY.submit.login',
      'AUTH_COPY.submit.register',
      'SETTINGS_COPY.fetchFail.title',
      'SETTINGS_COPY.fetchFail.body',
      'SETTINGS_COPY.fetchFail.retry',
      'SETTINGS_COPY.fetchFail.signOut',
      'EmptyState',
    ]) {
      expect(code, `屏未引用既有定稿槽 ${used}`).toContain(used);
    }
    /* G-2（§3.8.5 错误卡）与 G-4（B 区访客引导条）仍不接：`reminder`（每日提醒）这颗 shared 键
       本轮也一颗都不引（R-21 未交付，见用例 J-04 的反向哨）。 */
    for (const notBorrowed of ['reminder', 'notificationOff', 'deleteAccount', 'SETTINGS_COPY.avatar']) {
      expect(code, `屏借了本轮不该动的槽 ${notBorrowed}`).not.toContain(notBorrowed);
    }
  });

  it('A-08 本 spec 自身的自禁项：0 跳过型 / 0 预期失败 / 0 only / 0 裸等宏任务（只扫调用位）', () => {
    const code = stripComments(readSrc('./me-screen.spec.tsx'));
    const callSites: Array<[string, RegExp]> = [
      ['跳过型用例（skip/fail/only）', /\b(?:test|it)\.(?:skip|fail|only)\s*\(/],
      ['跳过型用例组（describe.skip/only）', /\bdescribe\.(?:skip|only)\s*\(/],
      ['裸等宏任务（waitForTimeout）', /waitForTimeout\s*\(/],
      ['手写 setTimeout 等待', /return new Promise[^)]*setTimeout/],
    ];
    for (const [label, pattern] of callSites) {
      expect(pattern.test(code), `spec 出现${label}`).toBe(false);
    }
    expect(code.match(/vi\.advanceTimersByTimeAsync/g) ?? []).toHaveLength(2);
    expect(code.match(/vi\.useFakeTimers\(\)/g) ?? []).toHaveLength(1);
    expect(code.match(/vi\.setSystemTime/g) ?? []).toHaveLength(1);
  });
});

/* ═════════════════ B 组 · E 区渲染面 ═════════════════ */

describe('B 组 · 每日目标渲染面（§3.8.3：标题 + 滑杆 + 刻度 + 右对齐保存，串逐字同源）', () => {
  it('B-01 已登录 + 档案到手：屏根 / 标题 / E 区四件套齐全，文本全部等于 SETTINGS_COPY 那一份（B/C/D 接上后按"包含"钉，全序由 G/H/I 组钉）', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    expect(screenRoot()).not.toBeNull();
    expect(goalSection()).not.toBeNull();
    const navTitle = NAV_ITEMS.find((item) => item.hash === '#/me')?.title ?? '';
    expect(navTitle).not.toBe('');
    const texts = visibleTexts();
    expect(texts[0]).toBe(navTitle);
    expect(texts).toContain(SETTINGS_COPY.dailyGoal.label);
    expect(texts).toContain(SETTINGS_COPY.dailyGoal.value(SERVER_GOAL));
    expect(texts).toContain(SETTINGS_COPY.dailyGoal.value(GOAL_SLIDER.min));
    expect(texts).toContain(SETTINGS_COPY.dailyGoal.value(GOAL_SLIDER.max));
    expect(buttonByLabel(SETTINGS_COPY.dailyGoal.save)).not.toBeNull();
    // 未为本屏之外的东西补 DOM 钩子：整棵树 0 个 id 属性、0 个原生 required
    expect(all('[id]').length).toBe(0);
    expect(all('[required]').length).toBe(0);
  });

  it('B-02 滑杆的可访问名与值文本 = shared 两份模板，值跟服务端那一刻的 daily_goal（不是默认值）', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    const el = slider();
    expect(el?.value).toBe(String(SERVER_GOAL));
    expect(el?.getAttribute('aria-label')).toBe(SETTINGS_COPY.dailyGoal.sliderAria(SERVER_GOAL));
    expect(el?.getAttribute('aria-valuetext')).toBe(SETTINGS_COPY.dailyGoal.sliderValueText(SERVER_GOAL));
    expect(el?.getAttribute('min')).toBe(String(GOAL_SLIDER.min));
    expect(el?.getAttribute('max')).toBe(String(GOAL_SLIDER.max));
    expect(el?.getAttribute('step')).toBe(String(GOAL_SLIDER.step));
  });

  it('B-03 保存钮初始 disabled + aria-disabled（值未变化），未保存小点 0 命中', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    const save = buttonByLabel(SETTINGS_COPY.dailyGoal.save);
    expect(save?.disabled).toBe(true);
    expect(save?.getAttribute('aria-disabled')).toBe('true');
    expect(dirtyMarkShown()).toBe(false);
  });

  it('B-04 滑杆域 ⊂ 契约域（R-19⑦：默认值与存量值都不被重置，也发不出被服务端拒的值）；且屏不再持有第二副本', () => {
    // T-19g-ii：`GOAL_SLIDER` 的字面值上收到 shared（`limits.ts:119-121`），屏侧这份只是别名转发。
    // 域不变式**原断言一条不放松**（屏侧这半 + shared 里那颗钉的是同一件事的两半，留撤由 TPM 裁）。
    expect(GOAL_SLIDER).toEqual({
      min: DAILY_GOAL_UI_MIN,
      max: DAILY_GOAL_UI_MAX,
      step: DAILY_GOAL_UI_STEP,
    });
    expect(GOAL_SLIDER.min).toBeGreaterThanOrEqual(DAILY_GOAL_MIN);
    expect(GOAL_SLIDER.max).toBeLessThanOrEqual(DAILY_GOAL_MAX);
    expect(DAILY_GOAL_DEFAULT).toBeGreaterThanOrEqual(GOAL_SLIDER.min);
    expect(DAILY_GOAL_DEFAULT).toBeLessThanOrEqual(GOAL_SLIDER.max);
    expect(GOAL_SLIDER.step).toBeGreaterThan(0);
    expect(SERVER_GOAL % GOAL_SLIDER.step).toBe(0);
    expect(NEW_GOAL % GOAL_SLIDER.step).toBe(0);
    // 屏剥注释后 0 自造滑杆字面值（5/50/5 只允许从 shared import 进来）
    const code = screenCode();
    expect(code).not.toMatch(/min:\s*5/);
    expect(code).not.toMatch(/max:\s*50/);
    expect(code).not.toMatch(/step:\s*5/);
  });

  it('B-05 服务端给了超出 UI 域的存量值（200）：滑杆显示 UI 上界、不报错、更不替用户写回', async () => {
    seedNormalSession();
    getOutcome = success(DAILY_GOAL_MAX);
    mountScreen();
    await settle();
    const el = slider();
    expect(el?.value).toBe(String(GOAL_SLIDER.max));
    expect(el?.getAttribute('aria-valuetext')).toBe(SETTINGS_COPY.dailyGoal.sliderValueText(GOAL_SLIDER.max));
    expect(visibleTexts()).toContain(SETTINGS_COPY.dailyGoal.value(GOAL_SLIDER.max));
    expect(dirtyMarkShown()).toBe(false);
    expect(buttonByLabel(SETTINGS_COPY.dailyGoal.save)?.disabled).toBe(true);
    expect(putCalls()).toHaveLength(0);
    expect(toastCalls).toHaveLength(0);
  });
});

/* ═════════════════ C 组 · 未提交 ⇒ 静默不保存 ═════════════════ */

describe('C 组 · R-19② 后半句"取消点别处就静默保存"：未提交 ⇒ 不写、不 toast、不假装成功', () => {
  it('C-01 拖了不点保存：0 请求、0 toast，只有 ● 与可用的保存钮（改了但没提交）', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    await dragSliderTo(NEW_GOAL);
    expect(putCalls()).toHaveLength(0);
    expect(toastCalls).toHaveLength(0);
    expect(buttonByLabel(SETTINGS_COPY.dailyGoal.save)?.disabled).toBe(false);
    expect(dirtyMarkShown()).toBe(true);
    expect(visibleTexts()).toContain(SETTINGS_COPY.dailyGoal.value(NEW_GOAL));
  });

  it('C-02 拖回原值即撤销：保存钮回到 disabled、● 消失，仍 0 请求 0 toast', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    await dragSliderTo(NEW_GOAL);
    await dragSliderTo(SERVER_GOAL);
    expect(buttonByLabel(SETTINGS_COPY.dailyGoal.save)?.disabled).toBe(true);
    expect(dirtyMarkShown()).toBe(false);
    expect(putCalls()).toHaveLength(0);
    expect(toastCalls).toHaveLength(0);
  });

  it('C-03 失焦/离开不代替用户提交（§3.8.3 明令禁 onBlur 静默保存）：blur 后仍 0 请求 0 toast', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    await dragSliderTo(NEW_GOAL);
    await act(async () => {
      slider()!.dispatchEvent(new FocusEvent('blur'));
      slider()!.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await Promise.resolve();
    });
    await settle();
    expect(putCalls()).toHaveLength(0);
    expect(toastCalls).toHaveLength(0);
    expect(slider()?.value).toBe(String(NEW_GOAL));
  });

  it('C-04 未弄脏时硬点保存（绕过 disabled 直接派发）：屏侧再守一次，仍 0 请求 0 toast', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    const save = buttonByLabel(SETTINGS_COPY.dailyGoal.save);
    expect(save).not.toBeNull();
    await click(save!);
    await settle();
    expect(putCalls()).toHaveLength(0);
    expect(toastCalls).toHaveLength(0);
  });
});

/* ═════════════════ D 组 · 保存 + toast ═════════════════ */

describe('D 组 · 明确保存：恰一次 PUT /api/profile + 逐字 toast + 失效重取回同一个数', () => {
  it('D-01 请求面：一次 PUT /api/profile、带正常 token、体里只有 daily_goal（不夹带别的键）', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    await saveNewGoal();
    const puts = putCalls();
    expect(puts).toHaveLength(1);
    expect(puts[0]!.url).toContain('/api/profile');
    expect(puts[0]!.authorization).toBe(`Bearer ${NORMAL_TOKEN}`);
    expect(puts[0]!.body).toEqual({ daily_goal: NEW_GOAL });
    // 允许面 = 本屏三个既有读点（profile / checkin-status / review-queue 红点），其余一端点即越界
    expect(
      fetchCalls.filter(
        (call) =>
          !call.url.includes('/api/profile') &&
          !call.url.includes('/api/checkin/status') &&
          !call.url.includes('/api/review/queue'),
      ),
    ).toHaveLength(0);
  });

  it('D-02 成功 toast 逐字 = SETTINGS_COPY.dailyGoal.savedToast(n)、tone success，且只有这一条', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    await saveNewGoal();
    expect(toastCalls).toEqual([{ message: SETTINGS_COPY.dailyGoal.savedToast(NEW_GOAL), tone: 'success' }]);
  });

  it('D-03 成功后失效 profileKeys 重取，滑杆落到"与服务端同一个数"、● 消失、钮回 disabled、不自激', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    expect(getCalls()).toHaveLength(1);
    await saveNewGoal();
    expect(getCalls()).toHaveLength(2); // 被 invalidateQueries({ queryKey: profileKeys.all }) 拉回去重取
    await settle(6);
    expect(getCalls()).toHaveLength(2); // 之后不再多发一次
    const el = slider();
    expect(el?.value).toBe(String(NEW_GOAL));
    expect(el?.getAttribute('aria-valuetext')).toBe(SETTINGS_COPY.dailyGoal.sliderValueText(NEW_GOAL));
    expect(dirtyMarkShown()).toBe(false);
    expect(buttonByLabel(SETTINGS_COPY.dailyGoal.save)?.disabled).toBe(true);
    expect(client.getQueryData(profileKeys.get())).toMatchObject({ daily_goal: NEW_GOAL });
  });

  it('D-04 服务端拒绝 ⇒ 失败不洗成成功：0 success toast、error toast 用人话、草稿留着可重试', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    putMode = 'fail';
    putOutcome = serverErrorOf('TEMP_LOCKED', 429);
    await saveNewGoal();
    expect(putCalls()).toHaveLength(1);
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.tone).toBe('error');
    expect(toastCalls[0]!.message).toBe(TM_ERRORS.TEMP_LOCKED.copy);
    expect(slider()?.value).toBe(String(NEW_GOAL));
    expect(buttonByLabel(SETTINGS_COPY.dailyGoal.save)?.disabled).toBe(false);
    putMode = 'ok';
    await click(buttonByLabel(SETTINGS_COPY.dailyGoal.save)!); // = §3.8.3 的"重试"，不新增文案
    await settle();
    expect(putCalls()).toHaveLength(2);
    expect(toastCalls.filter((call) => call.tone === 'success')).toHaveLength(1);
  });

  it('D-05 契约外失败（网络断）⇒ 人话仍是既有单点那一份（PLAIN_TERMS.connectionDown），仍无 success', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    putMode = 'down';
    await saveNewGoal();
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.tone).toBe('error');
    expect(toastCalls[0]!.message).toBe(PLAIN_TERMS.connectionDown);
    expect(toastCalls.filter((call) => call.tone === 'success')).toHaveLength(0);
  });

  it('D-06 pending 期间重复点保存只发一次（半途不写第二遍）', async () => {
    seedNormalSession();
    holdPut = true;
    mountScreen();
    await settle();
    await dragSliderTo(NEW_GOAL);
    const save = buttonByLabel(SETTINGS_COPY.dailyGoal.save)!;
    await click(save);
    expect(putCalls()).toHaveLength(1);
    await click(save);
    await click(save);
    expect(putCalls()).toHaveLength(1);
    releaseHolders();
    holdPut = false;
    await settle();
    expect(putCalls()).toHaveLength(1);
    expect(toastCalls).toHaveLength(1);
  });

  it('D-07 401 CREDENTIAL_EXPIRED：清凭据与跳转仍只由 rest-fetcher 单点做，屏内 0 参与、0 自造提示', async () => {
    seedNormalSession();
    /* ── 撤旧钉③（T-19g-ii）──────────────────────────────────────────────────
     * T-19e 当年在断言前手工调一次 `refreshFromStorage()`，因为 `attachAuthSignals()` 在
     * 生产入口 0 调用（缺口）。A-73 #224 已把它接进 `main.tsx` 的 `bindDataLayerNavigation()`
     * （main.tsx:145）⇒ 手工刷新已过期。本 spec 不启 `main.tsx`，所以改挂**同款生产接线**
     * `attachAuthSignals()`（afterEach 必拆），把"广播 → store 对齐"交给被钉的机制本身，
     * 用例不再替它刷新。
     */
    detachAuthSignals = attachAuthSignals();
    mountScreen();
    await settle();
    putMode = 'fail';
    putOutcome = serverErrorOf('CREDENTIAL_EXPIRED', 401);
    await saveNewGoal();
    expect(localStorage.getItem(SESSION_KEYS.token)).toBeNull();
    // 这一帧屏还没被通知 ⇒ 屏侧没有第二份 401 处理（同 security spec F-05 的同一条判据）
    expect(fetchCalls.filter((call) => call.method === 'NAVIGATE')).toHaveLength(0);
    // 同源派生位：接线在位时，401 广播自己就会把 store 对齐成 signed-out（**0 手工 refreshFromStorage**）
    await settle();
    expect(getAuthSnapshot().status).toBe('signed-out');
    expect(toastCalls.filter((call) => call.tone === 'success')).toHaveLength(0);
    // 屏没自己跳：`host.navigate` 一次都没被调用（换页是单点写 hash 做的）
    expect(fetchCalls.filter((call) => call.method === 'NAVIGATE')).toHaveLength(0);
    expect(window.location.hash).toBe(`#${LOGIN_ROUTE}`);
  });
});

/* ═════════════════ E 组 · 止血阀软告知入口行 ═════════════════ */

describe('E 组 · passwordUpgradeEnforce=off 的软告知入口那一行（读 auth-store 派生位，点击去 #/security）', () => {
  it('E-01 正常会话（无软告知位）：该行不渲染，0 入口串、0「去更新」钮', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    expect(visibleTexts()).not.toContain(SETTINGS_COPY.upgradeTodo.entry);
    expect(buttonByLabel(SETTINGS_COPY.upgradeTodo.cta)).toBeNull();
    expect(buttons()).toHaveLength(9); // T-19g-iii 起：三张计数卡 + D 区「去背单词」+「保存」+ F 区三行 + G 区触发钮；「去更新」不出现
  });

  it('E-02 软告知会话：一行两槽逐字 = SETTINGS_COPY.upgradeTodo.entry / .cta，且全树恰一颗「去更新」', async () => {
    seedAdvisorySession();
    mountScreen();
    await settle();
    expect(visibleTexts()).toContain(SETTINGS_COPY.upgradeTodo.entry);
    expect(buttonByLabel(SETTINGS_COPY.upgradeTodo.cta)).not.toBeNull();
    expect(countButtonsLabeled(SETTINGS_COPY.upgradeTodo.cta)).toBe(1);
    expect(getAuthSnapshot()).toMatchObject({ hasToken: true, upgradeRequired: true });
  });

  it('E-03 点「去更新」= 走 router.js 的 navigate() 去既有 /security（本轮不重做改密页），且不发任何预取请求', async () => {
    seedAdvisorySession();
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    mountScreen();
    await settle();
    const before = fetchCalls.length;
    await click(buttonByLabel(SETTINGS_COPY.upgradeTodo.cta)!);
    expect(window.location.hash).toBe(`#${SECURITY_PATH}`);
    expect(fetchCalls).toHaveLength(before);
    expect(routeFor(SECURITY_PATH).kind).toBe('secondary');
    expect(fetchCalls.filter((call) => call.method === 'NAVIGATE')).toHaveLength(0);
  });

  it('E-04 点亮它的只有 auth-store 那枚派生位：广播软告知后同一行出现，屏不自算第二份判定', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    expect(visibleTexts()).not.toContain(SETTINGS_COPY.upgradeTodo.entry);
    await act(async () => {
      notePasswordUpgradeRequired(true);
      await Promise.resolve();
    });
    await settle();
    expect(getAuthSnapshot()).toMatchObject({ hasToken: true, upgradeRequired: true, upgradeSessionOnly: false });
    expect(visibleTexts()).toContain(SETTINGS_COPY.upgradeTodo.entry);
    expect(countButtonsLabeled(SETTINGS_COPY.upgradeTodo.cta)).toBe(1);
  });

  it('E-05 硬门禁那一支（只握临时凭据）不借用本行：本屏不渲染它，也不冒充 UpgradePasswordScreen', async () => {
    seedUpgradeOnlySession();
    mountScreen();
    await settle();
    expect(getAuthSnapshot()).toMatchObject({ hasToken: false, upgradeSessionOnly: true });
    expect(visibleTexts()).not.toContain(SETTINGS_COPY.upgradeTodo.entry);
    expect(buttonByLabel(SETTINGS_COPY.upgradeTodo.cta)).toBeNull();
    expect(putCalls()).toHaveLength(0);
    expect(getCalls()).toHaveLength(0);
  });
});

/* ═════════════════ F 组 · 访客与拉取失败 ═════════════════ */

/**
 * T-19g-iv · 访客态「整棵可见文本表」的正向期望值（F-01 / G-03 / H-04 / L-03 四支共用）。
 * 旧钉在三处访客支写的是 `toEqual([顶栏标题])` —— 那是把"访客态 F/G/H 全区隐藏"的**缺陷**钉成期望值，
 * 与 §3.8.5 `:998`（访客只隐藏 F 中「我的查询历史」「修改密码」两行）相反 ⇒ 翻面为正向整表钉。
 * 期望值**全部写字面量**（A-74 #231 的规矩，不许从 shared 反推）：行标题与档位人话逐字抄
 * §3.8.1 `:957`（「外观（浅色/深色/跟随系统）」「关于」），两串页脚逐字抄 `:959`（L-01 另钉 shared 槽不漂）；
 * `›` 是「关于」行右侧的既有静态装饰字符（`aria-hidden` 的文本节点，读屏面照收）；
 * 「跟随系统」成立的前提 = jsdom 每条用例清存储 ⇒ 外观缺省档 `system`（J-02 已钉同一缺省）。
 * T-19g-v 增补：`:998` 的 B 区引导条五串（两文案串 + 两颗按钮 + 下方收起文字）逐字抄 §3.8.5 `:998`
 * 文案列原文（`F-39` 记两版整表并存的账），顺序 = DOM 顺序（引导条住 B 区 ⇒ 顶栏标题之后、F 列表之前）。
 */
const GUEST_VISIBLE_TEXTS: readonly string[] = [
  '我的', // 顶栏标题（本屏 tab 名）
  '登录之后，换手机也不丢', // :998 引导条主串逐字（T-19g-v 接线）
  '词本、学习记录和提醒会跟着账号走。', // :998 引导条副串逐字
  '登录', // :998 主按钮 = AUTH_COPY.submit.login（逐字见 M-01 的 shared 槽钉）
  '注册', // :998 次按钮 = AUTH_COPY.submit.register
  '先不用，继续本机使用', // :998 下方文字（"本机"不在禁词面上，R-20⑤/R-25①）
  '外观', // :957 行标题逐字（访客可见）
  '跟随系统', // :957 外观行右值：缺省档人话
  '关于', // :957 行标题逐字（访客可见）
  '›', // 「关于」行 chevron
  '© 2026 明日记忆 · 赣ICP备2026013161号-1', // :959 页脚第一串（真号，用户本人 2026-09-26 给，F-32 已闭）
  '明天再记，也不算晚。', // :959 页脚第二串
];

describe('F 组 · 访客与拉取失败（T-19g-v 起：:998 引导条与 :1001 错误卡已接线，各由本组与 M 组钉住）', () => {
  it('F-01 游客：屏根仍在（/me 是 tab，不跳登录），E 区不渲染，F 两静态行 + 页脚按 :998 常驻，一个请求都不发', async () => {
    mountScreen();
    await settle();
    expect(screenRoot()).not.toBeNull();
    expect(goalSection()).toBeNull();
    expect(slider()).toBeNull();
    expect(fetchCalls).toHaveLength(0);
    /* T-19g-iv 翻面：旧钉 `toEqual([navTitle])` 把缺陷钉成期望值 ⇒ 正向整表钉（出处见常量注释）。 */
    expect(visibleTexts()).toEqual(GUEST_VISIBLE_TEXTS);
    expect(fetchCalls.filter((call) => call.method === 'NAVIGATE')).toHaveLength(0);
  });

  it('F-02 档案拉不下来：E 区整段不渲染（不半截滑杆、不假 0），且 0 写请求、0 成功 toast', async () => {
    seedNormalSession();
    getOutcome = serverErrorOf('TOO_MANY_REQUESTS', 429);
    mountScreen();
    await advance(5000); // R-24⑥ 那一次静默重试也跑完（屏侧 retry:1）
    await settle();
    expect(getCalls()).toHaveLength(2);
    expect(goalSection()).toBeNull();
    expect(slider()).toBeNull();
    expect(putCalls()).toHaveLength(0);
    expect(toastCalls).toHaveLength(0);
  });

  it('F-03 拉取失败：整页降级为一个错误卡（:1001 四串逐字正向钉），C/D/E/F/G 全不画、H 页脚保留（T-19g-v 立卡；E4b6 件2 翻页脚半，6A）', async () => {
    /* ── 判据翻面账（T-19g-v 撤旧钉）─────────────────────────────────────────
     * 旧钉（T-19e/iii/iv 时代）：`texts === [顶栏标题]` + "错误卡三串不在 shared ⇒ 宁缺勿造、不许借用"。
     * 三串今天已接线（`SETTINGS_COPY.fetchFail.*` 自 T-19g-i 就在 shared，本轮正是它的交付轮，
     * 与当年撤 `statCards` 禁借同一先例），":1001 整页降级"就是本支的形状 ⇒ 空表钉翻为错误卡整表钉。
     * 期望值照 A-74 #231 写 §3.8.5 `:1001` 文案列的**原文字面量**，不从 shared 反推。
     * ── 判据翻面账（E4b6 件2：用户 2026-09-22/23 裁 6A，A-86 #320，F-36 已裁）────────
     * 本支的 H 页脚由"不画"翻为"**保留**"：备案号是个人主办单位的法定公示、与数据态无关，而 `:1001`
     * "整页降级为一个错误卡"管的是**内容区** ⇒ 下面的整表钉尾部补两串页脚字面量（备案号在前，
     * 照 L-03 访客半支的既有形状，仍不从 shared 反推），`footer` 那颗从 0 翻为恰 1 颗。
     * C/D/E/F/G 与 `sync-badge` 的反查 0 命中**一颗没撤**（页脚不是同步行）；在途支仍不画页脚（M-06）。 */
    seedNormalSession();
    getOutcome = serverErrorOf('TOO_MANY_REQUESTS', 429);
    mountScreen();
    await advance(5000);
    await settle();
    const texts = visibleTexts();
    expect(texts).toEqual([
      '我的', // h1 常驻（StudyScreen :630-648 先例：降级支保留页级标题）
      '账号信息没拿到',
      '检查网络后再试一次，你的数据没有改动。',
      '再试一次',
      '退出登录', // :1001"次按钮仅在已登录态出现"—— 本支门就是已登录，必现
      '© 2026 明日记忆 · 赣ICP备2026013161号-1', // :959 页脚第一串（6A 起降级支也画；真号字面量，不反推 shared）
      '明天再记，也不算晚。', // :959 页脚第二串
    ]);
    // 四串各恰取 shared 的一个槽（串不许在屏内漂成第二份）
    expect(SETTINGS_COPY.fetchFail.title).toBe('账号信息没拿到');
    expect(SETTINGS_COPY.fetchFail.body).toBe('检查网络后再试一次，你的数据没有改动。');
    expect(SETTINGS_COPY.fetchFail.retry).toBe('再试一次');
    expect(SETTINGS_COPY.fetchFail.signOut).toBe('退出登录');
    // "不显示半真半假的 0"：C 卡 / D 行 / 同步行 / E 滑杆 / F 列表 / G 触发一颗不剩（H 页脚自 6A 起保留）
    expect(statCardsAll()).toHaveLength(0);
    expect(buttonByLabel(VERBS.goStudy)).toBeNull();
    expect(goalSection()).toBeNull();
    expect(settingRows()).toHaveLength(0);
    expect(all('footer')).toHaveLength(1); // E4b6 件2 翻面（6A）：旧钉 0 颗是 F-36 待裁前的口径，本页脚含备案号
    expect(all('[data-testid=sync-badge]')).toHaveLength(0);
    expect(buttonByLabel(SETTINGS_COPY.dailyGoal.save)).toBeNull();
  });

  it('F-04 首屏成功一次即静住：推进 60 秒不再多发 GET（无自激、无轮询）', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    expect(getCalls()).toHaveLength(1);
    await advance(60_000);
    await settle();
    expect(getCalls()).toHaveLength(1);
  });
});

/* ═════════════════ G 组 · C 区三张统计卡（T-19g-ii） ═════════════════ */

describe('G 组 · C 区三卡（§3.8.1:954 逐字 + :961 落点；E4b2 件3 起按格取源降级、缺源那格不画假 0）', () => {
  it('G-01 三卡齐：读屏全串逐字 = statCards.*.value(n)、≥100 显示 99+，几何类对回 :954', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    const words = statCard('stat-words');
    const reviewDays = statCard('stat-review-days');
    const streak = statCard('stat-streak');
    expect([words, reviewDays, streak].every((el) => el !== null)).toBe(true);
    expect(statCardsAll()).toHaveLength(3); // 恰三张，不许多造
    // "数字可点进明细"= 整卡一个 button（R-19②），卡内不再嵌控件
    expect(words!.querySelector('button')).toBeNull();
    // 读屏全串 = §3.8.1:954 那三种整行（valueText 传的是 shared 的原串）
    expect(words!.getAttribute('aria-label')).toBe(SETTINGS_COPY.statCards.words.value(TOTAL_WORDS));
    expect(reviewDays!.getAttribute('aria-label')).toBe(
      SETTINGS_COPY.statCards.reviewDays.value(REVIEW_DAYS),
    );
    expect(streak!.getAttribute('aria-label')).toBe(
      SETTINGS_COPY.statCards.streak.value(STREAK_DAYS),
    );
    // 显示面：≥100 走 formatCount 的唯一 `99+`（读屏仍全串）；<100 原样
    expect(words!.textContent).toContain(formatCount(TOTAL_WORDS));
    expect(reviewDays!.textContent).toContain(String(REVIEW_DAYS));
    expect(streak!.textContent).toContain(String(STREAK_DAYS));
    // label/unit 两颗小字也逐字来自 shared（不是屏内拼接）
    expect(words!.textContent).toContain(SETTINGS_COPY.statCards.words.label);
    expect(words!.textContent).toContain(SETTINGS_COPY.statCards.words.unit);
    expect(reviewDays!.textContent).toContain(SETTINGS_COPY.statCards.reviewDays.label);
    expect(streak!.textContent).toContain(SETTINGS_COPY.statCards.streak.label);
    // 几何 = :954 那一行：grid-cols-3 gap-3、卡高 84px、mt-1
    const grid = words!.parentElement!;
    expect(grid.className).toContain('grid-cols-3');
    expect(grid.className).toContain('gap-3');
    expect(grid.className).toContain('mt-1');
    for (const card of [words, reviewDays, streak]) {
      expect(card!.className).toContain('h-[84px]');
    }
  });

  it('G-02 三颗落点（§3.8.1:961）：词本→#/wordbook、累计复习→#/progress、连续→#/progress；跳转 0 预取', async () => {
    seedNormalSession();
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    mountScreen();
    await settle();
    const before = fetchCalls.length;
    await click(statCard('stat-words')!);
    expect(window.location.hash).toBe('#/wordbook');
    await click(statCard('stat-review-days')!);
    expect(window.location.hash).toBe('#/progress');
    await click(statCard('stat-streak')!);
    expect(window.location.hash).toBe('#/progress');
    expect(fetchCalls).toHaveLength(before); // 点卡只换地址，不发任何请求（数据是路由那边的事）
    expect(routeFor('/wordbook').kind).toBe('tab');
    expect(routeFor('/progress').kind).toBe('tab');
    // "数字明细弹层"不存在也不许造：没有第三种落点
    expect(statCardsAll()).toHaveLength(3);
  });

  it('G-03 访客：0 计数卡、0 假 0（"连续 0 天"不许上屏；§3.8.5 本地值缺口见报告，本轮整段不画）', async () => {
    mountScreen();
    await settle();
    expect(statCardsAll()).toHaveLength(0);
    const texts = visibleTexts();
    /* T-19g-iv 翻面：旧钉 `=== [顶栏标题]` 是"访客 F/G/H 全区隐藏"的缺陷钉 ⇒ 正向整表钉。
       这颗同时是"假 0 无处藏"的最强形态：访客全树文本 = 两静态行 + 两串页脚，不存在第三个数字位。 */
    expect(texts).toEqual(GUEST_VISIBLE_TEXTS);
    expect(texts.some((t) => t.includes(SETTINGS_COPY.statCards.streak.value(0)))).toBe(false);
    expect(texts.some((t) => t.includes(SETTINGS_COPY.statCards.reviewDays.value(0)))).toBe(false);
    expect(fetchCalls).toHaveLength(0);
  });

  it('G-04 打卡拉失败：只有打卡源的连续格与 D 行不画（不半截、不假 0），档案源两格与 B/E 照常，0 toast', async () => {
    /* ── E4b2 件3（F-29 真修）的改判账 ──────────────────────────────────────────
     * 旧钉（T-19g-ii 起）：`statCardsAll() === 0` + `buttons() === 5`，标题写"C 与 D 整段不渲染"——
     * 那是把屏侧那一颗 `showCheckinRow = showGoal && checkin.data !== undefined` 的**缺陷**钉成期望值：
     * `词本 N 词` 的唯一数字源是 `profileProgressOf(profile.data)`，与 `checkin/status` 无关，
     * 却因共门一起消失（与 R-19②"三格常驻"相反）。
     * 新钉：按格取源降级 ⇒ 档案源两格留在位（数字逐字不变），打卡源那一格与 D 行仍不画。
     * ⚠ 撤下的"不假 0"下限一颗没丢：`连续 0 天` 与 `CHECKIN_COPY.notDone.headline` 仍全树 0 命中，
     *   且 `stat-streak` 整格（含带真数 12 的那一份）也不许出现。 */
    seedNormalSession();
    checkinOutcome = { status: 500, body: { error: 'boom', code: 'SERVER_ERROR' } };
    mountScreen();
    await settle();
    // 档案源两格在位，且数字与三卡齐的 G-01 逐字同值（不因旁边少一格而漂）
    expect(statCardsAll()).toHaveLength(2);
    expect(statCard('stat-words')!.getAttribute('aria-label')).toBe(
      SETTINGS_COPY.statCards.words.value(TOTAL_WORDS),
    );
    expect(statCard('stat-review-days')!.getAttribute('aria-label')).toBe(
      SETTINGS_COPY.statCards.reviewDays.value(REVIEW_DAYS),
    );
    expect(statCard('stat-streak')).toBeNull(); // 缺源那一格整格不画
    const texts = visibleTexts();
    expect(texts.some((t) => t.includes(SETTINGS_COPY.statCards.streak.value(0)))).toBe(false);
    expect(texts.some((t) => t.includes(SETTINGS_COPY.statCards.streak.value(STREAK_DAYS)))).toBe(false);
    expect(texts).not.toContain(CHECKIN_COPY.notDone.headline); // 拿不到状态也不画 D 行
    expect(buttonByLabel(VERBS.goStudy)).toBeNull(); // D 行的按钮也不在
    expect(texts).toContain(SETTINGS_COPY.dailyGoal.label); // E 区只等 profile，不受牵连
    /* 常态 9 颗可点面（G-01/D-01 口径）减去「连续」卡与 D 区「去背单词」两颗 = 7：
       档案源两卡 +「保存」+ F 区三行 + G 区触发钮；没有半截的 0 卡、也没有第三种补位控件。 */
    expect(buttons()).toHaveLength(7);
    expect(toastCalls).toHaveLength(0);
  });

  it('G-05 打卡数在途未回：与 G-04 同一档按格降级（档案源两格已在位、0 假 0、0 半截）', async () => {
    /* E4b2 件3 新增：F-29 的门是"到手没有"，不是"失败没有" ⇒ 永不应答那一档必须单独钉，
       否则"未回"这一支只被 G-04 的 500 支间接代表过。旧版屏在这里同样会整段不画（同一颗共门）。 */
    seedNormalSession();
    holdCheckin = true; // `/api/checkin/status` 永不应答 ⇒ 屏停在"打卡源没到手"
    mountScreen();
    await settle();
    expect(statCardsAll()).toHaveLength(2);
    expect(statCard('stat-words')).not.toBeNull();
    expect(statCard('stat-review-days')).not.toBeNull();
    expect(statCard('stat-streak')).toBeNull();
    const texts = visibleTexts();
    expect(texts.some((t) => t.includes(SETTINGS_COPY.statCards.streak.value(0)))).toBe(false);
    expect(texts).not.toContain(CHECKIN_COPY.notDone.headline);
    expect(buttonByLabel(VERBS.goStudy)).toBeNull();
    expect(texts).toContain(SETTINGS_COPY.dailyGoal.label); // 档案已到手 ⇒ E 区照常（含滑杆）
    expect(slider()).not.toBeNull();
    expect(buttons()).toHaveLength(7);
    expect(toastCalls).toHaveLength(0);
  });

  it('G-06 档案在途未回而打卡已回：只画打卡源那一格 + D 行，档案两格与 B/E 不画，且不出 :1001 错误卡', async () => {
    /* E4b2 件3 新增（反方向）：F-29 之后两源互不牵连 ⇒ "档案没回来"不能再把已到手的打卡数字一起带走。
       这一颗同时是"按格取源"的另一半证据：若有人把门重新合并（`showGoal && …`），本条立刻判红。
       `fetchFailed = signedIn && profile.isError` ⇒ 在途不是失败，错误卡不许出现（M-06 同族下限）。 */
    seedNormalSession();
    holdProfile = true; // `/api/profile` 永不应答；checkin 用默认桩（已打卡 · 连续 12 天）
    mountScreen();
    await settle();
    expect(statCardsAll()).toHaveLength(1);
    expect(statCard('stat-streak')!.getAttribute('aria-label')).toBe(
      SETTINGS_COPY.statCards.streak.value(STREAK_DAYS),
    );
    expect(statCard('stat-words')).toBeNull();
    expect(statCard('stat-review-days')).toBeNull();
    const texts = visibleTexts();
    expect(texts.some((t) => t.includes(SETTINGS_COPY.statCards.words.value(0)))).toBe(false); // 档案侧 0 假 0
    expect(texts).toContain(CHECKIN_COPY.done(STREAK_DAYS)); // D 行只看它自己的源，已到手就画
    expect(buttonByLabel(VERBS.goStudy)).not.toBeNull();
    expect(goalSection()).toBeNull(); // E 区仍等档案（半截滑杆不画）
    expect(texts).not.toContain(SETTINGS_COPY.fetchFail.title); // 在途不出错误卡
    /* 可点面 = 连续卡 + D 行「去背单词」两颗：F 区与 G 区仍走 `showSettingsSections = !signedIn || showGoal`
       （访客/失败那一族的门，本轮禁动面），档案没到手时它们本来就不画 ⇒ 不是 F-29 的账。 */
    expect(buttons()).toHaveLength(2);
    expect(toastCalls).toHaveLength(0);
  });
});

/* ═════════════════ H 组 · B 区账号头（T-19g-ii） ═════════════════ */

describe('H 组 · B 区账号头（§3.8.1:953：头像 56px 回落 + 昵称 + 脱敏手机号；头像非交互）', () => {
  it('H-01 已登录：昵称逐字、手机号只以 maskPhone 形状上屏，裸号 0 出现', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    const texts = visibleTexts();
    expect(texts).toContain('tm'); // = profileBody().nickname（屏不自造第二份）
    expect(texts).toContain(maskPhone(PHONE));
    expect(texts.some((t) => t.includes(PHONE))).toBe(false); // 裸号任何一段都不上屏
    expect(texts.some((t) => t.includes(PHONE.slice(3, 7)))).toBe(false);
  });

  it('H-02 缺图回落：0 <img>，回落面 = 品牌底 + 昵称首字；B 区 0 可点控件（§3.8.4 选图链未接）', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    expect(all('img')).toHaveLength(0);
    expect(visibleTexts()).toContain('tm'.slice(0, 1));
    // 头像面不是按钮：整屏可点数 = 三卡 + 去背单词 + 保存 + F 区三行 + G 区触发钮，B 区 0 贡献
    expect(buttons()).toHaveLength(9);
    expect(buttons().some((b) => b.querySelector('img'))).toBe(false);
  });

  it('H-03 有头像 URL：仍 0 点击语义、0 上传/头像请求（§3.8.4 选图链未接线；jsdom 不载图，img 上屏面见报告）', async () => {
    seedNormalSession();
    getOutcome = {
      status: 200,
      body: { ...profileBody(SERVER_GOAL), avatar: 'https://cdn.example.com/a.png' },
    };
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    mountScreen();
    await settle();
    // radix Avatar 只在图片 `loaded` 后才挂 `<img>`；jsdom 不加载网络图片，这台宿主上验不了
    // "img 上屏"这一半（**待证**：真机 WebView 上应出现圆图）。本轮该钉的是"什么都没多出来"：
    const hashBefore = window.location.hash;
    const before = fetchCalls.length;
    expect(buttons()).toHaveLength(9); // 与缺图态同一颗数：头像没变成第 10 颗可点控件
    const texts = visibleTexts();
    expect(texts).toContain('tm');
    expect(texts).toContain(maskPhone(PHONE));
    await click(screenRoot()!); // 点头像所在区域（用屏根代点，头像本身不可查）也不该有链
    await settle();
    expect(fetchCalls.filter((c) => c.url.includes('/api/avatar'))).toHaveLength(0);
    expect(fetchCalls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(fetchCalls.length).toBe(before);
    expect(window.location.hash).toBe(hashBefore); // 点头像区域不跳任何页
  });

  it('H-04 访客：B 区账号头不渲染、:998 登录引导条上屏（T-19g-v 翻面：旧钉"guestGuide 不上屏"随接线作废）', async () => {
    mountScreen();
    await settle();
    const texts = visibleTexts();
    /* T-19g-iv 翻面（正向整表钉）→ T-19g-v 再翻面：`GUEST_VISIBLE_TEXTS` 已含 :998 五串；
       旧钉 `texts.some((t) => t.includes('登录')) === false` 与 `not.toContain(headline)` 钉的是
       "本轮未接线"（A-07 时代），今天正是 `:998` 的交付轮 ⇒ 翻为"引导条整表在屏、B 区头不在"。
       B 区头不渲染的可断言面：`img` 0 颗 + 脱敏手机号不上屏（访客没有档案）。 */
    expect(texts).toEqual(GUEST_VISIBLE_TEXTS);
    expect(all('img')).toHaveLength(0);
    expect(texts.some((t) => t.includes(maskPhone(PHONE)))).toBe(false);
    expect(texts).toContain(SETTINGS_COPY.guestGuide.headline);
    // 键在 shared 且屏已接：整表与 :998 字面量同源（期望值不许从 shared 反推，见常量注释）
    expect(SETTINGS_COPY.guestGuide.headline).toBe('登录之后，换手机也不丢');
  });
});

/* ═════════════════ I 组 · D 区打卡常驻 + 同步行（T-19g-ii） ═════════════════ */

describe('I 组 · D 区打卡常驻（§3.8.1:955 两态整串 + :962 同步行一次、禁词 0）', () => {
  it('I-01 已打卡：整行逐字 = CHECKIN_COPY.done(n)，右侧按钮逐字 = VERBS.goStudy → #/study，0 预取', async () => {
    seedNormalSession();
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    mountScreen();
    await settle();
    expect(visibleTexts()).toContain(CHECKIN_COPY.done(STREAK_DAYS)); // `今天已打卡 · 连续 12 天`
    const cta = buttonByLabel(VERBS.goStudy);
    expect(cta).not.toBeNull();
    // 几何 = :955：p-3 rounded-lg bg-brand-soft、行高 56px（h-14）；外层 mt-3
    const row = checkinRow();
    expect(row).not.toBeNull();
    expect(row!.className).toContain('h-14');
    expect(row!.className).toContain('p-3');
    expect(row!.className).toContain('rounded-lg');
    expect(row!.className).toContain('bg-brand-soft');
    expect(row!.parentElement!.className).toContain('mt-3');
    const before = fetchCalls.length;
    await click(cta!);
    expect(window.location.hash).toBe('#/study');
    expect(fetchCalls).toHaveLength(before);
    expect(routeFor('/study').kind).toBe('tab');
  });

  it('I-02 未打卡：整行逐字 = CHECKIN_COPY.notDone.headline（不带"连续 N 天"拼接），按钮仍在', async () => {
    seedNormalSession();
    checkinOutcome = { status: 200, body: { checkedIn: false, streak: 5 } };
    mountScreen();
    await settle();
    const texts = visibleTexts();
    expect(texts).toContain(CHECKIN_COPY.notDone.headline); // `今天还没打卡`
    expect(texts.some((t) => t.includes(CHECKIN_COPY.done(5)))).toBe(false);
    expect(buttonByLabel(VERBS.goStudy)).not.toBeNull();
    // 同一份 streak 喂 C 区第三格（同源不分叉）：卡串 = `连续 5 天`
    expect(statCard('stat-streak')!.getAttribute('aria-label')).toBe(
      SETTINGS_COPY.statCards.streak.value(5),
    );
  });

  it('I-03 同步行：只出现一次、text-xs，串 = SYNC_COPY.synced(HH:MM)（startup.syncLabel 唯一实现）', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    expect(all('[data-testid=sync-badge]')).toHaveLength(0); // 本会话没同步过 ⇒ offlineQuiet，不硬画
    const ts = Date.now() - 61_000;
    await act(async () => {
      setSyncedAt(ts);
      await Promise.resolve();
    });
    await settle();
    const badges = all('[data-testid=sync-badge]');
    expect(badges).toHaveLength(1); // "只在 D 区下方出现一次"
    expect(badges[0]!.className).toContain('text-xs');
    expect(visibleTexts()).toContain(SYNC_COPY.synced(formatClock(ts)!));
  });

  it('I-04 恢复补传失败态：整串 = SYNC_COPY.replayFail；两种状态下全树禁词 0 命中（:962、R-20⑤、R-25①）', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    const banned = ['云端', '本地', '已连接', '未连接'];
    const scan = (): void => {
      for (const word of banned) {
        expect(visibleTexts().some((t) => t.includes(word)), `禁词 ${word} 上屏了`).toBe(false);
      }
    };
    scan(); // 正常态（含已打卡行 + 计数卡 + B/E 区全量文本）
    await act(async () => {
      setSyncFailed(true);
      await Promise.resolve();
    });
    await settle();
    expect(visibleTexts()).toContain(SYNC_COPY.replayFail); // `还没同步 · 联网后会自动补上`
    scan(); // 失败态再过一遍
  });
});

/* ═════════════════ J 组 · F 区设置列表（T-19g-iii） ═════════════════ */

/** F 区某行的**标题槽**文本（`:972` 的 `title` 槽）：行内嵌套最深的那颗 span，不含 trailing 面。 */
function rowTitleOf(li: Element): string {
  return String(li.querySelector('button span span')?.textContent ?? '').trim();
}

describe('J 组 · F 区设置列表（§3.8.1:957 的**有源三行**：逐字标题 + 相对次序 + 行几何 + 两部落点 + 主题写键）', () => {
  it('J-01 三行逐字 = 外观 / 修改密码 / 关于，相对次序按 :957 那串排；行高 min-h-[56px]、行间 divide 且末行不描边（结构面）', async () => {
    /* 正向钉（照 A-06 的口径：期望值是 §3.8.1:957 那一行的**原文照抄**，不从 shared 反推回来）：
       shared 的这三个槽走样即红。屏侧只从这三处取串，屏 0 中文字面量由 A-01 钉。
       E4b6 件1（A-86 #320 的 5A）：两颗串的**源**从 `groups[2]`/`groups[4]` 换为 F 区专用键
       `rows.appearance`/`rows.about` —— 同裁定明令 J-01 的字面量钉不放宽 ⇒ 右侧 `'外观'`/`'关于'` 逐字不动。 */
    expect(SETTINGS_COPY.rows.appearance, 'shared 的「外观」槽漂了').toBe('外观');
    expect(AUTH_COPY.changePassword.title, 'shared 的「修改密码」槽漂了').toBe('修改密码');
    expect(SETTINGS_COPY.rows.about, 'shared 的「关于」槽漂了').toBe('关于');

    seedNormalSession();
    mountScreen();
    await settle();
    const rows = settingRows();
    expect(rows).toHaveLength(3); // 恰三行：有源的三行全落，无源的三行一颗不补
    expect(rows.map(rowTitleOf)).toEqual(['外观', '修改密码', '关于']);
    // 每行都可点（`:972` 的 onClick 槽），且行内不嵌第二颗控件（同 StatCard 的"整行一个 button"口径）
    for (const li of rows) expect(li.querySelectorAll('button')).toHaveLength(1);
    // 列表容器 = 有序列表 + `mt-4`（:957）
    const list = q('[role=list]');
    expect(list).not.toBeNull();
    expect(list!.tagName).toBe('UL');
    expect(list!.className).toContain('mt-4');
    // 行间 `--hair` 1px 与"末行不描边"的可断言面：描边只在 ul 上以 divide 表达 ⇒ 结构上就不可能有末行描边，
    // 所以**任何一行自己的 class 里都不许出现 border/last: 覆写**（jsdom 无 CSS 引擎，这里钉的是契约面不是像素）。
    expect(list!.className).toContain('divide-y');
    expect(list!.className).toContain('divide-hair');
    for (const li of rows) {
      const btn = li.querySelector('button')!;
      expect(btn.className).toContain('min-h-[56px]');
      for (const el of [li, btn]) {
        expect(el.className, '行内出现第二处描边（会造出末行描边）').not.toMatch(/border-b|border-t|last:border|first:border/);
      }
    }
  });

  it('J-02 外观行：trailing=value 显示当前档人话；点击按 light→dark→system→light 循环，逐次钉「写了哪颗键、传了哪个 mode」', async () => {
    // 三档人话也是原文照抄 :957 的「外观（浅色/深色/跟随系统）」
    expect(THEME_MODE_LABELS).toEqual({ light: '浅色', dark: '深色', system: '跟随系统' });
    seedNormalSession();
    mountScreen();
    await settle();
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const row = settingRowButton('外观');
    expect(row).not.toBeNull();
    // 没点过 ⇒ 屏不替用户落任何一档（挂载也不写：首帧归 index.html 的内联脚本，见 use-theme-toggle 文件头）
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    // 初始档 = 无键时 `readStoredTheme()` 的缺省 `system` ⇒ 右值显示 shared 那一格人话
    expect(String(settingRowTrailing('外观')?.textContent ?? '').trim()).toBe(THEME_MODE_LABELS.system);
    /* 循环方向照盘面对位件那张表（`settings-list.tsx:63`）：`light→dark`、`dark→system`、`system→light`
       ⇒ 从缺省档 `system` 起步，四跳依次是 light → dark → system → light（最后一跳证明圈闭合、无第四档）。 */
    await click(row!);
    await settle();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(String(settingRowTrailing('外观')?.textContent ?? '').trim()).toBe(THEME_MODE_LABELS.light);
    expect(htmlDarkClass()).toBe(false); // `applyTheme('light')` 的那一刀：`.dark` 不在
    expect(document.documentElement.style.colorScheme).toBe('light');
    await click(row!);
    await settle();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(String(settingRowTrailing('外观')?.textContent ?? '').trim()).toBe(THEME_MODE_LABELS.dark);
    expect(htmlDarkClass()).toBe(true); // `applyTheme('dark')` 的那一刀：`<html>` 挂上 `.dark`
    expect(document.documentElement.style.colorScheme).toBe('dark');
    await click(row!);
    await settle();
    // `system` 档的实际明暗跟随宿主媒体查询（jsdom 上不可钉 ⇒ 只钉写进去的档位与人话右值）
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(String(settingRowTrailing('外观')?.textContent ?? '').trim()).toBe(THEME_MODE_LABELS.system);
    await click(row!);
    await settle();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    /* 主题账总共就这四笔：整场只写 `THEME_STORAGE_KEY` 这一颗键、值恰好是循环表那四个 mode、
       次数 = 点击次数 ⇒ 屏没另开第二份持久化，也没在别处偷写。 */
    expect(themeWrites(writes.mock.calls)).toEqual(['light', 'dark', 'system', 'light']);
    writes.mockRestore();
  });

  it('J-03 两部落点：修改密码→#/security（既有常量）、关于→#/me/about（本轮新增 ABOUT_ROUTE，进 E4 总账）；跳转 0 预取 0 请求', async () => {
    seedNormalSession();
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    mountScreen();
    await settle();
    const before = fetchCalls.length;
    await click(settingRowButton('修改密码')!);
    expect(window.location.hash).toBe(`#${SECURITY_PATH}`);
    expect(routeFor(SECURITY_PATH).kind).toBe('secondary');
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    await click(settingRowButton('关于')!);
    expect(window.location.hash).toBe(`#${ABOUT_PATH}`);
    // `routeFor` 认不出路径会回落 ROUTES[0]（kind='tab'）⇒ 这一钉证明 `/me/about` 真在 11 条名册里、屏常量与它同值
    expect(routeFor(ABOUT_PATH).kind).toBe('secondary');
    expect(fetchCalls).toHaveLength(before); // 点行只换地址：0 预取、0 请求
    expect(fetchCalls.filter((call) => call.method === 'NAVIGATE')).toHaveLength(0); // 屏不借 host.navigate 开第二条通路
  });

  it('J-04 反向哨：`自动收藏` / `每日提醒时间` / `我的查询历史` 三行因盘面无数据源**本轮不渲染**（不是"没做"，是"做了就是假的"）', async () => {
    /* 三行无源的证据（原始 grep 输出贴在交付报告 §1，这里只钉"屏没引、屏没画"这一半）：
       - `自动收藏`：全仓只有 `packages/shared/src/constants/flags.ts` 的 `autoFavoriteDefault`（文件头明令代码内
         不得读该 flag，唯一读点在服务端）+ Web 本地 `PROFILE_COPY.autoFavoriteRow`（Web 自己的设置列表也没引它）
         ⇒ 屏侧 0 数据源、`ProfileDto` 0 契约字段；
       - `每日提醒时间`：文案串在 shared（`SETTINGS_COPY.reminder.*`），但 `reminderTime`/`reminder_time`/`alarm`
         全仓 **0 命中** ⇒ R-21 的原生调度未交付 ⇒ 渲染出去就是点了没反应的设置（PRD §5 把这类与"要求用户给图片 URL"
         同列为 R-04 类缺陷）；
       - `我的查询历史`：`查询历史` 全仓 0 命中，`router.tsx:43-55` 的 11 条名册里也没有落点。 */
    const code = screenCode();
    for (const absent of ['自动收藏', '查询历史', '提醒时间', 'autoFavorite', 'reminderTime', 'reminder_time']) {
      expect(code, `屏源码剥注释后命中无源串 ${absent}`).not.toContain(absent);
    }
    seedNormalSession();
    mountScreen();
    await settle();
    const texts = visibleTexts();
    for (const absent of ['自动收藏', '查词后自动收藏', '我的查询历史', '查询历史', '每日提醒', '提醒时间']) {
      expect(texts.some((t) => t.includes(absent)), `无源行 ${absent} 上了屏`).toBe(false);
    }
    expect(settingRows()).toHaveLength(3); // 不补假设置，也不自添一行规范没写的
    // 键在 shared 而屏未引（钉死"没源不渲染"而不是"没键"）
    expect(SETTINGS_COPY.reminder.label).toBe('每日提醒');
    expect(SETTINGS_COPY.groups).toContain('提醒');
    // `:972` 的 trailing='switch' 档本轮无源 ⇒ 屏不该出现任何开关件（第三种控件就是自造）
    expect(all('input[type=checkbox]')).toHaveLength(0);
    expect(all('[role=switch]')).toHaveLength(0);
    expect(texts.filter((t) => t === '开' || t === '关')).toHaveLength(0);
  });

  it('J-05 访客态 F 区（T-19g-iv 按 :998 拆门）：正向钉两行逐字+次序+行几何，反向钉「修改密码」0 命中且无 /security 入口', async () => {
    // 正向：访客只藏「修改密码」一行，「外观」「关于」必须看得见 —— 行标题逐字 = :957 原文照抄（不从 shared 反推）。
    mountScreen();
    await settle();
    expect(getAuthSnapshot().hasToken).toBe(false);
    const rows = settingRows();
    expect(rows.map(rowTitleOf)).toEqual(['外观', '关于']); // 次序沿用 :957（修改密码缺席后两行保序）
    // 结构面沿用 J-01 口径：每行恰一颗 button、行高 min-h-[56px]、描边只在 ul 上以 divide 表达。
    const list = q('[role=list]');
    expect(list).not.toBeNull();
    expect(list!.className).toContain('mt-4');
    expect(list!.className).toContain('divide-y');
    for (const li of rows) {
      expect(li.querySelectorAll('button')).toHaveLength(1);
      const btn = li.querySelector('button')!;
      expect(btn.className).toContain('min-h-[56px]');
      for (const el of [li, btn]) {
        expect(el.className, '行内出现第二处描边（会造出末行描边）').not.toMatch(/border-b|border-t|last:border|first:border/);
      }
    }
    // 反向①：访客态整棵树 0 命中「修改密码」，行件也不存在。
    expect(visibleTexts().some((t) => t.includes('修改密码'))).toBe(false);
    expect(settingRowButton('修改密码')).toBeNull();
    unmount();
    // 反向②：把访客可见的两行都点一遍 —— 只允许去 /me/about 与"就地切档"，全程 0 个指向 /security 的导航。
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    mountScreen();
    await settle();
    await click(settingRowButton('关于')!);
    expect(window.location.hash).toBe(`#${ABOUT_PATH}`);
    expect(routeFor(ABOUT_PATH).kind).toBe('secondary');
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    await click(settingRowButton('外观')!); // 外观行只循环档位，不导航
    expect(window.location.hash).not.toContain('security');
    const navs = fetchCalls.filter((call) => call.method === 'NAVIGATE');
    expect(navs.some((call) => call.url.includes('security'))).toBe(false);
    expect(fetchCalls.filter((call) => call.method !== 'NAVIGATE')).toHaveLength(0); // 全程 0 网络请求
  });
});

/* ═════════════════ K 组 · G 区退出登录（T-19g-iii） ═════════════════ */

describe('K 组 · G 区退出登录（§3.8.1:958 单独一行危险色 + §3.8.2:973 必过 ConfirmSheet；清凭据只经 auth-store.signOut()）', () => {
  it('K-01 已登录：触发钮逐字 = VERBS.signOut、几何 mt-6 mb-2 居中 + text-danger text-sm，且不混进 F 列表', async () => {
    expect(VERBS.signOut, 'shared 的退出动作名漂了').toBe('退出登录'); // :958 的串
    seedNormalSession();
    mountScreen();
    await settle();
    const trigger = buttonByLabel(VERBS.signOut);
    expect(trigger).not.toBeNull();
    expect(countButtonsLabeled(VERBS.signOut)).toBe(1); // 全树恰一颗（确认层没开 ⇒ 不该有第二颗）
    expect(trigger!.className).toContain('text-danger');
    expect(trigger!.className).toContain('text-sm');
    const wrap = trigger!.parentElement!;
    expect(wrap.className).toContain('mt-6');
    expect(wrap.className).toContain('mb-2');
    expect(wrap.className).toContain('justify-center'); // 居中
    // "不混进 F 列表"：这颗不在 ul/li 里，且 F 列表恰三行、文本里没有退出登录
    expect(trigger!.closest('[role=list]')).toBeNull();
    expect(settingRows()).toHaveLength(3);
    expect(String(q('[role=list]')?.textContent ?? '')).not.toContain(VERBS.signOut);
    expect(signOutSheet()).toBeNull(); // 二次确认层关闭时不占 DOM
  });

  it('K-02 未登录（访客）0「退出登录」；拉取失败态只剩错误卡那颗次按钮（G 区触发钮不画）：T-19g-v 翻失败半', async () => {
    mountScreen();
    await settle();
    expect(getAuthSnapshot().hasToken).toBe(false);
    expect(buttonByLabel(VERBS.signOut)).toBeNull();
    expect(signOutSheet()).toBeNull();
    expect(fetchCalls).toHaveLength(0);
    unmount();
    /* ── 判据翻面账（T-19g-v 翻失败半；简报"K-02 不动"与 `:1001`"次按钮仅在已登录态出现"不可兼得，
       按规范原文做，差异申报在交付报告 §0）───────────────────────────────────
       旧钉：失败态 `buttonByLabel(VERBS.signOut)` 为 null。今天 `:1001` 错误卡的次按钮
       `SETTINGS_COPY.fetchFail.signOut`（`退出登录`）与 `VERBS.signOut` 同串 ⇒ 这颗必须存在。
       "G 区触发钮不跟着画"翻为：全树**恰一颗**「退出登录」且它住在错误卡里、不在 `mt-6 mb-2` 的 G 区容器。 */
    seedNormalSession();
    getOutcome = serverErrorOf('TOO_MANY_REQUESTS', 429);
    mountScreen();
    await advance(5000); // R-24⑥ 的那一次静默重试也跑完
    await settle();
    expect(countButtonsLabeled(VERBS.signOut)).toBe(1); // 恰一颗 = 错误卡次按钮，没有第二套退出入口
    const cardSignOut = buttonByLabel(VERBS.signOut)!;
    expect(cardSignOut.closest('[data-testid=me-fetch-fail]')).not.toBeNull(); // 它属错误卡，不属 G 区
    expect(signOutSheet()).toBeNull(); // 确认层关闭时仍不占 DOM
    expect(getAuthSnapshot().hasToken).toBe(true); // 拉取失败不等于退出：凭据还在
  });

  it('K-03 点触发只开确认层：四槽逐字 = SETTINGS_COPY.signOut.{title,body,confirm,cancel}、danger 档，此刻凭据未清、页未跳', async () => {
    expect(SETTINGS_COPY.signOut.title).toBe('要退出吗？');
    expect(SETTINGS_COPY.signOut.confirm).toBe('退出登录');
    expect(SETTINGS_COPY.signOut.cancel).toBe('取消');
    seedNormalSession();
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    mountScreen();
    await settle();
    const hashBefore = window.location.hash; // 本文件不启路由 ⇒ 钉"这一次点击没换页"，不钉绝对值
    await click(buttonByLabel(VERBS.signOut)!);
    await settle();
    const sheet = signOutSheet();
    expect(sheet).not.toBeNull();
    const texts = visibleTexts(sheet!);
    expect(texts).toContain(SETTINGS_COPY.signOut.title);
    expect(texts).toContain(SETTINGS_COPY.signOut.body); // `手机上的词本会保留，下次登录还能接着用。`
    expect(texts).toContain(SETTINGS_COPY.signOut.confirm);
    expect(texts).toContain(SETTINGS_COPY.signOut.cancel);
    const sheetButtons = buttonsIn(sheet!);
    expect(sheetButtons).toHaveLength(2); // 只有 取消 / 退出登录 两出口，没有第三种
    expect(sheetButtons.map((el) => String(el.textContent ?? '').trim())).toEqual([
      SETTINGS_COPY.signOut.cancel,
      SETTINGS_COPY.signOut.confirm,
    ]);
    expect(sheetButtons[1]!.className).toContain('bg-danger'); // tone='danger'
    // 还没退：凭据在、页没跳、0 写请求（点一下触发钮就掉登录 = §3.8.6 要防的那种事故）
    expect(getAuthSnapshot().hasToken).toBe(true);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe(NORMAL_TOKEN);
    expect(window.location.hash).toBe(hashBefore); // 页未跳
    expect(putCalls()).toHaveLength(0);
    expect(toastCalls).toHaveLength(0);
  });

  it('K-04 确认层点「取消」：只收层，不清凭据、不跳转、0 请求、0 toast', async () => {
    seedNormalSession();
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    mountScreen();
    await settle();
    const hashBefore = window.location.hash; // 同 K-03：钉"没换页"而不是绝对值
    await click(buttonByLabel(VERBS.signOut)!);
    await settle();
    const sheet = signOutSheet();
    expect(sheet).not.toBeNull();
    await click(buttonsIn(sheet!)[0]!); // 第一颗 = 取消
    await settle();
    expect(signOutSheet()).toBeNull();
    expect(getAuthSnapshot().hasToken).toBe(true);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe(NORMAL_TOKEN);
    expect(window.location.hash).toBe(hashBefore); // 取消不代替用户跳转
    expect(fetchCalls.filter((call) => call.method !== 'GET')).toHaveLength(0);
    expect(toastCalls).toHaveLength(0);
    // 取消后本屏仍是可用的（F 区三行还在）：确认层收起不留半截 UI
    expect(settingRows()).toHaveLength(3);
  });

  it('K-05 确认层点「退出登录」：清凭据只经 signOut() 一个函数、上一会话缓存清掉、落点是登录页、0 登出请求', async () => {
    seedNormalSession();
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    // `commitLocation` 只刷快照、不写地址面（router.tsx:217-226）⇒ 要钉"退出后落在登录页"就得先把真地址拨回本页
    window.location.hash = `#${ME_PATH}`;
    mountScreen();
    await settle();
    const before = fetchCalls.length;
    expect(window.location.hash).toBe(`#${ME_PATH}`);
    // `findAll` 只吃 `QueryFilters`（queryCache.d.ts:443），键要装在 `queryKey` 字段里
    expect(client.getQueryCache().findAll({ queryKey: profileKeys.all }).length).toBeGreaterThan(0); // 先确有缓存可清
    /* 「缓存被清掉」的可断言面 = `leaveTo` 里那一颗 `queryClient.clear()` 恰被调到一次。
       （不能拿"清完之后 findAll = 0"来钉：本页的 query 观察者还挂着，clear 之后它们会立刻把
        键重新注册回去 —— 那是 react-query 的正常行为，不是屏的第二份状态。） */
    const clearSpy = vi.spyOn(client, 'clear');
    await click(buttonByLabel(VERBS.signOut)!);
    await settle();
    const sheet = signOutSheet();
    expect(sheet).not.toBeNull();
    await click(buttonsIn(sheet!)[1]!); // 第二颗 = `退出登录`（danger 确认键）
    await settle();
    // ① 凭据清干净（`signOut()` 转发 `token-bridge.clearStoredSession()` = 全仓唯一清点）：三把键一把不留
    expect(getAuthSnapshot()).toMatchObject({ hasToken: false, upgradeRequired: false });
    for (const key of [SESSION_KEYS.token, SESSION_KEYS.phone, SESSION_KEYS.nickname]) {
      expect(localStorage.getItem(key), `退出后仍留着存储键 ${key}`).toBeNull();
    }
    // ② 上一会话的查询缓存被 `leaveTo` 清掉（词本/查词都可能已属别人）：恰一次，且就在跳转之前
    expect(clearSpy.mock.calls).toHaveLength(1);
    clearSpy.mockRestore();
    // ③ 落点 = 登录页，且目标是 `signOut()` 的返回值（屏不自拼第二份路径）
    expect(window.location.hash).toBe(`#${LOGIN_ROUTE}`);
    expect(LOGIN_ROUTE).toBe('/login');
    expect(routeFor(LOGIN_ROUTE).kind).toBe('gate');
    expect(signOutSheet()).toBeNull();
    // ④ 退出不发任何写请求：全仓没有"登出端点"，屏也不许自己造一颗
    expect(fetchCalls.filter((call) => call.method !== 'GET')).toHaveLength(0);
    expect(fetchCalls.filter((call) => call.method === 'NAVIGATE')).toHaveLength(0);
    // 跳转之后仍没多出第四种端点（本屏数据面只有那三个既有单点 ⇒ 这里按"只有 GET"钉）
    expect(fetchCalls.slice(before).every((call) => call.method === 'GET')).toBe(true);
    expect(fetchCalls.slice(before).every((call) => /\/api\/(profile|checkin\/status|review\/queue)/.test(call.url))).toBe(true);
    expect(toastCalls).toHaveLength(0);
  });

  it('K-06 软告知会话退出：内存软告知位由 signOut() 自己归零，屏 0 参与、0 再点一次「去更新」', async () => {
    seedAdvisorySession();
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    // 本用例要钉的是"从本页跳到登录页"，故先把浏览器的真地址拨回本页
    // （`commitLocation` 只刷快照、不写地址面 —— 见 router.tsx:217-226 的契约）
    window.location.hash = `#${ME_PATH}`;
    mountScreen();
    await settle();
    expect(getAuthSnapshot()).toMatchObject({ hasToken: true, upgradeRequired: true });
    await click(buttonByLabel(VERBS.signOut)!);
    await settle();
    await click(buttonsIn(signOutSheet()!)[1]!);
    await settle();
    expect(getAuthSnapshot()).toMatchObject({ hasToken: false, upgradeRequired: false });
    expect(buttonByLabel(SETTINGS_COPY.upgradeTodo.cta)).toBeNull(); // 退出后本屏不再画软告知行
    expect(window.location.hash).toBe(`#${LOGIN_ROUTE}`);
  });
});

/* ═════════════════ L 组 · H 区页脚（T-19g-iii） ═════════════════ */

describe('L 组 · H 区页脚（§3.8.1:959 两串逐字 + §3.1 的 App 侧口径"页脚收进「我的」底部"；F-32 已闭：备案号是真号）', () => {
  it('L-01 两串逐字 = BRAND.footerLine1 / footerLine2，备案号在前、态度话在后，几何 text-xs leading-relaxed text-ink-muted', async () => {
    // 期望值 = `:959` + shared `BRAND` 那两格的原文照抄（真号逐字，用户本人 2026-09-26 给，见 L-02）
    expect(BRAND.footerLine1).toBe('© 2026 明日记忆 · 赣ICP备2026013161号-1');
    expect(BRAND.footerLine2).toBe('明天再记，也不算晚。');
    seedNormalSession();
    mountScreen();
    await settle();
    const footers = all('footer');
    expect(footers).toHaveLength(1); // App 侧唯一落点就是这一颗
    const footer = footers[0]!;
    expect(footer.className).toContain('text-xs');
    expect(footer.className).toContain('leading-relaxed');
    expect(footer.className).toContain('text-ink-muted');
    const lines = Array.from(footer.querySelectorAll('p')).map((el) => String(el.textContent ?? '').trim());
    expect(lines).toEqual([BRAND.footerLine1, BRAND.footerLine2]); // 顺序 = :959 那串的书写顺序
    // 分区全序（§3.8.1 A→H）：E 区 section 在 F 列表前、F 在 G 前、G 在页脚前
    const list = q('[role=list]')!;
    const signOutWrap = buttonByLabel(VERBS.signOut)!.parentElement!;
    expect(goalSection()!.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.compareDocumentPosition(signOutWrap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(signOutWrap.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('L-02 备案号不许被自造或替换：屏 0 自造号、0 外链，上屏那颗逐字等于 shared（真号、0 占位段残留），也不抄 §3.1 图示那份', async () => {
    const code = screenCode();
    // 屏代码（剥掉注释后）不许出现任何备案号形状：备案号字样、6 位以上连续数字（真号只住在注释与 shared 里）都不许有
    expect(code, '屏自造了备案号').not.toMatch(/ICP|备案/);
    expect(code, '屏出现 6 位以上连续数字（疑似真号）').not.toMatch(/[0-9]{6,}/);
    expect(code, '屏不许给备案号开外链').not.toMatch(/beian|miit\.gov\.cn|<a /);
    seedNormalSession();
    mountScreen();
    await settle();
    const texts = visibleTexts();
    expect(texts).toContain(BRAND.footerLine1);
    expect(texts).toContain(BRAND.footerLine2);
    const joined = texts.join('');
    expect(joined).not.toContain('XXXXXX'); // 占位段不许残留 ⇒ 屏上就是真号，不是模板
    // §3.1 图示那份过期串（蜀字头）仍不许上屏；Web 页脚那颗与本串已同引同一真号（口径差只剩前缀与外链）
    expect(joined).not.toMatch(/蜀ICP/);
    expect(joined).toContain('赣ICP备2026013161号-1'); // 翻正面：上屏文本逐字含真号（用户本人 2026-09-26 给，A-98 #415）
    expect(all('a[href]')).toHaveLength(0); // 页脚不带外链（App 侧页脚就是两行裸文本；#421② 未裁 ⇒ 屏不擅自加）
  });

  it('L-03 降级面与禁词：访客态与拉取失败态页脚都常驻（各恰 1 颗、备案号在前），已登录态全树禁词 0 命中（R-25① / :962；E4b6 件2 翻失败半）', async () => {
    mountScreen();
    await settle();
    /* T-19g-iv 翻转（访客那半）：页脚摘掉**登录门** ⇒ 访客态 `footer` 恰 1 颗、两串逐字在屏上、
       顺序 = §3.8.1 :959 书写顺序（备案号在前、态度话在后）。页脚常驻是 TPM 裁定（备案号是个人主办单位的
       法定公示、与登录态无关），非 §3.8.5 推导；期望值写字面量，不从 shared 反推（A-74 #231）。 */
    const footers = all('footer');
    expect(footers).toHaveLength(1);
    expect(
      Array.from(footers[0]!.querySelectorAll('p')).map((el) => String(el.textContent ?? '').trim()),
    ).toEqual(['© 2026 明日记忆 · 赣ICP备2026013161号-1', '明天再记，也不算晚。']);
    expect(visibleTexts()).toEqual(GUEST_VISIBLE_TEXTS);
    unmount();
    /* 拉取失败那半（E4b6 件2 翻面：用户 2026-09-22/23 裁 6A，A-86 #320，F-36 已裁）：旧钉
       `toHaveLength(0)` 是裁定前照 `:1001` 逐字"整页降级为一个错误卡"做的口径；备案号是个人主办单位的法定公示、
       与数据态无关 ⇒ 本支**保留页脚**，翻为恰 1 颗 + 两串逐字、备案号在前（形状照上面的访客半支）。
       在途半支仍不画页脚，由 M-06 钉住（6A 只裁了拉取失败这一支，没裁 loading 面）。 */
    seedNormalSession();
    getOutcome = serverErrorOf('TOO_MANY_REQUESTS', 429);
    mountScreen();
    await advance(5000); // 把 R-24⑥ 的那一次静默重试也跑完
    await settle();
    const failedFooters = all('footer');
    expect(failedFooters).toHaveLength(1);
    expect(
      Array.from(failedFooters[0]!.querySelectorAll('p')).map((el) => String(el.textContent ?? '').trim()),
    ).toEqual(['© 2026 明日记忆 · 赣ICP备2026013161号-1', '明天再记，也不算晚。']);
    unmount();
    getOutcome = success(SERVER_GOAL);
    seedNormalSession();
    mountScreen();
    await settle();
    const banned = ['云端', '本地', '已连接', '未连接', '缓存', 'token', 'Token'];
    for (const word of banned) {
      expect(visibleTexts().some((t) => t.includes(word)), `禁词/内部术语 ${word} 上屏了（含 F/G/H 三区全量文本）`).toBe(false);
    }
    // 运维信息在本页的唯一例外仍是 D 区下方那颗人话同步行（R-25①），页脚不新增第二颗
    expect(all('[data-testid=sync-badge]')).toHaveLength(0); // 本会话没同步过 ⇒ offlineQuiet
    await act(async () => {
      setSyncedAt(Date.now() - 61_000);
      await Promise.resolve();
    });
    await settle();
    expect(all('[data-testid=sync-badge]')).toHaveLength(1);
    expect(visibleTexts().some((t) => t.includes('已同步'))).toBe(true);
    for (const word of banned) {
      expect(visibleTexts().some((t) => t.includes(word)), `禁词 ${word} 上屏了`).toBe(false);
    }
  });
});

/* ═════════════════ M 组 · :998 引导条与 :1001 错误卡（T-19g-v 新增钉） ═════════════════ */

/** 收起引导条之后的访客整表 = T-19g-iv 版 `GUEST_VISIBLE_TEXTS`（字面量照抄；F-39 记两版并存的账）。 */
const GUEST_BASE_VISIBLE_TEXTS: readonly string[] = [
  '我的',
  '外观',
  '跟随系统',
  '关于',
  '›',
  '© 2026 明日记忆 · 赣ICP备2026013161号-1',
  '明天再记，也不算晚。',
];

describe('M 组 · :998 访客引导条（B 区替换）与 :1001 拉取失败整页错误卡（T-19g-v 接线）', () => {
  it('M-01 :998 引导条五串字面量正向整表钉 + shared 槽漂移钉 + 几何（钮 min-h-tap / 钮行 h-14 / 全页单 h1）+ 禁词 0', async () => {
    // shared 槽漂移钉：期望值 = §3.8.5 :998 文案列原文照抄（A-74 #231 的规矩，不从 shared 反推回来）。
    expect(SETTINGS_COPY.guestGuide.headline).toBe('登录之后，换手机也不丢');
    expect(SETTINGS_COPY.guestGuide.subtitle).toBe('词本、学习记录和提醒会跟着账号走。');
    expect(SETTINGS_COPY.guestGuide.continueAsGuest).toBe('先不用，继续本机使用');
    expect(AUTH_COPY.submit.login).toBe('登录');
    expect(AUTH_COPY.submit.register).toBe('注册');
    mountScreen();
    await settle();
    // 整表 = 上方共用常量（引导条住 B 区 ⇒ 顶栏标题之后、F 列表之前；两版整表并存的账见 F-39）
    expect(visibleTexts()).toEqual(GUEST_VISIBLE_TEXTS);
    expect(all('h1')).toHaveLength(1); // 引导条不自造第二颗标题（主串是 p，不是 heading）
    // 几何红线 :1013：按钮 ≥44×44（min-h-tap）、钮所在行 56px（h-14）
    const login = buttonByLabel(AUTH_COPY.submit.login);
    const register = buttonByLabel(AUTH_COPY.submit.register);
    const dismiss = buttonByLabel(SETTINGS_COPY.guestGuide.continueAsGuest);
    expect(login).not.toBeNull();
    expect(register).not.toBeNull();
    expect(dismiss).not.toBeNull();
    for (const b of [login, register, dismiss]) {
      expect(b!.className).toContain('min-h-tap');
    }
    const buttonRow = login!.parentElement!;
    expect(buttonRow).toBe(register!.parentElement); // 两颗并一排（主/次），收起文字在下方独立一行
    expect(buttonRow.className).toContain('h-14');
    // 禁词面（R-20⑤/R-25①）：渲染文字 0 命中；定稿串里的「本机」不属禁词，未为过扫改一个字
    for (const word of ['云端', '本地', '已连接', '未连接']) {
      expect(visibleTexts().some((t) => t.includes(word)), `禁词 ${word} 上屏了`).toBe(false);
    }
  });

  it('M-02 点「先不用，继续本机使用」= 只翻组件内 useState：引导条消失、F 两行与 H 页脚照常可点、0 存储写、重进又回来', async () => {
    mountScreen();
    await settle();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await click(buttonByLabel(SETTINGS_COPY.guestGuide.continueAsGuest)!);
    // ① 0 存储写（A-02/A-05：不持久化、0 键名 —— 本轮没有"已读"这件事）
    expect(setItem.mock.calls).toHaveLength(0);
    setItem.mockRestore();
    expect(localStorage.length).toBe(0);
    // ② 整表回到 T-19g-iv 版（字面量）：五串没了，其余纹丝不动
    expect(visibleTexts()).toEqual(GUEST_BASE_VISIBLE_TEXTS);
    // ③ 「外观」「关于」与页脚收起后照常可见可点（落点不变）
    expect(settingRows()).toHaveLength(2);
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    await click(settingRowButton('关于')!);
    expect(window.location.hash).toBe(`#${ABOUT_PATH}`);
    expect(all('footer')).toHaveLength(1);
    // ④ 不持久化 ⇒ 卸了重进，引导条照常回来
    unmount();
    mountScreen();
    await settle();
    expect(visibleTexts()).toEqual(GUEST_VISIBLE_TEXTS);
  });

  it('M-03 「登录」落 #/login、「注册」落 #/register（E5 翻正旧「已知降级」钉）、点击 0 请求', async () => {
    expect(routeFor('/login').kind).toBe('gate'); // 两颗 gate 之一
    expect(routeFor('/register').kind).toBe('gate'); // 另一颗（路由表第 12 条，与 /login 共指 LoginScreen）
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    window.location.hash = `#${ME_PATH}`;
    mountScreen();
    await settle();
    const before = fetchCalls.length;
    await click(buttonByLabel(AUTH_COPY.submit.login)!);
    expect(window.location.hash).toBe('#/login');
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    window.location.hash = `#${ME_PATH}`;
    await click(buttonByLabel(AUTH_COPY.submit.register)!);
    // E5-register 翻转申报（逐字改前/改后与理由见 .delivery/04-dev-report-E5-register.md）：
    // 旧钉「注册也落 #/login、不造 #/register」的前提（LoginScreen 的 mode 无 URL 驱动入口）已真修 ⇒ 「注册」落 #/register。
    expect(window.location.hash).toBe('#/register');
    expect(fetchCalls).toHaveLength(before); // 点钮只换地址，0 请求
  });

  it('M-04 :1001 错误卡：钮 2 颗是全页唯一可点面；「再试一次」= refetch（retry:1 用尽才出卡，query 配置未动）；恢复后整页回来', async () => {
    seedNormalSession();
    getOutcome = serverErrorOf('TOO_MANY_REQUESTS', 429);
    mountScreen();
    await advance(5000);
    await settle();
    expect(q('[data-testid=me-fetch-fail]')).not.toBeNull();
    // 装配照 StudyScreen :630-648 的 EmptyState 先例：主/次两颗钮是全页仅有的可点面
    expect(buttons()).toHaveLength(2);
    expect(getCalls()).toHaveLength(2); // 首发 + R-24⑥ 那一次静默重试 ⇒ 才判失败
    getOutcome = success(SERVER_GOAL);
    await click(buttonByLabel(SETTINGS_COPY.fetchFail.retry)!);
    await settle();
    expect(getCalls()).toHaveLength(3); // 点它真的 refetch 了
    expect(q('[data-testid=me-fetch-fail]')).toBeNull(); // 好了 ⇒ 卡撤
    expect(visibleTexts()).toContain('tm'); // B 区账号头回来
    expect(statCardsAll()).toHaveLength(3); // C 区回来
    expect(putCalls()).toHaveLength(0);
    expect(toastCalls).toHaveLength(0); // 恢复静默：不自造成功 toast
  });

  it('M-05 错误卡次按钮开的是 G 区那颗既有 ConfirmSheet（全页唯一退出确认）：取消卡还在，确认走 signOut() 落 #/login', async () => {
    seedNormalSession();
    getOutcome = serverErrorOf('TOO_MANY_REQUESTS', 429);
    resetRouterForTest(ME_PATH);
    commitLocation(ME_PATH, false);
    window.location.hash = `#${ME_PATH}`;
    mountScreen();
    await advance(5000);
    await settle();
    await click(buttonByLabel(SETTINGS_COPY.fetchFail.signOut)!);
    await settle();
    const sheets = document.body.querySelectorAll('[data-testid=me-signout]');
    expect(sheets).toHaveLength(1); // 没有第二套确认层
    const sheet = sheets[0] as HTMLElement;
    const texts = visibleTexts(sheet);
    expect(texts).toContain(SETTINGS_COPY.signOut.title);
    expect(texts).toContain(SETTINGS_COPY.signOut.body);
    const sheetButtons = buttonsIn(sheet);
    expect(sheetButtons.map((el) => String(el.textContent ?? '').trim())).toEqual([
      SETTINGS_COPY.signOut.cancel,
      SETTINGS_COPY.signOut.confirm,
    ]);
    // 取消：收层、卡还在、凭据没动、页没跳
    await click(sheetButtons[0]!);
    await settle();
    expect(document.body.querySelector('[data-testid=me-signout]')).toBeNull();
    expect(q('[data-testid=me-fetch-fail]')).not.toBeNull();
    expect(getAuthSnapshot().hasToken).toBe(true);
    expect(window.location.hash).toBe(`#${ME_PATH}`);
    // 确认：与 G 区同一条链（auth-store.signOut() + leaveTo ⇒ 登录页），0 写请求（全仓没有登出端点）
    await click(buttonByLabel(SETTINGS_COPY.fetchFail.signOut)!);
    await settle();
    await click(buttonsIn(document.body.querySelector('[data-testid=me-signout]')!)![1]!);
    await settle();
    expect(getAuthSnapshot()).toMatchObject({ hasToken: false });
    expect(window.location.hash).toBe(`#${LOGIN_ROUTE}`);
    expect(putCalls()).toHaveLength(0);
    expect(fetchCalls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  });

  it('M-06 在途不出卡（isPending 支）：挂载后同步查整表只有 h1；判到错才出卡（loading/骨架不在本轮）', async () => {
    seedNormalSession();
    getOutcome = serverErrorOf('TOO_MANY_REQUESTS', 429);
    mountScreen();
    // 此刻首拉在途（stub 的 microtask 还没落）⇒ 降级支不许抢跑
    expect(q('[data-testid=me-fetch-fail]')).toBeNull();
    expect(visibleTexts()).toEqual(['我的']);
    expect(buttons()).toHaveLength(0);
    expect(all('footer')).toHaveLength(0);
    await advance(5000); // retry: 1 的那一次静默重试也跑完
    await settle();
    expect(q('[data-testid=me-fetch-fail]')).not.toBeNull(); // 判到错才出这张卡
  });
});
