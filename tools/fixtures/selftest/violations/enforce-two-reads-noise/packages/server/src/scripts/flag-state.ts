// A-32-5 噪音 fixture（取证脚本面）：src/scripts/** 是离线取证/体检脚本，不算业务运行时读点。
declare function readFlag(key: string): string;

export function reportFlagState() {
  return { enforce: readFlag('passwordUpgradeEnforce') };
}
