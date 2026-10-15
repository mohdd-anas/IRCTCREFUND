import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryRateLimiter } from "@/app/lib/rate-limiter";
import { RobustProviderWrapper, ProviderError } from "@/app/lib/provider-wrapper";
import { hashPnr } from "@/app/lib/crypto";
import { Logger } from "@/app/lib/logger";
import { POST as pnrLookupHandler } from "@/app/api/pnr/lookup/route";
import { POST as refundCalcHandler } from "@/app/api/refund/calculate/route";
import { GET as healthHandler } from "@/app/api/health/route";
import { NextRequest } from "next/server";
import type { CanonicalPnr } from "@/app/lib/types";

describe("Sprint 2 — API Hardening & Security Suite", () => {
  /* ─── 1. Rate Limiter Tests ─── */
  describe("Rate Limiting", () => {
    let limiter: InMemoryRateLimiter;

    beforeEach(() => {
      limiter = new InMemoryRateLimiter(3, 1000); // 3 requests per 1000ms
    });

    it("allows requests within configured threshold", async () => {
      const res1 = await limiter.check("client-1");
      const res2 = await limiter.check("client-1");
      const res3 = await limiter.check("client-1");

      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(2);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(1);
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(0);
    });

    it("blocks requests once rate limit is exceeded", async () => {
      await limiter.check("client-2");
      await limiter.check("client-2");
      await limiter.check("client-2");

      const blockedRes = await limiter.check("client-2");
      expect(blockedRes.allowed).toBe(false);
      expect(blockedRes.remaining).toBe(0);
      expect(blockedRes.resetMs).toBeGreaterThan(0);
    });

    it("isolates rate limit counters across distinct client keys", async () => {
      await limiter.check("ip-alpha");
      await limiter.check("ip-alpha");
      await limiter.check("ip-alpha");

      const alphaBlocked = await limiter.check("ip-alpha");
      const betaAllowed = await limiter.check("ip-beta");

      expect(alphaBlocked.allowed).toBe(false);
      expect(betaAllowed.allowed).toBe(true);
    });
  });

  /* ─── 2. Provider Timeout & Retry Logic ─── */
  describe("Provider Timeout & Retry Behavior", () => {
    it("times out when provider exceeds timeoutMs threshold", async () => {
      const slowProvider = {
        async getPnrStatus(): Promise<CanonicalPnr> {
          await new Promise((resolve) => setTimeout(resolve, 300));
          throw new Error("Should have timed out");
        },
      };

      const wrapper = new RobustProviderWrapper(slowProvider, {
        timeoutMs: 50,
        maxRetries: 0,
      });

      await expect(wrapper.getPnrStatus("1234567890")).rejects.toThrow(
        /timed out/i
      );
    });

    it("does NOT retry non-retryable 4xx errors (e.g. PNR_NOT_FOUND)", async () => {
      let callCount = 0;
      const notFoundProvider = {
        async getPnrStatus(): Promise<CanonicalPnr> {
          callCount++;
          throw new Error("PNR_NOT_FOUND");
        },
      };

      const wrapper = new RobustProviderWrapper(notFoundProvider, {
        timeoutMs: 500,
        maxRetries: 3,
      });

      await expect(wrapper.getPnrStatus("9999999999")).rejects.toThrow();
      expect(callCount).toBe(1); // Exactly 1 attempt, no retries
    });

    it("retries retryable transient errors up to maxRetries", async () => {
      let callCount = 0;
      const flapperProvider = {
        async getPnrStatus(): Promise<CanonicalPnr> {
          callCount++;
          if (callCount < 3) {
            throw new Error("ETIMEDOUT");
          }
          return {
            pnr: "1234567890",
            journey: {
              trainNumber: "12229",
              source: "LKO",
              destination: "NDLS",
              journeyDate: "2026-10-25",
              departureTime: "2026-10-25T06:00:00+05:30",
            },
            booking: {
              fare: 1000,
              class: "3A",
              quota: "GN",
              ticketType: "GENERAL",
              bookingStatus: "CONFIRMED",
              chartStatus: "NOT_PREPARED",
            },
            passengers: [{ bookingStatus: "CNF", currentStatus: "CNF" }],
          };
        },
      };

      const wrapper = new RobustProviderWrapper(flapperProvider, {
        timeoutMs: 500,
        maxRetries: 3,
      });

      const res = await wrapper.getPnrStatus("1234567890");
      expect(res.pnr).toBe("1234567890");
      expect(callCount).toBe(3); // Initial + 2 retries
    });
  });

  /* ─── 3. Bad Input Handling ─── */
  describe("Bad Input Validation", () => {
    it("returns 400 for PNR with fewer than 10 digits", async () => {
      const req = new NextRequest("http://localhost:3000/api/pnr/lookup", {
        method: "POST",
        body: JSON.stringify({ pnr: "12345" }),
      });

      const res = await pnrLookupHandler(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("Invalid PNR. Please enter a valid 10-digit PNR number.");
    });

    it("returns 400 for PNR containing non-numeric characters", async () => {
      const req = new NextRequest("http://localhost:3000/api/pnr/lookup", {
        method: "POST",
        body: JSON.stringify({ pnr: "123456789A" }),
      });

      const res = await pnrLookupHandler(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("Invalid PNR. Please enter a valid 10-digit PNR number.");
    });

    it("returns 400 for malformed JSON payload in lookup", async () => {
      const req = new NextRequest("http://localhost:3000/api/pnr/lookup", {
        method: "POST",
        body: "{ bad-json-payload",
      });

      const res = await pnrLookupHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Malformed request body/i);
    });

    it("returns 400 for calculation payload with missing/invalid fare", async () => {
      const req = new NextRequest("http://localhost:3000/api/refund/calculate", {
        method: "POST",
        body: JSON.stringify({
          pnrData: {
            pnr: "1234567890",
            journey: {
              trainNumber: "12229",
              source: "LKO",
              destination: "NDLS",
              journeyDate: "2026-10-25",
              departureTime: "2026-10-25T06:00:00+05:30",
            },
            booking: {
              fare: -500, // Invalid negative fare
              class: "3A",
              quota: "GN",
              ticketType: "GENERAL",
              bookingStatus: "CONFIRMED",
              chartStatus: "NOT_PREPARED",
            },
            passengers: [{ bookingStatus: "CNF", currentStatus: "CNF" }],
          },
        }),
      });

      const res = await refundCalcHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid ticket data. Unable to calculate refund.");
    });
  });

  /* ─── 4. Error-Shape Non-Leakage & Privacy ─── */
  describe("Error-Shape Non-Leakage & PNR Privacy", () => {
    it("never leaks stack traces, environment vars or provider details in errors", async () => {
      const req = new NextRequest("http://localhost:3000/api/pnr/lookup", {
        method: "POST",
        body: JSON.stringify({ pnr: "9999999999" }), // Unknown PNR
      });

      const res = await pnrLookupHandler(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data).toHaveProperty("error");
      expect(data).not.toHaveProperty("stack");
      expect(data).not.toHaveProperty("provider");
      expect(data).not.toHaveProperty("internal");
    });

    it("consistently hashes PNR using salted SHA-256", () => {
      const pnr = "1234567890";
      const hash1 = hashPnr(pnr);
      const hash2 = hashPnr(pnr);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
      expect(hash1).not.toContain(pnr); // Never contains raw PNR
    });

    it("redacts raw PNR when logging structured entries", () => {
      const loggedEntries: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((msg) => {
        loggedEntries.push(msg);
      });

      const customLogger = new Logger("test-context", "req-abc-123");
      customLogger.info("Test message", {
        pnr: "1234567890",
        nested: { directPnr: "9876543210" },
      });

      spy.mockRestore();

      expect(loggedEntries.length).toBe(1);
      const logData = JSON.parse(loggedEntries[0]);

      expect(logData.requestId).toBe("req-abc-123");
      expect(logData.pnrHash).toBeDefined();
      expect(logData.pnrLength).toBe(10);
      expect(loggedEntries[0]).not.toContain("1234567890");
      expect(loggedEntries[0]).not.toContain("9876543210");
    });
  });

  /* ─── 5. Health Check Endpoint ─── */
  describe("Health Endpoint", () => {
    it("returns 200 with status ok and request id header", async () => {
      const req = new NextRequest("http://localhost:3000/api/health", {
        headers: { "x-request-id": "test-req-id-777" },
      });

      const res = await healthHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("uptimeSeconds");
      expect(res.headers.get("x-request-id")).toBe("test-req-id-777");
    });
  });
});
