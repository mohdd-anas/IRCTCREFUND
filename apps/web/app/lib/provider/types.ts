import type { CanonicalPnr } from "../types";

/**
 * Common contract for all PNR providers.
 * Hard Rule: The UI never touches a provider's raw response.
 * Any provider must normalize raw data into CanonicalPnr.
 */
export interface PnrProvider {
  readonly name: string;
  getPnrStatus(pnr: string): Promise<CanonicalPnr>;
}

export interface CacheStore {
  get(key: string): Promise<CanonicalPnr | null>;
  set(key: string, value: CanonicalPnr, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}
