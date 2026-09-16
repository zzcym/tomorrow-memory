/** api.js 白盒单测:node tests/api.test.mjs
 *  stub localStorage/fetch 后直接驱动 API 层逻辑(队列合并/401/缓存/最近查词)。
 *  需本地服务端:DB_DRIVER=sqlite AUTH_DEV_MASTER_CODE=12345(pnpm --filter @tm/server start)
 */
const BASE = process.env.TM_BASE || 'http://127.0.0.1:3001';

// ---- stubs(在 import api.js 前注入) ----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.window = { __API_BASE__: BASE };
let fetchCalls = [];
const realFetch = globalThis.fetch;
function resetFetch(handler) {
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url: String(url), opts });
    if (handler) return handler(url, opts);
    return realFetch(url, opts);
  };
}
globalThis.window.AndroidBridge = { saveToken: () => {} };

const { createRequire } = await import('module');
const require2 = createRequire(import.meta.url);
const API = require2('../assets/api.js');

let pass = 0, fail = 0;
function eq(a, b, label) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) pass++;
  else { fail++; console.error(`✗ ${label}\n  期望 ${y}\n  实际 ${x}`); }
}
function ok(cond, label) { cond ? pass++ : (fail++, console.error('✗ ' + label)); }

// ---- 1. 登录与 token 管理 ----
const login = await API.login('13800138000', '12345');
ok(login.token && login.token.split('.').length === 3, '登录返回 JWT');
API.setAuth(login.token, login.phone, '');
eq(API.getAuth().token, login.token, 'token 已入 localStorage');
ok(store.has('tm.token'), 'token 已写 localStorage');

// ---- 2. 查词 + 缓存 ----
const r1 = await API.lookup('hello');
ok(r1.data && r1.data.translation, '查词返回释义');
// 离线场景:onLine=false 且无网络,应回落缓存而非报错
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
resetFetch(() => { throw new Error('离线不应发起网络请求'); });
const r2 = await API.lookup('hello');
ok(r2.cached === true && r2.data.word === 'hello', '离线查词回落缓存');
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
resetFetch(null);
const cached = API.lookupCache('hello');
ok(cached && cached.word === 'hello', 'lookupCache 命中');

// ---- 3. 最近查词 ----
API.recentAdd('hello', 'interj. 喂');
API.recentAdd('world', 'n. 世界');
eq(API.recentList().map((x) => x.word), ['world', 'hello'], '最近查词置顶去重');
API.recentClear();
eq(API.recentList(), [], '清空最近查词');

// ---- 4. 单词本离线队列:断网本地加词 → 恢复后同步合并 ----
API.wbLocalAdd('apple');
API.wbLocalAdd('banana');
resetFetch((url, opts) => {
  if (String(url).includes('/api/wordbook')) throw Object.assign(new Error('offline'), { code: 'NETWORK' });
  return realFetch(url, opts);
});
await API.wbSync().catch(() => {}); // 断网:队列保留
eq(API.wbQueue().length, 2, '断网后队列保留 2 条');
resetFetch(null); // 恢复网络
const list = await API.wbSync();
ok(list.some((x) => x.word === 'apple') && list.some((x) => x.word === 'banana'), '恢复网络后 apple/banana 已同步到服务端');
eq(API.wbQueue().length, 0, '同步成功后队列清空');
// 服务端真有数据(双查验证)
resetFetch(null);
const remote = await (await realFetch(BASE + '/api/wordbook', { headers: { Authorization: 'Bearer ' + login.token } })).json();
ok(remote.data.some((x) => x.word === 'apple'), '服务端确实收到 apple(数据保存链路)');

// ---- 5. remove 操作合并 ----
API.wbLocalRemove('apple');
await API.wbSync();
const remote2 = await (await realFetch(BASE + '/api/wordbook', { headers: { Authorization: 'Bearer ' + login.token } })).json();
ok(!remote2.data.some((x) => x.word === 'apple') && remote2.data.some((x) => x.word === 'banana'), 'remove 同步:apple 删 banana 留');

