'use client';

/**
 * 自适应测评页面
 * - 题型：选择题 / 填空题 / 拼写题
 * - 进度：当前第 N 题 / 共 M 题
 * - 结束页：正确率、用时、掌握度变化、复习数量变化
 */

import * as React from 'react';
import { Check, Clock, Lightbulb, Volume2, X } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuthed } from '@/lib/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface GeneratedQuestion {
  key: string;
  type: 'choice' | 'fill' | 'spelling';
  word: string;
  prompt?: string;
  options?: string[];
  sentence?: string;
  hint?: string;
  phonetic?: string;
  definition?: string;
  difficulty: number;
}

interface SubmitResult {
  ok: boolean;
  word: string;
  correct: boolean;
  score: number;
  scoreLabel: string;
  correctAnswer: string;
  explanation: string;
  stabilityBefore: number;
  stabilityAfter: number;
  difficulty: number;
  nextReview: string;
}

interface AssessmentState {
  phase: 'idle' | 'loading' | 'testing' | 'finished';
  questions: GeneratedQuestion[];
  index: number;
  results: SubmitResult[];
  startTime: number;
}

export default function AssessPage(): React.JSX.Element {
  const [state, setState] = React.useState<AssessmentState>({
    phase: 'idle',
    questions: [],
    index: 0,
    results: [],
    startTime: 0,
  });
  // 当前题的作答状态
  const [selected, setSelected] = React.useState<number | null>(null);
  const [fillText, setFillText] = React.useState('');
  const [showHint, setShowHint] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<SubmitResult | null>(null);

  const authed = useAuthed();
  const utils = trpc.useUtils();
  const generate = trpc.assessment.generate.useMutation({
    onMutate: () => {
      // 立即进入 loading 相位：显示"生成题目中…"并禁用按钮（防连点重复生成）
      setState((s) => ({ ...s, phase: 'loading' }));
    },
    onSuccess: (data) => {
      setState({
        phase: 'testing',
        questions: data.questions as GeneratedQuestion[],
        index: 0,
        results: [],
        startTime: Date.now(),
      });
      setSelected(null);
      setFillText('');
      setShowHint(false);
      setLastResult(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setState((s) => ({ ...s, phase: 'idle' }));
    },
  });
  const submit = trpc.assessment.submit.useMutation({
    onSuccess: (result) => {
      const r = result as SubmitResult;
      setLastResult(r);
      setSubmitting(false);
      setState((s) => ({ ...s, results: [...s.results, r] }));
      void utils.review.today.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
      setSubmitting(false);
    },
  });

  const current = state.questions[state.index];

  const nextQuestion = (): void => {
    setSelected(null);
    setFillText('');
    setShowHint(false);
    setLastResult(null);
    if (state.index + 1 >= state.questions.length) {
      setState((s) => ({ ...s, phase: 'finished' }));
    } else {
      setState((s) => ({ ...s, index: s.index + 1 }));
    }
  };

  const submitAnswer = (): void => {
    if (!current) return;
    setSubmitting(true);
    let userAnswer: string | number;
    if (current.type === 'choice') {
      if (selected === null) {
        toast.error('请选择一个选项');
        setSubmitting(false);
        return;
      }
      userAnswer = selected;
    } else {
      if (!fillText.trim()) {
        toast.error('请输入答案');
        setSubmitting(false);
        return;
      }
      userAnswer = fillText.trim();
    }
    submit.mutate({
      key: current.key,
      userAnswer,
      hesitated: false,
      modified: false,
    });
  };

  const speak = (text: string): void => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  };

  if (!authed) {
    return <p className="py-20 text-center text-muted-foreground">请先登录后开始测评。</p>;
  }

  // ===== 结束页 =====
  if (state.phase === 'finished') {
    const correct = state.results.filter((r) => r.correct).length;
    // 0 题时避免 0/0 → NaN%
    const rate = state.results.length > 0 ? Math.round((correct / state.results.length) * 100) : 0;
    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    const avgScore = state.results.reduce((s, r) => s + r.score, 0) / Math.max(1, state.results.length);
    const masteryDelta = state.results.reduce((s, r) => s + (r.stabilityAfter - r.stabilityBefore), 0);
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-2xl">测评完成！</CardTitle>
            <CardDescription className="text-center">{state.questions.length} 道题 · 用时 {elapsed}s</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold text-primary">{rate}%</p>
                <p className="text-xs text-muted-foreground">正确率（{correct}/{state.results.length}）</p>
              </div>
              <div>
                <p className="text-3xl font-bold">{avgScore.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">平均分（1-5）</p>
              </div>
              <div>
                <p className={`text-3xl font-bold ${masteryDelta >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {masteryDelta >= 0 ? '+' : ''}{masteryDelta.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">掌握度变化（S）</p>
              </div>
            </div>
            <Button className="w-full" onClick={() => generate.mutate({ count: 5 })} disabled={generate.isPending}>
              {generate.isPending ? '生成题目中…' : '再来一轮'}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setState((s) => ({ ...s, phase: 'idle' }))}>
              返回
            </Button>
          </CardContent>
        </Card>
        <div className="h-8" />
      </div>
    );
  }

  // ===== 开始页 =====
  if (state.phase === 'idle' || state.phase === 'loading') {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Card>
          <CardHeader>
            <CardTitle>自适应测评</CardTitle>
            <CardDescription>从今日待复习单词中生成 5-10 道题，按你的掌握程度调整难度</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="lg"
              className="w-full"
              disabled={state.phase === 'loading'}
              onClick={() => generate.mutate({ count: 5 })}
            >
              {state.phase === 'loading' ? '生成题目中…' : '开始测评'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== 答题中 =====
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <Badge variant="secondary">
            第 {state.index + 1} 题 / 共 {state.questions.length} 题
          </Badge>
          <Badge variant="outline">
            {(current?.difficulty ?? 5) < 4 ? '简单' : (current?.difficulty ?? 5) <= 7 ? '中等' : '困难'}
          </Badge>
        </div>
        <Progress value={((state.index + (lastResult ? 1 : 0)) / state.questions.length) * 100} />
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {/* 选择题 */}
          {current?.type === 'choice' && (
            <>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{current.word}</h3>
                <Button variant="ghost" size="icon" onClick={() => speak(current.word)} aria-label="发音">
                  <Volume2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-muted-foreground">{current.prompt}</p>
              <div className="grid gap-2">
                {current.options?.map((opt, i) => {
                  const isCorrect = lastResult?.correctAnswer === opt;
                  const isSelected = selected === i;
                  const disabled = !!lastResult;
                  return (
                    <button
                      key={i}
                      disabled={disabled}
                      onClick={() => setSelected(i)}
                      className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ${
                        isSelected ? 'border-primary bg-primary/10' : 'hover:bg-accent'
                      } ${isCorrect ? 'border-green-500 bg-green-500/10' : ''} ${
                        disabled && isSelected && !isCorrect ? 'border-red-500 bg-red-500/10' : ''
                      }`}
                    >
                      <span>
                        {String.fromCharCode(65 + i)}. {opt}
                      </span>
                      {isCorrect && <Check className="h-4 w-4 text-green-600" />}
                      {disabled && isSelected && !isCorrect && <X className="h-4 w-4 text-red-600" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* 填空题 */}
          {current?.type === 'fill' && (
            <>
              <h3 className="text-lg font-semibold">{current.word}</h3>
              <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground">{current.sentence}</p>
              <div className="flex gap-2">
                <Input
                  placeholder="输入答案"
                  value={fillText}
                  onChange={(e) => setFillText(e.target.value)}
                  disabled={!!lastResult}
                  onKeyDown={(e) => e.key === 'Enter' && !lastResult && submitAnswer()}
                />
                <Button variant="outline" disabled={showHint || !!lastResult} onClick={() => setShowHint(true)}>
                  <Lightbulb className="mr-1 h-4 w-4" />
                  hint
                </Button>
              </div>
              {showHint && <p className="text-sm text-muted-foreground">提示：{current.hint}</p>}
            </>
          )}

          {/* 拼写题 */}
          {current?.type === 'spelling' && (
            <>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">拼写：{current.definition}</h3>
                <Button variant="ghost" size="icon" onClick={() => speak(current.word)} aria-label="朗读">
                  <Volume2 className="h-4 w-4" />
                </Button>
              </div>
              {current.phonetic && <p className="text-muted-foreground">/ {current.phonetic} /</p>}
              <Input
                placeholder="输入拼写"
                value={fillText}
                onChange={(e) => setFillText(e.target.value)}
                disabled={!!lastResult}
                onKeyDown={(e) => e.key === 'Enter' && !lastResult && submitAnswer()}
              />
              {fillText && !lastResult && (
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const target = current.word;
                    const matched = fillText.split('').filter((c, i) => c.toLowerCase() === target[i]?.toLowerCase()).length;
                    return `实时匹配 ${matched}/${target.length}`;
                  })()}
                </p>
              )}
            </>
          )}

          {/* 结果反馈 */}
          {lastResult && (
            <div className={`rounded-lg border p-3 text-sm ${lastResult.correct ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
              <p className="font-semibold">
                {lastResult.correct ? '✅ 回答正确！' : '❌ 回答错误'}
                <span className="ml-2 font-normal text-muted-foreground">{lastResult.scoreLabel}</span>
              </p>
              <p className="mt-1">正确答案：{lastResult.correctAnswer}</p>
              {lastResult.explanation && <p className="mt-1 text-muted-foreground">{lastResult.explanation}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                S: {lastResult.stabilityBefore.toFixed(2)} → {lastResult.stabilityAfter.toFixed(2)} · 下次复习{' '}
                {new Date(lastResult.nextReview).toLocaleDateString()}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {lastResult ? (
          <Button onClick={nextQuestion}>
            {state.index + 1 >= state.questions.length ? '查看结果' : '下一题'}
            <Clock className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submitAnswer} disabled={submitting}>
            {submitting ? '提交中…' : '提交答案'}
          </Button>
        )}
      </div>
      <div className="h-8" />
    </div>
  );
}
