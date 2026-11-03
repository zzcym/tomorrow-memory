/// <reference types="node" />
/**
 * T-13 `@tm/ui/auth` 自门禁（vitest workspace 的 `@tm/ui` 项目，environment=jsdom）。
 *
 * 逐条对位 §10.2 T-13 的完成判据：
 *  ① 两态齐 + 注册态可交互元素 = 5 + 底部小字 1 处（§3.9.1 / PRD §8.3-D-8 的可测数字）；
 *  ② 主按钮全站唯一 + 切换保留手机号与勾选、清空两个密码框（R-39⑨ / §3.9.1）；
 *  ③ 验证码入口 = 12px 文字、不是按钮 + 旁注常驻 + 点击后不发"已发送"、不启动倒计时（R-01⑥ / §3.9.5）；
 *  ④ 错误文案 100% import 自 `@tm/shared`（运行时"可见中文串 ∈ shared 全量文案"反查 + 源码级 0 中文字面量）；
 *  ⑤ `ForcePasswordUpgradeForm` 出口 = 2、无关闭、无任何"延后处理"型出口（R-40④）；
 *  ⑥ 强度与放行判据只取 `PASSWORD_MIN` / `PASSWORD_MAX_BYTES`，分级只取 `passwordStrength()`（R-39② / R-40①）。
 *
 * A-14：`node:fs` 只在 `test/**` 里用于源码扫描断言。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_COPY,
  LOGIN_METHOD_NOTICE,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN,
  SMS_RESEND_COOLDOWN_SECONDS,
  TM_ERRORS,
  VERBS,
  passwordStrength,
  type TmErrorCode,
} from '@tm/shared';
import * as SHARED from '@tm/shared';

import {
  AgreementCheckbox,
  AuthFormShell,
  ChangePasswordForm,
  ForcePasswordUpgradeForm,
  NoticeBar,
  PasswordStrength,
  SmsCodeEntry,
} from '../src/index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ───────────────────────── 仓库定位与源码工具 ───────────────────────── */

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

const AUTH_DIR = path.join(REPO_ROOT, 'packages/ui/src/auth');

const COMPONENTS = [
  'NoticeBar',
  'PasswordStrength',
  'AgreementCheckbox',
  'SmsCodeEntry',
  'AuthFormShell',
  'ChangePasswordForm',
  'ForcePasswordUpgradeForm',
] as const;

const readSource = (name: string): string => readFileSync(path.join(AUTH_DIR, `${name}.tsx`), 'utf8');

/** 去注释后的源码（注释里写规范原文是允许的，判据只管代码）。 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** 去掉空白，用于"渲染出的串是否来自 shared"的反查（换行/缩进不该影响判定）。 */
const squash = (value: string): string => value.replace(/\s+/g, '');

/** `@tm/shared` 全量导出里的所有字符串（函数与类名排除）= 可见文案的唯一合法来源。 */
const SHARED_TEXT = (() => {
  const plain: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...SHARED })) {
    if (typeof value === 'function' || typeof value === 'symbol') continue;
    plain[key] = value;
  }
  return squash(JSON.stringify(plain));
})();

/* ───────────────────────── 挂载与事件工具 ───────────────────────── */

/** 测试数据：手机号与口令串都由 shared 常量派生，用例不写死阈值。 */
const VALID_PHONE = '13800000000';
const OK_PASSWORD = 'a1'.repeat(Math.ceil(PASSWORD_MIN / 2));

let mounted: { root: Root; container: HTMLElement } | null = null;

function mount(node: React.ReactElement): { container: HTMLElement; rerender: (next: React.ReactElement) => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  mounted = { root, container };
  return {
    container,
    rerender: (next) => {
      act(() => {
        root.render(next);
      });
    },
  };
}

