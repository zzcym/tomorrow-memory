/**
 * T-08 · tRPC 过程清单快照门禁（§10.2 T-08 判据①）
 *
 * 目的：证明「`trpc/router.ts` 按域拆分」是**纯搬迁**——拆分前后
 * `appRouter.router.unstable_getProcedureList()` 的 path 列表 + input/output 形状
 * 以及 `appRouter.createCallerFactory` 产出的调用面**逐字节一致**。
 *
 * 快照口径（三层，全部可判真假）：
 *  1) procedure 清单：`path` / `type` / `meta` / `input` 的 zod 结构描述 / `output`；
 *  2) 行为指纹：对每个 input 解析器跑同一份固定探针集（≈50 例，覆盖缺省/边界/越界/类型错），
 *     记录 `safeParse` 的 ok / issues(path+code+message) / 解析后 data（含 `.default()` 生效值）；
 *  3) 调用面：`createCallerFactory({})` 递归走 own keys，记录 path 与函数/命名空间形态。
 *
 * 基线文件 `test/trpc-shape.baseline.json` 是在**拆分之前**、`src/trpc/router.ts` 仍存在时
 * 生成的（`provenance.sourceModule = "../src/trpc/router.js"`，见报告）。本用例只读基线、
 * 只做比对，**不写生产库**，也不构造任何 ctx（探针只跑 zod 解析器，不触碰 db/LLM）。
 *
 * 重新生成基线（仅限确有契约变更并经 TPM 批准）：`TRPC_SHAPE_UPDATE=1 pnpm --filter @tm/server test -- trpc-shape`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appRouter } from '../src/trpc/routers/index.js';
import { createCallerFactory } from '../src/trpc/init.js';

const BASELINE_FILE = fileURLToPath(new URL('./trpc-shape.baseline.json', import.meta.url));
/** 当前 appRouter 的来源模块（基线生成时这里是 `../src/trpc/router.js`，见 PROVENANCE）。 */
const SOURCE_MODULE = '../src/trpc/routers/index.js';

/** tRPC 11.18 的 router 把扁平过程表放在 `_def.procedures`、键面放在 `_def.record`（内部面，需转）。 */
interface RouterInternals {
  router?: { unstable_getProcedureList?: () => Array<Record<string, unknown>> };
  createCallerFactory?: (ctx: unknown) => unknown;
  _def: {
    procedures: Record<string, Record<string, unknown>>;
    record: Record<string, unknown>;
  };
}

const R = appRouter as unknown as RouterInternals;

/* ─────────────────────────── zod 结构描述（确定性、可 JSON 化） ─────────────────────────── */

type Desc = unknown;

function isZodLike(v: unknown): v is { safeParse: (d: unknown) => unknown; _def?: Record<string, unknown> } {
  return typeof v === 'object' && v !== null && typeof (v as { safeParse?: unknown }).safeParse === 'function';
}

