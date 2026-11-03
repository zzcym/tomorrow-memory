/**
 * 头像校验（R-04①② / 审计 S4·C-04·C-18）——**REST 与 tRPC 两门面的唯一判定入口**。
 *
 * 现状缺陷（本文件收口）：tRPC `profile.update` 的 avatar 上限是 500 字符、
 * REST `PUT /api/profile` 是 200_000 字符，两张 200×200 的 JPEG 一张也收不下 →
 * "换头像永远失败"（PRD §3.3 S4）。收口后两侧都按 `AVATAR_MAX_BYTES`（300KB，解码后的真实字节数）
 * + `AVATAR_MAX_SIDE_PX`（200px 边长）判定，超限返回 `@tm/shared` 的**同一条人话**（判据③）。
 *
 * Q4 定案：**本期不迁对象存储**（PRD R-04⑥ / §3.2-B）——不落文件、不回填历史 base64，
 * `profiles.avatar` 的存量 base64 原样保留并继续显示（本文件只在**写入路径**上判定，读路径不设限）。
 * 新值允许 dataUrl（短 base64）或 http(s) URL 两种形态（R-04⑥"新上传返回 URL 或短 base64 均可"）。
 *
 * 开关：`avatarUnifiedLimit`（§4.4.4 / PRD §6.4-5-6，默认 `on`）。
 * off = 回退到"改动前的默认行为"= 两门面各自的旧字符上限，不报错也不改变存储内容。
 *
 * ⚠ 错误码与文案一律 import 自 `@tm/shared`（A-28-4：域内不得再建第二份码表）。
 */

import {
  AVATAR_MAX_BYTES,
  AVATAR_MAX_SIDE_PX,
  TM_ERROR_CODES,
  TM_ERRORS,
  decodedDataUrlBytes,
  errorMessage,
} from '@tm/shared';

/** 统一后的错误出口（HTTP 状态取 shared 表内的 `http`，不在本文件抄一遍数字）。 */
export const AVATAR_ERROR_HTTP_STATUS: number = TM_ERRORS.AVATAR_TOO_LARGE.http;

/**
 * 头像取值**不是图片数据**时的人话（与 `AVATAR_TOO_LARGE_COPY` 同性质：判定与文案同处一个出口）。
 * ⚠ 这条文案在 `@tm/shared` 里**没有对应的码**（§4.6 与 `TM_ERRORS_SUPPLEMENT` 都没有），
 * 批次3 期间不许自建码表也不许改 shared（A-28-4），故先收在本文件当唯一出口，
 * 已由报告待裁决点 P-4 提请 T-03 在出口轮一次性收进 shared。
 * 之前 `routes/avatar.ts` 里另有一份逐字相同的字面量 = 第二处真相，已删。
 */
export const AVATAR_BAD_FORMAT_COPY = '头像数据格式不正确';

export class AvatarError extends Error {
  readonly tmCode: typeof TM_ERROR_CODES.AVATAR_TOO_LARGE = TM_ERROR_CODES.AVATAR_TOO_LARGE;
  /** 被哪一面调用（诊断用，不影响文案）。 */
  readonly facade: 'rest' | 'trpc' | 'avatar-api';

  constructor(message: string, facade: 'rest' | 'trpc' | 'avatar-api' = 'avatar-api') {
    super(message);
    this.name = 'AvatarError';
    this.facade = facade;
  }
}

/** 领域错误 → `{ error, code }` 响应体（§4.6：`error` 是人话、`code` 是新增可选键）。 */
export function avatarErrorBody(err: AvatarError): {
  status: number;
  body: { error: string; code: string };
} {
  return { status: AVATAR_ERROR_HTTP_STATUS, body: { error: err.message, code: err.tmCode } };
}

/** tRPC 侧同一错误的载体（`TRPCError` 只有码名，映射到 shared 表的 http 语义位）。 */
export function avatarErrorTrpcCode(_err: AvatarError): 'BAD_REQUEST' {
  return 'BAD_REQUEST';
}

/* ───────────────────── dataUrl 解析（不引第三方依赖） ───────────────────── */

export interface DecodedAvatar {
  kind: 'data-url' | 'remote-url' | 'raw-base64';
  /** 原始输入（trim 后），落库用。 */
  value: string;
  mime: string | null;
  /** 解码后的真实字节数；URL 形态没有本地字节 ⇒ null。 */
  bytes: number | null;
  /** 图片宽高；解不出（非图/未知编码）⇒ null。 */
  width: number | null;
  height: number | null;
}

const DATA_URL_RE = /^data:([\w.+-]+\/[\w.+-]+)?(;[\w=;,-]*)?(,|$)/;

