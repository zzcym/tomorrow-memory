/**
 * T-11 微轮 fix2 · **A-34-1②**：`profile.get` 挂上 `output` parser 之后的两类证据。
 *
 * A-34-1① 只准挂"现成的 DTO"（不许新造第二份真相），A-34-1② 要求每条挂载都带一条
 * "**真实服务端输出过 schema**"的用例 —— 防的就是"补了个会误杀的 parser"。本文件把这两件事
 * 分开钉死：
 *  1. **不误杀**：真 `createProfileRouter` / 真 `profile` router / 真临时 sqlite，走三个门面
 *     （REST、tRPC caller、tRPC **线上 HTTP**）各拿一次 `profile.get`，断言都过 parser、
 *     且键集合与值**逐字等于**服务端装配的那一份（parser 不改形、不丢键）；
 *     再单独跑一次 `PROFILE_DTO_LEGACY_ALIAS=off` —— 别名键停发是**产品行为**（`profile-dto.spec.ts`
 *     判据② 已钉），把它声明成必填就会在这里红。
 *  2. **不是空转**：缺一个统计键、或统计键类型错，parser 必须拒（否则挂了等于没挂）。
 *  3. **只增不改**（A-28-1 / A-30-2 的口径）：procedure 清单、`profile.get` 的入参、
 *     `profile.update` 与 `profile.changePassword` 的既有形状一字未动，且这两个过程**本轮仍不挂** output。
 *     注：任务书里点名的 `profile.stats` 在本仓库**不存在**（`profile` 域只有 get/update/changePassword，
 *     `trpc-shape.baseline.json` 与 `appRouter` 两条路都核过，见本文件第 3 组用例与报告 §5）。
 *  4. **键集合钉（A-35-1②，fix3 新增）**：`ProfileGetOutputSchema` 已从"继承 passthrough"改成
 *     **闭合对象**（A-35-1①），代价是未声明键会被静默 `strip` ⇒ 本组把"真实 `getProfileDto()` 的键
 *     集合 ⊆ 声明键集合"钉成断言，装配点将来加键而未声明 = 当场红（疫苗取证见报告 §3.3）。
 *     同轮把第 2 组末尾那条"未知键仍放行"的后半从 `passthrough` 翻成 `strip`（**未放宽**：多钉两条，
 *     且 REST 侧 `ProfileDtoSchema` 的 passthrough 一字未动这一事实也钉在这里）。
 *  5. 第 3 组里"`profile.get` 出参面"那三条断言（E3′ §9-1 那格红之后的第 5 微轮）钉的是**持久性质**：
 *     parser 挂着 / 挂的是闭合对象 / 声明键 = 13 键。**不得**在这里再钉"基线再生过没有""本轮改了什么"
 *     这类瞬时状态（那种断言一旦基线正常就必红，属 A-28-2 禁的"探针依赖活的缺陷"），也不得引行号。
 *
 * 只在 `os.tmpdir()` 的临时库上跑，**绝不碰仓库根 `data.db` / `packages/server/data.db`**；
 * **不读不写** `trpc-shape.baseline.json`（只 `readFileSync` 一次做对照，再生属出口 E3）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { trpcServer } from '@hono/trpc-server';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  DAILY_GOAL_DEFAULT,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  NICKNAME_MAX_LENGTH,
  ProfileDtoSchema,
} from '@tm/shared';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import { createProfileRouter } from '../../src/routes/profile.js';
import { ProfileGetOutputSchema, profile } from '../../src/trpc/routers/profile.js';
import { createCallerFactory, type TrpcContext } from '../../src/trpc/init.js';
import { createFeatureFlags, type FeatureFlags } from '../../src/services/feature-flags.js';
import { getProfileDto, PROFILE_DTO_KEYS } from '../../src/services/profile-service.js';
import type { AuthEnv } from '../../src/middleware/auth.js';

const TEST_SECRET = 'tm-t11-profile-output-secret';
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;

const tmpDir = path.join(os.tmpdir(), `tm-t11-profile-output-${process.pid}`);
const T0 = 1_770_000_000_000;

/** A-34-1③ 的"E3 核对材料"：盘上基线里 `profile.get` 的出参侧现状（本轮改动**之前**的那一份）。 */
const BASELINE_PATH = fileURLToPath(new URL('../trpc-shape.baseline.json', import.meta.url));