function describeZod(schema: unknown, depth = 0): Desc {
  if (!isZodLike(schema)) return schema === undefined ? null : { opaque: String(schema) };
  if (depth > 16) return { truncated: true };
  const def = (schema._def ?? {}) as Record<string, unknown>;
  const typeName = String(def.typeName ?? 'Unknown');
  const walk = (v: unknown): Desc => describeZod(v, depth + 1);
  const plain = Object.keys(def)
    .filter((k) => {
      if (
        [
          'typeName', 'type', 'innerType', 'schema', 'shape', 'options', 'values', 'enum',
          'keyType', 'valueType', 'catchall', 'defaultValue', 'checks', 'description',
          'errorMap', 'invalid_type_error', 'required_error', 'error', 'lazy', 'unwrap',
        ].includes(k)
      ) {
        return false;
      }
      const val = def[k];
      return val === null || ['string', 'number', 'boolean'].includes(typeof val);
    })
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = def[k];
      return acc;
    }, {});

  const node: Record<string, unknown> = { typeName, ...plain };
  switch (typeName) {
    case 'ZodObject': {
      const shapeFn = def.shape;
      const shape = typeof shapeFn === 'function' ? (shapeFn as () => Record<string, unknown>)() : shapeFn;
      node.shape = Object.keys((shape ?? {}) as object)
        .sort()
        .reduce<Record<string, Desc>>((acc, k) => {
          acc[k] = walk((shape as Record<string, unknown>)[k]);
          return acc;
        }, {});
      node.unknownKeys = def.unknownKeys;
      break;
    }
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion':
    case 'ZodIntersection':
      node.options = (def.options as unknown[])?.map(walk);
      break;
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodReadonly':
    case 'ZodPromise':
      node.innerType = walk(def.innerType);
      break;
    case 'ZodDefault':
      node.innerType = walk(def.innerType);
      node.defaultValue =
        typeof def.defaultValue === 'function' ? (def.defaultValue as () => unknown)() : def.defaultValue;
      break;
    case 'ZodRecord':
    case 'ZodMap':
    case 'ZodSet':
      node.keyType = walk(def.keyType);
      node.valueType = walk(def.valueType ?? def.type);
      break;
    case 'ZodEffects': {
      node.schema = walk(def.schema);
      const effect = def.effect as { type?: unknown; transform?: unknown } | undefined;
      node.effectType = effect?.type ?? null;
      break;
    }
    case 'ZodPipeline':
      node.in = walk(def.in);
      node.out = walk(def.out);
      break;
    case 'ZodLiteral':
      node.value = def.value;
      break;
    case 'ZodEnum':
    case 'ZodNativeEnum':
      node.values = def.values ?? Object.keys((def.values ?? {}) as object);
      break;
    case 'ZodArray':
      node.element = walk(def.type);
      node.checks = JSON.parse(JSON.stringify(def.checks ?? []));
      break;
    case 'ZodString':
    case 'ZodNumber':
    case 'ZodDate':
      node.checks = JSON.parse(JSON.stringify(def.checks ?? []));
      break;
    default:
      break;
  }
  return node;
}

/* ─────────────────────────────── 固定探针集（行为指纹） ─────────────────────────────── */

const LONG_101 = 'x'.repeat(101);
const LONG_501 = 'a'.repeat(501);
const LONG_2001 = 'y'.repeat(2001);

/** [名称, 值]；名称参与快照，便于定位是哪一条探针翻了。 */
const PROBES: Array<[string, unknown]> = [
  ['undefined', undefined],
  ['null', null],
  ['bareString', 'apple'],
  ['bareNumber', 42],
  ['bareBoolean', true],
  ['bareArray', []],
  ['emptyObject', {}],
  ['word', { word: 'apple' }],
  ['wordEmpty', { word: '' }],
  ['wordTooLong', { word: LONG_101 }],
  ['wordNumber', { word: 123 }],
  ['wordDirection', { word: 'apple', direction: 'en2zh' }],
  ['wordDirectionBad', { word: 'apple', direction: 'bad' }],
  ['wordSeq', { word: 'apple', seq: 2 }],
  ['wordRating1', { word: 'apple', rating: 1 }],
  ['wordRating2', { word: 'apple', rating: 2 }],
  ['wordRating3', { word: 'apple', rating: 3 }],
  ['wordRating4', { word: 'apple', rating: 4 }],
  ['wordRating0', { word: 'apple', rating: 0 }],
  ['wordRating5', { word: 'apple', rating: 5 }],
  ['wordRatingString', { word: 'a', rating: '3' }],
  ['wordRatingNull', { word: 'a', rating: null }],
  ['phone', { phone: '13800138000' }],
  ['phoneBad11', { phone: '12345678901' }],
  ['phoneBadPrefix', { phone: '23800138000' }],
  ['phoneNumber', { phone: 13800138000 }],
  ['phoneCode', { phone: '13800138000', code: '123456' }],
  ['phonePassword', { phone: '13800138000', password: 'abcd' }],
  ['phoneEmptyStrings', { phone: '13800138000', code: '', password: '' }],
  ['codeOnly', { code: '123456' }],
  ['passwordOnly', { password: 'abcd' }],
  ['passwordShort', { password: 'abc' }],
  ['passwordLong', { password: 'x'.repeat(73) }],
  ['profileNickname', { nickname: 'n'.repeat(31) }],
  ['profileNicknameOk', { nickname: 'nick' }],
  ['profileAvatar', { avatar: LONG_501 }],
  ['profileDailyGoal0', { dailyGoal: 0 }],
  ['profileDailyGoal101', { dailyGoal: 101 }],
  ['profileDailyGoalFrac', { dailyGoal: 2.5 }],
  ['threadId', { threadId: 't1' }],
  ['threadIdLong', { threadId: LONG_101 }],
  ['count5', { count: 5 }],
  ['count4', { count: 4 }],
  ['count11', { count: 11 }],
  ['countString', { count: '5' }],
  ['period7d', { period: '7d' }],
  ['period90d', { period: '90d' }],
  ['periodBad', { period: '1d' }],
  ['periodNumber', { period: 7 }],
  ['assessmentKey', { key: 'apple:choice' }],
  ['assessmentKeyAnswer', { key: 'apple:choice', userAnswer: 1 }],
  ['assessmentAnswerOnly', { userAnswer: 'a' }],
  ['assessmentFull', { key: '', userAnswer: 'a', hesitated: true, modified: false }],
  ['agentInputEmpty', { input: '' }],
  ['agentInputLong', { input: LONG_2001 }],
  ['agentInputOk', { input: '帮我背 apple' }],
  ['unexpectedKey', { nope: 1 }],
];

