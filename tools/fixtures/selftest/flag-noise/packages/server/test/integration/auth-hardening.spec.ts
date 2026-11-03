// A-32-5 噪音 fixture（测试面）：夹具里 set/读该开关不是"运行时的第二处读点"。
// 旧口径把这两行算进读点数 → 门禁指向不存在的入口；新口径按 test/** 豁免。
declare function set(key: string, value: string): void;

beforeEach(() => {
  set('passwordUpgradeEnforce', 'on');
});

test('enforce on 时把旧哈希升级为argon2', async () => {
  expect(await import('../src/services/auth-service')).toBeTruthy();
  expect(process.env.PASSWORD_UPGRADE_ENFORCE).toBeUndefined();
});
