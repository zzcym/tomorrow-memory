/* WebSocket 对话 + HITL interrupt 测试 */
export {};

import WebSocket from 'ws';

async function main(): Promise<void> {
  // 登录拿 token
  const phone = '135' + String(Date.now()).slice(-8);
  const login = await fetch('http://localhost:3001/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: '12345' }),
  });
  const { token } = (await login.json()) as { token: string };

  // 加两个单词
  await fetch('http://localhost:3001/api/wordbook', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data: [{ word: 'serendipity', addedAt: Date.now() }, { word: 'ephemeral', addedAt: Date.now() }] }),
  });

  const threadId = 'test-' + Date.now();
  const ws = new WebSocket(`ws://localhost:3001/ws?token=${encodeURIComponent(token)}&threadId=${threadId}`);

  const results: Array<{ name: string; ok: boolean }> = [];
  const check = (name: string, ok: boolean): void => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  };

  let step = 0;
  let gotChunks = false;
  let gotDone = false;
  let gotInterrupt = false;
  let gotResumeDone = false;

  ws.on('open', () => {
    // 1. 正常对话（learn 意图）
    ws.send(JSON.stringify({ type: 'message', text: '讲解一下 serendipity' }));
  });

  ws.on('message', (data: Buffer) => {
    const msg = JSON.parse(data.toString()) as Record<string, unknown>;
    if (msg.type === 'chunk') {
      gotChunks = gotChunks || typeof msg.text === 'string';
    } else if (msg.type === 'done') {
      if (step === 0) {
        gotDone = !!msg.response;
        check('WS message → done（含流式 chunk）', gotChunks && gotDone);
        step = 1;
        // 2. 意图模糊 → 触发 HITL interrupt
        ws.send(JSON.stringify({ type: 'message', text: '你好' }));
      } else if (step === 2) {
        gotResumeDone = !!msg.response;
        check('WS resume → 继续执行并完成', gotResumeDone);
        ws.close();
      }
    } else if (msg.type === 'interrupt') {
      if (step === 1) {
        gotInterrupt = typeof msg.question === 'string';
        check('WS interrupt（HITL 反问）', gotInterrupt);
        step = 2;
        // 3. 回答 → resume 继续
        ws.send(JSON.stringify({ type: 'resume', text: '查词' }));
      }
    } else if (msg.type === 'error') {
      console.log('WS error:', String(msg.error));
    }
  });

  ws.on('close', () => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
    process.exit(failed > 0 ? 1 : 0);
  });

  setTimeout(() => {
    console.log('TIMEOUT: 未收到预期消息');
    process.exit(1);
  }, 20000);
}

main().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
