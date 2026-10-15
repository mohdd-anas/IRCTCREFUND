import { env } from "./env";
import { logger } from "./logger";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

/**
 * In-memory sliding window rate limiter with automated bucket cleanup.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private requests = new Map<string, number[]>();

  constructor(
    private maxRequests: number = env.RATE_LIMIT_MAX_REQUESTS,
    private windowMs: number = env.RATE_LIMIT_WINDOW_MS
  ) {}

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const timestamps = (this.requests.get(key) || []).filter((ts) => ts > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const oldest = timestamps[0];
      const resetMs = Math.max(0, oldest + this.windowMs - now);

      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetMs,
      };
    }

    timestamps.push(now);
    this.requests.set(key, timestamps);

    // Evict expired entries periodically to prevent memory leak
    if (this.requests.size > 1000) {
      for (const [k, tsList] of this.requests.entries()) {
        const valid = tsList.filter((ts) => ts > windowStart);
        if (valid.length === 0) {
          this.requests.delete(k);
        } else {
          this.requests.set(k, valid);
        }
      }
    }

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: this.maxRequests - timestamps.length,
      resetMs: this.windowMs,
    };
  }

  // Helper for tests
  reset() {
    this.requests.clear();
  }
}

/**
 * Upstash Redis rate limiter using native HTTP REST API.
 */
export class UpstashRedisRateLimiter implements RateLimiter {
  constructor(
    private restUrl: string,
    private restToken: string,
    private maxRequests: number = env.RATE_LIMIT_MAX_REQUESTS,
    private windowMs: number = env.RATE_LIMIT_WINDOW_MS
  ) {}

  async check(key: string): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${key}`;
    const windowSec = Math.ceil(this.windowMs / 1000);

    try {
      // Execute INCR and EXPIRE pipeline via Upstash REST API
      const res = await fetch(`${this.restUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.restToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["EXPIRE", redisKey, windowSec, "NX"],
          ["TTL", redisKey],
        ]),
      });

      if (!res.ok) {
        throw new Error(`Upstash returned status ${res.status}`);
      }

      const results = (await res.json()) as Array<{ result: unknown }>;
      const count = Number(results[0]?.result ?? 1);
      const ttlSec = Number(results[2]?.result ?? windowSec);

      const remaining = Math.max(0, this.maxRequests - count);
      const allowed = count <= this.maxRequests;

      return {
        allowed,
        limit: this.maxRequests,
        remaining,
        resetMs: ttlSec * 1000,
      };
    } catch (err) {
      logger.error("Upstash rate limit check failed, falling back to permissive allow", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fail open on rate limiter infra failure so users aren't locked out
      return {
        allowed: true,
        limit: this.maxRequests,
        remaining: 1,
        resetMs: this.windowMs,
      };
    }
  }
}

let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      rateLimiterInstance = new UpstashRedisRateLimiter(
        env.UPSTASH_REDIS_REST_URL,
        env.UPSTASH_REDIS_REST_TOKEN,
        env.RATE_LIMIT_MAX_REQUESTS,
        env.RATE_LIMIT_WINDOW_MS
      );
    } else {
      rateLimiterInstance = new InMemoryRateLimiter(
        env.RATE_LIMIT_MAX_REQUESTS,
        env.RATE_LIMIT_WINDOW_MS
      );
    }
  }
  return rateLimiterInstance;
}
