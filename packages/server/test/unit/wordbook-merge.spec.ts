/**
 * T-09 · 词本字段级 merge / 墓碑纯函数单测。
 *
 * 打的是判据②（同词并发 `reviewCount=max`、`lastReview` 取晚、`addedAt` 取早）、
 * 判据③（409 重放幂等 —— 幂等的根就在"未变即同一引用 + 墓碑串不变"）、
 * 判据④（off 态整数组语义下"已按增量写入的词"的保留规则，PRD §6.4-5-3）、
 * 判据⑥⑧（同一份 ops 分别过"整数组投影"与"增量投影"，T-21 抽样比对用的就是这两个函数），
 * 以及 §3 红线（`data` 形状 / 未知键不重排不丢弃 / `addedAt` 稳定排序）。
 *
 * 纯函数层：不碰数据库、不读开关，所以这里**不需要**任何 mock —— 判据的可信度靠"算法只有一份"。
 */

import { describe, expect, it } from 'vitest';
import type { WordbookEntry } from '@tm/shared';
import {
  ENTRY_UPDATED_AT_KEY,
  applyOps,
  effectiveTimeOf,
  filterReadable,
  invalidWordKeys,
  isPruned,
  maxEffectiveTime,
  mergeEntry,
  normalizeEntry,
  parseTombstones,
  projectArrayMerge,
  projectArrayOverwrite,
  pruneTombstones,
  serializeTombstones,
  sizeViolation,
  sortForRead,
  tombstonesJsonFor,
  updatedAtOf,
  wordKeyOf,
  withUpdatedAt,
  type Tombstones,
} from '../../src/services/wordbook-merge.js';

const T0 = 1_700_000_000_000; // 2023-11-14，任意固定基准
const HOUR = 3_600_000;
const DAY = 86_400_000;

const entry = (word: string, extra: Record<string, unknown> = {}): WordbookEntry =>
  ({ word, addedAt: T0, ...extra }) as unknown as WordbookEntry;

/** 数组里按词取条目（词名归一口径与实现一致）。 */
const pick = (list: readonly WordbookEntry[], word: string): WordbookEntry | undefined =>
  list.find((e) => wordKeyOf(e) === word);

const keysOf = (e: WordbookEntry): string[] => Object.keys(e as unknown as Record<string, unknown>);

/* ══════════════════════════ 判据②：同词字段合并 ══════════════════════════ */

