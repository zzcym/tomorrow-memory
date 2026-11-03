/**
 * auth 表单族出口（T-13；UI §3.9 / R-01⑤、R-39、R-40、R-23④⑤）。
 *
 * 七件套：壳（两态一壳 + 激活认领文案态）、协议勾选、强度条、验证码 12px 入口、
 * 提示卡/告知条、改密表单、强制改密页。根出口 `src/index.ts` 已再导出本文件。
 */
export * from './NoticeBar.js';
export * from './PasswordStrength.js';
export * from './AgreementCheckbox.js';
export * from './SmsCodeEntry.js';
export * from './AuthFormShell.js';
export * from './ChangePasswordForm.js';
export * from './ForcePasswordUpgradeForm.js';
