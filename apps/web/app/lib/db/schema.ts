import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";

/**
 * 1. pnr_requests table
 * Minimal request telemetry — NEVER contains raw PNR.
 */
export const pnrRequests = pgTable(
  "pnr_requests",
  {
    requestId: text("request_id").primaryKey(),
    pnrHash: text("pnr_hash").notNull(),
    status: text("status").notNull(), // "SUCCESS" | "NOT_FOUND" | "TIMEOUT" | "ERROR"
    latencyMs: integer("latency_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pnrHashIdx: index("pnr_requests_pnr_hash_idx").on(table.pnrHash),
    createdAtIdx: index("pnr_requests_created_at_idx").on(table.createdAt),
  })
);

/**
 * 2. pnr_snapshots table
 * Short-lived cache of canonical PNR data.
 * Minimal data retention with TTL expiration.
 */
export const pnrSnapshots = pgTable(
  "pnr_snapshots",
  {
    id: text("id").primaryKey(), // Usually pnrHash or UUID
    pnrHash: text("pnr_hash").notNull(),
    canonicalJson: jsonb("canonical_json").notNull(),
    provider: text("provider").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pnrHashIdx: index("pnr_snapshots_pnr_hash_idx").on(table.pnrHash),
    expiresAtIdx: index("pnr_snapshots_expires_at_idx").on(table.expiresAt),
  })
);

/**
 * 3. refund_calculations table
 * Persists the exact input snapshot + rule version + provider + calculation result.
 * Answers: "Why did we return this amount on this date?" from one query.
 */
export const refundCalculations = pgTable(
  "refund_calculations",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id"),
    pnrHash: text("pnr_hash").notNull(),
    inputSnapshot: jsonb("input_snapshot").notNull(),
    ruleVersion: text("rule_version").notNull(),
    provider: text("provider").notNull(),
    result: jsonb("result").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pnrHashIdx: index("refund_calculations_pnr_hash_idx").on(table.pnrHash),
    requestIdIdx: index("refund_calculations_request_id_idx").on(table.requestId),
    timestampIdx: index("refund_calculations_timestamp_idx").on(table.timestamp),
  })
);

/**
 * 4. refund_rules table
 * Auditable repository of rules with versioning, sources, and validity periods.
 */
export const refundRules = pgTable(
  "refund_rules",
  {
    id: text("id").primaryKey(),
    version: text("version").notNull(),
    ruleType: text("rule_type").notNull(), // "CONFIRMED" | "TIME_SLAB" | "AUTO_CANCEL"
    ticketType: text("ticket_type"),
    travelClass: text("class"),
    quota: text("quota"),
    conditions: jsonb("conditions"),
    calculation: jsonb("calculation").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    source: text("source"),
    status: text("status").notNull(), // "ACTIVE" | "DEPRECATED" | "DRAFT"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    versionIdx: index("refund_rules_version_idx").on(table.version),
    statusIdx: index("refund_rules_status_idx").on(table.status),
  })
);