afterEach(() => {
  if (mounted) {
    const { root, container } = mounted;
    act(() => {
      root.unmount();
    });
    container.remove();
    mounted = null;
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const INTERACTIVE =
  'a[href], area, button, input, select, textarea, summary, iframe, [role="button"], [role="checkbox"], [role="link"], [tabindex]:not([tabindex="-1"])';

/** 不计"是不是主控件"，只数可交互元素（判据① 的口径靠 `data-auth-control` 标记收敛）。 */
function interactiveIn(scope: Element): Element[] {
  return Array.from(scope.querySelectorAll(INTERACTIVE));
}

function controlKeys(scope: Element): string[] {
  return Array.from(scope.querySelectorAll('[data-auth-control]')).map((el) => el.getAttribute('data-auth-control') ?? '');
}

function byTestId(container: HTMLElement, testid: string): HTMLElement {
  const node = container.querySelector(`[data-testid="${testid}"]`);
  if (!node) throw new Error(`找不到 data-testid="${testid}"`);
  return node as HTMLElement;
}

function click(target: Element): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function blur(target: Element): void {
  act(() => {
    target.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    target.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
  });
}

/** React 受控 input：必须走原生 setter + `input` 事件才进 onChange。 */
function type(target: Element, value: string): void {
  const input = target as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function press(target: Element, keyName: string): Event {
  const event = new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function fieldOf(container: HTMLElement, control: string): HTMLInputElement {
  return container.querySelector(`[data-auth-control="${control}"]`) as HTMLInputElement;
}

/** 树里所有可见中文串（文本节点 + aria-label/title/placeholder）。 */
function visibleChinese(root: Element): string[] {
  const found: string[] = [];
  const push = (value: string | null | undefined): void => {
    const text = (value ?? '').trim();
    if (text.length > 0 && /[\u4e00-\u9fff]/.test(text)) found.push(text);
  };
  const walk = (node: Element): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) push(child.textContent);
      else if (child.nodeType === 1) walk(child as Element);
    }
  };
  push(root.getAttribute('aria-label'));
  push(root.getAttribute('title'));
  push(root.getAttribute('placeholder'));
  walk(root);
  for (const el of Array.from(root.querySelectorAll('*'))) {
    push(el.getAttribute('aria-label'));
    push(el.getAttribute('title'));
    push(el.getAttribute('placeholder'));
  }
  return found;
}

/** 判据④：每条可见中文串都能在 `@tm/shared` 里原样找到。 */
function expectAllCopyFromShared(root: Element, label: string): void {
  const texts = visibleChinese(root);
  expect(texts.length, `${label}：没有渲染出任何文案，用例本身失效`).toBeGreaterThan(0);
  for (const text of texts) {
    expect(SHARED_TEXT, `${label}：这条串不在 @tm/shared 里 → ${text}`).toContain(squash(text));
  }
}

/* ═════════════ 判据①：两态齐 + 注册态可交互元素 = 5 + 底部小字 1 处 ═════════════ */

describe('判据① 两态一壳与可交互元素计数（§3.9.1 / PRD §8.3-D-8）', () => {
  it('七个组件文件都在盘上，二级出口逐一再导出', () => {
    const onDisk = readdirSync(AUTH_DIR)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => f.replace(/\.tsx$/, ''));
    expect(onDisk.sort()).toEqual([...COMPONENTS].sort());
    const barrel = readFileSync(path.join(AUTH_DIR, 'index.ts'), 'utf8');
    for (const name of COMPONENTS) expect(barrel).toContain(`./${name}.js`);
    expect(readFileSync(path.join(REPO_ROOT, 'packages/ui/src/index.ts'), 'utf8')).toContain(
      "export * from './auth/index.js'",
    );
  });

  it('登录态：手机号 + 密码 + 主按钮，标题与按钮文案来自 shared', () => {
    const { container } = mount(<AuthFormShell onSubmit={() => {}} />);
    const form = byTestId(container, 'auth-form');
    expect(form.getAttribute('data-mode')).toBe('sign-in');
    expect(byTestId(container, 'auth-title').textContent).toBe(AUTH_COPY.dialog.login);
    expect(byTestId(container, 'auth-submit').textContent).toBe(AUTH_COPY.submit.login);
    expect(controlKeys(form).sort()).toEqual(['password', 'phone', 'submit']);
    expectAllCopyFromShared(form, '登录态');
  });

  it('注册态：可交互主控件恰好 5 个 = 手机号/密码/确认密码/协议勾选/主按钮', () => {
    const { container } = mount(
      <AuthFormShell
        defaultMode="register"
        onSubmit={() => {}}
        showPasswordLabel={VERBS.speak}
        hidePasswordLabel={VERBS.undo}
      />,
    );
    const form = byTestId(container, 'auth-form');
    expect(form.getAttribute('data-mode')).toBe('register');
    expect(byTestId(container, 'auth-title').textContent).toBe(AUTH_COPY.dialog.register);
    expect(byTestId(container, 'auth-submit').textContent).toBe(AUTH_COPY.submit.register);
    const controls = form.querySelectorAll('[data-auth-control]');
    expect(controls.length).toBe(5);
    expect(controlKeys(form).sort()).toEqual(['agreement', 'confirm', 'password', 'phone', 'submit']);
    /* 显示/隐藏密码 = 装饰件，标 `data-auth-affordance`，不占 5 个额度。 */
    expect(container.querySelectorAll('[data-auth-affordance="password-visibility"]').length).toBe(2);
  });

  it('除 5 个主控件外的可交互元素一律带次级标记（次级链 / 12px 入口 / 装饰件 / 书号链）', () => {
    const { container } = mount(
      <AuthFormShell
        defaultMode="register"
        onSubmit={() => {}}
        switchToSignInLabel={VERBS.cancel}
        termsHref="/terms"
        privacyHref="/privacy"
      />,
    );
    const form = byTestId(container, 'auth-form');
    const unmarked = interactiveIn(form).filter(
      (el) =>
        !el.closest(
          '[data-auth-control], [data-auth-switch], [data-auth-secondary], [data-auth-affordance], [data-auth-link]',
        ),
    );
    expect(unmarked.map((el) => `${el.tagName}:${el.textContent ?? ''}`)).toEqual([]);
  });

  it('激活认领不新增第三态：DOM 与注册态逐元素相同，只换标题与主按钮（R-39⑨）', () => {
    const plain = mount(<AuthFormShell defaultMode="register" onSubmit={() => {}} />);
    const plainForm = byTestId(plain.container, 'auth-form');
    const plainControls = controlKeys(plainForm);
    const plainStructure = Array.from(plainForm.querySelectorAll('[data-testid],[data-auth-control]')).map((el) =>
      [el.tagName, el.getAttribute('data-testid') ?? '', el.getAttribute('data-auth-control') ?? ''].join('|'),
    );
    plain.rerender(<AuthFormShell defaultMode="register" activate onSubmit={() => {}} />);
    expect(plainForm.getAttribute('data-activate')).toBe('true');
    expect(controlKeys(plainForm)).toEqual(plainControls);
    expect(controlKeys(plainForm).length).toBe(5);
    expect(
      Array.from(plainForm.querySelectorAll('[data-testid],[data-auth-control]')).map((el) =>
        [el.tagName, el.getAttribute('data-testid') ?? '', el.getAttribute('data-auth-control') ?? ''].join('|'),
      ),
    ).toEqual(plainStructure);
    expect(byTestId(plain.container, 'auth-title').textContent).toBe(AUTH_COPY.dialog.activate);
    expect(byTestId(plain.container, 'auth-submit').textContent).toBe(AUTH_COPY.submit.activate);
    expectAllCopyFromShared(plainForm, '激活态');
  });

  it('R-01⑤：默认焦点在密码框（DOM 可断言），手机号框可退回', () => {
    const a = mount(<AuthFormShell onSubmit={() => {}} />);
    expect(document.activeElement).toBe(fieldOf(a.container, 'password'));
    const b = mount(<AuthFormShell autoFocus="phone" onSubmit={() => {}} />);
    expect(document.activeElement).toBe(fieldOf(b.container, 'phone'));
  });

  it('登录态逐元素计数（§3.9.1 第 1031 行口径）：3 主控件 + 1 文字链 + 1 验证码小字 = 5', () => {
    const { container } = mount(
      <AuthFormShell
        onSubmit={() => {}}
        switchToRegisterLabel={AUTH_COPY.dialog.register}
        switchToSignInLabel={AUTH_COPY.dialog.login}
      />,
    );
    const form = byTestId(container, 'auth-form');
    const interactive = interactiveIn(form);
    expect(interactive.length).toBe(5);
    expect(interactive.filter((el) => el.hasAttribute('data-auth-control')).length).toBe(3);
    expect(interactive.filter((el) => el.hasAttribute('data-auth-switch')).length).toBe(1);
    expect(interactive.filter((el) => el.hasAttribute('data-auth-secondary')).length).toBe(1);
  });

  it('底部小字区只有 1 个可交互元素；公告条那一行不可点（§3.9.1）', () => {
    const { container } = mount(<AuthFormShell onSubmit={() => {}} />);
    const footer = container.querySelector('[data-slot="auth-footer"]') as HTMLElement;
    expect(container.querySelectorAll('[data-slot="auth-footer"]').length).toBe(1);
    const footerInteractive = interactiveIn(footer);
    expect(footerInteractive.length).toBe(1);
    expect(footerInteractive[0]?.getAttribute('data-auth-secondary')).toBe('sms-entry');
    const notice = byTestId(container, 'auth-notice');
    expect(notice.textContent).toBe(LOGIN_METHOD_NOTICE);
    expect(interactiveIn(notice).length).toBe(0);
  });
});

/* ═════════════ 判据②：主按钮唯一 + 切换保留/清空 ═════════════ */

describe('判据② 主按钮唯一、切换态保留手机号与勾选并清空两个密码框', () => {
  it('两态各自只有 1 个主按钮，且只有它是 submit 类型', () => {
    for (const mode of ['sign-in', 'register'] as const) {
      const { container } = mount(
        <AuthFormShell
          defaultMode={mode}
          onSubmit={() => {}}
          switchToRegisterLabel={AUTH_COPY.dialog.register}
          switchToSignInLabel={AUTH_COPY.dialog.login}
        />,
      );
      const form = byTestId(container, 'auth-form');
      expect(form.querySelectorAll('[data-auth-control="submit"]').length).toBe(1);
      expect(form.querySelectorAll('button[type="submit"]').length).toBe(1);
      if (mode === 'sign-in') {
        /* 品牌底 = 主按钮专属（注册态未勾协议时主按钮按 §3.9.6 走 --hair 禁用样式，故只在登录态数）。 */
        const brandFilled = Array.from(form.querySelectorAll('button')).filter((el) =>
          el.className.split(/\s+/).some((token) => token === 'bg-brand' || token === 'bg-brand-strong'),
        );
        expect(brandFilled.length).toBe(1);
        expect(brandFilled[0]?.getAttribute('data-auth-control')).toBe('submit');
      } else {
        expect(byTestId(container, 'auth-submit').className).toContain('bg-hair');
      }
    }
  });

  it('注册 → 登录 → 注册：手机号与勾选保留，两个密码框清空（点标题行右侧的次级链切换）', () => {
    const { container } = mount(
      <AuthFormShell
        defaultMode="register"
        onSubmit={() => {}}
        switchToRegisterLabel={AUTH_COPY.dialog.register}
        switchToSignInLabel={AUTH_COPY.dialog.login}
      />,
    );
    const form = byTestId(container, 'auth-form');
    const checkbox = () => container.querySelector('[role="checkbox"]') as HTMLElement;
    type(fieldOf(container, 'phone'), VALID_PHONE);
    type(fieldOf(container, 'password'), OK_PASSWORD);
    type(fieldOf(container, 'confirm'), OK_PASSWORD);
    click(checkbox());
    expect(checkbox().getAttribute('aria-checked')).toBe('true');
    expect(fieldOf(container, 'phone').value).toBe('138 0000 0000');

    click(byTestId(container, 'auth-switch'));
    expect(form.getAttribute('data-mode')).toBe('sign-in');
    expect(fieldOf(container, 'phone').value).toBe('138 0000 0000');
    expect(fieldOf(container, 'password').value).toBe('');

    click(byTestId(container, 'auth-switch'));
    expect(form.getAttribute('data-mode')).toBe('register');
    expect(fieldOf(container, 'phone').value).toBe('138 0000 0000');
    expect(fieldOf(container, 'password').value).toBe('');
    expect(fieldOf(container, 'confirm').value).toBe('');
    expect(checkbox().getAttribute('aria-checked')).toBe('true');
  });

  it('未勾协议时主按钮 aria-disabled，点击只给 AGREEMENT_REQUIRED 且焦点进勾选框', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell defaultMode="register" onSubmit={onSubmit} />);
    const submit = byTestId(container, 'auth-submit');
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    type(fieldOf(container, 'phone'), VALID_PHONE);
    type(fieldOf(container, 'password'), OK_PASSWORD);
    type(fieldOf(container, 'confirm'), OK_PASSWORD);
    click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
    const error = container.querySelector('[data-slot="agreement-error"]');
    expect(error?.textContent).toBe(TM_ERRORS.AGREEMENT_REQUIRED.copy);
    expect(document.activeElement).toBe(container.querySelector('[role="checkbox"]'));
    click(container.querySelector('[role="checkbox"]') as Element);
    expect(byTestId(container, 'auth-submit').getAttribute('aria-disabled')).toBeNull();
  });

  it('提交值：手机号去空格、注册态带确认密码（R-39②）', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell defaultMode="register" onSubmit={onSubmit} />);
    type(fieldOf(container, 'phone'), '138 0000 0000');
    type(fieldOf(container, 'password'), OK_PASSWORD);
    type(fieldOf(container, 'confirm'), OK_PASSWORD);
    click(container.querySelector('[role="checkbox"]') as Element);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      phone: VALID_PHONE,
      password: OK_PASSWORD,
      confirmPassword: OK_PASSWORD,
      agreed: true,
    });
  });
});

/* ═════════════ 判据③：12px 验证码入口 ═════════════ */

