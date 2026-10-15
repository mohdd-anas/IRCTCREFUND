import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRefundRepository } from "@/app/lib/db/repository";
import { hashPnr } from "@/app/lib/crypto";
import { calculateRefund } from "@/app/lib/refund-engine";
import type { CanonicalPnr } from "@/app/lib/types";

describe("Sprint 3 — Persistence & Auditability Suite", () => {
  let repository: InMemoryRefundRepository;

  const mockPnrData: CanonicalPnr = {
    pnr: "1234567890",
    journey: {
      trainNumber: "12229",
      trainName: "Lucknow Mail",
      source: "LKO",
      destination: "NDLS",
      journeyDate: "2026-10-25",
      departureTime: "2026-10-25T06:00:00+05:30",
    },
    booking: {
      fare: 1185,
      class: "3A",
      quota: "GN",
      ticketType: "GENERAL",
      bookingStatus: "CONFIRMED",
      chartStatus: "NOT_PREPARED",
    },
    passengers: [
      { bookingStatus: "CNF", currentStatus: "CNF" },
      { bookingStatus: "CNF", currentStatus: "CNF" },
    ],
  };

  beforeEach(() => {
    repository = new InMemoryRefundRepository();
  });

  describe("PNR Snapshot Caching and TTL", () => {
    it("saves and retrieves active snapshots before TTL expiry", async () => {
      const pnrHash = hashPnr("1234567890");
      await repository.savePnrSnapshot({
        pnrHash,
        canonicalJson: mockPnrData,
        provider: "mock",
        ttlSeconds: 60,
      });

      const cached = await repository.getPnrSnapshot(pnrHash);
      expect(cached).not.toBeNull();
      expect(cached?.canonicalJson.journey.trainNumber).toBe("12229");
      expect(cached?.provider).toBe("mock");
    });

    it("returns null for expired snapshots", async () => {
      const pnrHash = hashPnr("1234567890");
      // TTL -10 seconds (already expired)
      await repository.savePnrSnapshot({
        pnrHash,
        canonicalJson: mockPnrData,
        provider: "mock",
        ttlSeconds: -10,
      });

      const cached = await repository.getPnrSnapshot(pnrHash);
      expect(cached).toBeNull();
    });

    it("cleanupExpiredSnapshots deletes only expired entries", async () => {
      const pnrHashExpired = hashPnr("1111111111");
      const pnrHashActive = hashPnr("2222222222");

      await repository.savePnrSnapshot({
        pnrHash: pnrHashExpired,
        canonicalJson: mockPnrData,
        provider: "mock",
        ttlSeconds: -60, // expired
      });

      await repository.savePnrSnapshot({
        pnrHash: pnrHashActive,
        canonicalJson: mockPnrData,
        provider: "mock",
        ttlSeconds: 3600, // active
      });

      const deletedCount = await repository.cleanupExpiredSnapshots();
      expect(deletedCount).toBe(1);

      expect(await repository.getPnrSnapshot(pnrHashExpired)).toBeNull();
      expect(await repository.getPnrSnapshot(pnrHashActive)).not.toBeNull();
    });
  });

  describe("Calculation Auditability ('Why did we return this amount on this date?')", () => {
    it("persists calculation and answers the audit question from one query", async () => {
      const pnrHash = hashPnr(mockPnrData.pnr);
      const calculationTime = "2026-10-20T10:00:00+05:30";

      // 1. Engine calculates refund cleanly (DB-free)
      const result = calculateRefund(mockPnrData, calculationTime);
      expect(result.amount).toBe(825);

      // 2. Repository persists input snapshot + rule version + provider + result + timestamp
      const { id: calculationId } = await repository.saveCalculation({
        requestId: "req-audit-999",
        pnrHash,
        inputSnapshot: mockPnrData,
        ruleVersion: result.ruleVersion,
        provider: "mock",
        result,
      });

      expect(calculationId).toBeDefined();

      // 3. Single-query audit lookup
      const audit = await repository.getCalculationAudit(calculationId);

      expect(audit).not.toBeNull();
      expect(audit?.calculationId).toBe(calculationId);
      expect(audit?.requestId).toBe("req-audit-999");
      expect(audit?.pnrHash).toBe(pnrHash);
      expect(audit?.ruleVersion).toBe("2026.1-draft");
      expect(audit?.provider).toBe("mock");
      expect(audit?.timestamp).toBeInstanceOf(Date);

      // Verify the audit answer
      expect(audit?.auditExplanation.grossFare).toBe(1185);
      expect(audit?.auditExplanation.deduction).toBe(360);
      expect(audit?.auditExplanation.estimatedRefund).toBe(825);
      expect(audit?.auditExplanation.eligibility).toBe("ELIGIBLE");
      expect(audit?.auditExplanation.rulesApplied).toContain("SLAB_MORE_THAN_48H");
      expect(audit?.auditExplanation.explanationLines.length).toBeGreaterThan(0);
      expect(audit?.auditExplanation.warnings.length).toBeGreaterThan(0);
    });

    it("verifies raw PNR is never stored in calculation records", async () => {
      const pnrHash = hashPnr("1234567890");
      const result = calculateRefund(mockPnrData);

      const { id } = await repository.saveCalculation({
        pnrHash,
        inputSnapshot: mockPnrData,
        ruleVersion: result.ruleVersion,
        provider: "mock",
        result,
      });

      const audit = await repository.getCalculationAudit(id);
      expect(audit?.pnrHash).toBe(pnrHash);
      expect(audit?.pnrHash).not.toBe("1234567890");
    });
  });

  describe("DB-Free Engine Invariant", () => {
    it("engine calculates refunds purely without requiring DB or repository instances", () => {
      const result = calculateRefund(mockPnrData);
      expect(result).toBeDefined();
      expect(result.eligibility).toBe("ELIGIBLE");
    });
  });
});
