import { eq, lte, gt, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pnrRequests, pnrSnapshots, refundCalculations, refundRules } from "./schema";
import type { CanonicalPnr, RefundResult } from "../types";
import { logger } from "../logger";

export interface PnrRequestRecord {
  requestId: string;
  pnrHash: string;
  status: string;
  latencyMs: number;
  createdAt?: Date;
}

export interface PnrSnapshotRecord {
  id: string;
  pnrHash: string;
  canonicalJson: CanonicalPnr;
  provider: string;
  fetchedAt: Date;
  expiresAt: Date;
}

export interface RefundCalculationRecord {
  id: string;
  requestId?: string;
  pnrHash: string;
  inputSnapshot: CanonicalPnr;
  ruleVersion: string;
  provider: string;
  result: RefundResult;
  timestamp: Date;
}

export interface CalculationAuditRecord {
  calculationId: string;
  requestId?: string;
  pnrHash: string;
  timestamp: Date;
  provider: string;
  ruleVersion: string;
  inputSnapshot: CanonicalPnr;
  result: RefundResult;
  auditExplanation: {
    grossFare: number;
    deduction: number | null;
    estimatedRefund: number | null;
    eligibility: string;
    rulesApplied: string[];
    explanationLines: string[];
    warnings: string[];
  };
}

export interface RefundRepository {
  logPnrRequest(req: PnrRequestRecord): Promise<void>;
  savePnrSnapshot(params: {
    pnrHash: string;
    canonicalJson: CanonicalPnr;
    provider: string;
    ttlSeconds?: number;
  }): Promise<void>;
  getPnrSnapshot(pnrHash: string): Promise<{ canonicalJson: CanonicalPnr; provider: string } | null>;
  saveCalculation(params: {
    requestId?: string;
    pnrHash: string;
    inputSnapshot: CanonicalPnr;
    ruleVersion: string;
    provider: string;
    result: RefundResult;
  }): Promise<{ id: string }>;
  getCalculationAudit(calculationId: string): Promise<CalculationAuditRecord | null>;
  cleanupExpiredSnapshots(): Promise<number>;
}

/**
 * In-memory repository implementation for testing and development
 * when PostgreSQL is not configured.
 */
export class InMemoryRefundRepository implements RefundRepository {
  private requests = new Map<string, PnrRequestRecord>();
  private snapshots = new Map<string, PnrSnapshotRecord>();
  private calculations = new Map<string, RefundCalculationRecord>();

  async logPnrRequest(req: PnrRequestRecord): Promise<void> {
    this.requests.set(req.requestId, {
      ...req,
      createdAt: req.createdAt ?? new Date(),
    });
  }

  async savePnrSnapshot(params: {
    pnrHash: string;
    canonicalJson: CanonicalPnr;
    provider: string;
    ttlSeconds?: number;
  }): Promise<void> {
    const now = new Date();
    const ttlSeconds = params.ttlSeconds ?? 3600; // 1 hour default
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const record: PnrSnapshotRecord = {
      id: params.pnrHash,
      pnrHash: params.pnrHash,
      canonicalJson: params.canonicalJson,
      provider: params.provider,
      fetchedAt: now,
      expiresAt,
    };
    this.snapshots.set(params.pnrHash, record);
  }

  async getPnrSnapshot(pnrHash: string): Promise<{ canonicalJson: CanonicalPnr; provider: string } | null> {
    const snap = this.snapshots.get(pnrHash);
    if (!snap) return null;

    if (snap.expiresAt.getTime() <= Date.now()) {
      this.snapshots.delete(pnrHash);
      return null;
    }

    return {
      canonicalJson: snap.canonicalJson,
      provider: snap.provider,
    };
  }