describe('判据③ 验证码入口 = 12px 文字（不是按钮）+ 常驻说明 + 不启动倒计时（R-01⑥）', () => {
  it('入口用 text-xs（12px），不套 Button 基元的按钮盒', () => {
    const { container } = mount(<AuthFormShell onSubmit={() => {}} />);
    const entry = byTestId(container, 'sms-entry');
    expect(entry.tagName).toBe('BUTTON');
    expect(entry.className).toContain('text-xs');
    for (const boxed of ['h-field', 'h-tap', 'h-9', 'rounded-md', 'bg-brand', 'px-4', 'shadow-elev-1']) {
      expect(entry.className, `入口不该有按钮形态类 ${boxed}`).not.toContain(boxed);
    }
    expect(entry.textContent).toBe(AUTH_COPY.smsEntryLabel);
    expect(byTestId(container, 'sms-hint').textContent).toBe(AUTH_COPY.smsHint);
    expect(byTestId(container, 'sms-hint').className).toContain('text-xs');
  });

  it('点击后：就地显示通道未开通，不出现"已发送"、不进入倒计时', () => {
    const onRequestCode = vi.fn();
    const { container } = mount(
      <AuthFormShell onSubmit={() => {}} onSmsEntryClick={onRequestCode} smsCooldownSecondsRemaining={SMS_RESEND_COOLDOWN_SECONDS} />,
    );
    const row = byTestId(container, 'sms-entry-row');
    expect(row.getAttribute('data-cooldown')).toBe('off');
    click(byTestId(container, 'sms-entry'));
    expect(onRequestCode).toHaveBeenCalledTimes(1);
    expect(byTestId(container, 'sms-result').textContent).toBe(AUTH_COPY.smsResult);
    expect(container.textContent ?? '').not.toMatch(/已发送|发送成功/);
    expect(row.getAttribute('data-cooldown')).toBe('off');
    expect(row.getAttribute('data-channel-ready')).toBe('false');
    expect(byTestId(container, 'sms-entry').hasAttribute('disabled')).toBe(false);
  });

  it('通道接上后才允许倒计时（本期恒不触发，R-23⑥）', () => {
    const { container } = mount(
      <SmsCodeEntry phone={VALID_PHONE} channelReady cooldownSecondsRemaining={SMS_RESEND_COOLDOWN_SECONDS} />,
    );
    const row = byTestId(container, 'sms-entry-row');
    expect(row.getAttribute('data-cooldown')).toBe('running');
    expect(byTestId(container, 'sms-entry').hasAttribute('disabled')).toBe(true);
    click(byTestId(container, 'sms-entry'));
    expect(container.querySelector('[data-testid="sms-result"]')).toBeNull();
  });
});

/* ═════════════ 判据④：错误文案全部来自 @tm/shared ═════════════ */

describe('判据④ 错误串全部 import 自 @tm/shared（零自造文案）', () => {
  const AUTH_CODES: TmErrorCode[] = [
    'INVALID_PHONE',
    'WEAK_PASSWORD',
    'PASSWORD_MISMATCH',
    'AGREEMENT_REQUIRED',
    'PHONE_ALREADY_REGISTERED',
    'NO_PASSWORD_ACCOUNT',
    'REGISTER_CLOSED',
    'TOO_MANY_REQUESTS',
    'TEMP_LOCKED',
    'CREDENTIAL_EXPIRED',
  ];

  it.each(AUTH_CODES)('AuthFormShell 收到 %s 时显示的串与 TM_ERRORS.copy 逐字相同', (code) => {
    const { container } = mount(<AuthFormShell defaultMode="register" errorCode={code} onSubmit={() => {}} />);
    const form = byTestId(container, 'auth-form');
    expect(form.textContent ?? '').toContain(TM_ERRORS[code].copy);
    expectAllCopyFromShared(form, `AuthFormShell/${code}`);
  });

  it('逐码落点（§3.9.5）：字段下 / 提示卡 / 主按钮下', () => {
    const placement = (code: TmErrorCode): string | null => {
      const { container } = mount(<AuthFormShell defaultMode="register" errorCode={code} onSubmit={() => {}} />);
      const alerts = Array.from(container.querySelectorAll('[role="alert"], [role="status"]'));
      const hit = alerts.find((el) => (el.textContent ?? '').includes(TM_ERRORS[code].copy));
      return hit ? ((hit.closest('[data-testid]') as HTMLElement | null)?.getAttribute('data-testid') ?? null) : null;
    };
    expect(placement('INVALID_PHONE')).toBe('field-phone');
    expect(placement('PASSWORD_MISMATCH')).toBe('field-confirm');
    expect(placement('PHONE_ALREADY_REGISTERED')).toBe('auth-notice-card');
    expect(placement('NO_PASSWORD_ACCOUNT')).toBe('auth-notice-card');
    expect(placement('REGISTER_CLOSED')).toBe('auth-notice-card');
    expect(placement('TOO_MANY_REQUESTS')).toBe('auth-form-error');
    expect(placement('TEMP_LOCKED')).toBe('auth-form-error');
  });

  it.each(['OLD_PASSWORD_REQUIRED', 'OLD_PASSWORD_INCORRECT', 'PASSWORD_SAME_AS_OLD', 'WEAK_PASSWORD', 'PASSWORD_MISMATCH', 'TEMP_LOCKED'] as const)(
    'ChangePasswordForm 收到 %s 时文案同样取自 shared',
    (code) => {
      const { container } = mount(
        <ChangePasswordForm submitLabel={AUTH_COPY.forceUpgrade.submit} errorCode={code} onSubmit={() => {}} />,
      );
      const form = byTestId(container, 'change-password-form');
      expect(form.textContent ?? '').toContain(TM_ERRORS[code].copy);
      expectAllCopyFromShared(form, `ChangePasswordForm/${code}`);
    },
  );

  it('源码级：src/auth 七个文件去注释后 0 处中文字面量（文案只能 import）', () => {
    for (const name of COMPONENTS) {
      const code = stripComments(readSource(name));
      const cjk = code.match(/['"`][^'"`\n]*[\u4e00-\u9fff][^'"`\n]*['"`]/g) ?? [];
      expect(cjk, `${name}.tsx 里出现中文字面量：${cjk.join(' / ')}`).toEqual([]);
    }
  });
});

/* ═════════════ T-06r（A-41 #62）：服务端拒绝原因不得静默 ═════════════ */

describe('T-06r 服务端拒绝原因必须显示在对应字段下方（A-41 #62 / §3.9.5）', () => {
  /** 该串由 `PASSWORD_MIN` 派生 → 客户端长度判据**合规**，只有服务端更强策略会拒。 */
  const CLIENT_LEGAL_PASSWORD = OK_PASSWORD;

  /** 字段自己的错误位（`PasswordField` 的 `<p role="alert">`，与强度条 `role="status"` 不同节点）。 */
  function fieldError(scope: HTMLElement, control: string): HTMLElement | null {
    const input = fieldOf(scope, control);
    // input → `.relative` → `PasswordField` 外层 `div`（错误 `<p>` 与输入框同级）
    const wrapper = input?.parentElement?.parentElement;
    return wrapper ? (wrapper.querySelector('[role="alert"]') as HTMLElement | null) : null;
  }

  it('code=WEAK_PASSWORD + codeField=new：新密码框下逐字显示 shared 文案，aria-describedby 指到错误位', () => {
    expect(CLIENT_LEGAL_PASSWORD.trim().length).toBeGreaterThanOrEqual(PASSWORD_MIN);
    const { container } = mount(
      <ChangePasswordForm submitLabel={AUTH_COPY.forceUpgrade.submit} errorCode="WEAK_PASSWORD" onSubmit={() => {}} />,
    );
    type(fieldOf(container, 'old-password'), 'old12345');
    type(fieldOf(container, 'new-password'), CLIENT_LEGAL_PASSWORD);

    const newInput = fieldOf(container, 'new-password');
    const error = fieldError(container, 'new-password');
    expect(error, '服务端 WEAK_PASSWORD 被吞：新密码框下没有任何可见原因').not.toBeNull();
    expect((error as HTMLElement).textContent).toBe(TM_ERRORS.WEAK_PASSWORD.copy);
    expect(newInput.getAttribute('aria-invalid')).toBe('true');
    expect(newInput.getAttribute('aria-describedby')).toContain((error as HTMLElement).id);
    // 不是靠强度条那一格蹭过去的（强度条是 role="status"，且文案同句）
    expect((error as HTMLElement).getAttribute('role')).toBe('alert');
    expect(error).not.toBe(byTestId(container, 'password-strength'));

    // 按 code 归位：不给别的字段造错误，也不堆到主按钮下
    expect(fieldError(container, 'old-password')).toBeNull();
    expect(fieldError(container, 'confirm-password')).toBeNull();
    expect(container.querySelector('[data-testid="password-form-error"]')).toBeNull();
    expectAllCopyFromShared(byTestId(container, 'change-password-form'), 'ChangePasswordForm/服务端 WEAK_PASSWORD');
  });

  it('服务端 code 与客户端校验互不覆盖：PASSWORD_MISMATCH 只落确认框，新密码框仍显示自己的长度原因', () => {
    const { container } = mount(
      <ChangePasswordForm submitLabel={AUTH_COPY.forceUpgrade.submit} errorCode="PASSWORD_MISMATCH" onSubmit={() => {}} />,
    );
    const weak = 'a'.repeat(Math.max(1, PASSWORD_MIN - 1));
    type(fieldOf(container, 'new-password'), weak);
    blur(fieldOf(container, 'new-password'));

    expect(fieldError(container, 'new-password')?.textContent).toBe(TM_ERRORS.WEAK_PASSWORD.copy);
    expect(fieldError(container, 'confirm-password')?.textContent).toBe(TM_ERRORS.PASSWORD_MISMATCH.copy);
    expect(fieldError(container, 'old-password')).toBeNull();
    expectAllCopyFromShared(byTestId(container, 'change-password-form'), 'ChangePasswordForm/MISMATCH + 长度');
  });

  it('反向哨兵：未知 code 不静默 —— 宿主的人话 serverMessage 必须落在主按钮下（errorCode 优先于它）', () => {
    const { container } = mount(
      <ChangePasswordForm
        submitLabel={AUTH_COPY.forceUpgrade.submit}
        errorCode="PASSWORD_POLICY_VIOLATION"
        serverMessage="新密码不能包含手机号"
        onSubmit={() => {}}
      />,
    );
    const underButton = container.querySelector('[data-testid="password-form-error"]');
    expect(underButton, '未知 code + 无提示位 = 点了提交毫无反应').not.toBeNull();
    expect(underButton?.getAttribute('role')).toBe('alert');
    expect(underButton?.textContent).toBe('新密码不能包含手机号');
    // 已知码仍然优先：TM_ERRORS 里有的码不走 serverMessage
    const { container: known } = mount(
      <ChangePasswordForm
        submitLabel={AUTH_COPY.forceUpgrade.submit}
        errorCode="TEMP_LOCKED"
        serverMessage="新密码不能包含手机号"
        onSubmit={() => {}}
      />,
    );
    expect(known.querySelector('[data-testid="password-form-error"]')?.textContent).toBe(TM_ERRORS.TEMP_LOCKED.copy);
    expect(fieldError(known, 'new-password')).toBeNull();
  });
});

