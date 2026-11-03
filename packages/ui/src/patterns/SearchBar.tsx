'use client';

/**
 * `SearchBar`（UI §3.1.5 / §3.2 / §3.3 / §3.6.3；判据⑤：对外暴露 `focus()`）。
 *
 * 零请求：本地过滤与提交全部经 props 交回宿主（R-07 ② / §3.5 `ui-no-io`）。
 * 最近查询面板走 `children` 插槽，`panelOpen === false` 时**整棵子树不渲染**（§3.3 硬判据）。
 */
import * as React from 'react';
import { SEARCH_PLACEHOLDER, VERBS, WORD_MAX_LENGTH } from '@tm/shared';
import { cn } from '../host.js';

export type SearchBarSize = 'hero' | 'list';

export interface SearchBarHandle {
  focus(): void;
  blur(): void;
  getInput(): HTMLInputElement | null;
}

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onClear?: () => void;
  size?: SearchBarSize;
  placeholder?: string;
  /** `sr-only` 字段名（§3.1.6：禁只靠 placeholder 表达字段含义）。文案真源在宿主/`@tm/shared`。 */
  label: string;
  submitLabel?: string;
  clearLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  panelOpen?: boolean;
  panelId?: string;
  children?: React.ReactNode;
  maxLength?: number;
  containerClassName?: string;
  className?: string;
  id?: string;
  testid?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

function SearchGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={cn('h-5 w-5 shrink-0', className)}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.4-3.4" />
    </svg>
  );
}

function CloseGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-5 w-5 shrink-0"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

const SearchBar = React.forwardRef<SearchBarHandle, SearchBarProps>(function SearchBar(
  {
    value,
    onChange,
    onSubmit,
    onClear,
    size = 'hero',
    placeholder = SEARCH_PLACEHOLDER,
    label,
    submitLabel = VERBS.query,
    clearLabel = VERBS.clear,
    busy = false,
    disabled = false,
    panelOpen = false,
    panelId,
    children,
    maxLength = WORD_MAX_LENGTH,
    containerClassName,
    className,
    id,
    testid,
    onFocus,
    onBlur,
    onKeyDown,
  },
  ref,
) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = id ? `${id}-label` : undefined;

  React.useImperativeHandle(
    ref,
    (): SearchBarHandle => ({
      focus() {
        inputRef.current?.focus();
        inputRef.current?.select();
      },
      blur() {
        inputRef.current?.blur();
      },
      getInput: () => inputRef.current,
    }),
    [],
  );

  const submit = React.useCallback((): void => {
    if (!value.trim() || disabled) return;
    onSubmit?.(value);
  }, [disabled, onSubmit, value]);

  const hero = size === 'hero';

  return (
    <div
      role="search"
      data-testid={testid}
      className={cn('relative', containerClassName)}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {/* I-02（a）案：胶囊容器改定位上下文，放大镜/按钮浮标与原 flex 逐像素等位
          （icon 16+border、按钮走 `right-0 pr-4 gap-2` 轨道），`<input>` 铺满容器 padding-box
          （`absolute inset-0`）⇒ 焦点环仍真实挂在 input 上（⛔ 隐藏/⛔ 压掉，见闸 focus-ring-not-hidden），但盒型与
          胶囊对齐、环走同档圆角、offset 收到 0 贴边 ⇒ 读起来就是胶囊外圈一整圈。
          容器上竞争的 `focus-within:border-brand` 收掉（只留底面/辉光），做到「只有一圈」。
          垂直居中走 `inset-y-0 my-auto`（⛔ -translate-y-1/2：busy 环的 spin 关键帧自带 transform 会打架）。 */}
      <div
        className={cn(
          'relative border border-transparent bg-sunken text-ink',
          'transition-colors duration-micro ease-standard',
          'focus-within:bg-surface focus-within:shadow-elev-brand',
          hero ? 'h-search rounded-full' : 'h-tap rounded-lg',
          disabled && 'opacity-50',
          className,
        )}
      >
        {busy ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-4 my-auto h-4 w-4 shrink-0 animate-spinner rounded-full border-2 border-brand border-t-transparent"
          />
        ) : (
          <SearchGlyph className="absolute inset-y-0 left-4 my-auto text-ink-muted" />
        )}
        <input
          ref={inputRef}
          id={id}
          type="search"
          role="combobox"
          aria-expanded={panelOpen}
          aria-controls={panelId}
          aria-autocomplete="list"
          aria-labelledby={listId}
          autoComplete="off"
          inputMode="search"
          disabled={disabled}
          maxLength={maxLength}
          value={value}
          placeholder={placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onClear?.();
            }
          }}
          className={cn(
            'absolute inset-0 bg-transparent text-body text-ink',
            hero ? 'rounded-full' : 'rounded-lg',
            'pl-11',
            /* 文字右界 = 按钮轨道左缘再收 8px 缝（tap 44 + pad 16 + gap 8；清除键在时 ×2 键位）。 */
            value.length > 0
              ? 'pr-[calc(var(--tap)*2+var(--sp-4)+var(--sp-2)*2)]'
              : 'pr-[calc(var(--tap)+var(--sp-4)+var(--sp-2))]',
            'placeholder:text-ink-muted',
            'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-0',
            'disabled:cursor-not-allowed',
          )}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-2 pr-4">
          {value.length > 0 ? (
            <button
              type="button"
              aria-label={clearLabel}
              onClick={() => {
                onClear?.();
                inputRef.current?.focus();
              }}
              className={cn(
                'pointer-events-auto inline-flex h-tap w-tap shrink-0 items-center justify-center rounded-full',
                'text-ink-muted transition-colors duration-micro ease-standard',
                'hover:text-ink active:scale-[.94] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
              )}
            >
              <CloseGlyph />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={submitLabel}
            disabled={!value.trim() || disabled}
            onClick={submit}
            className={cn(
              'pointer-events-auto inline-flex h-tap w-tap shrink-0 items-center justify-center rounded-full',
              'text-ink-muted transition-colors duration-micro ease-standard',
              'hover:text-ink active:scale-[.94] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
              'disabled:opacity-50',
            )}
          >
            <SearchGlyph />
          </button>
        </div>
      </div>
      {panelOpen ? (
        <div
          id={panelId}
          className={cn('absolute inset-x-0 top-full mt-2 z-pop', !children && 'hidden')}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
});

export { SearchBar };
