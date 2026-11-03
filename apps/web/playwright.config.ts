import { defineConfig, devices } from '@playwright/test';

/**
 * A-30-6（批次3 出口轮 E2 建，T-22/T-23 接手维护）——**全仓唯一的 Playwright 装配点**。
 *
 * 为什么必须存在：本文件落地前 `apps/web` 只有 `e2e/home.spec.ts` 却没有配置，
 * 直接跑 `npx playwright test` 会用默认收集范围（`apps/web` 整棵树），把 **Vitest** 的
 * `test/home-shell.spec.tsx` 也吞进去，抛 `Vitest cannot be imported in a CommonJS module`
 * ——这是 T-12 报告 §1.7 记录的假红，也是 §10.2 里 T-12/T-15/T-16 五条 e2e 冒烟命令共同的坑。
 * `testDir: './e2e'` 就是那记解药。
 *
 * ⛔ 批次4 的 T-15 / T-16 **不要再各自造配置文件**（A-30-6："谁先建谁独占"已由本轮占位）。
 *   新增 `e2e/study.spec.ts`、`e2e/wordbook.spec.ts`、`e2e/profile.spec.ts`、`e2e/auth-wall.spec.ts`、
 *   `e2e/upgrade.spec.ts` 一律落进 `apps/web/e2e/`，会被下面两个 project 自动收集；
 *   需要新的设备档位时**在本文件的 `projects` 里追加**，不要另起一份 config。
 *
 * T-15r2c（批次4C，A-41 #59 裁决 (b)）：`projects` **收敛为两档视口**。曾有第三档
 * `chromium-375x667-tests`（自带 `testDir: './tests'`），起因是简报把 T-15 的三个 e2e 面
 * 写错落点到 `apps/web/tests/`，而既有两档继承顶层 `testDir: './e2e'` ⇒ 看不见那个目录。
 * §10.2:913 与本文件上面的 A-30-6 注都明写 `apps/web/e2e/` ⇒ 是简报写错、设计无歧义。
 * 解法因此更正为**全部归位 `e2e/`，两档视口**：第三档连同 `apps/web/tests/` 一并撤销。
 *
 * 端口用 **3100**（不是 `package.json` 里 `start` 的 3000）：e2e 要和开发者手上正在跑的
 * `pnpm dev:web`（3000）互不抢占，且 `next start` 需要先有生产构建产物。
 */
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  /* 只收 e2e 目录里的 *.spec.ts；Vitest 规格（test/**、src/**）由根 vitest.workspace.ts 的
     @tm/web project 负责，两边共用文件后缀但互不吃对方。 */
  testMatch: /.*\.spec\.ts/,

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /**
   * T-16r5b（A-68 #192/#193）钉到 4；**A-79（T-30b / F-37）把本地再钉到 2**，同一把尺：纯吞吐与争用实测，不给红点让路。
   *   · 套件由 98 长到 118 条（T-30 把 ①/①b 拆成每页一叶）后，**4 worker 在我连跑 5 次里红 4 次、每次恰好红 4 支**，
   *     失败集合在 `home.spec` / `home-redline.spec` / `auth-wall ⑨c` 之间**随机漂移**，形态只有
   *     `Test timeout of 30000ms exceeded` 与 `browserContext.close: Test ended` 两种，**0 例断言失败**；
   *     而这些"红用例"绿态实测只要 0.8–2.5s（全 suite 最慢是 `upgrade.spec:440 ⑦` = 7.3s，30s 预算余 4 倍）。
   *   · 同产物、同负载窗口、只把并发换成 2：**连跑 3 次 118 passed（54.7 / 54.5 / 54.7s）**，墙钟与 4 worker 的绿态
   *     基本相同（4 worker 绿态 53.9s，红态反而拖到 1.6m）⇒ 少开两档浏览器不是降速，是去掉排队。
   *   · 单跑嫌疑人文件必绿（`home` + `home-redline` 两文件 4 worker = 16 passed / 6.9s）⇒ 红不在那些用例身上。
   * 结论：饿的是**装配面**（4 个 chromium 启停 + Defender 实时扫描 + `webServer` 每跑必冷启动抢同一台机器），
   * 不是产品。所以**只降并发，不抬 `timeout`、不加 `retries`（本地仍 0）、不屏蔽任何端点或用例、断言语义一字未动**。
   * 需要还原时只动这一行：`workers: process.env.CI ? 2 : 4` 回到 T-16r5b 的口径；CI 侧口径不变（本就 2）。
   */
  workers: 2,
  reporter: process.env.CI ? [['github'], ['dot']] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  expect: { timeout: 10_000 },

  projects: [
    {
      // R-38/R-40 的移动主战场档位：375×667（iPhone SE 视口，UI 规范 §3.1.1 的计数口径以此为准）
      name: 'chromium-375x667',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      // 桌面档位：1280×900，验 `md:` 断点 above-the-fold 与顶栏主导航
      name: 'chromium-1280x900',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],

  webServer: {
    // 需先 `pnpm --filter @tm/web build`：`next start` 跑的是 .next 里的生产产物。
    command: 'pnpm exec next start -p 3100',
    cwd: __dirname,
    url: BASE_URL,
    // 本地：已有 3100 在服务就直接复用，不重复起；CI：必须自己起一个，且用完即弃。
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
