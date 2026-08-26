/* tRPC 端到端测试（通过 HTTP 协议直接调用） */
export {};

const BASE = 'http://localhost:3001/trpc';

/** tRPC v11 HTTP 调用：query 用 GET，mutation 用 POST */
async function call<T>(
  path: string,
  input: unknown,
  token?: string,
  kind: 'query' | 'mutation' = 'mutation',
): Promise<{ data: T; error?: { message: string } }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const inputParam = encodeURIComponent(JSON.stringify({ '0': input }));
  const url = `${BASE}/${path}?batch=1&input=${inputParam}`;
  const resp =
    kind === 'query'
      ? await fetch(url, { method: 'GET', headers })
      : await fetch(url, { method: 'POST', headers, body: JSON.stringify({ '0': input }) });
  const json = (await resp.json()) as Array<{ result?: { data: T }; error?: { message: string } }>;
  const first = json[0];
  if (first?.error) return { data: undefined as never, error: first.error };
  return { data: first?.result?.data as T };
}

const results: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
}

// 1. 登录
const phone = '136' + String(Date.now()).slice(-8);
let token: string | undefined;
{
  const r = await call<{ token: string; phone: string }>('auth.login', { phone, code: '12345' });
  token = r.data?.token;
  check('auth.login', !!token && r.data.phone === phone, r.error?.message ?? '');
}

// 2. me
{
  const r = await call<{ phone: string }>('auth.me', {}, token, 'query');
  check('auth.me', r.data?.phone === phone, r.error?.message ?? '');
}

// 3. wordbook.add + list
{
  const add = await call<{ ok: boolean; added: boolean }>('wordbook.add', { word: 'serendipity' }, token);
  check('wordbook.add', add.data?.ok === true && add.data.added === true, add.error?.message ?? '');
  const add2 = await call<{ ok: boolean; added: boolean }>('wordbook.add', { word: 'ephemeral' }, token);
  check('wordbook.add (2nd)', add2.data?.added === true, add2.error?.message ?? '');
  const list = await call<Array<{ word: string }>>('wordbook.list', {}, token, 'query');
  check('wordbook.list', list.data?.length === 2 && list.data[0]?.word === 'serendipity', list.error?.message ?? '');
}

// 4. review.today
{
  const r = await call<{ total: number; dueToday: number; queue: unknown[] }>('review.today', {}, token, 'query');
  check('review.today', r.data?.total === 2 && Array.isArray(r.data.queue), r.error?.message ?? '');
}

// 5. review.reviewCard（FSRS 更新）
{
  const r = await call<{ ok: boolean; stabilityAfter: number }>('review.reviewCard', { word: 'serendipity', rating: 3 }, token);
  check('review.reviewCard', r.data?.ok === true && r.data.stabilityAfter > 0, r.error?.message ?? '');
}

// 6. checkin.status + create
{
  const st = await call<{ checkedIn: boolean; dailyGoal: number }>('checkin.status', {}, token, 'query');
  check('checkin.status', typeof st.data?.checkedIn === 'boolean' && st.data.dailyGoal === 10, st.error?.message ?? '');
  const ck = await call<{ ok: boolean; streak: number }>('checkin.create', {}, token);
  check('checkin.create', ck.data?.ok === true && ck.data.streak >= 1, ck.error?.message ?? '');
}

// 7. profile.get + update
{
  const pf = await call<{ totalWords: number; dailyGoal: number }>('profile.get', {}, token, 'query');
  check('profile.get', pf.data?.totalWords === 2, pf.error?.message ?? '');
  const up = await call<{ ok: boolean }>('profile.update', { nickname: '测试用户', dailyGoal: 20 }, token);
  check('profile.update', up.data?.ok === true, up.error?.message ?? '');
}

// 8. assessment.generate（5 题，从单词本选词）
{
  const r = await call<{ count: number; questions: unknown[] }>('assessment.generate', { count: 5 }, token);
  check('assessment.generate', r.data?.count === 2 && Array.isArray(r.data.questions), r.error?.message ?? `count=${r.data?.count}`);
}

// 9. assessment.submit（正确选项）
{
  const gen = await call<{ questions: Array<{ key: string; type: string; options?: string[]; answerIndex?: never }> }>(
    'assessment.generate',
    { count: 5 },
    token,
  );
  const q = gen.data?.questions[0];
  check('assessment.submit (prep)', !!q?.key, JSON.stringify(gen.error));
  if (q) {
    // 规则降级题 answerIndex=0，提交答案 0（正确）
    const r = await call<{ ok: boolean; correct: boolean; score: number; nextReview: string }>(
      'assessment.submit',
      { key: q.key, userAnswer: 0 },
      token,
    );
    check('assessment.submit (correct)', r.data?.ok === true && r.data.correct === true && r.data.score >= 1, r.error?.message ?? '');
  }
}

// 10. 未登录保护
{
  const r = await call('wordbook.list', {}, undefined, 'query');
  check('protected (no auth)', !!r.error, r.error?.message ?? '');
}

// 11. agent.chat（编排）
{
  const r = await call<{ intent: string; response: string }>('agent.chat', { input: '讲解一下 serendipity' }, token);
  check('agent.chat', r.data?.intent === 'learn' && !!r.data.response, r.error?.message ?? '');
}

const failed = results.filter((x) => !x.ok).length;
console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
process.exit(failed > 0 ? 1 : 0);
