#!/usr/bin/env node

/**
 * RailRefund TTL Snapshot Cleanup Script
 * Cleans up expired PNR snapshots to adhere to minimal data retention rules.
 * Runs standalone without background queue workers (no BullMQ/Redis required).
 */

import { getRepository } from "../app/lib/db/repository";
import { logger } from "../app/lib/logger";

async function runCleanup() {
  const startTime = Date.now();
  logger.info("Starting TTL expired snapshots cleanup job");

  try {
    const repository = getRepository();
    const deletedCount = await repository.cleanupExpiredSnapshots();
    const durationMs = Date.now() - startTime;

    logger.info("TTL expired snapshots cleanup job completed successfully", {
      deletedCount,
      durationMs,
    });

    console.log(`[cleanup-ttl] Removed ${deletedCount} expired snapshot(s) in ${durationMs}ms.`);
    process.exit(0);
  } catch (err) {
    logger.error("TTL expired snapshots cleanup job failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    console.error("[cleanup-ttl] Error during cleanup:", err);
    process.exit(1);
  }
}

runCleanup();