describe('mergeEntry — 判据② R-03③：后写不覆盖前一次的评分/次数', () => {
  it('addedAt 取早、lastReview 取晚、reviewCount 取 max', () => {
    const base = entry('apple', { addedAt: T0, lastReview: T0 + 2 * HOUR, reviewCount: 3 });
    const incoming = entry('apple', { addedAt: T0 + HOUR, lastReview: T0 + HOUR, reviewCount: 5 });
    const { entry: merged, changed } = mergeEntry(base, incoming);

    expect(changed).toBe(true);
    expect((merged.addedAt as number)).toBe(T0); // 取早
    expect((merged.lastReview as number)).toBe(T0 + 2 * HOUR); // 取晚
    expect((merged.reviewCount as number)).toBe(5); // max
  });

  it('三个字段各取各的，与"谁是后写"无关（A 端只改了 lastReview、B 端只改了 reviewCount 时两边都不丢）', () => {
    const aSide = entry('apple', { addedAt: T0, lastReview: T0 + 5 * HOUR, reviewCount: 1, updatedAt: T0 + 5 * HOUR });
    const bSide = entry('apple', { addedAt: T0, lastReview: T0 + 1 * HOUR, reviewCount: 9, updatedAt: T0 + 9 * HOUR });

    const ab = mergeEntry(aSide, bSide).entry;
    const ba = mergeEntry(bSide, aSide).entry;

    // 交换合并顺序结果必须一致（并发下谁先到不重要）
    expect(ab.reviewCount).toBe(9);
    expect(ba.reviewCount).toBe(9);
    expect(ab.lastReview).toBe(T0 + 5 * HOUR);
    expect(ba.lastReview).toBe(T0 + 5 * HOUR);
    expect(JSON.stringify(sortForRead([ab]))).toBe(JSON.stringify(sortForRead([ba])));
  });

  it('来方缺字段（旧 APK 只发 {word,addedAt}）不得把服务端已有值抹成 undefined', () => {
    const base = entry('apple', { lastReview: T0 + HOUR, reviewCount: 7 });
    const stale = { word: 'apple', addedAt: T0 } as unknown as WordbookEntry;
    const { entry: merged, changed } = mergeEntry(base, stale);

    expect(merged.lastReview).toBe(T0 + HOUR);
    expect(merged.reviewCount).toBe(7);
    expect(changed).toBe(false);
    expect(merged).toBe(base); // 未变 → 同一引用 → applyEntries/applySync 不 ++（判据③ 的根）
  });

  it('数值可以是字符串形态（pg JSONB 与旧客户端的历史值），取数宽容但结果仍取 max', () => {
    const base = entry('apple', { reviewCount: '4' });
    const { entry: merged } = mergeEntry(base, entry('apple', { reviewCount: 6 }));
    expect(merged.reviewCount).toBe(6);
  });

  it('updatedAt 只在"真改了字段"时前进；无字段变化时连 updatedAt 单独超前也不写（幂等的另一半）', () => {
    const base = entry('apple', { [ENTRY_UPDATED_AT_KEY]: T0 + 3 * HOUR });
    expect(updatedAtOf(base)).toBe(T0 + 3 * HOUR);

    const older = mergeEntry(base, entry('apple', { [ENTRY_UPDATED_AT_KEY]: T0 + HOUR, reviewCount: 2 }));
    expect(updatedAtOf(older.entry)).toBe(T0 + 3 * HOUR); // 不倒退
    expect(older.entry.reviewCount).toBe(2); // 字段该前进还是前进

    // 来方时间戳更新、但没有任何字段值变化 → 整批 unchanged（不为此多 ++ 一次版本）
    const nothingChanged = mergeEntry(base, entry('apple', { [ENTRY_UPDATED_AT_KEY]: T0 + 4 * HOUR }));
    expect(nothingChanged.changed).toBe(false);
    expect(nothingChanged.entry).toBe(base);

    // 有字段变化时才把 updatedAt 抬到来方时刻
    const newer = mergeEntry(base, entry('apple', { reviewCount: 8, [ENTRY_UPDATED_AT_KEY]: T0 + 4 * HOUR }));
    expect(newer.changed).toBe(true);
    expect(updatedAtOf(newer.entry)).toBe(T0 + 4 * HOUR);
  });
});

/* ══════════════════════ 红线：未知键原样保留、不重排 ══════════════════════ */

describe('mergeEntry — §3 红线：未知键不丢弃、不重排', () => {
  it('键序 = 存量键序；未知键在末尾，只按 updatedAt 较新者覆盖', () => {
    const base = entry('apple', {
      addedAt: T0,
      lastReview: T0 + HOUR,
      reviewCount: 1,
      source: 'lookup', // ← 本版本不认识的键
      uiPinned: true,
    });
    expect(keysOf(base)).toEqual(['word', 'addedAt', 'lastReview', 'reviewCount', 'source', 'uiPinned']);

    const incoming = entry('apple', {
      addedAt: T0,
      reviewCount: 2,
      source: 'manual',
      freshFromV3: { nested: [1, 2, 3] },
      [ENTRY_UPDATED_AT_KEY]: T0 + 10 * HOUR,
    });
    const merged = mergeEntry(base, incoming).entry;

    // 已知键在前、顺序不变；未知键只追加/覆盖，从不重排
    expect(keysOf(merged).slice(0, 5)).toEqual(['word', 'addedAt', 'lastReview', 'reviewCount', 'source']);
    expect(merged.uiPinned).toBe(true); // 存量未知键还在
    expect(merged.source).toBe('manual'); // 来方 updatedAt 更新 → 未知键按来方
    expect(merged.freshFromV3).toEqual({ nested: [1, 2, 3] }); // 未来版本的键被吸收
    expect(merged.lastReview).toBe(T0 + HOUR); // 来方没带的已知键不被抹掉
  });

  it('来方 updatedAt 更旧 → 未知键一律不动（前向兼容不成为倒退通道）', () => {
    const base = entry('apple', { source: 'lookup', [ENTRY_UPDATED_AT_KEY]: T0 + 9 * HOUR });
    const incoming = entry('apple', { source: 'stale-copy', reviewCount: 1, [ENTRY_UPDATED_AT_KEY]: T0 + HOUR });
    const merged = mergeEntry(base, incoming).entry;

    expect(merged.source).toBe('lookup');
    expect(merged.reviewCount).toBe(1);
    expect(updatedAtOf(merged)).toBe(T0 + 9 * HOUR);
  });
});