/* ═════════════ 判据⑤：强制改密页无关闭、无延后出口 ═════════════ */

describe('判据⑤ ForcePasswordUpgradeForm 只有两个出口（R-40④ / §3.9.4）', () => {
  /** §3.9.4「全站 0 处」清单（此处只做断言，不写进 src）。 */
  const FORBIDDEN_EXIT_COPY = ['以后再说', '稍后再改', '下次提醒', '已为您延至', '宽限期', '截止日期'];
  /** 再加一层：页面上不得出现任何"关/跳过"语义的可见文字。 */
  const FORBIDDEN_ON_SCREEN = [...FORBIDDEN_EXIT_COPY, '关闭', '跳过', '取消'];

  it('出口 = 2：主按钮「更新密码并继续」+ 居中文字按钮「退出登录」', () => {
    const onSignOut = vi.fn();
    const { container } = mount(
      <ForcePasswordUpgradeForm onSubmit={() => {}} onSignOut={onSignOut} subtitle={AUTH_COPY.forceUpgrade.notice} />,
    );
    const root = byTestId(container, 'force-password-upgrade');
    const buttons = Array.from(root.querySelectorAll('button'));
    expect(buttons.length).toBe(2);
    expect(buttons[0]?.getAttribute('data-auth-control')).toBe('submit');
    expect(buttons[0]?.getAttribute('type')).toBe('submit');
    expect(buttons[0]?.textContent).toBe(AUTH_COPY.forceUpgrade.submit);
    expect(buttons[1]?.getAttribute('data-auth-secondary')).toBe('sign-out');
    expect(buttons[1]?.textContent).toBe(AUTH_COPY.forceUpgrade.secondary);
    if (buttons[1]) click(buttons[1]);
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(byTestId(container, 'force-notice').textContent).toBe(AUTH_COPY.forceUpgrade.notice);
    expect(byTestId(container, 'force-change-password').textContent).toContain(AUTH_COPY.forceUpgrade.title);
    expectAllCopyFromShared(root, '强制改密页');
  });

  it('无返回箭头 / 无关闭件 / 无第三出口：可交互元素总数恰为 4（三字段 + 两出口里非输入的 2 个）', () => {
    const { container } = mount(<ForcePasswordUpgradeForm onSubmit={() => {}} onSignOut={() => {}} />);
    const root = byTestId(container, 'force-password-upgrade');
    const interactive = interactiveIn(root);
    expect(interactive.map((el) => el.getAttribute('data-auth-control') ?? el.getAttribute('data-auth-secondary') ?? el.tagName).sort()).toEqual(
      ['new-password', 'old-password', 'confirm-password', 'submit', 'sign-out'].sort(),
    );
    for (const el of interactive) {
      expect(el.getAttribute('aria-label'), '出口按钮不得靠 aria-label 藏关闭语义').toBeNull();
      expect(el.hasAttribute('data-dismiss')).toBe(false);
    }
    expect(root.querySelector('[data-auth-affordance]')).toBeNull();
  });

  it('渲染出的文字里不存在任何延后/关闭语义串；src/auth 源码亦 0 命中 §3.9.4 全站 0 处清单', () => {
    const { container } = mount(<ForcePasswordUpgradeForm onSubmit={() => {}} onSignOut={() => {}} />);
    const rendered = container.textContent ?? '';
    for (const term of FORBIDDEN_ON_SCREEN) expect(rendered, `页面出现 ${term}`).not.toContain(term);
    for (const name of COMPONENTS) {
      const source = readSource(name);
      for (const term of FORBIDDEN_EXIT_COPY) expect(source, `${name}.tsx 命中 ${term}`).not.toContain(term);
    }
  });

  it('被拦下的返回：Esc/alt+← 不后退、shake 一次（位移 ≤4px）并把焦点送回首个字段（§3.9.4 末段）', () => {
    vi.useFakeTimers();
    const { container, rerender } = mount(<ForcePasswordUpgradeForm onSubmit={() => {}} onSignOut={() => {}} blockedBackSignal={0} />);
    const root = byTestId(container, 'force-password-upgrade');
    const old = fieldOf(container, 'old-password');
    expect(document.activeElement).toBe(old);
    const esc = press(root, 'Escape');
    expect(esc.defaultPrevented).toBe(true);
    expect(root.getAttribute('data-nudge')).toBe('true');
    const shifted = Array.from(root.classList).find((c) => /translate-x/.test(c)) ?? '';
    const px = Number(/translate-x-\[(\d+)px\]/.exec(shifted)?.[1] ?? (shifted.includes('translate-x-0.') ? 4 : 2));
    expect(px).toBeLessThanOrEqual(4);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(byTestId(container, 'force-password-upgrade').getAttribute('data-nudge')).toBe('false');
    rerender(<ForcePasswordUpgradeForm onSubmit={() => {}} onSignOut={() => {}} blockedBackSignal={1} />);
    expect(byTestId(container, 'force-password-upgrade').getAttribute('data-nudge')).toBe('true');
  });

  it('TEMP_LOCKED 只禁用提交、本页不显示倒计时（§3.9.4 末段）', () => {
    const { container } = mount(
      <ForcePasswordUpgradeForm onSubmit={() => {}} onSignOut={() => {}} errorCode="TEMP_LOCKED" />,
    );
    expect(byTestId(container, 'password-submit').hasAttribute('disabled')).toBe(true);
    expect(byTestId(container, 'password-submit').textContent).toBe(AUTH_COPY.forceUpgrade.submit);
    expect(container.textContent ?? '').toContain(TM_ERRORS.TEMP_LOCKED.copy);
    /** 本页不显示倒计时：既没有倒计时节点，也没有秒/分递增的文字。 */
    expect(container.querySelector('[data-cooldown]')).toBeNull();
    expect(container.querySelector('[data-testid="sms-entry"]')).toBeNull();
  });

  it('成功后的常驻信息条与 toast 由宿主挂载，本件不写死文案（R-40③）', () => {
    const { container } = mount(
      <ForcePasswordUpgradeForm
        onSubmit={() => {}}
        onSignOut={() => {}}
        result={<NoticeBar layout="bar" tone="success" testid="other-devices">{AUTH_COPY.noPasswordAccount.body}</NoticeBar>}
      />,
    );
    expect(byTestId(container, 'other-devices')).toBeTruthy();
  });
});

/* ═════════════ 判据⑥：强度与放行判据只用 shared 常量 ═════════════ */

