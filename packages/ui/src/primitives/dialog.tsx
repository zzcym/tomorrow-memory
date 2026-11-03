'use client';

/** Dialog（原件 apps/web/src/components/ui/dialog.tsx；UI §3.11.2 + §1.10 层级 + §5.2 遮罩）。 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../host.js';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

/** 遮罩：浅 `--ink/45`、深纯黑 .6（UI §5.2 末条 = §5.5 允许的三个深色例外之一）。 */
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-mask bg-ink/45 dark:bg-black/60 animate-fade-in', className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * 桌面居中对话框：`w-[min(92vw,440px)] p-6 rounded-lg` + `--elev-2`（UI §3.11.2）。
 *
 * ## F-24 的真因（两条独立因；T-16r5b 实测，A-68 第 192 条）
 * 因一：面板内容真高于视口时缺滚动路径 ⇒ 件 1 用「弹层高度上限 + `overflow-y-auto
 * overscroll-contain`」补上（保留，与动效无关）。那颗上限本轮收成 token
 * `--dialog-max-h`（UI §3.11.2 的 4C）：常青内核解析为满格真实视口高（与替换前的旧写法
 * 逐字同值），Chrome 84 走 `@supports` 之外的兜底值，App 宿主再覆写为每侧留距 24px。
 * 因二：这颗面板用 `translate-x-[-50%] translate-y-[-50%]` 做居中，Tailwind v3.4 把这两颗
 * 工具类编译成 `transform: translate(var(--tw-translate-x), var(--tw-translate-y)) …`（构建
 * 产物 `.next/static/css/*.css` 可查）。§3.11.2 原入场动效 `animate-fade-in-up` 的关键帧写的
 * 是**完整 `transform`**（`translateY(8px)` → `translateY(0)`，不含居中量），而 CSS 动画声明的
 * 层叠优先级**高于普通作者声明**且 `animation-fill-mode: both` **持久**填充 ⇒ 工具类的
 * `transform` 被整体覆盖且不还原，居中永久失效、面板被推到视口外
 * （375×667 注册态实测：`transform: matrix(1,0,0,1,0,8)`、`rect.bottom 975.33`）。
 *
 * ## 现状（T-13r 正交化，替代上一轮「弃位移换 fade-in」的临时处置）
 * 入场动效换成对话框专用的 `animate-dialog-in`：关键帧在 0% 与 100% **两个端点都带上居中量**
 * ——经由 Tailwind 自己的 `--tw-translate-x/y` 变量转写（对本颗默认即 -50%/-50%），8px 位移
 * 只叠加在 y 上（0% = translate(var(--tw-translate-x), calc(var(--tw-translate-y) + 8px))，
 * 100% = translate(var(--tw-translate-x), var(--tw-translate-y))）。动画持有 `transform`
 * 也无妨——它的端点计算值与工具类居中态**逐字同值** ⇒ §3.11.2「面板上移 8px 淡入」恢复，
 * 居中不再被覆盖；端点走变量而非写死 -50%，是为了让 `more-menu.tsx` 的
 * `translate-x-0 translate-y-0` 覆写面（右上下拉/右侧抽屉）继续成立。`fade-in-up` 本体不改
 * （另有 4 处别处消费者），`animate-sheet-in`（底部抽屉，不吃 transform 居中）不涉此冲突。
 * 三条历史备选的取舍不变：`inset-0 m-auto`（改成 margin 居中会外溢到 `more-menu.tsx` 的
 * `right-3 top-14` 覆写面）、CSS `translate` 独立属性（会外溢到 `more-menu.tsx` 的
 * `translate-x-0 translate-y-0` 覆写面）、`animation-composition: add`（要 Chrome 115+，
 * App 侧红线是 Chrome 84）—— 三条都动到本文件对外的**覆写契约**，均不采。
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /**
     * 右上角 X 关闭按钮。**默认 false**：原件（`apps/web`）没有这颗按钮，而 §10.4 要求
     * 存量页面的非 import 行零变更 → 不擅自给 14 个在用的对话框加控件。
     * 需要时（强制改密形态 R-40 ④ 反过来传 false）由调用方显式打开。
     */
    showClose?: boolean;
    /**
     * `showClose` 时关闭按钮的可访问名。文案唯一真源在 `@tm/shared/constants/copy`
     * （§8.2-14），故包内不自带中文字面量，由调用方传入。
     */
    closeLabel?: string;
  }
>(({ className, children, showClose = false, closeLabel, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-dialog grid max-h-dialog w-[min(92vw,440px)] max-w-auth translate-x-[-50%] translate-y-[-50%] gap-3 overflow-y-auto overscroll-contain rounded-lg border border-hair bg-surface p-6 text-ink shadow-elev-2 animate-dialog-in',
        className,
      )}
      {...props}
    >
      {children}
      {showClose ? (
        <DialogPrimitive.Close className="absolute right-3 top-3 z-base inline-flex h-tap w-tap items-center justify-center rounded-md opacity-70 transition-opacity duration-micro ease-standard hover:opacity-100 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-5 w-5"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          <span className="sr-only">{closeLabel}</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-h2 font-bold leading-tight tracking-tight text-ink', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm leading-relaxed text-ink-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
