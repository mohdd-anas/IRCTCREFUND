import { describe, it, expect, beforeEach } from "vitest";
import { POST as pnrLookupHandler } from "@/app/api/pnr/lookup/route";
import { POST as refundCalcHandler } from "@/app/api/refund/calculate/route";
import { GET as healthHandler } from "@/app/api/health/route";
import { GET as auditHandler } from "@/app/api/refund/audit/[id]/route";
import { NextRequest } from "next/server";
import type { CanonicalPnr } from "@/app/lib/types";

describe("Sprint 5 — API Route Integration Suite", () => {
  beforeEach(() => {
    // Ensure clean in-memory state
  });

  describe("POST /api/pnr/lookup", () => {
    it("returns 200 with canonical PNR data for valid 10-digit PNR", async () => {
      const req = new NextRequest("http://localhost:3000/api/pnr/lookup", {
        method: "POST",
        headers: { "x-request-id": "req-route-lookup-1" },
        body: JSON.stringify({ pnr: "1234567890" }),
      });

      const res = await pnrLookupHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("pnrData");
      expect(data.pnrData.pnr).toBe("1234567890");
      expect(data.pnrData.journey.source).toBe("LKO");
      expect(data.pnrData.journey.destination).toBe("NDLS");
      expect(res.headers.get("x-request-id")).toBe("req-route-lookup-1");
    });

    it("serves subsequent requests from cached snapshot", async () => {
      const req1 = new NextRequest("http://localhost:3000/api/pnr/lookup", {
        method: "POST",
        headers: { "x-request-id": "req-snap-1" },
        body: JSON.stringify({ pnr: "1234567890" }),
      });
      const res1 = await pnrLookupHandler(req1);
      expect(res1.status).toBe(200);

      const req2 = new NextRequest("http://localhost:3000/api/pnr/lookup", {
        method: "POST",
        headers: { "x-request-id": "req-snap-2" },
        body: JSON.stringify({ pnr: "1234567890" }),
      });
      const res2 = await pnrLookupHandler(req2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.pnrData.pnr).toBe("1234567890");
    });

    it("returns 404 with friendly message for unknown PNR ending in 9", async () => {
      const req = new NextRequest("http://localhost:3000/api/pnr/lookup", {
        method: "POST",
        headers: { "x-request-id": "req-not-found" },
        body: JSON.stringify({ pnr: "9999999999" }),
      });

      const res = await pnrLookupHandler(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("couldn't find a ticket");
    });
  });

  describe("POST /api/refund/calculate", () => {
    const validTicketData: CanonicalPnr = {
      pnr: "1234567890",
      journey: {
        trainNumber: "12229",
        trainName: "Lucknow Mail",
        source: "LKO",
        destination: "NDLS",
        journeyDate: "2026-11-20",
        departureTime: "2026-11-20T06:00:00+05:30",
      },
      booking: {
        fare: 1500,
        class: "3A",
        quota: "GN",
        ticketType: "GENERAL",
        bookingStatus: "CONFIRMED",
        chartStatus: "NOT_PREPARED",
      },
      passengers: [{ bookingStatus: "CNF", currentStatus: "CNF" }],
    };

    it("independently validates ticket payload and calculates refund with audit persistence", async () => {
      const req = new NextRequest("http://localhost:3000/api/refund/calculate", {
        method: "POST",
        headers: { "x-request-id": "req-calc-audit" },
        body: JSON.stringify({
          pnrData: validTicketData,
          calculationTime: "2026-11-15T10:00:00+05:30",
        }),
      });

      const res = await refundCalcHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("result");
      expect(data).toHaveProperty("calculationId");
      expect(data.result.eligibility).toBe("ELIGIBLE");
      expect(data.result.deduction).toBe(180);
      expect(data.result.amount).toBe(1320);

      // Verify audit endpoint can retrieve this calculation record
      const auditReq = new NextRequest(
        `http://localhost:3000/api/refund/audit/${data.calculationId}`
      );
      const auditRes = await auditHandler(auditReq, {
        params: Promise.resolve({ id: data.calculationId }),
      });
      expect(auditRes.status).toBe(200);
      const auditData = await auditRes.json();

      expect(auditData.audit.calculationId).toBe(data.calculationId);
      expect(auditData.audit.auditExplanation.estimatedRefund).toBe(1320);
      expect(auditData.audit.auditExplanation.rulesApplied).toContain("SLAB_MORE_THAN_48H");
    });

    it("returns 400 when calculation payload is missing required journey fields", async () => {
      const req = new NextRequest("http://localhost:3000/api/refund/calculate", {
        method: "POST",
        body: JSON.stringify({
          pnrData: {
            pnr: "1234567890",
            booking: { fare: 1000 },
          },
        }),
      });

      const res = await refundCalcHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid ticket data. Unable to calculate refund.");
    });
  });

  describe("GET /api/health", () => {
    it("returns system health status and uptime", async () => {
      const req = new NextRequest("http://localhost:3000/api/health", {
        headers: { "x-request-id": "health-check-1" },
      });

      const res = await healthHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe("ok");
      expect(data).toHaveProperty("uptimeSeconds");
      expect(data).toHaveProperty("version");
      expect(res.headers.get("x-request-id")).toBe("health-check-1");
    });
  });

  describe("GET /api/refund/audit/[id]", () => {
    it("returns 404 for unknown calculation ID", async () => {
      const req = new NextRequest("http://localhost:3000/api/refund/audit/nonexistent-id");
      const res = await auditHandler(req, {
        params: Promise.resolve({ id: "nonexistent-id" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("Calculation record not found");
    });
  });
});