describe('判据⑥ 放行判据 = PASSWORD_MIN / PASSWORD_MAX_BYTES，分级 = passwordStrength()', () => {
  it('段数与标签来自 AUTH_COPY.strengthLevels；档位与 passwordStrength() 一致', () => {
    const samples = ['', 'abc', 'abcd1234', 'Abcdefgh1234', 'Abcdefgh1234!'];
    const segments = AUTH_COPY.strengthLevels.length;
    for (const value of samples) {
      const { container } = mount(<PasswordStrength value={value} />);
      const bar = byTestId(container, 'password-strength');
      const level = passwordStrength(value);
      expect(Number(bar.getAttribute('data-level'))).toBe(level);
      expect(Number(bar.getAttribute('data-level'))).toBeLessThan(segments);
      expect(bar.querySelectorAll('[aria-hidden="true"] > span').length).toBe(segments);
      expect(bar.textContent).toBe(AUTH_COPY.strengthLevels[level]);
      expect(Number(bar.getAttribute('data-filled'))).toBeLessThanOrEqual(segments);
      expect(bar.getAttribute('role')).toBe('status');
    }
  });

  it('源码级：src/auth 不出现第二套阈值 —— 无数字比较、无 8 / 72 字面量', () => {
    for (const name of COMPONENTS) {
      const code = stripComments(readSource(name));
      expect(code, `${name}.tsx 出现了与数字的比较`).not.toMatch(/[<>]=?\s*[1-9]/);
      expect(code, `${name}.tsx 出现了 .length === 数字（0 除外，那是空值判断）`).not.toMatch(/\.length\s*[=!]==?\s*[1-9]/);
      if (name === 'AuthFormShell' || name === 'ChangePasswordForm') {
        expect(code).toContain('PASSWORD_MIN');
        expect(code).toContain('PASSWORD_MAX_BYTES');
        expect(code).toMatch(/\.length\s*<\s*PASSWORD_MIN/);
      }
      if (name === 'PasswordStrength') {
        expect(code).toContain('passwordStrength(');
        expect(code).toContain('AUTH_COPY.strengthLevels.length');
        expect(code).not.toMatch(/PASSWORD_MIN|PASSWORD_MAX/);
      }
    }
  });

  it(`注册态放行判据：${PASSWORD_MIN - 1} 位不放行、${PASSWORD_MIN} 位放行，全程不出现阈值字面量`, () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell defaultMode="register" onSubmit={onSubmit} />);
    type(fieldOf(container, 'phone'), VALID_PHONE);
    type(fieldOf(container, 'password'), 'a'.repeat(PASSWORD_MIN - 1));
    type(fieldOf(container, 'confirm'), 'a'.repeat(PASSWORD_MIN - 1));
    click(container.querySelector('[role="checkbox"]') as Element);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(byTestId(container, 'password-strength').getAttribute('data-level')).toBe('0');
    expect(byTestId(container, 'password-strength').textContent).toBe(TM_ERRORS.WEAK_PASSWORD.copy);

    type(fieldOf(container, 'password'), 'a'.repeat(PASSWORD_MIN));
    type(fieldOf(container, 'confirm'), 'a'.repeat(PASSWORD_MIN));
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it(`超过 ${PASSWORD_MAX_BYTES} 字节不放行（UTF-8 字节口径，与 shared 一致）`, () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell onSubmit={onSubmit} />);
    type(fieldOf(container, 'phone'), VALID_PHONE);
    type(fieldOf(container, 'password'), 'あ'.repeat(PASSWORD_MAX_BYTES));
    blur(fieldOf(container, 'password'));
    /* T-29r D-1：这条**旧的**登录态期望钉的就是被删掉的残留路径（借 `WEAK_PASSWORD.copy`
       解释"过长"，字面是"至少 8 位"，语义反向且再触 R-40④）。按新行为改判为反向断言；
       拦截本身（下一行的 `onSubmit` 未被调）一字未动。 */
    expect(byTestId(container, 'auth-form').textContent ?? '').not.toContain(TM_ERRORS.WEAK_PASSWORD.copy);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('手机号判据只取 PHONE_PATTERN：展示分组 138 0000 0000，提交值 11 位', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell onSubmit={onSubmit} />);
    const phone = fieldOf(container, 'phone');
    type(phone, `${VALID_PHONE}123456`);
    expect(phone.value).toBe('138 0000 0000');
    expect(phone.maxLength).toBe(13);
    expect(phone.getAttribute('inputmode')).toBe('numeric');
    expect(phone.getAttribute('autocomplete')).toBe('tel');
    type(phone, '12345678901');
    blur(phone);
    expect(byTestId(container, 'field-phone').textContent ?? '').toContain(TM_ERRORS.INVALID_PHONE.copy);
  });
});

/* ═════════════ 交差项：零 IO / 零 next-* 绑定 / 契约 props 驱动 ═════════════ */