/* ══════════════════════ 判据①：一批 ops 的合并与幂等 ══════════════════════ */

describe('applyOps — 判据①：两客户端各加一个不同词，双方都在', () => {
  const base = [entry('apple'), entry('banana')];

  it('A 端 push cat、B 端 push dog（同一 baseVersion，按到达顺序落库）→ 四个词都在', () => {
    const stepA = applyOps(base, { entries: [entry('cat')] }, { now: T0 + HOUR, tombstonesEnabled: true });
    expect(stepA.added).toBe(1);
    expect(stepA.entries).toHaveLength(3);

    const stepB = applyOps(stepA.entries, { entries: [entry('dog')] }, { now: T0 + 2 * HOUR, tombstonesEnabled: true });
    expect(stepB.entries).toHaveLength(4);
    for (const w of ['apple', 'banana', 'cat', 'dog']) expect(pick(stepB.entries, w)).toBeDefined();
  });

  it('新词补 addedAt = 落库时刻，词名归一（trim + lowercase）与旧 PUT 口径一致', () => {
    const res = applyOps([], { entries: [{ word: '  Echo ' } as unknown as WordbookEntry] }, { now: T0 + 7, tombstonesEnabled: true });
    const only = res.entries[0];
    expect(res.entries).toHaveLength(1);
    expect(only?.word).toBe('echo');
    expect(only?.addedAt).toBe(T0 + 7);
  });

  it('同批"又删又加同一个词"→ 删除胜出（墓碑时刻 = now，来方不可能更晚）', () => {
    const res = applyOps(base, { entries: [entry('apple', { reviewCount: 3 })], removedWords: ['apple'] }, {
      now: T0 + HOUR,
      tombstonesEnabled: true,
    });
    expect(pick(res.entries, 'apple')).toBeUndefined();
    expect(res.tombstones.apple).toBe(T0 + HOUR);
  });

  it('非法词名（空/纯空格）被跳过，不进数组也不报错给 merge 层', () => {
    const res = applyOps(base, { entries: [{ word: '   ' } as unknown as WordbookEntry, entry('cherry')] }, {
      now: T0,
      tombstonesEnabled: true,
    });
    expect(res.entries).toHaveLength(3);
    expect(pick(res.entries, 'cherry')).toBeDefined();
  });
});

