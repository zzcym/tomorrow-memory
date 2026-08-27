'use client';

/**
 * AI 实时对话页面（WebSocket + LangGraph 编排）
 * - 消息列表 + 输入框
 * - 打字机效果（chunk 增量渲染）
 * - HITL：Agent 意图不明确时 interrupt 反问，用户回答后 resume 继续
 * - 会话历史（最多 20 轮）
 */

import * as React from 'react';
import { Bot, Send, User } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Markdown } from '@/components/markdown';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'interrupt';
  content: string;
  streaming?: boolean;
}

const WS_URL = '/ws';

export default function ChatPage(): React.JSX.Element {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState('');
  const [connected, setConnected] = React.useState(false);
  const [waiting, setWaiting] = React.useState(false);
  const [pendingInterrupt, setPendingInterrupt] = React.useState(false);
  const wsRef = React.useRef<WebSocket | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [threadId] = React.useState(() => `web-${Date.now()}`);

  const authed = !!getToken();

  const appendMessage = (msg: ChatMessage): void => {
    setMessages((prev) => [...prev, msg]);
  };

  const send = (text: string, type: 'message' | 'resume' = 'message'): void => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('连接未建立，请稍候');
      return;
    }
    appendMessage({ id: `u-${Date.now()}`, role: 'user', content: text });
    setInput('');
    setWaiting(true);
    if (type === 'resume') setPendingInterrupt(false);
    ws.send(JSON.stringify({ type, text }));
  };

  React.useEffect(() => {
    if (!authed) return;
    const token = getToken();
    if (!token) return;

    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}&threadId=${threadId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (msg.type === 'chunk') {
        const text = String(msg.text ?? '');
        // 打字机：累积到最新一条 assistant 消息
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            next[next.length - 1] = { ...last, content: last.content + text };
            return next;
          }
          next.push({ id: `a-${Date.now()}`, role: 'assistant', content: text, streaming: true });
          return next;
        });
      } else if (msg.type === 'done') {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            next[next.length - 1] = { ...last, streaming: false };
          }
          return next;
        });
        setWaiting(false);
      } else if (msg.type === 'interrupt') {
        const question = String(msg.question ?? '');
        appendMessage({ id: `i-${Date.now()}`, role: 'interrupt', content: question });
        setPendingInterrupt(true);
        setWaiting(false);
      } else if (msg.type === 'error') {
        toast.error(String(msg.error ?? '发生错误'));
        setWaiting(false);
      }
    };

    // 加载历史
    void (async () => {
      try {
        const r = await fetch(`/api/chat/history?threadId=${threadId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const j = (await r.json()) as { messages: Array<{ role: string; content: string }> };
          setMessages(
            j.messages.map((m, i) => ({
              id: `h-${i}`,
              role: m.role === 'user' ? 'user' : m.role === 'interrupt' ? 'interrupt' : 'assistant',
              content: m.content,
            })),
          );
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [authed, threadId]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  if (!authed) {
    return <p className="py-20 text-center text-muted-foreground">请先登录后开始对话。</p>;
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">AI 学习助手</h1>
        <Badge variant={connected ? 'default' : 'outline'} className="ml-auto">
          {connected ? '已连接' : '未连接'}
        </Badge>
      </div>
      <Separator />

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            可以试试：
            <br />
            「帮我查一下 abandon」
            <br />
            「给我讲讲 serendipity 怎么记」
            <br />
            「今天要复习什么」
            <br />
            「测一下我」
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`flex max-w-[80%] gap-2 ${
                m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  m.role === 'user' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div
                className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : m.role === 'interrupt'
                      ? 'border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'bg-muted'
                }`}
              >
                {m.role === 'assistant' ? (
                  <Markdown content={m.content} />
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
                {m.streaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-primary align-middle" />}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Separator />
      {/* 输入区 */}
      <div className="flex gap-2 pt-3">
        <Input
          placeholder={pendingInterrupt ? '回答 Agent 的问题…' : waiting ? 'AI 思考中…' : '输入消息…'}
          value={input}
          disabled={waiting && !pendingInterrupt}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim() && !(waiting && !pendingInterrupt)) {
              send(input.trim(), pendingInterrupt ? 'resume' : 'message');
            }
          }}
        />
        <Button
          disabled={!input.trim() || (waiting && !pendingInterrupt)}
          onClick={() => send(input.trim(), pendingInterrupt ? 'resume' : 'message')}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        支持：查词 · 教学讲解 · 复习调度 · 测评 · 学习分析；意图不明确时 AI 会反问确认
      </p>
    </div>
  );
}