// base64 正文的解码字节数 —— **复用 `@tm/shared` 的 `decodedDataUrlBytes()`**（全库唯一实现，见 decodeAvatar）。
// 本文件过去自己抄了一份同口径的算法、注释里却写着"复用它"：那是一份没人看守的第二实现，
// 一旦 shared 侧改了 padding/取正文的口径，300KB 那条线就会在两处各算一遍（= C-04 的成因）。

/**
 * 图片宽高嗅探（JPEG SOF / PNG IHDR / GIF LSD / WEBP VP8*）。
 * 只做"读头部"这一件事：本期不落文件、不做转码 ⇒ 不需要完整解码器，
 * 也符合"不新增第三方依赖"的硬约束。
 */
export function sniffImageSize(buf: Uint8Array): { width: number; height: number } | null {
  const at = (i: number): number => buf[i] ?? 0;
  const u16be = (i: number): number => (at(i) << 8) | at(i + 1);
  const u16le = (i: number): number => at(i) | (at(i + 1) << 8);
  const u32be = (i: number): number => (((at(i) << 24) >>> 0) + (at(i + 1) << 16)) + (at(i + 2) << 8) + at(i + 3);

  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR(width,height)
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
    return { width: u32be(16), height: u32be(20) };
  }
  // GIF: 'GIF87a'/'GIF89a' + logical screen descriptor
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) {
    return { width: u16le(6), height: u16le(8) };
  }
  // WEBP: RIFF....WEBP + VP8 /VP8L /VP8X
  if (u16be(0) === 0x5249 && u16be(8) === 0x5745) {
    const c = String.fromCharCode(at(12), at(13), at(14), at(15));
    if (c === 'VP8 ') {
      return { width: u16le(28) & 0x3fff, height: u16le(30) & 0x3fff };
    }
    if (c === 'VP8L') {
      const bits = at(21) | (at(22) << 8) | (at(23) << 16) | (at(24) << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (c === 'VP8X') {
      return {
        width: 1 + (at(24) | (at(25) << 8) | (at(26) << 16)),
        height: 1 + (at(27) | (at(28) << 8) | (at(29) << 16)),
      };
    }
    return null;
  }
  // JPEG: FFD8 + 段扫描找 SOFn
  if (at(0) === 0xff && at(1) === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (at(i) !== 0xff) {
        i += 1;
        continue;
      }
      const marker = at(i + 1);
      // SOF0..SOF15（跳过 DHT=C4 / JPG=C8 / DAC=CC）
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: u16be(i + 5), width: u16be(i + 7) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = u16be(i + 2);
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  return null;
}

/** base64 → 字节（只用到头部，整图不落地）。非法 base64 返回 null。 */
function decodeBase64Head(body: string, max = 64): Uint8Array | null {
  try {
    const head = body.slice(0, Math.max(max, 8));
    const bin = Buffer.from(head, 'base64');
    return new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength);
  } catch {
    return null;
  }
}

/**
 * 解析头像取值。不做判定，只给事实（判定在 `assertAvatarValue` 一处）。
 * 允许的形态：`data:image/*;base64,…` / `http(s)://…` / 裸 base64（旧客户端只发正文，无 data: 前缀）。
 */
export function decodeAvatar(raw: string): DecodedAvatar {
  const value = raw.trim();
  const m = DATA_URL_RE.exec(value);
  if (m) {
    const mime = m[1] ?? null;
    const isBase64 = /;base64$/i.test(m[2] ?? '');
    const body = value.slice(value.indexOf(',') + 1);
    if (!isBase64) {
      // data URL 的 URL 编码形态：按字符数保守估字节
      return { kind: 'data-url', value, mime, bytes: body.length, width: null, height: null };
    }
    const bytes = decodedDataUrlBytes(value);
    const size = sniffImageSize(decodeBase64Head(body) ?? new Uint8Array());
    return { kind: 'data-url', value, mime, bytes, width: size?.width ?? null, height: size?.height ?? null };
  }
  if (/^https?:\/\//i.test(value)) {
    return { kind: 'remote-url', value, mime: null, bytes: null, width: null, height: null };
  }
  // 裸 base64（旧 App 直接发正文）：按 dataUrl 同等对待
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 32) {
    const compact = value.replace(/\s+/g, '');
    const bytes = decodedDataUrlBytes(compact);
    const size = sniffImageSize(decodeBase64Head(compact) ?? new Uint8Array());
    return { kind: 'raw-base64', value: compact, mime: null, bytes, width: size?.width ?? null, height: size?.height ?? null };
  }
  // 既不是 URL 也不是 base64 ⇒ 无法度量，按"非图片数据"处理（字节数按字符数保守计）
  return { kind: 'raw-base64', value, mime: null, bytes: value.length, width: null, height: null };
}

