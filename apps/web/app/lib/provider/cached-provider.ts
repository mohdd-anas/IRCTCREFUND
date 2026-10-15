import type { CanonicalPnr } from "../types";
import type { PnrProvider, CacheStore } from "./types";
import { hashPnr } from "../crypto";
import { logger } from "../logger";
import { env } from "../env";

/**
 * In-memory fallback cache store for PNR snapshots.
 */
export class InMemoryCacheStore implements CacheStore {
  private cache = new Map<string, { data: CanonicalPnr; expiresAt: number }>();

  async get(key: string): Promise<CanonicalPnr | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  async set(key: string, value: CanonicalPnr, ttlSeconds: number): Promise<void> {
    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Upstash Redis cache store using native HTTP REST API.
 */
export class UpstashRedisCacheStore implements CacheStore {
  constructor(private restUrl: string, private restToken: string) {}

  async get(key: string): Promise<CanonicalPnr | null> {
    try {
      const res = await fetch(`${this.restUrl}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${this.restToken}` },
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json.result) return null;
      return typeof json.result === "string" ? JSON.parse(json.result) : json.result;
    } catch (err) {
      logger.warn("Upstash cache read failed, falling back to provider lookup", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async set(key: string, value: CanonicalPnr, ttlSeconds: number): Promise<void> {
    try {
      await fetch(
        `${this.restUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(
          JSON.stringify(value)
        )}?ex=${ttlSeconds}`,
        {
          headers: { Authorization: `Bearer ${this.restToken}` },
        }
      );
    } catch (err) {
      logger.warn("Upstash cache write failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fetch(`${this.restUrl}/del/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${this.restToken}` },
      });
    } catch {
      // Ignored
    }
  }
}

/**
 * CachedProviderDecorator: Decorates any PnrProvider with short-TTL caching.
 * Hard Rule: Never store raw PNRs in cache keys. Hashed keys only.
 */
export class CachedProviderDecorator implements PnrProvider {
  public readonly name: string;

  constructor(
    private innerProvider: PnrProvider,
    private cacheStore: CacheStore,
    private ttlSeconds: number = 900 // 15 minutes default short TTL
  ) {
    this.name = `cached(${innerProvider.name})`;
  }

  async getPnrStatus(pnr: string): Promise<CanonicalPnr> {
    const cacheKey = `pnr_cache:${hashPnr(pnr)}`;

    // 1. Check cache first
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      logger.info("Serving PNR status from short-TTL cache", {
        provider: this.name,
        pnrHashPrefix: hashPnr(pnr).slice(0, 8),
      });
      return cached;
    }

    // 2. Query inner provider on cache miss
    const fresh = await this.innerProvider.getPnrStatus(pnr);

    // 3. Populate cache
    await this.cacheStore.set(cacheKey, fresh, this.ttlSeconds);

    return fresh;
  }
}

export function createDefaultCacheStore(): CacheStore {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRedisCacheStore(
      env.UPSTASH_REDIS_REST_URL,
      env.UPSTASH_REDIS_REST_TOKEN
    );
  }
  return new InMemoryCacheStore();
}