describe('applyOps — 判据③：重放幂等（未变即 unchanged + 墓碑串不变）', () => {
  it('重复提交同一批 upsert：第二次 changed=false、数组逐元素同引用', () => {
    const first = applyOps([], { entries: [entry('apple', { reviewCount: 2, [ENTRY_UPDATED_AT_KEY]: T0 + HOUR })] }, {
      now: T0 + HOUR,
      tombstonesEnabled: true,
      stampUpdatedAt: true,
    });
    expect(first.unchanged).toBe(false);

    const replay = applyOps(first.entries, { entries: [entry('apple', { reviewCount: 2, [ENTRY_UPDATED_AT_KEY]: T0 + HOUR })] }, {
      now: first.entries[0] ? T0 + 99 * HOUR : T0, // 即使 now 前移也不许让数组"看起来变了"
      tombstonesEnabled: true,
      stampUpdatedAt: true,
    });
    expect(replay.unchanged).toBe(true);
    expect(replay.added).toBe(0);
    expect(replay.merged).toBe(0);
    expect(replay.entries.every((e, i) => e === first.entries[i])).toBe(true);
  });

  it('重复提交同一批删除：墓碑保留**最早**时刻，序列化串不变（service 会把存量墓碑回灌，这里同口径）', () => {
    const one = applyOps([entry('apple'), entry('banana')], { removedWords: ['apple'] }, { now: T0 + HOUR, tombstonesEnabled: true });
    const replay = applyOps(one.entries, { removedWords: ['apple'] }, {
      now: T0 + 50 * HOUR, // 重放落在更晚的墙上时钟上
      tombstonesEnabled: true,
      tombstones: one.tombstones,
    });

    expect(one.tombstones.apple).toBe(T0 + HOUR);
    expect(replay.tombstones.apple).toBe(T0 + HOUR); // 不刷新时间戳
    expect(serializeTombstones(replay.tombstones)).toBe(serializeTombstones(one.tombstones));
    expect(replay.unchanged).toBe(true);
    expect(replay.removed).toBe(0); // 已经不在了，不计第二次"删除"
  });

  it('空 ops 打在未变数组上 = unchanged（applyEntries 的"未变即不 ++"依赖这一条）', () => {
    const base = [entry('apple')];
    expect(applyOps(base, {}, { now: T0 + DAY, tombstonesEnabled: true, tombstones: { zebra: T0 } }).unchanged).toBe(true);
  });
});

/* ══════════════════════ 墓碑：复活、压缩、可视化 ══════════════════════ */

describe('tombstones — §4.4.2 删除防复活 / R-16① 重新收藏', () => {
  const base = [entry('apple'), entry('banana')];
  const deleted = applyOps(base, { removedWords: ['apple'] }, { now: T0 + 10 * HOUR, tombstonesEnabled: true });

  it('删除后旧时间戳的上报不再复活该词（updatedAt 不晚于删除时刻 → 忽略）', () => {
    const stale = applyOps(deleted.entries, { entries: [entry('apple', { [ENTRY_UPDATED_AT_KEY]: T0 + HOUR })] }, {
      now: T0 + 11 * HOUR,
      tombstonesEnabled: true,
      tombstones: deleted.tombstones,
    });
    expect(pick(stale.entries, 'apple')).toBeUndefined();
    expect(stale.revived).toBe(0);
    expect(stale.tombstones.apple).toBe(T0 + 10 * HOUR);
  });

  it('删除后重新收藏（updatedAt 晚于删除时刻）→ 词回来且墓碑清掉（R-16①）', () => {
    const revived = applyOps(deleted.entries, { entries: [entry('apple', { [ENTRY_UPDATED_AT_KEY]: T0 + 20 * HOUR })] }, {
      now: T0 + 20 * HOUR,
      tombstonesEnabled: true,
      tombstones: deleted.tombstones,
    });
    expect(revived.revived).toBe(1);
    expect(revived.tombstones.apple).toBeUndefined();
    expect(pick(revived.entries, 'apple')).toBeDefined();
    expect(serializeTombstones(revived.tombstones)).toBe('{}');
  });

  it('off 态（tombstonesEnabled=false）：墓碑不参与，词看得见、删除照旧生效', () => {
    const offDelete = applyOps(base, { removedWords: ['apple'] }, { now: T0 + HOUR, tombstonesEnabled: false });
    expect(offDelete.tombstones).toEqual({});
    expect(pick(offDelete.entries, 'apple')).toBeUndefined();
    expect(offDelete.removed).toBe(1);
  });

  it('pruneTombstones：30 天窗口边界含在内，过期墓碑计数并剔除', () => {
    const tombstones: Tombstones = { old: T0, fresh: T0 + 29 * DAY };
    // 恰好压线（now - 30d === old）→ 仍保留；过 1ms 才丢
    expect(pruneTombstones(tombstones, T0 + 30 * DAY)).toEqual({ tombstones: { old: T0, fresh: T0 + 29 * DAY }, dropped: 0 });
    const pruned = pruneTombstones(tombstones, T0 + 30 * DAY + 1);
    expect(pruned.dropped).toBe(1);
    expect(pruned.tombstones).toEqual({ fresh: T0 + 29 * DAY });
  });

  it('isPruned：客户端 since 早于最旧墓碑 → 只能全量重放；空墓碑集永不判"压缩过"', () => {
    expect(isPruned(T0 - DAY, { a: T0 })).toBe(true);
    expect(isPruned(T0 + 1, { a: T0 })).toBe(false);
    expect(isPruned(T0, {})).toBe(false);
    expect(isPruned(undefined, { a: T0 })).toBe(false);
  });

  it('序列化确定性：键升序，两次结果逐字节相等（版本"未变即不 ++"的前提）', () => {
    const a = serializeTombstones({ dog: 2, cat: 1, ant: 3 });
    const b = serializeTombstones({ ant: 3, cat: 1, dog: 2 });
    expect(a).toBe(b);
    expect(a).toBe('{"ant":3,"cat":1,"dog":2}');
  });

  it('parseTombstones 宽容：列默认 \'[]\'、坏 JSON、数组、null 一律读成"无墓碑"，绝不抛', () => {
    expect(parseTombstones('[]')).toEqual({});
    expect(parseTombstones('{}')).toEqual({});
    expect(parseTombstones(null)).toEqual({});
    expect(parseTombstones(undefined)).toEqual({});
    expect(parseTombstones('{oops')).toEqual({});
    expect(parseTombstones('{"a":"123"}')).toEqual({ a: 123 }); // 字符串时间戳宽容取值
    expect(parseTombstones('{"  A  ":5}')).toEqual({ a: 5 }); // 键也归一
    expect(parseTombstones({ a: 1 })).toEqual({ a: 1 });
    expect(parseTombstones('[1,2]')).toEqual({});
    expect(parseTombstones('{"a":-1}')).toEqual({});
  });
});