/* ───────────────────── 判定（两门面共用的一处） ───────────────────── */

export interface AvatarLimitOptions {
  /** 'unified' = 本期统一上限（默认，开关 on）；'legacy' = 回退到改动前的字符上限（开关 off） */
  mode?: 'unified' | 'legacy';
  /** legacy 模式下这一面的旧字符上限（REST 200_000 / tRPC 500，由调用方传入自己的历史值） */
  legacyMaxChars?: number;
  /** 错误出自哪一面（只影响诊断字段，不影响文案） */
  facade?: 'rest' | 'trpc' | 'avatar-api';
}

/**
 * 校验头像取值并返回可落库的字符串。
 * @throws AvatarError 一律 `AVATAR_TOO_LARGE` 同一条人话（判据③ 要求两门面逐字相同）
 */
export function assertAvatarValue(raw: unknown, opts: AvatarLimitOptions = {}): string {
  const facade = opts.facade ?? 'avatar-api';
  if (typeof raw !== 'string' || raw.trim() === '') {
    // 空串 = 清空头像（R-04⑤ 允许写空）；非字符串是入参非法，不是"图片太大"
    if (raw === '' || raw === null || raw === undefined) return '';
    throw new AvatarError(AVATAR_BAD_FORMAT_COPY, facade);
  }
  const decoded = decodeAvatar(raw);

  if (opts.mode === 'legacy') {
    const max = opts.legacyMaxChars ?? AVATAR_MAX_BYTES;
    if (raw.length > max) {
      throw new AvatarError(errorMessage(TM_ERROR_CODES.AVATAR_TOO_LARGE), facade);
    }
    return decoded.value;
  }

  // ① 字节上限：以解码后的真实大小为准（R-04②：300KB）
  if (decoded.bytes !== null && decoded.bytes > AVATAR_MAX_BYTES) {
    throw new AvatarError(errorMessage(TM_ERROR_CODES.AVATAR_TOO_LARGE), facade);
  }
  // ② 字符上限：base64 正文 4/3 展开后的字符数也要能进 `profiles.avatar`
  //    （与 bodyLimit 对齐的临界问题 = C-18：`AVATAR_MAX_BYTES` 的 base64 形态恒 < `HTTP_BODY_LIMIT_BYTES`）
  if (decoded.kind !== 'remote-url' && decoded.value.length > Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 512) {
    throw new AvatarError(errorMessage(TM_ERROR_CODES.AVATAR_TOO_LARGE), facade);
  }
  // ③ 尺寸上限：只在对"能读出宽高"的图片数据判定（判据③ 的 200×200 即此路）
  if (decoded.width !== null && decoded.height !== null) {
    if (decoded.width > AVATAR_MAX_SIDE_PX || decoded.height > AVATAR_MAX_SIDE_PX) {
      throw new AvatarError(errorMessage(TM_ERROR_CODES.AVATAR_TOO_LARGE), facade);
    }
  }
  // ④ 形态：dataUrl 必须是 image/*；URL 必须是 http(s)
  if (decoded.kind === 'data-url' && decoded.mime !== null && !decoded.mime.startsWith('image/')) {
    throw new AvatarError(errorMessage(TM_ERROR_CODES.AVATAR_TOO_LARGE), facade);
  }
  if (decoded.kind === 'raw-base64' && !/^https?:\/\//i.test(decoded.value) && !/^[A-Za-z0-9+/]+={0,2}$/.test(decoded.value)) {
    throw new AvatarError(errorMessage(TM_ERROR_CODES.AVATAR_TOO_LARGE), facade);
  }
  return decoded.value;
}

/** 判据文案的**唯一**导出点（测试与两端引用它，防止第二份人话出现）。 */
export const AVATAR_TOO_LARGE_COPY: string = TM_ERRORS.AVATAR_TOO_LARGE.copy;

/**
 * 入参侧的字符上限（= `AVATAR_MAX_BYTES` 的 base64 展开 + dataUrl 前缀余量）。
 * zod / Hono 只挡"明显超长的请求体"，真实字节数与宽高判定永远在 `assertAvatarValue` 一处，
 * 这样两门面不会因为各自抄了一份数字而再次跑偏（C-04 的成因）。
 */
export const AVATAR_MAX_DATA_URL_CHARS = Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 512;

export { AVATAR_MAX_BYTES, AVATAR_MAX_SIDE_PX };
