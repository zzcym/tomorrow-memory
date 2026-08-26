/* 冒烟测试：验证新 Hono 服务与旧 Express API 的兼容性 */
export {};

const BASE = 'http://localhost:3001';

interface TestResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function req(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const resp = await fetch(BASE + path, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await resp.json()) as Record<string, unknown>;
  } catch {
    // 非 JSON 响应（如 404 页面）时 json 保持 null
  }
  return { status: resp.status, json };
}

const results: TestResult[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
}

// 1. 静态页面
{
  const r = await fetch(BASE + '/');
  check('GET / (index.html)', r.status === 200 && (await r.text()).includes('<!DOCTYPE'), `status=${r.status}`);
}
{
  const r = await fetch(BASE + '/admin');
  const text = await r.text();
  check('GET /admin', r.status === 200 && text.includes('admin'), `status=${r.status}`);
}

// 2. 登录（万能验证码 12345 自动注册）
const phone = '139' + String(Date.now()).slice(-8);
let token: string | undefined;
{
  const r = await req('POST', '/api/login', { body: { phone, code: '12345' } });
  token = typeof r.json?.token === 'string' ? r.json.token : undefined;
  check(
    'POST /api/login',
    r.status === 200 && !!token && r.json?.phone === phone,
    `status=${r.status} hasPassword=${String(r.json?.hasPassword)}`,
  );
}

// 3. 单词本
{
  const data = [{ word: 'hello', addedAt: Date.now() }, { word: 'world', addedAt: Date.now() }];
  const put = await req('PUT', '/api/wordbook', { token, body: { data } });
  check('PUT /api/wordbook', put.status === 200 && put.json?.ok === true, `status=${put.status}`);
  const get = await req('GET', '/api/wordbook', { token });
  const wbData = Array.isArray(get.json?.data) ? (get.json.data as Array<Record<string, unknown>>) : [];
  check(
    'GET /api/wordbook',
    get.status === 200 && wbData.length === 2 && wbData[0]?.word === 'hello',
    `status=${get.status}`,
  );
}

// 4. 打卡
{
  const st = await req('GET', '/api/checkin/status', { token });
  check(
    'GET /api/checkin/status',
    st.status === 200 && typeof st.json?.checkedIn === 'boolean' && st.json?.dailyGoal === 10,
    `status=${st.status}`,
  );
  const ck = await req('POST', '/api/checkin', { token });
  check('POST /api/checkin', ck.status === 200 && ck.json?.ok === true && Number(ck.json?.streak) >= 1, `streak=${String(ck.json?.streak)}`);
}

// 5. 个人主页
{
  const pf = await req('GET', '/api/profile', { token });
  check(
    'GET /api/profile',
    pf.status === 200 && Number(pf.json?.totalWords) === 2 && Number(pf.json?.reviewDays) >= 1,
    `status=${pf.status} totalWords=${String(pf.json?.totalWords)}`,
  );
  const put = await req('PUT', '/api/profile', { token, body: { nickname: '测试用户', daily_goal: 20 } });
  check('PUT /api/profile', put.status === 200, `status=${put.status}`);
}

// 6. /api/me
{
  const me = await req('GET', '/api/me', { token });
  check('GET /api/me', me.status === 200 && me.json?.phone === phone && me.json?.nickname === '测试用户', `status=${me.status}`);
}

// 7. 改密码 + 密码登录
{
  const pw = await req('PUT', '/api/password', { token, body: { password: 'abcd1234' } });
  check('PUT /api/password', pw.status === 200, `status=${pw.status}`);
  const login = await req('POST', '/api/login', { body: { phone, password: 'abcd1234' } });
  check('POST /api/login (password)', login.status === 200 && !!login.json?.token, `status=${login.status}`);
}

// 8. 管理后台
{
  const bad = await req('POST', '/api/admin/login', { body: { password: 'wrong' } });
  check('POST /api/admin/login (wrong)', bad.status === 401, `status=${bad.status}`);
  const good = await req('POST', '/api/admin/login', { body: { password: 'admin888' } });
  const adminToken = typeof good.json?.token === 'string' ? good.json.token : undefined;
  check('POST /api/admin/login', good.status === 200 && !!adminToken, `status=${good.status}`);
  const stats = await req('GET', '/api/admin/stats', { token: adminToken });
  check('GET /api/admin/stats', stats.status === 200 && typeof stats.json?.totalUsers === 'number', `status=${stats.status}`);
  const users = await req('GET', '/api/admin/users?page=1&pageSize=5', { token: adminToken });
  check('GET /api/admin/users', users.status === 200 && Array.isArray(users.json?.users), `status=${users.status}`);
}

// 9. zh2en 查词
{
  const r = await req('GET', '/api/lookup?word=' + encodeURIComponent('苹果') + '&direction=zh2en');
  const zhResults = Array.isArray(r.json?.results) ? (r.json.results as unknown[]) : [];
  check(
    'GET /api/lookup zh2en',
    r.status === 200 && r.json?.sourceLang === 'zh' && zhResults.length > 0,
    `status=${r.status} results=${zhResults.length}`,
  );
}

// 10. 认证保护
{
  const r = await req('GET', '/api/wordbook');
  check('GET /api/wordbook (no auth)', r.status === 401, `status=${r.status}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
process.exit(failed > 0 ? 1 : 0);