/* ═══════════════ 判据④⑥⑧：整数组投影 vs 增量投影 ═══════════════ */

describe('projectArrayOverwrite — off 态整数组语义（PRD §6.4-5-3）', () => {
  it('来方数组就是真相：数组里没有 = 客户端已删 → 覆盖掉（旧 APK 的删除能力不回退）', () => {
    const server = [entry('apple'), entry('banana'), entry('cherry')];
    const res = projectArrayOverwrite(server, [entry('apple'), entry('banana')], T0 + DAY);
    expect(res.entries.map((e) => e.word)).toEqual(['apple', 'banana']);
    expect(res.removed).toBe(1);
  });

  it('已按增量写入的词（带 updatedAt 且更新）在整数组覆盖时保留 —— 不丢词', () => {
    const server = [
      entry('apple', { addedAt: T0 }),
      entry('newword', { addedAt: T0 + 5 * HOUR, [ENTRY_UPDATED_AT_KEY]: T0 + 6 * HOUR }), // 增量路径写的
    ];
    // 离线很久的旧 APK 上交一份不含 newword 的数组（它自己的条目最新也只到 T0+HOUR）
    const res = projectArrayOverwrite(server, [entry('apple', { addedAt: T0 })], T0 + 9 * HOUR);
    expect(pick(res.entries, 'newword')).toBeDefined();
    expect(pick(res.entries, 'apple')).toBeDefined();
    expect(res.removed).toBe(0);
  });

  it('不带 updatedAt 的存量词不会被"保护性保留"（否则旧 APK 永远删不掉词）', () => {
    const server = [entry('apple'), entry('ghost')]; // ghost 没有 updatedAt
    const res = projectArrayOverwrite(server, [entry('apple')], T0 + DAY);
    expect(pick(res.entries, 'ghost')).toBeUndefined();
    expect(res.removed).toBe(1);
  });

  it('空数组 = 用户主动清空，不做任何保留（wordbook.clear / 旧 APK clear）', () => {
    const server = [entry('apple', { [ENTRY_UPDATED_AT_KEY]: T0 + 99 * DAY }), entry('banana')];
    const res = projectArrayOverwrite(server, [], T0 + 100 * DAY);
    expect(res.entries).toEqual([]);
    expect(res.unchanged).toBe(false);
  });

  it('整数组投影不写墓碑、不补 updatedAt（off 态落库的形状与旧实现一字不差）', () => {
    const res = projectArrayOverwrite([], [entry('cat'), entry('cat'), entry('dog')], T0 + HOUR);
    expect(res.tombstones).toEqual({});
    expect(res.entries.map((e) => e.word)).toEqual(['cat', 'dog']); // 来方自重复 → 首次出现胜出
    for (const e of res.entries) expect(updatedAtOf(e)).toBe(0);
  });

  it('幂等：同一份数组连交两次，第二次 unchanged=true', () => {
    const server = [entry('apple')];
    const first = projectArrayOverwrite(server, [entry('apple'), entry('cat')], T0 + HOUR);
    const second = projectArrayOverwrite(first.entries, [entry('apple'), entry('cat')], T0 + 2 * HOUR);
    expect(second.unchanged).toBe(true); // 落库串不变 → 版本不 ++（整数组投影按 JSON 口径判等）
    expect(JSON.stringify(second.entries)).toBe(JSON.stringify(first.entries));
  });
});