function probeInput(schema: unknown): Array<{ probe: string; ok: boolean; issues: unknown; data: unknown }> {
  if (!isZodLike(schema)) {
    return [{ probe: '(no-parser)', ok: false, issues: null, data: `unparseable:${JSON.stringify(schema) ?? 'undefined'}` }];
  }
  return PROBES.map(([name, value]) => {
    const res = schema.safeParse(value) as {
      success: boolean;
      data?: unknown;
      error?: { issues?: Array<{ path?: Array<string | number>; code: unknown; message: unknown }> };
    };
    return {
      probe: name,
      ok: res.success,
      issues: (res.error?.issues ?? []).map((i) => ({
        path: (i.path ?? []).map(String).join('.'),
        code: i.code,
        message: i.message,
      })),
      data: res.success ? res.data : undefined,
    };
  });
}

/* ───────────────────────────── 快照装配 ───────────────────────────── */

interface ProcedureSnapshot {
  path: string;
  type: string | null;
  meta: unknown;
  nMiddlewares: number | null;
  input: Desc;
  output: Desc;
  inputProbes: unknown;
  outputProbes: unknown;
}

/**
 * 过程清单。装了 @trpc/server 11.18.0 已不提供 `router.unstable_getProcedureList()`
 * （实测 `grep -r unstable_getProcedureList node_modules/@trpc/server` 0 命中），
 * 这里优先调用它（若存在），否则读同一份数据源 `_def.procedures`
 * （v11 的 `createRouter` 就是把扁平 path→procedure 存在这里，unstable_getProcedureList
 * 当年也只是它的一层包装）—— 口径不变：path / type / meta / input / output。
 */
