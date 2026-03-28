import { createRequire } from 'node:module';

import { RateLimiter, RateLimitRule } from './rate-limiter.js';

const require = createRequire(import.meta.url);
const IORedis = require('ioredis') as new (
  connectionString: string,
  options: {
    lazyConnect: boolean;
    maxRetriesPerRequest: number;
    enableOfflineQueue: boolean;
  },
) => {
  connect(): Promise<unknown>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ttlMs: number): Promise<number>;
  pttl(key: string): Promise<number>;
  quit(): Promise<unknown>;
  disconnect(): void;
};

type RedisClient = InstanceType<typeof IORedis>;

export class RedisRateLimiter implements RateLimiter {
  private readonly redis: RedisClient;

  constructor(connectionString: string) {
    this.redis = new IORedis(connectionString, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  async check(key: string, rule: RateLimitRule): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    await this.redis.connect().catch(() => undefined);
    const ttlMs = rule.windowMs;
    const redisKey = `rate:${rule.bucket}:${key}`;

    const current = await this.redis.incr(redisKey);
    if (current === 1) {
      await this.redis.pexpire(redisKey, ttlMs);
    }

    const remainingTtl = await this.redis.pttl(redisKey);
    const retryAfterSeconds = Math.max(1, Math.ceil((remainingTtl > 0 ? remainingTtl : ttlMs) / 1000));

    if (current > rule.maxRequests) {
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true, retryAfterSeconds };
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
