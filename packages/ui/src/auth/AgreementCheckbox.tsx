'use client';

/**
 * `AgreementCheckbox`（UI §3.9.2 末段 / R-23⑤ / R-39②：未勾选不得提交）。
 *
 * - 文案唯一源 = `AUTH_COPY.agreement`（`我已阅读并同意《用户协议》《隐私政策》`）；
 *   句中的书名号片段**由文案本身切出来**渲染成两个链接，本文件不写第二份链接文字；
 * - 方框 16px、整行命中区 ≥44px（`min-h-tap`，UI §7.1）；
 * - 点链接不切换勾选态（§3.9.2），故链接带 `data-auth-link`，行内点击处理器对该标记放行；
 * - 未勾选时错误文案 = `TM_ERRORS.AGREEMENT_REQUIRED.copy`，由调用方（`AuthFormShell`）传入，
 *   本件不含任何文案字面量。
 */
import * as React from 'react';
import { AUTH_COPY } from '@tm/shared';
import { cn } from '../host.js';

export interface AgreementCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 勾选框下方的错误（`AGREEMENT_REQUIRED` 人话）；无错误时不渲染。 */
  error?: string;
  /** 句子整体覆写（默认 `AUTH_COPY.agreement`）。 */
  label?: string;
  /** 两个书名的落点：给了 href 就渲染 `<a target="_blank">`，只给回调就渲染按钮形态的文字链。 */
  termsHref?: string;
  privacyHref?: string;
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
  disabled?: boolean;
  id?: string;
  /** 错误节点的 id（`aria-describedby` 用，§3.9.2）。 */
  describedby?: string;
  /** 勾选控件本体（未勾选时点主按钮要把焦点跳到这里，§3.9.2 末段）。 */
  buttonRef?: React.Ref<HTMLButtonElement>;
  className?: string;
  testid?: string;
}

/** 书名号片段（《用户协议》《隐私政策》）——从文案里切，不另写一份。 */
const TITLE_PATTERN = /《[^》]*》/;
const TITLE_SPLIT = /(《[^》]*》)/;

function isBookTitle(text: string): boolean {
  return TITLE_PATTERN.test(text);
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

export function AgreementCheckbox({
  checked,
  onChange,
  error,
  label = AUTH_COPY.agreement,
  termsHref,
  privacyHref,
  onOpenTerms,
  onOpenPrivacy,
  disabled,
  id,
  describedby,
  buttonRef,
  className,
  testid,
}: AgreementCheckboxProps): React.JSX.Element {
  const pieces = label.split(TITLE_SPLIT).filter((piece) => piece.length > 0);
  let titleOrdinal = 0;

  const handleRowClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-auth-link]')) return;
    if (target?.closest('[role="checkbox"]')) return;
    onChange(!checked);
  };

  return (
    <div className={cn('min-w-0', className)} data-testid={testid ?? 'agreement'}>
      <div
        className="flex min-h-tap cursor-pointer items-start gap-2 py-1"
        onClick={handleRowClick}
        data-auth-control="agreement"
      >
        <button
          type="button"
          role="checkbox"
          id={id}
          ref={buttonRef}
          aria-checked={checked}
          aria-disabled={disabled || undefined}
          aria-describedby={describedby}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onChange(!checked);
          }}
          className={cn(
            'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border bg-surface transition-colors duration-micro ease-standard',
            checked ? 'border-brand bg-brand text-on-brand' : 'border-hair',
            FOCUS,
          )}
        >
          {checked ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3"
            >
              <path d="m5 13 4 4 10-10" />
            </svg>
          ) : null}
        </button>
        <span className="min-w-0 flex-1 text-sm leading-6 text-ink">
          {pieces.map((piece, index) => {
            if (!isBookTitle(piece)) {
              return <React.Fragment key={index}>{piece}</React.Fragment>;
            }
            const ordinal = titleOrdinal;
            titleOrdinal += 1;
            const href = ordinal === 0 ? termsHref : privacyHref;
            const onOpen = ordinal === 0 ? onOpenTerms : onOpenPrivacy;
            const open = (event: React.SyntheticEvent): void => {
              event.stopPropagation();
              if (href) return;
              event.preventDefault();
              onOpen?.();
            };
            const linkClass = cn('text-brand underline-offset-2 hover:underline', FOCUS);
            return href ? (
              <a
                key={index}
                data-auth-link={`agreement-${ordinal}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                onClick={open}
                className={linkClass}
              >
                {piece}
              </a>
            ) : (
              <button
                key={index}
                type="button"
                data-auth-link={`agreement-${ordinal}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen?.();
                }}
                className={cn(linkClass, 'inline py-0 text-left')}
              >
                {piece}
              </button>
            );
          })}
        </span>
      </div>
      {error ? (
        <p id={describedby} className="text-xs text-danger" role="alert" data-slot="agreement-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default AgreementCheckbox;