describe('§3.5 ui-no-io 与组件契约', () => {
  it.each(COMPONENTS)('%s.tsx 无请求、无宿主绑定、不自读时钟与随机数', (name) => {
    const src = readSource(name);
    expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|axios|useQuery\(/);
    expect(src).not.toMatch(/from ['"](next\/|@trpc\/|node:|react-dom\/)/);
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|window\.location|document\.cookie/);
    expect(src).not.toMatch(/Date\.now\(|new Date\(\)|Math\.random\(/);
    expect(src.startsWith("'use client';")).toBe(true);
  });

  it('不改 primitives 的签名：auth 只 import，不 re-export 基元', () => {
    for (const name of COMPONENTS) {
      const code = stripComments(readSource(name));
      expect(code).not.toMatch(/export\s+\*\s+from\s+'[^']*primitives/);
    }
  });

  it('协议勾选：点书名号链接不切换勾选，点整行切换（§3.9.2 命中区）', () => {
    const onChange = vi.fn();
    const onOpenTerms = vi.fn();
    const { container } = mount(
      <AgreementCheckbox checked={false} onChange={onChange} onOpenTerms={onOpenTerms} />,
    );
    const link = container.querySelector('[data-auth-link="agreement-0"]') as HTMLElement;
    expect(link.textContent).toBe(AUTH_COPY.agreement.match(/《[^》]*》/)?.[0]);
    click(link);
    expect(onOpenTerms).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    click(container.querySelector('[data-auth-control="agreement"]') as Element);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(byTestId(container, 'agreement').querySelector('[role="checkbox"]')).toBeTruthy();
  });

  it('改密表单（普通态）与强制态共用同一套字段与强度条', () => {
    const { container } = mount(
      <ChangePasswordForm
        submitLabel={AUTH_COPY.forceUpgrade.submit}
        fieldLabels={AUTH_COPY.forceUpgrade.fieldLabels}
        onSubmit={() => {}}
      />,
    );
    expect(controlKeys(byTestId(container, 'change-password-form')).sort()).toEqual(
      ['confirm-password', 'new-password', 'old-password', 'submit'].sort(),
    );
    expect(byTestId(container, 'password-strength')).toBeTruthy();
    type(fieldOf(container, 'new-password'), 'abcd1234');
    expect(byTestId(container, 'password-strength').getAttribute('data-level')).toBe(
      String(passwordStrength('abcd1234')),
    );
  });

  it('两态标题/主按钮在 pending 时文案不变，整表单 aria-busy（§3.9.6）', () => {
    const { container } = mount(<AuthFormShell defaultMode="register" pending onSubmit={() => {}} />);
    const form = byTestId(container, 'auth-form');
    expect(form.getAttribute('aria-busy')).toBe('true');
    expect(byTestId(container, 'auth-submit').textContent).toBe(AUTH_COPY.submit.register);
    expect(byTestId(container, 'auth-submit').hasAttribute('disabled')).toBe(true);
    expect(form.querySelector('.animate-spinner')).toBeTruthy();
    expect(form.querySelector('[data-testid="auth-fields"]')?.className).toContain('pointer-events-none');
  });
});

/* ═════════════ T-29：登录侧不得拦掉存量弱密码（DEFECT：R-40④ 链不可达）═════════════ */

describe('T-29 密码门槛分两面：PASSWORD_MIN 只拦建密码态，登录态必须把短密码发出去', () => {
  /** 存量短密码：由 `PASSWORD_MIN` 派生（用例不写死阈值），登录面必须能提交它。 */
  const LEGACY_SHORT = 'a'.repeat(Math.max(1, PASSWORD_MIN - 1));
  const LEGACY_BLANK = ' '.repeat(Math.max(1, PASSWORD_MIN - 1));

  /** `PasswordField` 自己的 `<p role="alert">`（与强度条的 `role="status"` 不同节点）。 */
  function fieldAlert(scope: HTMLElement, control: string): HTMLElement | null {
    const input = fieldOf(scope, control);
    const wrapper = input?.parentElement?.parentElement;
    return wrapper ? (wrapper.querySelector('[role="alert"]') as HTMLElement | null) : null;
  }

  it('① 登录态：短密码 + 合法手机号 → 提交真的发出去，onSubmit 收到原样密码串', () => {
    expect(LEGACY_SHORT.trim().length).toBeLessThan(PASSWORD_MIN);
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell onSubmit={onSubmit} />);
    type(fieldOf(container, 'phone'), VALID_PHONE);
    type(fieldOf(container, 'password'), LEGACY_SHORT);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      phone: VALID_PHONE,
      password: LEGACY_SHORT,
      confirmPassword: '',
      agreed: true,
    });
  });

  it('①b 登录态：切到注册再切回登录（密码框被清空）后，短密码仍然发得出去', () => {
    const onSubmit = vi.fn();
    const { container } = mount(
      <AuthFormShell
        onSubmit={onSubmit}
        switchToRegisterLabel={AUTH_COPY.dialog.register}
        switchToSignInLabel={AUTH_COPY.dialog.login}
      />,
    );
    type(fieldOf(container, 'phone'), VALID_PHONE);
    type(fieldOf(container, 'password'), LEGACY_SHORT);
    click(byTestId(container, 'auth-switch'));
    expect(byTestId(container, 'auth-form').getAttribute('data-mode')).toBe('register');
    click(byTestId(container, 'auth-switch'));
    expect(fieldOf(container, 'password').value).toBe('');
    type(fieldOf(container, 'password'), LEGACY_SHORT);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]?.password).toBe(LEGACY_SHORT);
  });

  it('② 建密码三面同口径：同一串短密码在注册 / 改密 / 强制改密态一律不放行，且给人话', () => {
    const onSubmit = vi.fn();
    const { container: register } = mount(<AuthFormShell defaultMode="register" onSubmit={onSubmit} />);
    type(fieldOf(register, 'phone'), VALID_PHONE);
    type(fieldOf(register, 'password'), LEGACY_SHORT);
    type(fieldOf(register, 'confirm'), LEGACY_SHORT);
    click(register.querySelector('[role="checkbox"]') as Element);
    blur(fieldOf(register, 'password'));
    click(byTestId(register, 'auth-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    /* 注册态的人话由强度条给（§3.9.2：字段下不重复一句）。 */
    expect(byTestId(register, 'password-strength').textContent).toBe(TM_ERRORS.WEAK_PASSWORD.copy);
    expectAllCopyFromShared(byTestId(register, 'auth-form'), '注册态短密码');

    const { container: change } = mount(
      <ChangePasswordForm submitLabel={AUTH_COPY.forceUpgrade.submit} onSubmit={onSubmit} />,
    );
    type(fieldOf(change, 'old-password'), OK_PASSWORD);
    type(fieldOf(change, 'new-password'), LEGACY_SHORT);
    type(fieldOf(change, 'confirm-password'), LEGACY_SHORT);
    blur(fieldOf(change, 'new-password'));
    click(byTestId(change, 'password-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(fieldAlert(change, 'new-password')?.textContent).toBe(TM_ERRORS.WEAK_PASSWORD.copy);

    const { container: forced } = mount(<ForcePasswordUpgradeForm onSubmit={onSubmit} onSignOut={() => {}} />);
    type(fieldOf(forced, 'old-password'), OK_PASSWORD);
    type(fieldOf(forced, 'new-password'), LEGACY_SHORT);
    type(fieldOf(forced, 'confirm-password'), LEGACY_SHORT);
    blur(fieldOf(forced, 'new-password'));
    click(byTestId(forced, 'password-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(fieldAlert(forced, 'new-password')?.textContent).toBe(TM_ERRORS.WEAK_PASSWORD.copy);
  });

  it('③ 登录态唯一的强度侧门槛：空密码与纯空格都不提交', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell onSubmit={onSubmit} />);
    type(fieldOf(container, 'phone'), VALID_PHONE);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    type(fieldOf(container, 'password'), ' ');
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    type(fieldOf(container, 'password'), LEGACY_BLANK);
    blur(fieldOf(container, 'password'));
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    /* 空格清掉后（密码非空）同一条路径立刻放行 —— 证明拦的是"空"，不是"短"。 */
    type(fieldOf(container, 'password'), LEGACY_SHORT);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('④ 反向哨：登录态任何一步都不出现建密码面的话术（WEAK_PASSWORD.copy）', () => {
    const { container } = mount(<AuthFormShell onSubmit={() => {}} />);
    const form = byTestId(container, 'auth-form');
    /* 登录态压根没有强度条（那是建密码面的常驻说明）。 */
    expect(container.querySelector('[data-testid="password-strength"]')).toBeNull();
    type(fieldOf(container, 'phone'), VALID_PHONE);
    for (const value of ['', ' ', LEGACY_SHORT, LEGACY_SHORT.repeat(2), OK_PASSWORD]) {
      type(fieldOf(container, 'password'), value);
      blur(fieldOf(container, 'password'));
      expect(fieldAlert(container, 'password'), `登录态对 ${value.length} 位密码讲了建密码面的话`).toBeNull();
      expect(form.textContent ?? '').not.toContain(TM_ERRORS.WEAK_PASSWORD.copy);
    }
    expectAllCopyFromShared(form, '登录态（T-29 后）');
  });

  it('④b 反向哨只针对客户端判据：服务端真回 WEAK_PASSWORD 时登录面照旧显示（不吞错）', () => {
    const { container } = mount(<AuthFormShell errorCode="WEAK_PASSWORD" onSubmit={() => {}} />);
    expect(fieldAlert(container, 'password')?.textContent).toBe(TM_ERRORS.WEAK_PASSWORD.copy);
  });
});

/* ═════════════ T-29r：D-1 过长不再借话术 · D-2 登录态空密码不静默 ═════════════ */

describe('T-29r 登录态两条残留哨兵：短密码发得出去、过长不说"至少 8 位"、空密码焦点进框', () => {
  /** 字面 3 位的存量密码（钉"确实很短"，与 `PASSWORD_MIN` 无关）。 */
  const THREE_CHAR = 'abc';
  /** 超字节口径：每字符 3 字节 ⇒ 总字节 = 3 × `PASSWORD_MAX_BYTES`，必然越界。 */
  const OVER_LONG = 'あ'.repeat(PASSWORD_MAX_BYTES);
  /** 建密码面话术的**形状**（数字取自 shared，用例不写死阈值）：登录面任何一步都不许出现它。 */
  const MIN_BITS = new RegExp(`至少\\s*${PASSWORD_MIN}\\s*位`);

  /** 同款取法（与 T-29 组内的局部助手一致，作用域不跨 describe，故本块自带一份）。 */
  function alertIn(scope: HTMLElement, control: string): HTMLElement | null {
    const input = fieldOf(scope, control);
    const wrapper = input?.parentElement?.parentElement;
    return wrapper ? (wrapper.querySelector('[role="alert"]') as HTMLElement | null) : null;
  }

  it('正向哨 · 登录态 3 位短密码：主按钮照样把请求发出去，password 原样传给宿主', () => {
    expect(THREE_CHAR.trim().length).toBeLessThan(PASSWORD_MIN);
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell onSubmit={onSubmit} />);
    type(fieldOf(container, 'phone'), VALID_PHONE);
    type(fieldOf(container, 'password'), THREE_CHAR);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      phone: VALID_PHONE,
      password: THREE_CHAR,
      confirmPassword: '',
      agreed: true,
    });
  });

  it('反向哨 · 登录态过长路径：blur + 点提交后 field-password 的 alert 与整表单 0 命中建密码话术，且不提交', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell onSubmit={onSubmit} />);
    const form = byTestId(container, 'auth-form');
    type(fieldOf(container, 'phone'), VALID_PHONE);
    type(fieldOf(container, 'password'), OVER_LONG);
    blur(fieldOf(container, 'password'));
    const minBits = (value: string, where: string) =>
      expect(value, `${where}：登录态把"过长"说成了"至少 ${PASSWORD_MIN} 位"`).not.toMatch(MIN_BITS);
    minBits(alertIn(container, 'password')?.textContent ?? '', 'blur 后 · 密码框 alert');
    minBits(form.textContent ?? '', 'blur 后 · 整表单');
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit, '字节上限拦截被删掉了：过长密码被提交上去了').not.toHaveBeenCalled();
    minBits(alertIn(container, 'password')?.textContent ?? '', '点提交后 · 密码框 alert');
    minBits(form.textContent ?? '', '点提交后 · 整表单');
    /* T-03r4 反向改判（PM-fix7 / §3.9.7 定稿串 B 接入同一错误槽）：D-1 那半句"压根没有 alert 节点"
       与本轮**真的互斥** —— 定稿后密码框下有且仅有那一条 alert，内容 = `AUTH_COPY.signInPasswordTooLong`。
       改成"有 alert 且逐字是定稿串"是**收紧**（旧断言只排除 alert 的存在，新断言同时锁死内容）；
       同一条用例里 D-1 的实质判据（上面两行 `MIN_BITS` 0 命中 + 本用例开头 blur 后的两条 0 命中 +
       这一行的"过长不提交"）一字未动；T-29 组 ④ 那条"blur 之后 alert 仍为 null"的时机钉也没动 ——
       串只在点过主按钮之后出现，未点提交时密码框下依旧零节点。 */
    const tooLongAlert = alertIn(container, 'password');
    expect(tooLongAlert, '§3.9.7：登录态过长被拦后密码框下没有那条定稿串').not.toBeNull();
    expect(tooLongAlert!.textContent).toBe(AUTH_COPY.signInPasswordTooLong);
  });

  it('静默哨 · 登录态空密码点提交：焦点落进密码框（按钮没死），且 0 提交', () => {
    const onSubmit = vi.fn();
    /* `autoFocus="phone"`：起手焦点不在密码框，断言才证明是这次点击送进去的。 */
    const { container } = mount(<AuthFormShell autoFocus="phone" onSubmit={onSubmit} />);
    const password = fieldOf(container, 'password');
    type(fieldOf(container, 'phone'), VALID_PHONE);
    expect(document.activeElement).not.toBe(password);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(password);
    /* 纯空格同一条路：仍然不提交，仍然把焦点送进密码框。 */
    type(password, ' '.repeat(PASSWORD_MIN));
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(password);
  });
});

