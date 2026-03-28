export interface RateLimitRule {
  bucket: string;
  windowMs: number;
  maxRequests: number;
}

export interface RateLimiter {
  check(key: string, rule: RateLimitRule): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  close?(): Promise<void>;
}

interface Entry {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly entries = new Map<string, Entry>();

  async check(key: string, rule: RateLimitRule): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const now = Date.now();
    const compositeKey = `${rule.bucket}:${key}`;
    const existing = this.entries.get(compositeKey);
    if (!existing || existing.resetAt <= now) {
      this.entries.set(compositeKey, { count: 1, resetAt: now + rule.windowMs });
      return { allowed: true, retryAfterSeconds: Math.ceil(rule.windowMs / 1000) };
    }
    if (existing.count >= rule.maxRequests) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
    }
    existing.count += 1;
    return { allowed: true, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
}
