import { CmsError } from "./errors.ts";

const buckets = new Map<string, number[]>();

export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
  now = Date.now(),
): void {
  const cutoff = now - windowMs;
  const recent = (buckets.get(key) ?? []).filter((time) => time > cutoff);
  if (recent.length >= limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((recent[0] + windowMs - now) / 1000),
    );
    buckets.set(key, recent);
    throw new CmsError(
      429,
      "rate_limited",
      "Too many changes in a short time. Wait a moment and try again.",
      { retryAfter },
    );
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5_000) {
    for (const [bucketKey, times] of buckets) {
      if (times.every((time) => time <= cutoff)) buckets.delete(bucketKey);
    }
  }
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