/* ═════════ T-03r4：§3.9.7 登录态两条本地拦截接回话术通道（PM-fix7 定稿两句） ═════════ */

describe('T-03r4 §3.9.7：登录态空/超长点`登录`后各出自己的定稿串，判据与拦截行为一字未动', () => {
  /** 超字节口径：每字符 3 字节 ⇒ 总字节 = 3 × `PASSWORD_MAX_BYTES`，必然越界（与 T-29r 同式）。 */
  const OVER_LONG = 'あ'.repeat(PASSWORD_MAX_BYTES);
  /** 建密码面话术的**形状**：数字取自 shared，用例不写死阈值。登录面两条都不许出现它。 */
  const MIN_BITS = new RegExp(`至少\\s*${PASSWORD_MIN}\\s*位`);

  /** `PasswordField` 自己的 `<p role="alert">`（与强度条的 `role="status"` 不同节点）。 */
  function alertIn(scope: HTMLElement, control: string): HTMLElement | null {
    const input = fieldOf(scope, control);
    const wrapper = input?.parentElement?.parentElement;
    return wrapper ? (wrapper.querySelector('[role="alert"]') as HTMLElement | null) : null;
  }

  /** 串必须落在 §3.9.5 那个**既有**字段错误槽里：不新开槽位，且 `aria-describedby` 指向同一节点。 */
  function assertSameErrorSlot(container: HTMLElement, copy: string): void {
    const alert = alertIn(container, 'password');
    expect(alert, '串没落在密码框下方的既有错误槽里').not.toBeNull();
    expect(alert!.textContent).toBe(copy);
    expect(byTestId(container, 'field-password').querySelector('[role="alert"]')).toBe(alert);
    const input = fieldOf(container, 'password');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby') ?? '').toContain(alert!.id);
  }

  it('钉 1 正向 · 空密码/纯空格点`登录`：串 A 逐字 + 0 提交 + 焦点仍在密码框', () => {
    const onSubmit = vi.fn();
    /* `autoFocus="phone"`：起手焦点不在密码框，断言才证明是这次点击送进去的。 */
    const { container } = mount(<AuthFormShell autoFocus="phone" onSubmit={onSubmit} />);
    const password = fieldOf(container, 'password');
    const form = byTestId(container, 'auth-form');
    type(fieldOf(container, 'phone'), VALID_PHONE);
    expect(document.activeElement).not.toBe(password);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit, '空密码被放行了：§3.9.7 没让串换掉判据').not.toHaveBeenCalled();
    expect(document.activeElement).toBe(password);
    assertSameErrorSlot(container, AUTH_COPY.signInPasswordMissing);
    expect(form.textContent ?? '').toContain(AUTH_COPY.signInPasswordMissing);
    /* 纯空格同一条路：同一个串、同样不提交、焦点仍在密码框。 */
    type(password, ' '.repeat(PASSWORD_MIN));
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(password);
    assertSameErrorSlot(container, AUTH_COPY.signInPasswordMissing);
    expectAllCopyFromShared(form, '登录态空密码被拦（§3.9.7）');
  });

  it('钉 2 正向 · 超字节上限点`登录`：串 B 逐字 + 0 提交 + 焦点仍在密码框', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell autoFocus="phone" onSubmit={onSubmit} />);
    const password = fieldOf(container, 'password');
    type(fieldOf(container, 'phone'), VALID_PHONE);
    type(password, OVER_LONG);
    expect(new TextEncoder().encode(password.value).length).toBeGreaterThan(PASSWORD_MAX_BYTES);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit, '字节上限拦截被删掉了：过长密码被提交上去了').not.toHaveBeenCalled();
    expect(document.activeElement).toBe(password);
    assertSameErrorSlot(container, AUTH_COPY.signInPasswordTooLong);
    expect(byTestId(container, 'auth-form').textContent ?? '').toContain(AUTH_COPY.signInPasswordTooLong);
    expectAllCopyFromShared(byTestId(container, 'auth-form'), '登录态过长被拦（§3.9.7）');
  });

  it('钉 3 反向哨 · 两条被拦状态下"至少 N 位"式强度话术 0 命中（数字由 `PASSWORD_MIN` 拼）', () => {
    for (const value of ['', ' '.repeat(PASSWORD_MIN), OVER_LONG]) {
      const onSubmit = vi.fn();
      const { container } = mount(<AuthFormShell onSubmit={onSubmit} />);
      const form = byTestId(container, 'auth-form');
      type(fieldOf(container, 'phone'), VALID_PHONE);
      type(fieldOf(container, 'password'), value);
      click(byTestId(container, 'auth-submit'));
      expect(onSubmit, `登录态 ${value.length} 字符的输入被放行了`).not.toHaveBeenCalled();
      const where = `登录态输入 ${value.length} 字符被拦后`;
      expect(form.textContent ?? '', `${where}：讲了建密码面的话`).not.toMatch(MIN_BITS);
      expect(alertIn(container, 'password')?.textContent ?? '', `${where}：alert 里讲了建密码面的话`).not.toMatch(MIN_BITS);
      expect(form.textContent ?? '', `${where}：借用了服务端回码那条串`).not.toContain(TM_ERRORS.WEAK_PASSWORD.copy);
      /* 密码框下唯一的 alert 就是 §3.9.7 那条串本身（不是强度话术、也不是服务端回码）。 */
      expect(alertIn(container, 'password')?.textContent).toBe(
        value === OVER_LONG ? AUTH_COPY.signInPasswordTooLong : AUTH_COPY.signInPasswordMissing,
      );
    }
  });

  it('钉 4 时机哨 · 没点`登录`之前，空密码字段下方不得出现串 A（blur 过也不行）', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell onSubmit={onSubmit} />);
    const form = byTestId(container, 'auth-form');
    type(fieldOf(container, 'phone'), VALID_PHONE);
    expect(alertIn(container, 'password')).toBeNull();
    /* 打进去又清空 + blur：`touched.password` 已经真，但用户没点过主按钮 → 不常驻红字。 */
    type(fieldOf(container, 'password'), OK_PASSWORD);
    type(fieldOf(container, 'password'), '');
    blur(fieldOf(container, 'password'));
    expect(alertIn(container, 'password'), '未提交就报红 = 骂用户').toBeNull();
    expect(form.textContent ?? '').not.toContain(AUTH_COPY.signInPasswordMissing);
    expect(form.textContent ?? '').not.toContain(AUTH_COPY.signInPasswordTooLong);
    expect(onSubmit).not.toHaveBeenCalled();
    /* 点了主按钮之后才出现，并且出现的就是那一条（同一槽位，前后各一次判定）。 */
    click(byTestId(container, 'auth-submit'));
    assertSameErrorSlot(container, AUTH_COPY.signInPasswordMissing);
  });

  it('钉 5 外溢哨 · 注册态与激活态的空/超长都不吃串 A、也不吃串 B', () => {
    for (const activate of [false, true]) {
      for (const value of ['', ' '.repeat(PASSWORD_MIN), OVER_LONG]) {
        const onSubmit = vi.fn();
        const { container } = mount(
          <AuthFormShell defaultMode="register" activate={activate} onSubmit={onSubmit} />,
        );
        const form = byTestId(container, 'auth-form');
        type(fieldOf(container, 'phone'), VALID_PHONE);
        type(fieldOf(container, 'password'), value);
        type(fieldOf(container, 'confirm'), value);
        click(container.querySelector('[role="checkbox"]') as Element);
        click(byTestId(container, 'auth-submit'));
        expect(onSubmit, '建密码态的门槛被动了').not.toHaveBeenCalled();
        const text = form.textContent ?? '';
        const where = `${activate ? '激活' : '注册'}态输入 ${value.length} 字符被拦后`;
        expect(text, `${where}：串 A 外溢到建密码面`).not.toContain(AUTH_COPY.signInPasswordMissing);
        expect(text, `${where}：串 B 外溢到建密码面`).not.toContain(AUTH_COPY.signInPasswordTooLong);
        /* T-03r5 反向改判（PM-fix8 件 3 / A-65 #181，已按 A-61 #169 口径申报互斥）：本轮给建密码面的
           超长拦截补了出口话术 `AUTH_COPY.setPasswordTooLong`，OVER_LONG 这一档"密码框下 0 槽位"与
           新判据**逻辑互斥**（旧钉正钉着本轮要修的静默分支）。只翻转这一条期望、且只翻 OVER_LONG 档：
           空串与纯空格两档（注册态弱静默）仍 `toBeNull()` 一字未动，前面的"0 提交 / 串 A 不外溢 /
           串 B 不外溢"四条断言全部保留。 */
        if (value === OVER_LONG) {
          const alert = alertIn(container, 'password');
          expect(alert, `${where}：建密码面超长仍同型静默（PM-fix8 件 3 未接上）`).not.toBeNull();
          expect(alert!.textContent).toBe(AUTH_COPY.setPasswordTooLong);
        } else {
          expect(alertIn(container, 'password'), `${where}：密码框下多了本地串槽位`).toBeNull();
        }
      }
    }
  });
});

