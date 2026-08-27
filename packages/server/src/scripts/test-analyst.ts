/* Phase 5 测试：analyst.report + 事件采集 */
export {};

const BASE = 'http://localhost:3001/trpc';

async function call<T>(
  path: string,
  input: unknown,
  token?: string,
  kind: 'query' | 'mutation' = 'mutation',
): Promise<{ data: T; error?: { message: string } }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const inputParam = encodeURIComponent(JSON.stringify({ 0: input }));
  const url = `${BASE}/${path}?batch=1&input=${inputParam}`;
  const resp =
    kind === 'query'
      ? await fetch(url, { method: 'GET', headers })
      : await fetch(url, { method: 'POST', headers, body: JSON.stringify({ 0: input }) });
  const json = (await resp.json()) as Array<{ result?: { data: T }; error?: { message: string } }>;
  const first = json[0];
  if (first?.error) return { data: undefined as never, error: first.error };
  return { data: first?.result?.data as T };
}

const results: Array<{ name: string; ok: boolean }> = [];
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
};

// 1. 登录 + 加词
const phone = '133' + String(Date.now()).slice(-8);
const login = await call<{ token: string }>('auth.login', { phone, code: '12345' });
const token = login.data?.token;
check('auth.login', !!token, login.error?.message ?? '');

if (token) {
  await call('wordbook.add', { word: 'serendipity' }, token);
  await call('wordbook.add', { word: 'ephemeral' }, token);
  await call('wordbook.add', { word: 'resilient' }, token);
  // 触发复习事件
  await call('review.reviewCard', { word: 'serendipity', rating: 3 }, token);
  // 触发测评事件
  const gen = await call<{ questions: Array<{ key: string }> }>('assessment.generate', { count: 5 }, token);
  const q = gen.data?.questions[0];
  if (q) {
    await call('assessment.submit', { key: q.key, userAnswer: 0 }, token);
  }
  // 打卡事件
  await call('checkin.create', {}, token);

  // 2. analyst.report（图表数据 + 洞察，DB 降级路径）
  const report = await call<{
    dataset: { growthCurve: unknown[]; forgettingCurve: unknown[]; cefrDistribution: unknown[]; source: string };
    insights: Array<{ type: string; text: string }>;
    cached: boolean;
  }>('analyst.report', { period: '30d' }, token, 'query');
  const d = report.data;
  check('analyst.report 数据', !!d && Array.isArray(d.dataset.growthCurve) && d.dataset.growthCurve.length > 0, report.error?.message ?? '');
  check('analyst.report 洞察', !!d && d.insights.length >= 1, `insights=${d?.insights.length}`);
  check('analyst.report 来源', d?.dataset.source === 'db-fallback', `source=${d?.dataset.source}`);

  // 3. 洞察缓存命中（第二次调用 cached=true）
  const report2 = await call<{ cached: boolean }>('analyst.report', { period: '30d' }, token, 'query');
  check('analyst.report 缓存命中', report2.data?.cached === true, `cached=${report2.data?.cached}`);

  // 4. /api/lookup 触发 lookup 事件（REST）
  await fetch('http://localhost:3001/api/lookup?word=hello');
}

const failed = results.filter((x) => !x.ok).length;
console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
process.exit(failed > 0 ? 1 : 0);
