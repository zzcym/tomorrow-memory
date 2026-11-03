declare function readFlag(k: string): string;
export function gate(next: () => void) {
  const on = readFlag('passwordUpgradeEnforce') === 'on';
  return on ? next() : undefined;
}