/* ═══ T-03r5：PM-fix8 件 3 建密码面超长出口（注册/激活态走壳）+ F-23 改密两面拆反号（A-64 #179） ═══ */

describe('T-03r5 建密码面超长不再同型静默：注册/激活态点主按钮后出自己的定稿串，改密两面超长不再被说成"太短"', () => {
  /** 超字节口径：每字符 3 字节 ⇒ 总字节 = 3 × `PASSWORD_MAX_BYTES`，必然越界（与 T-29r / T-03r4 同式）。 */
  const OVER_LONG = 'あ'.repeat(PASSWORD_MAX_BYTES);
  /** 强度话术的**形状**：数字取自 shared，用例不写死阈值（F-23 的反号钉 = 超长档 0 命中这条）。 */
  const MIN_BITS = new RegExp(`至少\\s*${PASSWORD_MIN}\\s*位`);

  /** 同款取法（作用域不跨 describe，本块自带一份，与 T-29r / r4 组同构）。 */
  function alertIn(scope: HTMLElement, control: string): HTMLElement | null {
    const input = fieldOf(scope, control);
    const wrapper = input?.parentElement?.parentElement;
    return wrapper ? (wrapper.querySelector('[role="alert"]') as HTMLElement | null) : null;
  }

  for (const activate of [false, true]) {
    const where = activate ? '激活态' : '注册态';

    it(`正向钉 · ${where}超字节点主按钮：串落在密码框既有错误槽 + 0 提交 + 焦点进密码框 + 0 强度话术`, () => {
      const onSubmit = vi.fn();
      const { container } = mount(
        <AuthFormShell defaultMode="register" activate={activate} autoFocus="phone" onSubmit={onSubmit} />,
      );
      const password = fieldOf(container, 'password');
      const form = byTestId(container, 'auth-form');
      type(fieldOf(container, 'phone'), VALID_PHONE);
      type(password, OVER_LONG);
      type(fieldOf(container, 'confirm'), OVER_LONG);
      click(container.querySelector('[role="checkbox"]') as Element);
      expect(document.activeElement).not.toBe(password);
      click(byTestId(container, 'auth-submit'));
      /* "不发请求 + 焦点进密码框"两个既有行为不变（PM-fix8 件 3 反向哨第 4 条）。 */
      expect(onSubmit, '字节上限拦截被删掉了：过长密码被提交上去了').not.toHaveBeenCalled();
      expect(document.activeElement, `${where}超长拦截把焦点丢了`).toBe(password);
      const alert = alertIn(container, 'password');
      expect(alert, `${where}：超长仍只有 focus、无话术（A-61 第 168 条的同型静默未关闭）`).not.toBeNull();
      expect(alert!.textContent).toBe(AUTH_COPY.setPasswordTooLong);
      expect(form.textContent ?? '').toContain(AUTH_COPY.setPasswordTooLong);
      /* "过长不说成太短"锁在**字段错误槽**上：注册/激活面的副标题（R-39⑥ 固定句式）合法自带
         "设一个至少 8 位的密码"，整表单扫 `MIN_BITS` 会把那句真话也钉红 —— PM-fix8 件 3 反向哨第 2 条
         本来就只禁"超长档的出口话术"讲强度。 */
      expect(alert!.textContent, `${where}：把"过长"说成了"太短"`).not.toMatch(MIN_BITS);
      expectAllCopyFromShared(form, `${where}超长被拦（PM-fix8 件 3）`);
    });

    it(`时机钉 · ${where}没点主按钮之前不常驻：只 blur 也不出串（与登录态同判据，不挂 touched）`, () => {
      const onSubmit = vi.fn();
      const { container } = mount(
        <AuthFormShell defaultMode="register" activate={activate} onSubmit={onSubmit} />,
      );
      const form = byTestId(container, 'auth-form');
      type(fieldOf(container, 'phone'), VALID_PHONE);
      type(fieldOf(container, 'password'), OVER_LONG);
      type(fieldOf(container, 'confirm'), OVER_LONG);
      click(container.querySelector('[role="checkbox"]') as Element);
      blur(fieldOf(container, 'password'));
      expect(alertIn(container, 'password'), `${where}：未提交就报红 = 骂用户（§3.9.7 时机判据）`).toBeNull();
      expect(form.textContent ?? '').not.toContain(AUTH_COPY.setPasswordTooLong);
      /* 点过主按钮之后才出，且出在同一槽位（与登录面 `signInLocalBlocked` 同范式）。 */
      click(byTestId(container, 'auth-submit'));
      expect(alertIn(container, 'password')?.textContent).toBe(AUTH_COPY.setPasswordTooLong);
    });
  }

  it('出口钉 · 普通改密/强制改密超长夹具：新密码框下等值 setPasswordTooLong 且不再被说成"太短"（F-23 / A-64 第 179 条）', () => {
    const onSubmit = vi.fn();
    for (const kind of ['change', 'force'] as const) {
      const { container } = mount(
        kind === 'change' ? (
          <ChangePasswordForm submitLabel={AUTH_COPY.forceUpgrade.submit} onSubmit={onSubmit} />
        ) : (
          <ForcePasswordUpgradeForm onSubmit={onSubmit} onSignOut={() => {}} />
        ),
      );
      const label = kind === 'change' ? '普通改密' : '强制改密';
      type(fieldOf(container, 'old-password'), OK_PASSWORD);
      type(fieldOf(container, 'new-password'), OVER_LONG);
      type(fieldOf(container, 'confirm-password'), OVER_LONG);
      click(byTestId(container, 'password-submit'));
      expect(onSubmit, `${label}：超长仍被提交上去了（:159 拦截行为不许动）`).not.toHaveBeenCalled();
      const alert = alertIn(container, 'new-password');
      expect(alert, `${label}：超长仍被告知"至少 8 位"或缺话术`).not.toBeNull();
      expect(alert!.textContent).toBe(AUTH_COPY.setPasswordTooLong);
      expect(alert!.textContent, `${label}：把"过长"说成了"太短"`).not.toMatch(MIN_BITS);
      expect(alert!.textContent).not.toBe(TM_ERRORS.WEAK_PASSWORD.copy);
      /* 强度条常驻读数与错误槽同屏可并存（PM-fix8 件 3 反向哨第 2 条），本钉只锁字段错误槽。 */
      expectAllCopyFromShared(
        byTestId(container, kind === 'change' ? 'change-password-form' : 'force-change-password'),
        `${label}超长（F-23）`,
      );
    }
  });

  it('判据不动钉 · 建密码面的"弱"仍静默（注册态字段下不出强度串），服务端回码仍最优先', () => {
    const weak = 'a'.repeat(Math.max(1, PASSWORD_MIN - 1));
    const onSubmit = vi.fn();
    const { container } = mount(<AuthFormShell defaultMode="register" onSubmit={onSubmit} />);
    type(fieldOf(container, 'phone'), VALID_PHONE);
    type(fieldOf(container, 'password'), weak);
    type(fieldOf(container, 'confirm'), weak);
    click(container.querySelector('[role="checkbox"]') as Element);
    click(byTestId(container, 'auth-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    /* 弱 → 仍由强度条承担（字段下 0 槽位），本轮没把它接成话术 = 未扩面。 */
    expect(alertIn(container, 'password')).toBeNull();
    expect(byTestId(container, 'password-strength').textContent).toBe(TM_ERRORS.WEAK_PASSWORD.copy);
    /* 服务端 `WEAK_PASSWORD` 回码仍排在本地判据之前（§3.9.5 / A-41 #62）。 */
    const { container: served } = mount(
      <AuthFormShell defaultMode="register" errorCode="WEAK_PASSWORD" onSubmit={() => {}} />,
    );
    type(fieldOf(served, 'password'), OVER_LONG);
    expect(alertIn(served, 'password')?.textContent).toBe(TM_ERRORS.WEAK_PASSWORD.copy);
  });
});