describe('projectArrayMerge — on 态把整数组 PUT 转成字段级 merge（§4.4.1）', () => {
  it('数组里没出现的词**不算删除**（判据① 在"旧 PUT 与 push 混用"时仍成立的根因）', () => {
    const server = [entry('apple'), entry('banana')];
    const res = projectArrayMerge(server, [entry('apple')], T0 + DAY);
    expect(pick(res.entries, 'banana')).toBeDefined();
    expect(res.removed).toBe(0);
    expect(res.unchanged).toBe(true); // 只带来一条更旧的 apple → 整批没变
  });

  it('来方条目补 updatedAt → 之后关开关也不会被整数组覆盖洗掉', () => {
    const res = projectArrayMerge([], [entry('cat')], T0 + 3 * HOUR);
    expect(updatedAtOf(res.entries[0] as WordbookEntry)).toBe(T0 + 3 * HOUR);

    // 立刻把开关关掉：旧设备交一份只含 apple 的旧数组
    const afterOff = projectArrayOverwrite(res.entries, [entry('apple', { addedAt: T0 })], T0 + 4 * HOUR);
    expect(pick(afterOff.entries, 'cat')).toBeDefined(); // ← §6.4-5-3 "不丢数据"
    expect(pick(afterOff.entries, 'apple')).toBeDefined();
  });

  it('两种投影的差异面是**封闭可枚举**的：只可能是"来方数组里没写的词"（判据⑥⑧ 的抽样口径）', () => {
    const server = [entry('apple', { reviewCount: 1 }), entry('banana')];
    const incoming = [entry('apple', { reviewCount: 2, lastReview: T0 + HOUR }), entry('cherry')];
    const merged = projectArrayMerge(server, incoming, T0 + 2 * HOUR);
    const overwritten = projectArrayOverwrite(server, incoming, T0 + 2 * HOUR);

    const missingFromOverwrite = merged.entries
      .filter((e) => !overwritten.entries.some((o) => wordKeyOf(o) === wordKeyOf(e)))
      .map((e) => e.word);
    const missingFromMerge = overwritten.entries
      .filter((e) => !merged.entries.some((o) => wordKeyOf(o) === wordKeyOf(e)))
      .map((e) => e.word);

    expect(missingFromOverwrite).toEqual(['banana']); // 增量不认"缺席即删除"
    expect(missingFromMerge).toEqual([]); // 反向不会多词：整数组里有的增量一定收
  });

  it('来方数组 = 全量且逐条带齐字段（新客户端 GET 后原样上交的形态）→ 去掉可选键 updatedAt 后两种投影逐字节相同', () => {
    const comparable = (list: readonly WordbookEntry[]) =>
      JSON.stringify(
        sortForRead(list)
          .map((e) => {
            const rest = { ...(e as unknown as Record<string, unknown>) };
            delete rest[ENTRY_UPDATED_AT_KEY];
            return rest;
          })
          .sort((a, b) => String(a.word).localeCompare(String(b.word))),
      );
    const server = [entry('apple', { reviewCount: 1 }), entry('banana', { reviewCount: 4 })];
    // 客户端把服务端全量原样带回、只改一处评分：这时"整数组语义"与"增量 merge"结果必然同解
    const incoming = server.map((e) => ({ ...(e as unknown as Record<string, unknown>) })) as unknown as WordbookEntry[];
    (incoming[0] as unknown as Record<string, unknown>).reviewCount = 2;

    const merged = projectArrayMerge(server, incoming, T0 + 2 * HOUR);
    const overwritten = projectArrayOverwrite(server, incoming, T0 + 2 * HOUR);
    expect(comparable(merged.entries)).toBe(comparable(overwritten.entries));
    expect(pick(merged.entries, 'apple')?.reviewCount).toBe(2);
    expect(pick(overwritten.entries, 'apple')?.reviewCount).toBe(2);
  });

  it('两种投影只剩两处可能不等的维度：缺席词 + 来方没带的可选字段（T-21 抽样脚本据此报 diff）', () => {
    const server = [entry('apple', { reviewCount: 4 }), entry('banana', { reviewCount: 1 })];
    const incoming = [entry('apple', { addedAt: T0 })]; // 旧 APK 形态：只发 word + addedAt
    const merged = projectArrayMerge(server, incoming, T0 + DAY);
    const overwritten = projectArrayOverwrite(server, incoming, T0 + DAY);

    expect(pick(merged.entries, 'apple')?.reviewCount).toBe(4); // 增量：评分不被抹
    expect(pick(overwritten.entries, 'apple')?.reviewCount).toBeUndefined(); // 整数组：来方没带就没这个字段
    expect(pick(merged.entries, 'banana')).toBeDefined();
    expect(pick(overwritten.entries, 'banana')).toBeUndefined();
  });
});

