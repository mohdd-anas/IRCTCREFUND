import { createHash } from "crypto";
import { env } from "./env";

/**
 * Creates a salted SHA-256 hash of a PNR.
 * Hard Rule: Never store, log, or expose raw PNRs.
 */
export function hashPnr(pnr: string, salt: string = env.PNR_HASH_SALT): string {
  return createHash("sha256")
    .update(`${salt}:${pnr.trim()}`)
    .digest("hex");
}
