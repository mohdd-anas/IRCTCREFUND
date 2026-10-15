import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockPnrProvider } from "@/app/lib/mock-provider";
import { TemplatePnrAdapter } from "@/app/lib/provider/adapter-template";
import { CachedProviderDecorator, InMemoryCacheStore } from "@/app/lib/provider/cached-provider";
import { FallbackProviderChain } from "@/app/lib/provider/fallback-chain";
import { PnrProviderFactory } from "@/app/lib/provider/factory";
import type { PnrProvider } from "@/app/lib/provider/types";
import type { CanonicalPnr } from "@/app/lib/types";

describe("Sprint 4 — Provider Layer & Contract Tests", () => {
  /* ─── 1. CanonicalPnr Contract Verification ─── */
  const verifyCanonicalContract = (provider: PnrProvider, testPnr: string) => {
    return async () => {
      const result: CanonicalPnr = await provider.getPnrStatus(testPnr);

      // Top-level structure
      expect(result).toHaveProperty("pnr");
      expect(result.pnr).toMatch(/^\d{10}$/);
      expect(result).toHaveProperty("journey");
      expect(result).toHaveProperty("booking");
      expect(result).toHaveProperty("passengers");

      // Journey fields
      expect(result.journey.trainNumber).toBeDefined();
      expect(result.journey.source).toBeDefined();
      expect(result.journey.destination).toBeDefined();
      expect(result.journey.journeyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(result.journey.departureTime).toString()).not.toBe("Invalid Date");

      // Booking fields
      expect(result.booking.fare).toBeGreaterThan(0);
      expect(["GENERAL", "TATKAL", "PREMIUM_TATKAL"]).toContain(result.booking.ticketType);
      expect(["CONFIRMED", "RAC", "WAITLISTED"]).toContain(result.booking.bookingStatus);
      expect(["PREPARED", "NOT_PREPARED"]).toContain(result.booking.chartStatus);

      // Passenger fields
      expect(Array.isArray(result.passengers)).toBe(true);
      expect(result.passengers.length).toBeGreaterThan(0);
      for (const p of result.passengers) {
        expect(p.bookingStatus).toBeDefined();
        expect(p.currentStatus).toBeDefined();
      }
    };
  };

  describe("Provider Contract Compliance", () => {
    it("MockPnrProvider satisfies CanonicalPnr contract", verifyCanonicalContract(new MockPnrProvider(), "1234567890"));
    it("TemplatePnrAdapter satisfies CanonicalPnr contract", verifyCanonicalContract(new TemplatePnrAdapter(), "1234567890"));
  });

  /* ─── 2. Cache Decorator ─── */
  describe("CachedProviderDecorator", () => {
    let mockInner: PnrProvider;
    let cacheStore: InMemoryCacheStore;
    let cachedProvider: CachedProviderDecorator;
    let callCount: number;

    beforeEach(() => {
      callCount = 0;
      mockInner = {
        name: "test-inner-provider",
        async getPnrStatus(pnr: string): Promise<CanonicalPnr> {
          callCount++;
          return {
            pnr,
            journey: {
              trainNumber: "12301",
              source: "NDLS",
              destination: "HWH",
              journeyDate: "2026-11-10",
              departureTime: "2026-11-10T16:00:00+05:30",
            },
            booking: {
              fare: 2500,
              class: "2A",
              quota: "GN",
              ticketType: "GENERAL",
              bookingStatus: "CONFIRMED",
              chartStatus: "NOT_PREPARED",
            },
            passengers: [{ bookingStatus: "CNF", currentStatus: "CNF" }],
          };
        },
      };

      cacheStore = new InMemoryCacheStore();
      cachedProvider = new CachedProviderDecorator(mockInner, cacheStore, 60);
    });

    it("avoids redundant provider calls when cache hit occurs", async () => {
      // First call: cache miss, calls inner provider
      const res1 = await cachedProvider.getPnrStatus("1234567890");
      expect(res1.pnr).toBe("1234567890");
      expect(callCount).toBe(1);

      // Second call: cache hit, inner provider NOT called again
      const res2 = await cachedProvider.getPnrStatus("1234567890");
      expect(res2.pnr).toBe("1234567890");
      expect(callCount).toBe(1); // Call count remains 1!
    });

    it("calls provider on distinct PNRs", async () => {
      await cachedProvider.getPnrStatus("1111111111");
      await cachedProvider.getPnrStatus("2222222222");
      expect(callCount).toBe(2);
    });
  });

  /* ─── 3. Fallback Provider Chain ─── */
  describe("FallbackProviderChain", () => {
    it("switches to secondary provider when primary encounters transient error", async () => {
      const primaryFail: PnrProvider = {
        name: "primary-flaky",
        async getPnrStatus(): Promise<CanonicalPnr> {
          throw new Error("ETIMEDOUT: Connection to railway upstream timed out");
        },
      };

      const secondarySuccess: PnrProvider = {
        name: "secondary-backup",
        async getPnrStatus(pnr: string): Promise<CanonicalPnr> {
          return {
            pnr,
            journey: {
              trainNumber: "12951",
              source: "BCT",
              destination: "NDLS",
              journeyDate: "2026-11-12",
              departureTime: "2026-11-12T17:00:00+05:30",
            },
            booking: {
              fare: 3100,
              class: "1A",
              quota: "GN",
              ticketType: "GENERAL",
              bookingStatus: "CONFIRMED",
              chartStatus: "NOT_PREPARED",
            },
            passengers: [{ bookingStatus: "CNF", currentStatus: "CNF" }],
          };
        },
      };

      const chain = new FallbackProviderChain([primaryFail, secondarySuccess]);
      const res = await chain.getPnrStatus("1234567890");

      expect(res.journey.trainNumber).toBe("12951");
      expect(res.pnr).toBe("1234567890");
    });

    it("does NOT switch to secondary provider when PNR is 404 (not found)", async () => {
      let secondaryCalled = false;

      const primaryNotFound: PnrProvider = {
        name: "primary",
        async getPnrStatus(): Promise<CanonicalPnr> {
          throw new Error("PNR_NOT_FOUND");
        },
      };

      const secondary: PnrProvider = {
        name: "secondary",
        async getPnrStatus(): Promise<CanonicalPnr> {
          secondaryCalled = true;
          throw new Error("Should never be called");
        },
      };

      const chain = new FallbackProviderChain([primaryNotFound, secondary]);

      await expect(chain.getPnrStatus("9999999999")).rejects.toThrow("PNR_NOT_FOUND");
      expect(secondaryCalled).toBe(false); // Verified: no fallback on 404
    });

    it("throws aggregated error if all providers in chain fail", async () => {
      const p1: PnrProvider = {
        name: "p1",
        async getPnrStatus() {
          throw new Error("P1 network down");
        },
      };
      const p2: PnrProvider = {
        name: "p2",
        async getPnrStatus() {
          throw new Error("P2 upstream 503");
        },
      };

      const chain = new FallbackProviderChain([p1, p2]);
      await expect(chain.getPnrStatus("1234567890")).rejects.toThrow(/All providers in chain failed/);
    });
  });

  /* ─── 4. PnrProviderFactory & Hard Rule 7 Production Guard ─── */
  describe("PnrProviderFactory & Production Guardrail", () => {
    it("creates cached mock provider in development mode", () => {
      const provider = PnrProviderFactory.create({ enableCache: true });
      expect(provider.name).toContain("cached");
      expect(provider.name).toContain("mock-provider");
    });

    it("fails closed in production if mock provider is used without authorization", () => {
      const envObj = process.env as Record<string, string | undefined>;
      const origNodeEnv = envObj["NODE_ENV"];
      const origAllowMock = envObj["ALLOW_MOCK_PROVIDER"];

      try {
        envObj["NODE_ENV"] = "production";
        envObj["ALLOW_MOCK_PROVIDER"] = "false";
        envObj["PNR_PROVIDER"] = "mock";

        expect(() => {
          PnrProviderFactory.create();
        }).toThrow(/MockPnrProvider cannot be used in production/);
      } finally {
        envObj["NODE_ENV"] = origNodeEnv;
        envObj["ALLOW_MOCK_PROVIDER"] = origAllowMock;
      }
    });
  });
});
