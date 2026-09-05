/**
 * 速率限制（滑动窗口计数）
 *
 * - 内存实现：单进程内有效，Redis 未运行时同样工作；多实例部署需切换到集中存储
 * - 键由调用方拼接（如 `ip:1.2.3.4:login`、`user:42:chat`），窗口内超限返回剩余秒数
 * - 过期键惰性清理 + 定期全量清理，避免长期运行内存无界增长
 */

interface Bucket {
  /** 窗口起点（ms） */
  start: number;
  /** 窗口内已计数 */
  count: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/** 超限时返回 { ok:false, retryAfterSeconds }；命中上限前返回 { ok:true, remaining } */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.start + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSeconds };
  }
  bucket.count++;
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** 每分钟全量清理一次过期桶（正常流量下桶数量可控） */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.start >= 24 * 3600_000) buckets.delete(key);
  }
}

/** 从请求头解析客户端 IP（部署在反代后时取 X-Forwarded-For 首段） */
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? 'unknown';
}
