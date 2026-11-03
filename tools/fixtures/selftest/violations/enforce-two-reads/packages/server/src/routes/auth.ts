declare const flags: Record<string, string>;
export const enforceNow = () => Boolean(flags.passwordUpgradeEnforce);

