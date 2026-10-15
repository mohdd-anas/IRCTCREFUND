import { describe, it, expect } from "vitest";
import { calculateRefund } from "../engine.js";
import { CanonicalPnr } from "../types.js";
import { UNVERIFIED_RULE_WARNING } from "../rules.js";

function makePnr(overrides: Partial<CanonicalPnr> & { booking?: any; journey?: any; passengers?: any } = {}): CanonicalPnr {
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

describe("Sprint 5 — Table-Driven Refund Engine Matrix", () => {
  /* ─── 1. Confirmed Tatkal & Premium Tatkal (Confirmed Rule) ─── */
  describe("Confirmed Tatkal Rules (VERIFIED: TRUE)", () => {
    const tatkalCases = [
      { ticketType: "TATKAL" as const, quota: "TQ", status: "CONFIRMED" as const, desc: "Standard Tatkal" },
      { ticketType: "PREMIUM_TATKAL" as const, quota: "PT", status: "CONFIRMED" as const, desc: "Premium Tatkal" },
    ];

    it.each(tatkalCases)(
      "returns NOT_ELIGIBLE and zero refund for $desc",
      ({ ticketType, quota, status }) => {
        const pnr = makePnr({
          booking: { ticketType, quota, bookingStatus: status, fare: 1850 },
          passengers: [{ bookingStatus: "CNF", currentStatus: "CNF" }]
        });
        const result = calculateRefund(pnr);
        expect(result.eligibility).toBe("NOT_ELIGIBLE");
        expect(result.amount).toBe(0);
        expect(result.deduction).toBe(1850);
        expect(result.ruleIds).toContain("RULE_TATKAL_CONFIRMED_VOLUNTARY");
        expect(result.warnings).toHaveLength(0); // Confirmed rule carries NO warning
      }
    );
  });

  /* ─── 2. Fully Waitlisted Post-Chart Preparation (Confirmed Rule) ─── */
  describe("Fully Waitlisted After Chart Preparation (VERIFIED: TRUE)", () => {
    it.each([
      { passengers: [{ bookingStatus: "WL/1", currentStatus: "WL/1" }], fare: 800 },
      {
        passengers: [
          { bookingStatus: "WL/5", currentStatus: "WL/2" },
          { bookingStatus: "WL/6", currentStatus: "WL/3" },
          { bookingStatus: "WL/7", currentStatus: "WL/4" }
        ],
        fare: 2400
      }
    ])("grants 100% full refund with zero deduction for $passengers.length waitlisted passenger(s)", ({ passengers, fare }) => {
      const pnr = makePnr({
        booking: { bookingStatus: "WAITLISTED", chartStatus: "PREPARED", fare },
        passengers
      });
      const result = calculateRefund(pnr);
      expect(result.eligibility).toBe("ELIGIBLE");
      expect(result.amount).toBe(fare);
      expect(result.deduction).toBe(0);
      expect(result.ruleIds).toContain("RULE_WAITLISTED_CHART_PREPARED_AUTO");
      expect(result.warnings).toHaveLength(0); // Confirmed rule carries NO warning
    });
  });

  /* ─── 3. Class Variations (>48 Hours Far-Out Cancellation) ─── */
  describe("Class Flat Deductions (>48h window, UNVERIFIED placeholder)", () => {
    const classFlatRates = [
      { travelClass: "1A", expectedFlat: 240, fare: 3000 },
      { travelClass: "EC", expectedFlat: 240, fare: 2500 },
      { travelClass: "2A", expectedFlat: 200, fare: 2000 },
      { travelClass: "3A", expectedFlat: 180, fare: 1500 },
      { travelClass: "CC", expectedFlat: 180, fare: 1200 },
      { travelClass: "3E", expectedFlat: 180, fare: 1300 },
      { travelClass: "SL", expectedFlat: 120, fare: 600 },
      { travelClass: "2S", expectedFlat: 60, fare: 200 }
    ];

    it.each(classFlatRates)(
      "applies ₹$expectedFlat flat deduction for class $travelClass with unverified warning",
      ({ travelClass, expectedFlat, fare }) => {
        const depTime = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
        const pnr = makePnr({
          journey: { departureTime: depTime },
          booking: { class: travelClass, fare },
          passengers: [{ bookingStatus: "CNF", currentStatus: "CNF" }]
        });

        const result = calculateRefund(pnr);
        expect(result.eligibility).toBe("ELIGIBLE");
        expect(result.deduction).toBe(expectedFlat);
        expect(result.amount).toBe(fare - expectedFlat);
        expect(result.warnings).toContain(UNVERIFIED_RULE_WARNING);
      }
    );

    it("multiplies flat rate by number of passengers", () => {
      const depTime = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      const pnr = makePnr({
        journey: { departureTime: depTime },
        booking: { class: "3A", fare: 4500 },
        passengers: [
          { bookingStatus: "CNF", currentStatus: "CNF" },
          { bookingStatus: "CNF", currentStatus: "CNF" },
          { bookingStatus: "CNF", currentStatus: "CNF" }
        ]
      });

      const result = calculateRefund(pnr);
      expect(result.deduction).toBe(180 * 3); // 540
      expect(result.amount).toBe(4500 - 540);
    });
  });

  /* ─── 4. Cancellation Timing Slabs & Boundary Hours ─── */
  describe("Cancellation Window Boundaries", () => {
    const fixedCalcTime = "2026-10-15T12:00:00+05:30";

    const timingMatrix = [
      {
        hoursBefore: 72,
        desc: "Far out (>48h)",
        expectedDeduction: 180, // flat 3A
        expectedRuleId: "SLAB_MORE_THAN_48H",
        expectedEligibility: "ELIGIBLE"
      },
      {
        hoursBefore: 48.1,
        desc: "Just over 48h boundary",
        expectedDeduction: 180,
        expectedRuleId: "SLAB_MORE_THAN_48H",
        expectedEligibility: "ELIGIBLE"
      },
      {
        hoursBefore: 48,
        desc: "Exactly 48h boundary",
        expectedDeduction: 180,
        expectedRuleId: "SLAB_MORE_THAN_48H",
        expectedEligibility: "ELIGIBLE"
      },
      {
        hoursBefore: 24,
        desc: "Mid 12h-48h window (25% deduction)",
        // 25% of 1600 = 400, min is 180 -> 400
        expectedDeduction: 400,
        expectedRuleId: "SLAB_12H_TO_48H",
        expectedEligibility: "ELIGIBLE"
      },
      {
        hoursBefore: 12,
        desc: "Exactly 12h boundary",
        expectedDeduction: 400,
        expectedRuleId: "SLAB_12H_TO_48H",
        expectedEligibility: "ELIGIBLE"
      },
      {
        hoursBefore: 8,
        desc: "Mid 4h-12h window (50% deduction)",
        // 50% of 1600 = 800
        expectedDeduction: 800,
        expectedRuleId: "SLAB_4H_TO_12H",
        expectedEligibility: "ELIGIBLE"
      },
      {
        hoursBefore: 3.9,
        desc: "Within 4h window",
        expectedDeduction: 1600,
        expectedRuleId: "SLAB_WITHIN_4H_OR_CHART_PREPARED",
        expectedEligibility: "NOT_ELIGIBLE"
      },
      {
        hoursBefore: -1,
        desc: "Post departure",
        expectedDeduction: 1600,
        expectedRuleId: "RULE_POST_DEPARTURE",
        expectedEligibility: "NOT_ELIGIBLE"
      }
    ];

    it.each(timingMatrix)(
      "correctly calculates refund for $desc (t-$hoursBefore hours)",
      ({ hoursBefore, expectedDeduction, expectedRuleId, expectedEligibility }) => {
        const baseDate = new Date(fixedCalcTime);
        const depDate = new Date(baseDate.getTime() + hoursBefore * 60 * 60 * 1000);

        const pnr = makePnr({
          journey: { departureTime: depDate.toISOString() },
          booking: { fare: 1600, class: "3A" }
        });

        const result = calculateRefund(pnr, fixedCalcTime);
        expect(result.eligibility).toBe(expectedEligibility);
        expect(result.deduction).toBe(expectedDeduction);
        expect(result.amount).toBe(1600 - expectedDeduction);
        expect(result.ruleIds).toContain(expectedRuleId);
      }
    );
  });

  /* ─── 5. Mixed Passenger Statuses & Unsupported Fallbacks ─── */
  describe("Mixed & Partial Passenger Scenarios (UNSUPPORTED)", () => {
    it("returns UNSUPPORTED when ticket has both confirmed and waitlisted passengers", () => {
      const pnr = makePnr({
        passengers: [
          { bookingStatus: "CNF", currentStatus: "CNF" },
          { bookingStatus: "WL/1", currentStatus: "WL/2" }
        ]
      });
      const result = calculateRefund(pnr);
      expect(result.eligibility).toBe("UNSUPPORTED");
      expect(result.amount).toBeNull();
      expect(result.deduction).toBeNull();
      expect(result.explanation[0]).toContain("couldn't confidently calculate");
    });

    it("returns UNSUPPORTED when ticket has confirmed and RAC passengers", () => {
      const pnr = makePnr({
        passengers: [
          { bookingStatus: "CNF", currentStatus: "CNF" },
          { bookingStatus: "RAC/1", currentStatus: "RAC/1" }
        ]
      });
      const result = calculateRefund(pnr);
      expect(result.eligibility).toBe("UNSUPPORTED");
      expect(result.amount).toBeNull();
    });
  });

  /* ─── 6. Malformed & Edge-Case Input Integrity ─── */
  describe("Malformed Input Integrity", () => {
    it.each([
      { fare: 0, desc: "zero fare" },
      { fare: -100, desc: "negative fare" },
      { fare: NaN, desc: "NaN fare" }
    ])("returns UNSUPPORTED for $desc", ({ fare }) => {
      const pnr = makePnr({ booking: { fare } });
      const result = calculateRefund(pnr);
      expect(result.eligibility).toBe("UNSUPPORTED");
      expect(result.amount).toBeNull();
    });

    it("returns UNSUPPORTED when passengers array is empty", () => {
      const pnr = makePnr({ passengers: [] });
      const result = calculateRefund(pnr);
      expect(result.eligibility).toBe("UNSUPPORTED");
      expect(result.amount).toBeNull();
    });

    it("returns UNSUPPORTED for invalid departure date format", () => {
      const pnr = makePnr({ journey: { departureTime: "invalid-iso-date" } });
      const result = calculateRefund(pnr);
      expect(result.eligibility).toBe("UNSUPPORTED");
      expect(result.amount).toBeNull();
    });
  });

  /* ─── 7. Fare Rounding ─── */
  describe("Fare Rounding Integrity", () => {
    it("rounds percentage-based deductions to clean integer amounts", () => {
      // 25% of 1233 = 308.25 -> rounds to 308
      const depTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const pnr = makePnr({
        journey: { departureTime: depTime },
        booking: { fare: 1233, class: "SL" }
      });
      const result = calculateRefund(pnr);
      expect(Number.isInteger(result.deduction)).toBe(true);
      expect(Number.isInteger(result.amount)).toBe(true);
      expect(result.deduction).toBe(308);
      expect(result.amount).toBe(925);
    });
  });
});