let db: SqliteAppDB;
let flags: FeatureFlags;
let user = 0;

async function openMigratedDb(name: string): Promise<SqliteAppDB> {
  const raw = new Database(path.join(tmpDir, name));
  const app = new SqliteAppDB(raw);
  await app.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return app;
}

const token = (userId: number): string => jwt.sign({ id: userId }, AUTH_SECRET, { expiresIn: '1h' });

async function req(app: Hono<AuthEnv>, pathname: string, userId: number): Promise<Record<string, unknown>> {
  const res = await app.request(pathname, {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token(userId)}` },
  });
  expect(res.status, `REST ${pathname} 应 2xx`).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

const restProfile = (): Hono<AuthEnv> => new Hono<AuthEnv>().route('/', createProfileRouter(db, flags));

function trpcProfile(userId: number) {
  const ctx = { userId, clientIp: '127.0.0.1', db, flags } as unknown as TrpcContext;
  return createCallerFactory(profile)(ctx);
}

/** 线上门面（真的过一遍 JSON 序列化）：门面自己拼，不依赖 T-07 的 `app.ts`。 */
function trpcOnline(userId: number): Hono {
  const app = new Hono();
  app.use(
    '/trpc/*',
    trpcServer({
      endpoint: '/trpc',
      router: profile,
      createContext: async () => ({ userId, clientIp: '127.0.0.1', db, flags }),
    }),
  );
  return app;
}

async function getOnline(userId: number): Promise<Record<string, unknown>> {
  const res = await trpcOnline(userId).request('/trpc/get');
  const raw = (await res.json()) as { result?: { data?: Record<string, unknown> } };
  expect(res.status).toBe(200);
  const data = raw.result?.data;
  expect(data, `线上 profile.get 响应体：${JSON.stringify(raw)}`).toBeTruthy();
  return data as Record<string, unknown>;
}

/** tRPC 内部面（`trpc-shape.spec.ts` 同一口径：v11.18 的扁平过程表在 `_def.procedures`）。 */
type ProcDef = { _def?: Record<string, unknown> };
const procedures = (): Record<string, ProcDef> =>
  (profile as unknown as { _def: { procedures: Record<string, ProcDef> } })._def.procedures;
/** 单条过程的 `_def` 键面（tRPC 11.18 实测：未挂 parser 时它是 procedure/inputs/middlewares/meta/type/resolver）。 */
const rawDef = (name: string): Record<string, unknown> =>
  ((procedures()[name] ?? {})._def ?? {}) as unknown as Record<string, unknown>;
/** 该过程有没有挂 output parser（未挂 = `_def` 上根本没有 `output` 这个键）。 */
const hasOutputParser = (name: string): boolean => 'output' in rawDef(name);
/** 挂上的那个 parser 的 zod 类型名（未挂时 undefined）。 */
const outputTypeName = (name: string): string | undefined =>
  (rawDef(name).output as { _def?: { typeName?: string } } | undefined)?._def?.typeName;
/** 该过程挂的 input parser 数组（A-34-1① 的"入参一字不改"核对面）。 */
const inputOf = (name: string): unknown[] => (rawDef(name).inputs ?? []) as unknown[];

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  db = await openMigratedDb('profile-output.db');
  flags = createFeatureFlags(db);
  user = await db.createUser('13900000031', T0);
  // fixture：两条打卡日 ⇒ `reviewDates` 非空、`reviewDays>=2`，才真测到 `z.array(z.string())` 这一支。
  await db.checkins.checkin(user, '2026-01-02', T0);
  await db.checkins.checkin(user, '2026-01-03', T0);
});

afterAll(async () => {
  await db?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('A-34-1② 判据一：真实服务端输出过 schema（三个门面都不误杀）', () => {
  it('profile.get（tRPC caller，真库真 router）过 ProfileGetOutputSchema 与 shared 的 ProfileDtoSchema', async () => {
    const viaTrpc = (await trpcProfile(user).get()) as unknown as Record<string, unknown>;

    expect(ProfileGetOutputSchema.safeParse(viaTrpc).success, '出参 parser 放行真实输出').toBe(true);
    expect(ProfileDtoSchema.safeParse(viaTrpc).success, 'shared DTO 仍然放行（parser 没改契约）').toBe(true);

    // fixture 自证：统计键不是"空数组恰好通过"，是真的有值
    console.info(`[A-34-1 真实输出] profile.get = ${JSON.stringify(viaTrpc)}`);
    expect(viaTrpc.reviewDates).toEqual(['2026-01-02', '2026-01-03']);
    expect(viaTrpc.reviewDays).toBe(2);
    expect(typeof viaTrpc.totalWords).toBe('number');
    expect(viaTrpc.daily_goal).toBe(DAILY_GOAL_DEFAULT);
    expect(viaTrpc.dailyGoal).toBe(DAILY_GOAL_DEFAULT);
  });

  it('profile.get（REST createProfileRouter）与 tRPC 线上 HTTP 都过同一个 parser', async () => {
    const viaRest = await req(restProfile(), '/api/profile', user);
    const viaOnline = await getOnline(user);

    expect(ProfileGetOutputSchema.safeParse(viaRest).success, 'REST 侧同形状 ⇒ parser 不是 tRPC 特例').toBe(true);
    expect(ProfileGetOutputSchema.safeParse(viaOnline).success, '线上（过 JSON 序列化后）仍过 parser').toBe(true);
    // R-04③ 没被带歪：三门面键集合全等、取值全等（parser 只做校验，不改形）
    expect(Object.keys(viaOnline).sort()).toEqual(Object.keys(viaRest).sort());
    expect(viaOnline).toEqual(viaRest);
  });

  it('parser 返回的就是服务端装配的那一份（键与值逐字相等，未被裁剪/未被补键）', async () => {
    const assembled = (await getProfileDto(db, user)) as unknown as Record<string, unknown>;
    const viaTrpc = (await trpcProfile(user).get()) as unknown as Record<string, unknown>;

    expect(Object.keys(viaTrpc).sort()).toEqual(Object.keys(assembled).sort());
    expect(viaTrpc).toEqual(assembled);
    // 键集合 = shared 的 12 键装配面 + 唯一别名键（`PROFILE_DTO_KEYS` 本身含 4 个统计键）
    expect(Object.keys(viaTrpc).sort()).toEqual([...PROFILE_DTO_KEYS, 'dailyGoal'].sort());
  });

  it('PROFILE_DTO_LEGACY_ALIAS=off ⇒ 同一个 parser 仍然放行（别名键必填就是误杀）', async () => {
    process.env.PROFILE_DTO_LEGACY_ALIAS = 'off';
    try {
      const viaTrpc = (await trpcProfile(user).get()) as unknown as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(viaTrpc, 'dailyGoal'), '产品行为：开关一关停发别名键').toBe(false);
      expect(ProfileGetOutputSchema.safeParse(viaTrpc).success, '停发别名键时 parser 不得拒').toBe(true);
      expect(Object.keys(viaTrpc).sort()).toEqual([...PROFILE_DTO_KEYS].sort());
    } finally {
      delete process.env.PROFILE_DTO_LEGACY_ALIAS;
    }
  });
});

describe('A-34-1② 判据二：parser 真的会咬（不是挂了个空转的 shape）', () => {
  const keys = ['user_id', 'phone', 'nickname', 'avatar', 'daily_goal', 'updated_at', 'hasPassword', 'pwPolicyVersion'];

  it('缺任一统计键 ⇒ 拒（`getProfileDto()` 无条件装配它们，漏发就是装配点写坏了）', async () => {
    const good = (await trpcProfile(user).get()) as unknown as Record<string, unknown>;
    for (const key of ['totalWords', 'reviewDays', 'reviewDates', 'streak']) {
      const broken = { ...good };
      delete broken[key];
      expect(ProfileGetOutputSchema.safeParse(broken).success, `缺 ${key} 必须被拒`).toBe(false);
    }
    for (const key of keys) {
      const broken = { ...good };
      delete broken[key];
      expect(ProfileGetOutputSchema.safeParse(broken).success, `缺契约键 ${key} 必须被拒`).toBe(false);
    }
  });

  it('类型/越界 ⇒ 拒：reviewDates 非字符串、daily_goal 越界、totalWords 负数', async () => {
    const good = (await trpcProfile(user).get()) as unknown as Record<string, unknown>;
    expect(ProfileGetOutputSchema.safeParse({ ...good, reviewDates: [1, 2] }).success).toBe(false);
    expect(ProfileGetOutputSchema.safeParse({ ...good, daily_goal: 0 }).success).toBe(false);
    expect(ProfileGetOutputSchema.safeParse({ ...good, daily_goal: DAILY_GOAL_MAX + 1 }).success).toBe(false);
    expect(ProfileGetOutputSchema.safeParse({ ...good, totalWords: -1 }).success).toBe(false);
    expect(ProfileGetOutputSchema.safeParse({ ...good, nickname: 'x'.repeat(NICKNAME_MAX_LENGTH + 1) }).success).toBe(
      false,
    );
    // 别名键同样受约束（不是"类型面写个 optional 就完全不校验"）
    expect(ProfileGetOutputSchema.safeParse({ ...good, dailyGoal: 999 }).success).toBe(false);
  });

  /**
   * A-35-1① 把这一支的后半从 `passthrough` 翻成 `strip` —— 不是放宽：断的是"出参装配面已闭合"这个
   * 新事实，并**多钉两条**（未声明键在 parse 结果里消失 = 静默丢键的真实后果；REST 侧契约 schema
   * 仍是 passthrough，本轮 `packages/shared` 零改动）。静默丢键这个后果由下一组"键集合钉"兜住。
   */
  it('出参装配面已闭合（A-35-1①）：未知键不拒但会被 strip ⇒ 必须靠键集合钉兜住；REST 侧 passthrough 未动', async () => {
    const good = (await trpcProfile(user).get()) as unknown as Record<string, unknown>;
    expect(ProfileGetOutputSchema.safeParse({ ...good, futureKey: 'x' }).success).toBe(true);
    expect((ProfileGetOutputSchema as unknown as { _def: { unknownKeys: string } })._def.unknownKeys).toBe('strip');
    const stripped = ProfileGetOutputSchema.parse({ ...good, futureKey: 'x' }) as unknown as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(stripped, 'futureKey'), '闭合对象必须把未声明键 strip 掉（静默丢键的真实后果）').toBe(
      false,
    );
    expect((ProfileDtoSchema as unknown as { _def: { unknownKeys: string } })._def.unknownKeys).toBe('passthrough');
    const restKept = ProfileDtoSchema.parse({ ...good, futureKey: 'x' }) as unknown as Record<string, unknown>;
    expect(restKept.futureKey, 'REST 侧未知键存活 = T-06 事务 RMW 的既有语义，本轮未动').toBe('x');
  });
});

/**
 * A-35-1②：**本轮的成败关键**。
 * ① 换来的客户端类型，代价是"未声明键被静默 strip"。若装配点将来发一个 schema 没声明的键，
 * 前端就静默少一个键 —— tsc 不报、safeParse 不报，只是数据不见了；那和 passthrough 时代的
 * "键在但类型是 unknown"是同一种假绿，只是换了个方向。所以本组把它钉成三条断言：
 *  1. 真实 `getProfileDto()` 的输出键集合 ⊆ 闭合 schema 的声明键集合（且开关 on 时**两集合全等**）；
 *  2. `PROFILE_DTO_KEYS`（服务端自报的装配契约清单）+ 唯一别名键 = 声明键集合，声明面也不许多出；
 *  3. 三门面（tRPC caller / REST / 线上 HTTP）实际返回的键集合同样 ⊆ 声明键，且过 parser 后**不增键**。
 * 疫苗取证（临时在装配点加一个未声明键 ⇒ 本组必红）见报告 §3.3。
 */
describe('A-35-1② 键集合钉：真实装配输出 ⊆ 闭合出参 schema 的声明键（新增键未声明即红）', () => {
  const declared = Object.keys(ProfileGetOutputSchema.shape).sort();

  it('真实 getProfileDto() 的键集合与闭合 schema 的声明键集合全等（开关 on 的默认产品态）', async () => {
    const emitted = Object.keys((await getProfileDto(db, user)) as unknown as Record<string, unknown>).sort();
    const undeclared = emitted.filter((k) => !declared.includes(k));
    expect(undeclared, `装配点发了闭合 schema 未声明的键 ⇒ 会被静默 strip：${undeclared.join(', ')}`).toEqual([]);
    const unemitted = declared.filter((k) => !emitted.includes(k));
    expect(unemitted, `闭合 schema 声明了装配点不发的键 ⇒ 类型面在撒谎：${unemitted.join(', ')}`).toEqual([]);
    expect(emitted).toEqual(declared);
    // 端到端：parse 之后键集合一个都没少（strip 无处可 strip）
    const parsed = Object.keys(
      ProfileGetOutputSchema.parse((await getProfileDto(db, user)) as unknown as Record<string, unknown>),
    ).sort();
    expect(parsed).toEqual(emitted);
  });

  it('声明键集合 = PROFILE_DTO_KEYS（服务端自报清单）+ 唯一别名键，不从第三方形状派生', () => {
    expect(declared).toEqual([...PROFILE_DTO_KEYS, 'dailyGoal'].sort());
    // 8 个契约键的字段 schema 实例仍复用 shared 的那一份（A-34-1①"不新造第二份真相"），
    // 与第 3 组同款取形方式（`.shape` 是 ZodRawShape，用 Record<string, unknown> 视图遍历，不做值域 cast）
    const shape = (ProfileGetOutputSchema as unknown as z.ZodObject<z.ZodRawShape>).shape;
    const sharedShape = ProfileDtoSchema.shape as unknown as Record<string, unknown>;
    for (const key of Object.keys(sharedShape)) {
      expect(shape[key], `契约键 ${key} 必须是 shared 的同一个实例`).toBe(sharedShape[key]);
    }
  });

  it('PROFILE_DTO_LEGACY_ALIAS=off ⇒ 同一支钉仍然成立（少发别名键是产品行为，不是漏声明）', async () => {
    process.env.PROFILE_DTO_LEGACY_ALIAS = 'off';
    try {
      const emitted = Object.keys((await getProfileDto(db, user)) as unknown as Record<string, unknown>).sort();
      expect(emitted.filter((k) => !declared.includes(k)), '停发别名键时也不得有未声明键').toEqual([]);
      expect(declared.filter((k) => !emitted.includes(k)), '声明面只许多出可停发的那个别名键').toEqual(['dailyGoal']);
      expect(emitted).toEqual(PROFILE_DTO_KEYS.slice().sort());
    } finally {
      delete process.env.PROFILE_DTO_LEGACY_ALIAS;
    }
  });

  it('三门面实际返回的键集合都 ⊆ 声明键，且过 parser 后不增键（键集合钉对真实线上一致）', async () => {
    const viaTrpc = Object.keys((await trpcProfile(user).get()) as unknown as Record<string, unknown>).sort();
    const viaRest = Object.keys(await req(restProfile(), '/api/profile', user)).sort();
    const viaOnline = Object.keys(await getOnline(user)).sort();
    for (const [name, keys] of [
      ['tRPC caller', viaTrpc],
      ['REST', viaRest],
      ['线上 HTTP', viaOnline],
    ] as const) {
      const undeclared = keys.filter((k) => !declared.includes(k));
      expect(undeclared, `${name} 返回了闭合 schema 未声明的键 ⇒ 会被静默丢掉：${undeclared.join(', ')}`).toEqual([]);
    }
    expect(viaRest).toEqual(viaTrpc);
    expect(viaOnline).toEqual(viaTrpc);
    expect(viaTrpc).toEqual(declared);
  });
});

describe('A-34-1①③ 形状只增不改（A-28-1 / A-30-2 冻结口径 + E3 核对材料）', () => {
  it('procedure 清单一字未动：get / update / changePassword，且不存在 profile.stats', () => {
    expect(Object.keys(procedures()).sort()).toEqual(['changePassword', 'get', 'update']);

    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as {
      procedures: Array<{ path: string; output: unknown }>;
    };
    const fromBaseline = baseline.procedures
      .filter((p) => p.path.startsWith('profile.'))
      .map((p) => p.path.replace(/^profile\./, ''))
      .sort();
    expect(fromBaseline, '基线里的 profile.* 清单 == 现在的清单').toEqual(Object.keys(procedures()).sort());
    // 任务书点名的 `profile.stats` 在本仓库不存在（router 与基线两条路都核过）：不存在 ⇒ 无从"带歪"
    expect(Object.keys(procedures())).not.toContain('stats');
    expect(baseline.procedures.map((p) => p.path)).not.toContain('profile.stats');
    /*
     * 出参侧的**持久性质**三条（T-11 第 5 微轮：这里原先钉的是"基线尚未再生"这一瞬时状态，
     * 基线一再生它就必红 —— 与 A-28-2 禁止的"探针依赖一个活的缺陷"同病，已改掉）：
     *  1. `profile.get` 挂着 output parser；
     *  2. 挂上的是一个**闭合对象**（`unknownKeys === 'strip'`，A-35-1① —— 只有闭合对象才给得出客户端类型）；
     *  3. 它的声明键集合恰好是下面 13 键（8 个契约键 + 4 个统计键 + 唯一别名键）。
     * 三条都从**真实 router 的 `_def`** 上取 ⇒ 实现里摘掉 `.output()` 或改错一个声明键，这里当场红
     * （疫苗 A/B 取证见报告 §3）。基线同一格只做**一致性**核对（代码与基线不符时 `trpc-shape` 门禁自己红），
     * 不断言"第几轮改过/再生过没有"，也不引行号。
     * `update` / `changePassword` 没有"已有 DTO + 双侧 safeParse 用例"的出参契约（A-34-1③④），
     * 故基线那两格仍是 `null`。
     */
    const GET_OUTPUT_KEYS = [
      'avatar',
      'dailyGoal',
      'daily_goal',
      'hasPassword',
      'nickname',
      'phone',
      'pwPolicyVersion',
      'reviewDates',
      'reviewDays',
      'streak',
      'totalWords',
      'updated_at',
      'user_id',
    ].sort();
    type ClosedParserDef = { _def?: { unknownKeys?: string }; shape?: Record<string, unknown> };
    /** 基线那一格是 `trpc-shape.spec.ts` 自己摊平过的形状（`{typeName, unknownKeys, shape}`）。 */
    type BaselineOutputShape = {
      typeName?: string;
      unknownKeys?: string;
      shape?: Record<string, unknown>;
    };

    const mounted = rawDef('get').output as ClosedParserDef | undefined;
    expect(mounted, 'profile.get 挂着 output parser（`_def.output` 存在）').toBeTruthy();
    expect(mounted?._def?.unknownKeys, '挂上的 parser 必须是闭合对象').toBe('strip');
    const mountedKeys = Object.keys(mounted?.shape ?? {});
    expect(mountedKeys, '声明键集合 = 13 键').toHaveLength(13);
    expect(mountedKeys.sort()).toEqual(GET_OUTPUT_KEYS);

    // 同一条持久性质在基线里的那一格：只核"代码与基线记录的是同一件事"，不核"再生过没有"
    const outputCell = baseline.procedures.find((p) => p.path === 'profile.get')
      ?.output as BaselineOutputShape | null;
    expect(outputCell, '基线记录的 profile.get 出参是 parser，不是"无 parser"占位').not.toBeNull();
    expect(outputCell?.unknownKeys, '基线同格也是闭合对象').toBe('strip');
    expect(Object.keys(outputCell?.shape ?? {}).sort()).toEqual(GET_OUTPUT_KEYS);
    expect(baseline.procedures.find((p) => p.path === 'profile.update')?.output).toBeNull();
  });

  it('profile.get：入参一字未改（0 个 input parser），出参 = ProfileGetOutputSchema 且 8 个契约键就是 shared 的那一份实例', () => {
    expect(inputOf('get'), 'A-34-1① 的"入参一字不改"').toEqual([]);
    // 三条过程的出参面逐字打印 —— 本轮 delta 只有 `get`：`output: null → <Schema>`（A-34-1③ 的"只增"）
    console.info(
      `[A-34-1 出参面] get: hasParser=${hasOutputParser('get')} type=${outputTypeName('get')} | ` +
        `update: hasParser=${hasOutputParser('update')} | ` +
        `changePassword: hasParser=${hasOutputParser('changePassword')} | ` +
        `update._def keys=${JSON.stringify(Object.keys(rawDef('update')))}`,
    );
    expect(hasOutputParser('get'), 'get 已挂 parser').toBe(true);
    expect(outputTypeName('get'), '挂上的就是 ProfileGetOutputSchema').toBe(ProfileGetOutputSchema._def.typeName);

    const shape = (ProfileGetOutputSchema as unknown as z.ZodObject<z.ZodRawShape>).shape;
    const sharedShape = ProfileDtoSchema.shape as unknown as Record<string, unknown>;
    for (const key of Object.keys(sharedShape)) {
      expect(shape[key], `契约键 ${key} 复用 shared 实例，未另写一份`).toBe(sharedShape[key]);
    }
    expect(Object.keys(shape).sort()).toEqual(
      [...Object.keys(sharedShape), 'dailyGoal', 'reviewDates', 'reviewDays', 'streak', 'totalWords'].sort(),
    );
  });

  it('profile.update：input 形状 = A-30-2 逐字口径，且本轮**没**给它挂 output', () => {
    const input = inputOf('update')[0] as z.ZodObject<z.ZodRawShape>;
    expect(Object.keys(input.shape).sort()).toEqual(['avatar', 'dailyGoal', 'daily_goal', 'nickname']);
    // A-30-2：`avatar` 由 `ZodOptional(ZodString[max 500])` → `ZodOptional(ZodString)`（C-04 的正解）
    expect(input.safeParse({ avatar: 'x'.repeat(501) }).success, 'avatar 的 500 字符上限已不在 zod 里').toBe(true);
    // `nickname` / `dailyGoal` 两键一字不变
    expect(input.safeParse({ nickname: 'x'.repeat(NICKNAME_MAX_LENGTH + 1) }).success).toBe(false);
    expect(input.safeParse({ dailyGoal: DAILY_GOAL_MIN - 1 }).success).toBe(false);
    expect(input.safeParse({ dailyGoal: DAILY_GOAL_MAX + 1 }).success).toBe(false);
    expect(input.safeParse({ daily_goal: DAILY_GOAL_MAX + 1 }).success).toBe(false);
    expect(input.safeParse({ nickname: '甲', dailyGoal: 30, daily_goal: 40, avatar: 'a' }).success).toBe(true);
    // 出参形状未动：`{ok:true, daily_goal}`（见下面那条运行时用例），且仍**没有** parser
    expect(hasOutputParser('update'), 'A-34-1③：update 本轮不挂 output').toBe(false);
  });

  it('profile.changePassword：input 形状与出参未挂 parser 都保持 A-30-3 的"签名一字不动"', () => {
    const input = inputOf('changePassword')[0] as z.ZodObject<z.ZodRawShape>;
    expect(Object.keys(input.shape)).toEqual(['password']);
    expect(input.safeParse({ password: 'abc' }).success).toBe(false);
    expect(input.safeParse({ password: 'x'.repeat(73) }).success).toBe(false);
    expect(input.safeParse({ password: 'abcd' }).success).toBe(true);
    expect(hasOutputParser('changePassword'), 'A-34-1③：changePassword 本轮不挂 output').toBe(false);
  });

  it('错误体未被 output parser 打搅（A-30-1 的 errorFormatter 仍是唯一出口）', async () => {
    await expect(trpcProfile(user).update({ daily_goal: DAILY_GOAL_MAX + 1 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    // 出参没挂 parser 的 update 仍然返回既有形状 `{ok:true, daily_goal}`（A-34-1③ 的"未带歪"实证）
    const updated = (await trpcProfile(user).update({ daily_goal: 33 })) as unknown as Record<string, unknown>;
    expect(updated).toEqual({ ok: true, daily_goal: 33 });
    const after = (await trpcProfile(user).get()) as unknown as Record<string, unknown>;
    expect([after.daily_goal, after.dailyGoal]).toEqual([33, 33]);
  });
});

describe('类型面（tsc 证据，不是运行时断言）：客户端从 parser 拿到的就是真实类型', () => {
  /**
   * 钉住"绿的那条路是哪一行"。`apps/web/.../profile/page.tsx:92` 是
   * `setDailyGoal(profile.data.dailyGoal)` —— React 的 setter 要 `number`。
   * 本组断言**只由 tsc 判定**（A-9：`test/` 纳入 typecheck），运行时是 no-op：
   *  - `daily_goal` 是 `number` ⇒ T-15 把读键换成它就 0 错（也正是 shared 头注⑧ 行的口径"新代码只读 `daily_goal`"）；
   *  - 别名键 `dailyGoal` 只能是 `number | undefined`（开关 off 停发，见上面那条用例）⇒ 读它必红，
   *    这就是本轮 Web typecheck 没能归零的唯一一行，属 T-15 / TPM 的决策，不属本文件能糊过去的范围。
   */
  type ClientOut = z.infer<typeof ProfileGetOutputSchema>;

  it('`daily_goal` 在客户端类型里是 `number`（`page.tsx:92` 的合法读法）', () => {
    expectTypeOf<ClientOut['daily_goal']>().toBeNumber();
    expectTypeOf<ClientOut['nickname']>().toBeString();
    expectTypeOf<ClientOut['avatar']>().toBeString();
  });

  it('`reviewDates`/`totalWords`/`reviewDays`/`streak` 恢复了真实类型（`page.tsx:144/200/207/214` 驱动的最小扩面）', () => {
    expectTypeOf<ClientOut['reviewDates']>().toEqualTypeOf<string[]>();
    expectTypeOf<ClientOut['totalWords']>().toBeNumber();
    expectTypeOf<ClientOut['reviewDays']>().toBeNumber();
    expectTypeOf<ClientOut['streak']>().toBeNumber();
  });

  it('别名键 `dailyGoal` 的类型如实是 `number | undefined`（不是被 parser 兜成必填）', () => {
    expectTypeOf<ClientOut['dailyGoal']>().toEqualTypeOf<number | undefined>();
  });
});
