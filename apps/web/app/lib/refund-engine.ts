/**
 * Refund engine — duplicated in apps/web for the API routes.
 * In a production build, this would import from @railrefund/refund-engine.
 * This file is identical to packages/refund-engine/src/engine.ts + rules.ts logic.
 */

import type { CanonicalPnr, RefundResult } from "./types";

const CURRENT_RULE_VERSION = "2026.1-draft";

const UNVERIFIED_RULE_WARNING =
  "This estimate uses cancellation rules that haven't been verified against an official source yet.";

interface TimeSlabRule {
  id: string;
  description: string;
  verified: boolean;
  minHoursBeforeDeparture: number;
  maxHoursBeforeDeparture: number | null;
  deductionType: "FLAT" | "PERCENTAGE_WITH_MIN" | "FULL_FARE";
  percentage?: number;
  flatPerPassengerByClass: Record<string, number>;
}

const PLACEHOLDER_TIME_SLABS: TimeSlabRule[] = [
  {
    id: "SLAB_MORE_THAN_48H",
    description: "Flat cancellation charge per passenger depending on class.",
    verified: false,
    minHoursBeforeDeparture: 48,
    maxHoursBeforeDeparture: null,
    deductionType: "FLAT",
    flatPerPassengerByClass: {
      "1A": 240, "EC": 240, "2A": 200, "3A": 180, "CC": 180, "3E": 180, "SL": 120, "2S": 60, DEFAULT: 120
    }
  },
  {
    id: "SLAB_12H_TO_48H",
    description: "25% of the fare subject to the minimum flat rate per passenger.",
    verified: false,
    minHoursBeforeDeparture: 12,
    maxHoursBeforeDeparture: 48,
    deductionType: "PERCENTAGE_WITH_MIN",
    percentage: 0.25,
    flatPerPassengerByClass: {
      "1A": 240, "EC": 240, "2A": 200, "3A": 180, "CC": 180, "3E": 180, "SL": 120, "2S": 60, DEFAULT: 120
    }
  },
  {
    id: "SLAB_4H_TO_12H",
    description: "50% of the fare subject to the minimum flat rate per passenger.",
    verified: false,
    minHoursBeforeDeparture: 4,
    maxHoursBeforeDeparture: 12,
    deductionType: "PERCENTAGE_WITH_MIN",
    percentage: 0.50,
    flatPerPassengerByClass: {
      "1A": 240, "EC": 240, "2A": 200, "3A": 180, "CC": 180, "3E": 180, "SL": 120, "2S": 60, DEFAULT: 120
    }
  }
];

function isWaitlistedStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s.includes("WL") || s.includes("WAITLIST") || s.includes("W/L");
}

function isConfirmedStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s === "CNF" || s === "CONFIRMED";
}

function isRacStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s.includes("RAC");
}

function hasMixedPassengerStatuses(passengers: { currentStatus: string }[]): boolean {
  if (passengers.length <= 1) return false;
  let hasCnf = false;
  let hasWl = false;
  let hasRac = false;
  for (const p of passengers) {
    const cur = p.currentStatus.toUpperCase();
    if (isConfirmedStatus(cur)) hasCnf = true;
    else if (isWaitlistedStatus(cur)) hasWl = true;
    else if (isRacStatus(cur)) hasRac = true;
  }
  return (hasCnf && hasWl) || (hasCnf && hasRac);
}