function procedureList(): ProcedureSnapshot[] {
  const raw = R.router?.unstable_getProcedureList
    ? R.router.unstable_getProcedureList().map((item) => ({
        path: (item.path as string[]).join('.'),
        proc: {
          type: item.type,
          meta: item.meta,
          inputs: [item.input],
          output: item.output,
          middlewares: [],
        } as Record<string, unknown>,
      }))
    : Object.entries(R._def.procedures).map(([procPath, proc]) => ({
        path: procPath,
        proc: proc as Record<string, unknown>,
      }));

  return raw
    .map(({ path: procPath, proc }) => {
      const def = (proc as { _def?: Record<string, unknown> })._def ?? proc;
      const inputs = def.inputs as unknown[] | undefined;
      return {
        path: procPath,
        type: (def.type as string) ?? null,
        meta: def.meta ?? null,
        nMiddlewares: Array.isArray(def.middlewares) ? (def.middlewares as unknown[]).length : null,
        input: describeZod(inputs ? inputs[0] : def.input),
        output: describeZod(def.output),
        inputProbes: probeInput(inputs ? inputs[0] : def.input),
        outputProbes: probeInput(def.output),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * 调用面：`createCallerFactory(appRouter)` 必须存在且可调用（tRPC 校验 `_def.router`），
 * 再走 `appRouter._def.record` 的嵌套结构（record 就是 caller 的键面）。
 * caller 本身是 Proxy，`Object.keys()` 恒空 → 走 record 才拿得到真实路径。
 */
function callerSurface(): { lines: string[]; factorySource: string } {
  const viaRouter = R.createCallerFactory;
  const factory: (ctx: unknown) => unknown =
    typeof viaRouter === 'function'
      ? viaRouter
      : (createCallerFactory(appRouter) as unknown as (ctx: unknown) => unknown);
  const factorySource =
    typeof viaRouter === 'function' ? 'appRouter.createCallerFactory' : 'init.createCallerFactory(appRouter)';
  // 只建壳子：ctx 在真正调用时才被用，这里不触达 db/LLM。
  factory({});
  const out: string[] = [];
  const walk = (node: Record<string, unknown>, prefix: string[], depth: number): void => {
    for (const key of Object.keys(node).sort()) {
      if (key === '_def' || key === 'createCaller') continue;
      const value = node[key];
      const next = [...prefix, key];
      if (typeof value === 'function') out.push(`${next.join('.')} = procedure`);
      else if (value !== null && typeof value === 'object' && depth < 6) {
        out.push(`${next.join('.')} = namespace`);
        walk(value as Record<string, unknown>, next, depth + 1);
      } else out.push(`${next.join('.')} = ${typeof value}`);
    }
  };
  walk(R._def.record, [], 0);
  return { lines: out.sort(), factorySource };
}

function buildSnapshot() {
  const procedures = procedureList();
  const surface = callerSurface();
  return {
    procedures,
    callerSurface: surface.lines,
    counts: {
      procedures: procedures.length,
      callerFactory: surface.factorySource,
      domains: [...new Set(procedures.map((p) => p.path.split('.')[0]))].sort(),
      byType: procedures.reduce<Record<string, number>>((acc, p) => {
        acc[p.type ?? 'unknown'] = (acc[p.type ?? 'unknown'] ?? 0) + 1;
        return acc;
      }, {}),
    },
  };
}

type Snapshot = ReturnType<typeof buildSnapshot>;

const PROVENANCE = {
  sourceModule: SOURCE_MODULE,
  oldRouterSha256GitHead: 'd9e7c4649158501289465dfeada80a5d585d92ed3b43dee1e67b278d1d1c625d',
  oldRouterLines: 610,
  note:
    '基线在 T-08 拆分之前生成：当时 appRouter 仍来自 packages/server/src/trpc/router.ts' +
    '（sha256 见 oldRouterSha256GitHead）。拆分后本用例的 import 改指 src/trpc/routers/index.js，' +
    '比对的是这份拆分前生成的基线。',
};

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

describe('T-08 判据①：tRPC appRouter 过程清单零签名漂移', () => {
  const current = buildSnapshot();

  it('快照非空（防止空清单把门禁跑成永真）', () => {
    expect(current.procedures.length).toBeGreaterThanOrEqual(20);
    expect(current.callerSurface.length).toBeGreaterThanOrEqual(20);
    expect(current.counts.domains).toEqual(
      ['agent', 'analyst', 'assessment', 'auth', 'chat', 'checkin', 'dictionary', 'profile', 'review', 'wordbook'].sort(),
    );
  });

  it('与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面）', () => {
    if (process.env.TRPC_SHAPE_UPDATE === '1') {
      fs.writeFileSync(
        BASELINE_FILE,
        `${stableJson({ provenance: PROVENANCE, ...current })}\n`,
        'utf8',
      );
    }
    expect(fs.existsSync(BASELINE_FILE), `基线快照缺失：${BASELINE_FILE}`).toBe(true);
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) as Snapshot & {
      provenance: unknown;
    };
    const a = stableJson(current);
    const b = stableJson({ procedures: baseline.procedures, callerSurface: baseline.callerSurface, counts: baseline.counts });
    if (a !== b) {
      // 失败时打印第一处差异，便于定位是哪个域/哪个探针漂了。
      const la = a.split('\n');
      const lb = b.split('\n');
      const idx = la.findIndex((line, i) => line !== lb[i]);
      const changed = current.procedures.filter(
        (p) => stableJson(p) !== stableJson(baseline.procedures.find((q) => q.path === p.path) ?? {}),
      );
      throw new Error(
        `appRouter 形状漂移：首个差异在第 ${idx + 1} 行\n  现值: ${la[idx]}\n  基线: ${lb[idx]}\n` +
          `  受影响 procedure: ${changed.map((c) => c.path).join(', ') || '(清单本身不同)'}`,
      );
    }
    expect(path.isAbsolute(BASELINE_FILE)).toBe(true);
  });
});
