'use client';

/**
 * `ConfirmSheet`（UI §3.11.2；R-40 ④ / R-08 ③）。
 *
 * 桌面 `Dialog`（居中）与移动底部 `Sheet` = **同一组件的两个 variant、同一份 DOM**：
 * 差异只靠 `max-md:` 类覆写（断点切换，不复制组件），底座是 `primitives/dialog`（Radix），
 * 焦点圈闭 / Esc / 焦点回弹由 primitive 内建。
 * `dismissible=false`（强制改密、目标达成二选一）时遮罩与 Esc 都不能关闭。
 * 破坏性动作的确认键**永不预聚焦**（Radix 默认聚焦可关闭的控件，这里显式拦一次）。
 */
import * as React from 'react';
import { VERBS } from '@tm/shared';
import { cn } from '../host.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../primitives/dialog.js';

export interface ConfirmSheetProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  variant?: 'auto' | 'dialog' | 'sheet';
  dismissible?: boolean;
  pending?: boolean;
  showClose?: boolean;
  closeLabel?: string;
  trigger?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  testid?: string;
}

/** 移动形态：贴底、圆角只留上方、宽度铺满（§3.11.2 的 sheet 形状）。 */
const SHEET_OVERRIDES =
  'max-md:left-0 max-md:top-auto max-md:bottom-0 max-md:max-w-full max-md:w-full ' +
  'max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-xl ' +
  'max-md:p-5 max-md:animate-sheet-in';

const ALWAYS_SHEET =
  'left-0 top-auto bottom-0 translate-x-0 translate-y-0 max-w-full w-full rounded-b-none rounded-t-xl p-5 animate-sheet-in';

export interface ConfirmSheetHandle {
  /** 供宿主在异步完成后收起（等价于 `onOpenChange(false)`，但语义上更清楚）。 */
  close: () => void;
}

function ConfirmSheet(
  {
    open,
    onOpenChange,
    title,
    description,
    confirmText,
    cancelText = VERBS.cancel,
    tone = 'default',
    onConfirm,
    onCancel,
    variant = 'auto',
    dismissible = true,
    pending = false,
    showClose = false,
    closeLabel,
    trigger,
    children,
    className,
    testid,
  }: ConfirmSheetProps,
  ref: React.ForwardedRef<ConfirmSheetHandle>,
): React.JSX.Element {
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  React.useImperativeHandle(
    ref,
    (): ConfirmSheetHandle => ({
      close: (): void => onOpenChange?.(false),
    }),
    [onOpenChange],
  );

  /* 只依赖 `preventDefault`：同一份处理器要挂到 Esc / 遮罩 / 焦点逃逸三种事件上。 */
  const veto = (event: { preventDefault: () => void }): void => {
    if (!dismissible) event.preventDefault();
  };

  const confirmClasses =
    tone === 'danger'
      ? 'bg-danger text-on-brand hover:opacity-90'
      : 'bg-brand text-on-brand hover:bg-brand-strong';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        data-testid={testid}
        showClose={showClose}
        closeLabel={closeLabel}
        onEscapeKeyDown={veto}
        onInteractOutside={veto}
        onPointerDownOutside={veto}
        onFocusOutside={veto}
        onOpenAutoFocus={(event: Event) => {
          /* 破坏性确认键不预聚焦：焦点落在取消键（无可取消时才交给 Radix 默认行为）。 */
          if (cancelRef.current) {
            event.preventDefault();
            cancelRef.current.focus();
          }
        }}
        className={cn(
          variant === 'sheet' ? ALWAYS_SHEET : '',
          variant === 'auto' ? SHEET_OVERRIDES : '',
          className,
        )}
      >
        <DialogHeader className="text-left">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DialogFooter>
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={() => {
              if (onCancel) onCancel();
              onOpenChange?.(false);
            }}
            className={cn(
              'inline-flex min-h-tap items-center justify-center rounded-lg border border-hair bg-surface px-4 text-sm text-ink',
              'transition-colors duration-micro ease-standard hover:bg-sunken disabled:pointer-events-none disabled:opacity-50',
              'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
            )}
          >
            {cancelText}
          </button>
          <button
            type="button"
            aria-busy={pending || undefined}
            disabled={pending}
            onClick={() => {
              void onConfirm();
            }}
            className={cn(
              'inline-flex min-h-tap items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium',
              'transition-[transform,opacity] duration-tap ease-standard active:scale-[.97]',
              'disabled:pointer-events-none disabled:opacity-60',
              'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
              confirmClasses,
            )}
          >
            {pending ? (
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 animate-spinner rounded-full border-2 border-current"
                style={{ borderTopColor: 'transparent' }}
              />
            ) : null}
            {confirmText}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ConfirmSheetWithRef = React.forwardRef(ConfirmSheet);
ConfirmSheetWithRef.displayName = 'ConfirmSheet';

export { ConfirmSheetWithRef as ConfirmSheet };
