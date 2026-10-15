import { describe, it, expect } from "vitest";
import { calculateRefund } from "../engine.js";
import { CanonicalPnr } from "../types.js";

function makePnr(overrides: Partial<CanonicalPnr> & { booking?: any; journey?: any; passengers?: any }): CanonicalPnr {
  const base: CanonicalPnr = {
    pnr: "1234567890",
    journey: {
      trainNumber: "12345",
      trainName: "Shatabdi Express",
      source: "LKO",
      destination: "NDLS",
      journeyDate: "2026-11-15",
      departureTime: "2026-11-15T06:00:00+05:30"
    },
    booking: {
      fare: 1200,
      class: "3A",
      quota: "GN",
      ticketType: "GENERAL",
      bookingStatus: "CONFIRMED",
      chartStatus: "NOT_PREPARED"
    },
    passengers: [
      { bookingStatus: "CNF", currentStatus: "CNF" }
    ]
  };

  return {
    ...base,
    ...overrides,
    journey: { ...base.journey, ...overrides.journey },
    booking: { ...base.booking, ...overrides.booking },
    passengers: overrides.passengers ?? base.passengers
  };
}

describe("calculateRefund", () => {
  // ── Confirmed Tatkal: no refund (VERIFIED RULE) ─────────────────────────
  it("returns NOT_ELIGIBLE with zero refund for confirmed Tatkal ticket", () => {
    const pnr = makePnr({
      booking: { ticketType: "TATKAL", bookingStatus: "CONFIRMED" },
      passengers: [{ bookingStatus: "CNF", currentStatus: "CNF" }]
    });
    const result = calculateRefund(pnr);
    expect(result.eligibility).toBe("NOT_ELIGIBLE");
    expect(result.amount).toBe(0);
    expect(result.ruleIds).toContain("RULE_TATKAL_CONFIRMED_VOLUNTARY");
    expect(result.warnings).toHaveLength(0); // verified rule, no warning
  });

  it("returns NOT_ELIGIBLE for confirmed Premium Tatkal ticket", () => {
    const pnr = makePnr({
      booking: { ticketType: "PREMIUM_TATKAL", bookingStatus: "CONFIRMED" },
      passengers: [{ bookingStatus: "CNF", currentStatus: "CNF" }]
    });
    const result = calculateRefund(pnr);
    expect(result.eligibility).toBe("NOT_ELIGIBLE");
    expect(result.amount).toBe(0);
  });

  // ── Fully waitlisted after chart prep: full refund (VERIFIED RULE) ──────
  it("returns full refund for fully waitlisted after chart preparation", () => {
    const pnr = makePnr({
      booking: { bookingStatus: "WAITLISTED", chartStatus: "PREPARED" },
      passengers: [
        { bookingStatus: "WL/1", currentStatus: "WL/5" },
        { bookingStatus: "WL/2", currentStatus: "WL/6" }
      ]
    });
    const result = calculateRefund(pnr);
    expect(result.eligibility).toBe("ELIGIBLE");
    expect(result.amount).toBe(1200);
    expect(result.deduction).toBe(0);
    expect(result.ruleIds).toContain("RULE_WAITLISTED_CHART_PREPARED_AUTO");
    expect(result.warnings).toHaveLength(0); // verified rule
  });

  // ── Waitlisted before chart prep: clerkage deduction (UNVERIFIED) ───────
  it("returns refund minus clerkage for waitlisted before chart prep", () => {
    const pnr = makePnr({
      booking: { bookingStatus: "WAITLISTED", chartStatus: "NOT_PREPARED", fare: 500 },
      passengers: [
        { bookingStatus: "WL/1", currentStatus: "WL/3" }
      ]
    });
    const result = calculateRefund(pnr);
    expect(result.eligibility).toBe("ELIGIBLE");
    expect(result.amount).toBe(440); // 500 - 60
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // ── Post-departure: no refund ───────────────────────────────────────────
  it("returns NOT_ELIGIBLE if train has already departed", () => {
    const pnr = makePnr({
      journey: { departureTime: "2020-01-01T06:00:00+05:30" }
    });
    const result = calculateRefund(pnr, "2026-10-14T12:00:00+05:30");
    expect(result.eligibility).toBe("NOT_ELIGIBLE");
    expect(result.amount).toBe(0);
  });

  // ── Within 4 hours: no refund (UNVERIFIED) ──────────────────────────────
  it("returns NOT_ELIGIBLE within 4 hours of departure", () => {
    const dep = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const pnr = makePnr({
      journey: { departureTime: dep },
      booking: { chartStatus: "NOT_PREPARED" }
    });
    const result = calculateRefund(pnr);
    expect(result.eligibility).toBe("NOT_ELIGIBLE");
  });

  // ── >48h slab (UNVERIFIED) ──────────────────────────────────────────────
  it("applies flat deduction for >48h cancellation", () => {
    const dep = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const pnr = makePnr({
      journey: { departureTime: dep },
      booking: { fare: 1200, class: "3A" }
    });
    const result = calculateRefund(pnr);
    expect(result.eligibility).toBe("ELIGIBLE");
    expect(result.deduction).toBe(180); // flat for 3A
    expect(result.amount).toBe(1020);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // ── 12-48h slab (UNVERIFIED) ────────────────────────────────────────────
  it("applies 25% deduction for 12-48h cancellation window", () => {
    const dep = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const pnr = makePnr({
      journey: { departureTime: dep },
      booking: { fare: 2000, class: "2A" }
    });
    const result = calculateRefund(pnr);
    expect(result.eligibility).toBe("ELIGIBLE");
    expect(result.deduction).toBe(500); // max(200, 2000*0.25) = max(200,500) = 500
    expect(result.amount).toBe(1500);
  });

  // ── Mixed passengers: UNSUPPORTED ───────────────────────────────────────
  it("returns UNSUPPORTED for mixed passenger statuses", () => {
    const dep = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const pnr = makePnr({
      journey: { departureTime: dep },
      passengers: [
        { bookingStatus: "CNF", currentStatus: "CNF" },
        { bookingStatus: "WL/1", currentStatus: "WL/3" }
      ]
    });
    const result = calculateRefund(pnr);
    expect(result.eligibility).toBe("UNSUPPORTED");
    expect(result.amount).toBeNull();
  });

  // ── Invalid input ──────────────────────────────────────────────────────
  it("returns UNSUPPORTED for missing passenger data", () => {
    const pnr = makePnr({ passengers: [] });
    const result = calculateRefund(pnr);
    expect(result.eligibility).toBe("UNSUPPORTED");
    expect(result.amount).toBeNull();
  });

  it("returns UNSUPPORTED for invalid fare", () => {
    const pnr = makePnr({ booking: { fare: -100 } });
    const result = calculateRefund(pnr);
    expect(result.eligibility).toBe("UNSUPPORTED");
  });
});