  async saveCalculation(params: {
    requestId?: string;
    pnrHash: string;
    inputSnapshot: CanonicalPnr;
    ruleVersion: string;
    provider: string;
    result: RefundResult;
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    const record: RefundCalculationRecord = {
      id,
      requestId: params.requestId,
      pnrHash: params.pnrHash,
      inputSnapshot: params.inputSnapshot,
      ruleVersion: params.ruleVersion,
      provider: params.provider,
      result: params.result,
      timestamp: new Date(),
    };
    this.calculations.set(id, record);
    return { id };
  }

  /**
   * Answers: "Why did we return this amount on this date?" from one query.
   */
  async getCalculationAudit(calculationId: string): Promise<CalculationAuditRecord | null> {
    const calc = this.calculations.get(calculationId);
    if (!calc) return null;

    return {
      calculationId: calc.id,
      requestId: calc.requestId,
      pnrHash: calc.pnrHash,
      timestamp: calc.timestamp,
      provider: calc.provider,
      ruleVersion: calc.ruleVersion,
      inputSnapshot: calc.inputSnapshot,
      result: calc.result,
      auditExplanation: {
        grossFare: calc.result.grossFare,
        deduction: calc.result.deduction,
        estimatedRefund: calc.result.amount,
        eligibility: calc.result.eligibility,
        rulesApplied: calc.result.ruleIds,
        explanationLines: calc.result.explanation,
        warnings: calc.result.warnings,
      },
    };
  }

  async cleanupExpiredSnapshots(): Promise<number> {
    const now = Date.now();
    let deletedCount = 0;
    for (const [key, snap] of this.snapshots.entries()) {
      if (snap.expiresAt.getTime() <= now) {
        this.snapshots.delete(key);
        deletedCount++;
      }
    }
    return deletedCount;
  }
}

/**
 * Drizzle + PostgreSQL production repository.
 */
export class DrizzlePostgresRepository implements RefundRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(databaseUrl: string) {
    const isLocal =
      databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      max: 10,
    });
    this.db = drizzle(pool);
  }

  async logPnrRequest(req: PnrRequestRecord): Promise<void> {
    try {
      await this.db.insert(pnrRequests).values({
        requestId: req.requestId,
        pnrHash: req.pnrHash,
        status: req.status,
        latencyMs: req.latencyMs,
        createdAt: req.createdAt ?? new Date(),
      });
    } catch (err) {
      logger.warn("Database error logging PNR request", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async savePnrSnapshot(params: {
    pnrHash: string;
    canonicalJson: CanonicalPnr;
    provider: string;
    ttlSeconds?: number;
  }): Promise<void> {
    const now = new Date();
    const ttlSeconds = params.ttlSeconds ?? 3600;
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    try {
      await this.db
        .insert(pnrSnapshots)
        .values({
          id: crypto.randomUUID(),
          pnrHash: params.pnrHash,
          canonicalJson: params.canonicalJson,
          provider: params.provider,
          fetchedAt: now,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: pnrSnapshots.id,
          set: {
            canonicalJson: params.canonicalJson,
            provider: params.provider,
            fetchedAt: now,
            expiresAt,
          },
        });
    } catch (err) {
      logger.warn("Database error saving PNR snapshot", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async getPnrSnapshot(pnrHash: string): Promise<{ canonicalJson: CanonicalPnr; provider: string } | null> {
    try {
      const rows = await this.db
        .select()
        .from(pnrSnapshots)
        .where(and(eq(pnrSnapshots.pnrHash, pnrHash), gt(pnrSnapshots.expiresAt, new Date())))
        .limit(1);

      if (rows.length === 0) return null;

      return {
        canonicalJson: rows[0].canonicalJson as CanonicalPnr,
        provider: rows[0].provider,
      };
    } catch (err) {
      logger.warn("Database error reading PNR snapshot, continuing without cache", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async saveCalculation(params: {
    requestId?: string;
    pnrHash: string;
    inputSnapshot: CanonicalPnr;
    ruleVersion: string;
    provider: string;
    result: RefundResult;
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    try {
      await this.db.insert(refundCalculations).values({
        id,
        requestId: params.requestId,
        pnrHash: params.pnrHash,
        inputSnapshot: params.inputSnapshot,
        ruleVersion: params.ruleVersion,
        provider: params.provider,
        result: params.result,
        timestamp: new Date(),
      });
    } catch (err) {
      logger.warn("Database error saving calculation, proceeding with generated ID", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return { id };
  }

  async getCalculationAudit(calculationId: string): Promise<CalculationAuditRecord | null> {
    const rows = await this.db
      .select()
      .from(refundCalculations)
      .where(eq(refundCalculations.id, calculationId))
      .limit(1);

    if (rows.length === 0) return null;
    const calc = rows[0];
    const res = calc.result as RefundResult;

    return {
      calculationId: calc.id,
      requestId: calc.requestId ?? undefined,
      pnrHash: calc.pnrHash,
      timestamp: calc.timestamp,
      provider: calc.provider,
      ruleVersion: calc.ruleVersion,
      inputSnapshot: calc.inputSnapshot as CanonicalPnr,
      result: res,
      auditExplanation: {
        grossFare: res.grossFare,
        deduction: res.deduction,
        estimatedRefund: res.amount,
        eligibility: res.eligibility,
        rulesApplied: res.ruleIds,
        explanationLines: res.explanation,
        warnings: res.warnings,
      },
    };
  }

  async cleanupExpiredSnapshots(): Promise<number> {
    const result = await this.db
      .delete(pnrSnapshots)
      .where(lte(pnrSnapshots.expiresAt, new Date()));
    return result.rowCount ?? 0;
  }
}

let repositoryInstance: RefundRepository | null = null;

export function getRepository(): RefundRepository {
  if (!repositoryInstance) {
    if (process.env.DATABASE_URL) {
      try {
        repositoryInstance = new DrizzlePostgresRepository(process.env.DATABASE_URL);
      } catch (err) {
        logger.error("Failed to connect to PostgreSQL, falling back to in-memory repository", {
          error: err instanceof Error ? err.message : String(err),
        });
        repositoryInstance = new InMemoryRefundRepository();
      }
    } else {
      repositoryInstance = new InMemoryRefundRepository();
    }
  }
  return repositoryInstance;
}