/* ══════════════════════════ 读路径与排序 ══════════════════════════ */

describe('sortForRead — §6.2：GET /api/wordbook 按 addedAt 稳定排序', () => {
  it('addedAt 升序；同值保持存量相对次序（稳定）；缺 addedAt 排最前', () => {
    const list = [
      entry('c', { addedAt: T0 + 2 }),
      entry('a', { addedAt: T0 + 2 }),
      { word: 'no-stamp' } as unknown as WordbookEntry,
      entry('b', { addedAt: T0 + 1 }),
    ];
    expect(sortForRead(list).map((e) => e.word)).toEqual(['no-stamp', 'b', 'c', 'a']);
  });

  it('排序只换元素位置，不改条目本身（引用相等）', () => {
    const list = [entry('b', { addedAt: T0 + 1 }), entry('a', { addedAt: T0 })];
    const sorted = sortForRead(list);
    expect(sorted[0]).toBe(list[1]);
    expect(sorted[1]).toBe(list[0]);
    expect(sortForRead(list)).not.toBe(list); // 返回新数组，不改调用方
  });
});

describe('filterReadable — 判据④：off 态不得因墓碑看不见词', () => {
  const tombstones: Tombstones = { apple: T0 + 10 * HOUR };
  const list = [
    entry('apple', { addedAt: T0, [ENTRY_UPDATED_AT_KEY]: T0 + HOUR }), // 已删
    entry('apple2', { addedAt: T0, [ENTRY_UPDATED_AT_KEY]: T0 + 20 * HOUR }), // 删后又收藏
    entry('banana'),
  ];

  it('on：墓碑生效，但 updatedAt 晚于删除时刻的条目仍可读', () => {
    expect(filterReadable(list, tombstones, true).map((e) => e.word)).toEqual(['apple2', 'banana']);
  });

  it('off：完全不过滤（同一份库、同一个用户，关掉开关只会少掉增量能力，不会少词）', () => {
    expect(filterReadable(list, tombstones, false).map((e) => e.word)).toEqual(['apple', 'apple2', 'banana']);
  });
});

/* ══════════════════════════ 小工具 ══════════════════════════ */

