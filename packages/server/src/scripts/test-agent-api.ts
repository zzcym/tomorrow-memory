/* Agent API 集成测试 */
export {};

const BASE = 'http://localhost:3001';

async function login(): Promise<string> {
  const phone = '137' + String(Date.now()).slice(-8);
  const r = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: '12345' }),
  });
  const j = (await r.json()) as { token: string };
  return j.token;
}

async function call(token: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const resp = await fetch(BASE + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await resp.json();
  } catch {
    /* ignore */
  }
  return { status: resp.status, json };
}

const results: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean): void {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

const token = await login();
check('登录', !!token);

// 1. 先存两个单词
await call(token, '/api/wordbook', {
  data: [{ word: 'serendipity', addedAt: Date.now() }, { word: 'ephemeral', addedAt: Date.now() }],
});

// 2. /api/agent 完整编排（lookup）
{
  const r = await call(token, '/api/agent', { input: '查一下 serendipity 的意思' });
  const j = r.json as { intent?: string; response?: string; error?: string };
  check('/api/agent lookup', r.status === 200 && j.intent === 'lookup' && !!j.response && !j.error);
}

// 3. /api/agent 教学
{
  const r = await call(token, '/api/agent', { input: '讲解一下 ephemeral' });
  const j = r.json as { intent?: string; tutorContent?: { mnemonic?: string } };
  check('/api/agent learn', r.status === 200 && j.intent === 'learn' && !!j.tutorContent?.mnemonic);
}

// 4. /api/tutor 便捷接口
{
  const resp = await fetch(BASE + '/api/tutor?word=serendipity&level=B1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = (await resp.json()) as { word?: string; content?: { wordRoot?: string } };
  check('/api/tutor', resp.status === 200 && j.word === 'serendipity' && !!j.content?.wordRoot);
}

// 5. /api/review/today
{
  const r = await call(token, '/api/review/today');
  const j = r.json as { total?: number; dueToday?: number; queue?: unknown[] };
  check('/api/review/today', r.status === 200 && typeof j.total === 'number' && Array.isArray(j.queue));
}

// 6. /api/review 评分更新
{
  const r = await call(token, '/api/review', { word: 'serendipity', rating: 4 });
  const j = r.json as { ok?: boolean; response?: string };
  check('/api/review', r.status === 200 && j.ok === true && /稳定性/.test(j.response ?? ''));
}

// 7. /api/agent/stream SSE
{
  const resp = await fetch(BASE + '/api/agent/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ input: '讲解一下 serendipity' }),
  });
  const text = await resp.text();
  check('/api/agent/stream SSE', resp.status === 200 && text.includes('event: static') && text.includes('event: done'));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
process.exit(failed > 0 ? 1 : 0);