export function calculateRefund(
  pnrData: CanonicalPnr,
  calculationTime?: string | Date
): RefundResult {
  if (
    !pnrData || !pnrData.booking || !pnrData.journey ||
    !Array.isArray(pnrData.passengers) || pnrData.passengers.length === 0
  ) {
    return {
      eligibility: "UNSUPPORTED", amount: null, grossFare: pnrData?.booking?.fare ?? 0,
      deduction: null, ruleVersion: CURRENT_RULE_VERSION, ruleIds: [],
      explanation: ["Invalid ticket data or missing passenger details."], warnings: []
    };
  }

  const { fare, ticketType, bookingStatus, chartStatus, class: travelClass } = pnrData.booking;

  if (typeof fare !== "number" || fare <= 0 || isNaN(fare)) {
    return {
      eligibility: "UNSUPPORTED", amount: null, grossFare: fare ?? 0,
      deduction: null, ruleVersion: CURRENT_RULE_VERSION, ruleIds: [],
      explanation: ["Ticket fare must be a positive number."], warnings: []
    };
  }

  if (hasMixedPassengerStatuses(pnrData.passengers)) {
    return {
      eligibility: "UNSUPPORTED", amount: null, grossFare: fare,
      deduction: null, ruleVersion: CURRENT_RULE_VERSION, ruleIds: [],
      explanation: [
        "We couldn't confidently calculate your refund for this ticket.",
        "Tickets with mixed passenger statuses (some confirmed, others waitlisted/RAC) require special split cancellation handling and are currently unsupported."
      ],
      warnings: []
    };
  }

  if (ticketType === "TATKAL" || ticketType === "PREMIUM_TATKAL") {
    const anyConfirmed = bookingStatus === "CONFIRMED" ||
      pnrData.passengers.some((p) => isConfirmedStatus(p.currentStatus));
    if (anyConfirmed) {
      return {
        eligibility: "NOT_ELIGIBLE", amount: 0, grossFare: fare, deduction: fare,
        ruleVersion: CURRENT_RULE_VERSION,
        ruleIds: ["RULE_TATKAL_CONFIRMED_VOLUNTARY"],
        explanation: ["Confirmed Tatkal and Premium Tatkal tickets grant zero refund on voluntary cancellation under Indian Railways rules."],
        warnings: []
      };
    }
  }

  const allWaitlisted = bookingStatus === "WAITLISTED" &&
    pnrData.passengers.every((p) => isWaitlistedStatus(p.currentStatus));

  if (allWaitlisted && chartStatus === "PREPARED") {
    return {
      eligibility: "ELIGIBLE", amount: fare, grossFare: fare, deduction: 0,
      ruleVersion: CURRENT_RULE_VERSION,
      ruleIds: ["RULE_WAITLISTED_CHART_PREPARED_AUTO"],
      explanation: ["Tickets that remain fully waitlisted after chart preparation are automatically cancelled by Indian Railways with a full refund."],
      warnings: []
    };
  }

  if (allWaitlisted && chartStatus === "NOT_PREPARED") {
    const clerkagePerPassenger = 60;
    const deduction = Math.min(fare, clerkagePerPassenger * pnrData.passengers.length);
    const amount = Math.max(0, fare - deduction);
    return {
      eligibility: "ELIGIBLE", amount, grossFare: fare, deduction,
      ruleVersion: CURRENT_RULE_VERSION, ruleIds: ["SLAB_WAITLISTED_CLERKAGE_UNVERIFIED"],
      explanation: ["Waitlisted tickets cancelled prior to chart preparation incur a nominal clerkage deduction per passenger."],
      warnings: [UNVERIFIED_RULE_WARNING]
    };
  }

  const depTime = new Date(pnrData.journey.departureTime);
  const calcTime = calculationTime ? new Date(calculationTime) : new Date();

  if (isNaN(depTime.getTime()) || isNaN(calcTime.getTime())) {
    return {
      eligibility: "UNSUPPORTED", amount: null, grossFare: fare,
      deduction: null, ruleVersion: CURRENT_RULE_VERSION, ruleIds: [],
      explanation: ["Invalid departure time or calculation timestamp."], warnings: []
    };
  }

  const hoursUntilDeparture = (depTime.getTime() - calcTime.getTime()) / (1000 * 60 * 60);

  if (hoursUntilDeparture < 0) {
    return {
      eligibility: "NOT_ELIGIBLE", amount: 0, grossFare: fare, deduction: fare,
      ruleVersion: CURRENT_RULE_VERSION, ruleIds: ["RULE_POST_DEPARTURE"],
      explanation: ["The scheduled departure time for this train has already passed. Online cancellation is not permitted post-departure."],
      warnings: []
    };
  }

  if (hoursUntilDeparture < 4 || chartStatus === "PREPARED") {
    return {
      eligibility: "NOT_ELIGIBLE", amount: 0, grossFare: fare, deduction: fare,
      ruleVersion: CURRENT_RULE_VERSION, ruleIds: ["SLAB_WITHIN_4H_OR_CHART_PREPARED"],
      explanation: ["Cancellation within 4 hours of departure or after chart preparation is not admissible for refund on confirmed tickets."],
      warnings: [UNVERIFIED_RULE_WARNING]
    };
  }

  const slab = PLACEHOLDER_TIME_SLABS.find((s) => {
    if (s.maxHoursBeforeDeparture === null) return hoursUntilDeparture >= s.minHoursBeforeDeparture;
    return hoursUntilDeparture >= s.minHoursBeforeDeparture && hoursUntilDeparture < s.maxHoursBeforeDeparture;
  });

  if (!slab) {
    return {
      eligibility: "UNSUPPORTED", amount: null, grossFare: fare,
      deduction: null, ruleVersion: CURRENT_RULE_VERSION, ruleIds: [],
      explanation: ["We couldn't confidently calculate your refund for this ticket.", "The departure timeline does not match any known cancellation window."],
      warnings: []
    };
  }

  const passengerCount = pnrData.passengers.length;
  const flatRate = slab.flatPerPassengerByClass[travelClass] ?? slab.flatPerPassengerByClass["DEFAULT"] ?? 120;
  const totalFlatMin = flatRate * passengerCount;

  let calculatedDeduction = totalFlatMin;
  if (slab.deductionType === "PERCENTAGE_WITH_MIN" && slab.percentage) {
    calculatedDeduction = Math.max(totalFlatMin, Math.round(fare * slab.percentage));
  }

  const deduction = Math.min(fare, calculatedDeduction);
  const amount = Math.max(0, fare - deduction);
  const warnings = slab.verified ? [] : [UNVERIFIED_RULE_WARNING];

  return {
    eligibility: amount > 0 ? "ELIGIBLE" : "NOT_ELIGIBLE",
    amount, grossFare: fare, deduction,
    ruleVersion: CURRENT_RULE_VERSION, ruleIds: [slab.id],
    explanation: [slab.description, `Calculated deduction of ₹${deduction} for ${passengerCount} passenger(s) travelling in class ${travelClass}.`],
    warnings
  };
}