describe('落库串与上限（判据③ 的最后一块 + §4.4.2 大小上限行）', () => {
  it('tombstonesJsonFor：空集合沿用库里原有那一串（\'[]\' 不会被无意义地改成 \'{}\'）', () => {
    expect(tombstonesJsonFor({}, '[]')).toBe('[]');
    expect(tombstonesJsonFor({}, '{}')).toBe('{}');
    expect(tombstonesJsonFor({}, undefined)).toBe('[]');
    expect(tombstonesJsonFor({}, null)).toBe('[]');
    expect(tombstonesJsonFor({ a: 1 }, '[]')).toBe('{"a":1}');
    expect(tombstonesJsonFor({}, '{"a":1}')).toBe('{}'); // 这次真的清空了
  });

  it('sizeViolation：单批 500 / 总量 20000，超限才报，边界内不报', () => {
    expect(sizeViolation({ entries: 500, removedWords: 500, totalAfter: 20_000 })).toBeUndefined();
    expect(sizeViolation({ entries: 501 })).toEqual({ kind: 'push-batch', count: 501, limit: 500 });
    expect(sizeViolation({ removedWords: 900 })).toEqual({ kind: 'push-batch', count: 900, limit: 500 });
    expect(sizeViolation({ totalAfter: 20_001 })).toEqual({ kind: 'total', count: 20_001, limit: 20_000 });
    // 旧 PUT 没有"单批 500"这一档：只带 total 时按 20000 判
    expect(sizeViolation({ totalAfter: 20_000 })).toBeUndefined();
  });
});

describe('helpers', () => {
  it('effectiveTimeOf：有 updatedAt 用它，否则退到 addedAt/lastReview 较晚者（旧 APK 只发 {word,addedAt}）', () => {
    expect(effectiveTimeOf(entry('a', { addedAt: T0, [ENTRY_UPDATED_AT_KEY]: T0 + 5 * HOUR }))).toBe(T0 + 5 * HOUR);
    expect(effectiveTimeOf(entry('a', { addedAt: T0, lastReview: T0 + 9 * HOUR }))).toBe(T0 + 9 * HOUR);
    expect(effectiveTimeOf(entry('a', { addedAt: T0 }))).toBe(T0);
    expect(effectiveTimeOf({ word: 'a' } as unknown as WordbookEntry)).toBe(0);
  });

  it('maxEffectiveTime：空数组 = 0（于是"任何带 updatedAt 的存量词都被保留"）', () => {
    expect(maxEffectiveTime([])).toBe(0);
    expect(maxEffectiveTime([entry('a', { addedAt: T0 }), entry('b', { addedAt: T0 + DAY })])).toBe(T0 + DAY);
  });

  it('withUpdatedAt：来方时间戳更新时原样返回同一引用（客户端时钟超前不后退）', () => {
    const ahead = entry('a', { [ENTRY_UPDATED_AT_KEY]: T0 + 100 * HOUR });
    expect(withUpdatedAt(ahead, T0)).toBe(ahead);
    expect(updatedAtOf(withUpdatedAt(entry('a'), T0 + HOUR))).toBe(T0 + HOUR);
  });

  it('normalizeEntry：不认识的键照样带过去，只补 addedAt / 归一词名', () => {
    const n = normalizeEntry({ word: ' MiXeD ', future: { a: 1 } } as unknown as WordbookEntry, T0 + 3);
    expect(n.word).toBe('mixed');
    expect(n.addedAt).toBe(T0 + 3);
    expect(n.future).toEqual({ a: 1 });
    expect(keysOf(n)).toEqual(['word', 'future', 'addedAt']);
  });

  it('wordKeyOf：非字符串 / null 条目归一为空串（调用方据此跳过，不炸）', () => {
    expect(wordKeyOf(null)).toBe('');
    expect(wordKeyOf({ word: '  A B ' } as WordbookEntry)).toBe('a b');
  });

  it('invalidWordKeys：只报空词，供门面层做 4xx 判定（§4.6 无对应码 → 报告 P-2）', () => {
    expect(invalidWordKeys([entry('ok'), { word: '  ' } as WordbookEntry, { word: 3 } as unknown as WordbookEntry])).toEqual(['  ', '3']);
  });
});