// ---- 5b. B1 竞态回归:PUT 慢窗口内新加词不能被清队列吞掉 ----
API.wbLocalAdd('kiwi');
let putGate;
const putGatePromise = new Promise((res) => { putGate = res; });
resetFetch((url, opts) => {
  if (String(url).includes('/api/wordbook') && opts && opts.method === 'PUT') {
    return putGatePromise.then(() => realFetch(url, opts)); // 挂住 PUT,模拟慢网
  }
  return realFetch(url, opts);
});
const slowSync = API.wbSync(); // 同步进行中(PUT 被挂住)
await new Promise((r) => setTimeout(r, 50));
API.wbLocalAdd('durian');      // 窗口期内用户加词
putGate();                     // 放行 PUT
await putGatePromise;
await slowSync;
// 修复语义:窗口期 durian 不能丢——要么仍在队列(待自愈),要么已被自愈同步上云
const durianSafe = API.wbQueue().some((x) => x.word === 'durian')
  || API.wbCache().some((x) => x.word === 'durian');
ok(durianSafe, '竞态:窗口期加词不丢失(B1)');

// ---- 5c. R1 回归:PUT 窗口内"同词翻转"(加后又删)不能被回滚 ----
API.wbLocalAdd('papaya');
let gate2;
const gate2p = new Promise((res) => { gate2 = res; });
resetFetch((url, opts) => {
  if (String(url).includes('/api/wordbook') && opts && opts.method === 'PUT') {
    return gate2p.then(() => realFetch(url, opts));
  }
  return realFetch(url, opts);
});
const slow2 = API.wbSync();
await new Promise((r) => setTimeout(r, 50));
API.wbLocalRemove('papaya');   // 窗口期内翻转:删除必须生效
gate2();
await slow2;
resetFetch(null);
await API.wbSync();
const remoteR1 = await (await realFetch(BASE + '/api/wordbook', { headers: { Authorization: 'Bearer ' + login.token } })).json();
ok(!remoteR1.data.some((x) => x.word === 'papaya'), 'R1:同词翻转后服务端无 papaya(删除生效)');
eq(API.wbQueue().length, 0, 'R1:翻转同步后队列清空');
resetFetch(null);
await API.wbSync();            // 自愈重同步
const remoteB1 = await (await realFetch(BASE + '/api/wordbook', { headers: { Authorization: 'Bearer ' + login.token } })).json();
ok(remoteB1.data.some((x) => x.word === 'durian'), '竞态:durian 最终同步到服务端');
eq(API.wbQueue().length, 0, '竞态:自愈后队列清空');

// ---- 6. clear 操作 ----
API.wbLocalAdd('cherry');
await API.wbSync();
API.wbLocalClear();
await API.wbSync();
const remote3 = await (await realFetch(BASE + '/api/wordbook', { headers: { Authorization: 'Bearer ' + login.token } })).json();
eq(remote3.data.length, 0, 'clear 同步后服务端为空');

// ---- 7. 401 处理:伪造 token → 触发 on401 并清 storage ----
let loggedOut = false;
API.setOn401(() => { loggedOut = true; });
API.setAuth('bad.token.here', '13800138000', '');
resetFetch((url) => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
let caught = null;
await API.reviewToday().catch((e) => { caught = e; });
ok(caught && /过期/.test(caught.message), '401 抛出登录过期');
ok(loggedOut, 'on401 回调触发');
eq(API.getAuth().token, '', '401 后本地 token 清空');
resetFetch(null);

// ---- 8. 复习契约:评分 1-4 ----
API.setAuth(login.token, '13800138000', '');
const today = await API.reviewToday();
ok(typeof today.total === 'number' && Array.isArray(today.queue), 'review/today 契约形状');
const bad = await realFetch(BASE + '/api/review', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
  body: JSON.stringify({ word: 'apple', rating: 5 }),
});
eq(bad.status, 400, 'rating=5 被服务端拒绝(400)');

console.log(`\n白盒结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
