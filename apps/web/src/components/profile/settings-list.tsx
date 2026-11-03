'use client';

/**
 * 「我的」F 区 = 设置列表 + G 区 = 退出登录（§10.2 T-15 行 🆕`components/profile/settings-list.tsx` / UI §3.8.1 F/G）。
 *
 * §3.8.2 表把 `SettingRow` 列为 🆕`@tm/ui/patterns/SettingRow.tsx`，但该文件**未随批次2 交付**
 * （`patterns/` 只有 14 件、README 契约也只有那 14 件），而 `packages/**` 本轮禁改 ⇒
 * 行形态画在这里（`role="list"` / `role="listitem"`、行高 ≥56px、行间 `--hair`、末行不描边）。
 *
 * 行清单按 §3.8.1 F 的六行**扣掉本期 Web 没有落点的两行**：
 * - `每日提醒时间` —— `profile.update` 的入参只有 `nickname/avatar/daily_goal`，没有提醒字段，
 *   挂上去就是一颗点了没反应的控件（R-21 的提醒面属 App/T-19）。
 * - `我的查询历史` —— Web 没有该页，最近查询只在首页输入框下的 `RecentSearchPanel` 里。
 * 两行连同缺的字段已进 T-15 报告的「上游缺口」清单。
 *
 * 判据⑦：整区不出现任何"云端/本地/同步状态"式内部术语；G 区的退出必须二次确认（§3.8.6）。
 */

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { IDENTITY_LABELS, NICKNAME_MAX_LENGTH, SETTINGS_COPY, THEME_MODE_LABELS, VERBS, type ThemeMode } from '@tm/shared';
import { ConfirmSheet, Input, useHost, useThemeToggle } from '@tm/ui';
import { PROFILE_COPY, useNickname } from '@/lib/api/profile';

const ROW =
  'flex min-h-[56px] w-full items-center gap-3 px-1 text-left text-sm text-ink ' +
  'transition-colors duration-micro hover:bg-sunken active:scale-[0.99] ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:rounded-md';
const HAIR = 'divide-y divide-hair';

interface RowProps {
  title: string;
  hint?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
  testid?: string;
}

function Row({ title, hint, trailing, onClick, testid }: RowProps): React.JSX.Element {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {hint ? <span className="block truncate text-xs text-ink-muted">{hint}</span> : null}
      </span>
      {trailing}
    </>
  );
  return (
    <li role="listitem" data-testid={testid}>
      {onClick ? (
        <button type="button" onClick={onClick} className={ROW}>
          {inner}
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
        </button>
      ) : (
        <div className={ROW}>{inner}</div>
      )}
    </li>
  );
}

const NEXT_THEME: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' };

export interface SettingsListProps {
  nickname: string;
  /** R-40④/⑤：`pw_policy_version = 0` ⇒ 「修改密码」行挂待办点。 */
  needsPasswordUpgrade: boolean;
  onSecurity: () => void;
  onAbout: () => void;
  onSignOut: () => void;
}

export function SettingsList({ nickname, needsPasswordUpgrade, onSecurity, onAbout, onSignOut }: SettingsListProps): React.JSX.Element {
  const host = useHost();
  const { theme, setTheme } = useThemeToggle();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(nickname);
  const name = useNickname((message, tone) => host.toast(message, tone ?? 'info'));

  const commitNickname = (): void => {
    name.commit(draft);
    setEditing(false);
  };

  return (
    <>
      <ul role="list" aria-label={PROFILE_COPY.sectionStats} className={`${HAIR} mt-4 rounded-xl border border-hair bg-surface px-3`}>
        <Row
          title={PROFILE_COPY.nicknameRow}
          testid="profile-row-nickname"
          trailing={
            editing ? (
              <span className="flex items-center gap-2">
                <Input
                  autoFocus
                  value={draft}
                  maxLength={NICKNAME_MAX_LENGTH}
                  aria-label={IDENTITY_LABELS.nickname}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNickname();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  className="h-9 w-40 text-sm"
                />
                <button type="button" onClick={commitNickname} disabled={name.saving} className="min-h-tap rounded-md px-2 text-sm text-brand">
                  {PROFILE_COPY.nicknameSave}
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-ink-muted">
                {nickname || IDENTITY_LABELS.nickname}
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </span>
            )
          }
          onClick={
            editing
              ? undefined
              : () => {
                  setDraft(nickname);
                  setEditing(true);
                }
          }
        />
        <Row
          title={PROFILE_COPY.appearanceRow}
          testid="profile-row-appearance"
          onClick={() => setTheme(NEXT_THEME[theme])}
          trailing={<span className="text-sm text-ink-muted">{THEME_MODE_LABELS[theme]}</span>}
        />
        <Row
          title={PROFILE_COPY.securityRow}
          testid="profile-row-security"
          onClick={onSecurity}
          hint={needsPasswordUpgrade ? SETTINGS_COPY.upgradeTodo.entry : undefined}
          trailing={
            needsPasswordUpgrade ? (
              <span aria-hidden="true" data-testid="profile-row-security-dot" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
            ) : undefined
          }
        />
        <Row title={PROFILE_COPY.aboutRow} testid="profile-row-about" onClick={onAbout} />
      </ul>

      {name.failed ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {PROFILE_COPY.nicknameRow} · {VERBS.retryInline}
        </p>
      ) : null}

      <SignOut onConfirm={onSignOut} />
    </>
  );
}

/** G 区：单独一行危险色文字按钮，不混进 F 列表（§3.8.1 G），点击必过二次确认（§3.8.6）。 */
function SignOut({ onConfirm }: { onConfirm: () => void }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <div className="mt-6 mb-2 flex justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="profile-signout-trigger"
          className="inline-flex min-h-tap items-center rounded-md px-4 text-sm text-danger focus-visible:outline-2 focus-visible:outline-focus"
        >
          {VERBS.signOut}
        </button>
      </div>
      <ConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title={SETTINGS_COPY.signOut.title}
        description={SETTINGS_COPY.signOut.body}
        confirmText={SETTINGS_COPY.signOut.confirm}
        cancelText={SETTINGS_COPY.signOut.cancel}
        tone="danger"
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
        onCancel={() => setOpen(false)}
        testid="profile-signout"
      />
    </>
  );
}
