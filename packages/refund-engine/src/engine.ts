import {
  BookingDetails,
  CanonicalPnr,
  Eligibility,
  Passenger,
  RefundResult
} from "./types.js";
import {
  CONFIRMED_RULES,
  CURRENT_RULE_VERSION,
  PLACEHOLDER_TIME_SLABS,
  UNVERIFIED_RULE_WARNING
} from "./rules.js";

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

function hasMixedPassengerStatuses(passengers: Passenger[]): boolean {
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

  // If a ticket contains both confirmed and waitlisted/rac passengers, it's mixed
  return (hasCnf && hasWl) || (hasCnf && hasRac);
}

export function calculateRefund(
  pnrData: CanonicalPnr,
  calculationTime?: string | Date
): RefundResult {
  // Input integrity checks
  if (
    !pnrData ||
    !pnrData.booking ||
    !pnrData.journey ||
    !Array.isArray(pnrData.passengers) ||
    pnrData.passengers.length === 0
  ) {
    return {
      eligibility: "UNSUPPORTED",
      amount: null,
      grossFare: pnrData?.booking?.fare ?? 0,
      deduction: null,
      ruleVersion: CURRENT_RULE_VERSION,
      ruleIds: [],
      explanation: ["Invalid ticket data or missing passenger details."],
      warnings: []
    };
  }

  const { fare, ticketType, bookingStatus, chartStatus, class: travelClass } = pnrData.booking;

  if (typeof fare !== "number" || fare <= 0 || isNaN(fare)) {
    return {
      eligibility: "UNSUPPORTED",
      amount: null,
      grossFare: fare ?? 0,
      deduction: null,
      ruleVersion: CURRENT_RULE_VERSION,
      ruleIds: [],
      explanation: ["Ticket fare must be a positive number."],
      warnings: []
    };
  }

  // 1. Check for mixed / partial passenger statuses (Unsupported scenario)
  if (hasMixedPassengerStatuses(pnrData.passengers)) {
    return {
      eligibility: "UNSUPPORTED",
      amount: null,
      grossFare: fare,
      deduction: null,
      ruleVersion: CURRENT_RULE_VERSION,
      ruleIds: [],
      explanation: [
        "We couldn't confidently calculate your refund for this ticket.",
        "Tickets with mixed passenger statuses (some confirmed, others waitlisted/RAC) require special split cancellation handling and are currently unsupported."
      ],
      warnings: []
    };
  }

  // 2. Confirmed Tatkal voluntary cancellation rule (VERIFIED: TRUE)
  if (ticketType === "TATKAL" || ticketType === "PREMIUM_TATKAL") {
    const anyConfirmed =
      bookingStatus === "CONFIRMED" ||
      pnrData.passengers.some((p) => isConfirmedStatus(p.currentStatus));

    if (anyConfirmed) {
      return {
        eligibility: "NOT_ELIGIBLE",
        amount: 0,
        grossFare: fare,
        deduction: fare,
        ruleVersion: CURRENT_RULE_VERSION,
        ruleIds: [CONFIRMED_RULES.RULE_TATKAL_CONFIRMED_VOLUNTARY.id],
        explanation: [
          "Confirmed Tatkal and Premium Tatkal tickets grant zero refund on voluntary cancellation under Indian Railways rules."
        ],
        warnings: [] // Confirmed rule: no unverified warnings
      };
    }
  }

  // 3. Fully Waitlisted after chart preparation (VERIFIED: TRUE)
  const allWaitlisted =
    bookingStatus === "WAITLISTED" &&
    pnrData.passengers.every((p) => isWaitlistedStatus(p.currentStatus));

  if (allWaitlisted && chartStatus === "PREPARED") {
    return {
      eligibility: "ELIGIBLE",
      amount: fare,
      grossFare: fare,
      deduction: 0,
      ruleVersion: CURRENT_RULE_VERSION,
      ruleIds: [CONFIRMED_RULES.RULE_WAITLISTED_CHART_PREPARED_AUTO.id],
      explanation: [
        "Tickets that remain fully waitlisted after chart preparation are automatically cancelled by Indian Railways with a full refund."
      ],
      warnings: [] // Confirmed rule: no unverified warnings
    };
  }

  // Waitlisted before chart preparation (Placeholder clerkage deduction)
  if (allWaitlisted && chartStatus === "NOT_PREPARED") {
    const clerkagePerPassenger = 60;
    const deduction = Math.min(fare, clerkagePerPassenger * pnrData.passengers.length);
    const amount = Math.max(0, fare - deduction);
    return {
      eligibility: "ELIGIBLE",
      amount,
      grossFare: fare,
      deduction,
      ruleVersion: CURRENT_RULE_VERSION,
      ruleIds: ["SLAB_WAITLISTED_CLERKAGE_UNVERIFIED"],
      explanation: [
        "Waitlisted tickets cancelled prior to chart preparation incur a nominal clerkage deduction per passenger."
      ],
      warnings: [UNVERIFIED_RULE_WARNING]
    };
  }

  // 4. Departure Time & Timing calculations
  const depTime = new Date(pnrData.journey.departureTime);
  const calcTime = calculationTime ? new Date(calculationTime) : new Date();

  if (isNaN(depTime.getTime()) || isNaN(calcTime.getTime())) {
    return {
      eligibility: "UNSUPPORTED",
      amount: null,
      grossFare: fare,
      deduction: null,
      ruleVersion: CURRENT_RULE_VERSION,
      ruleIds: [],
      explanation: ["Invalid departure time or calculation timestamp."],
      warnings: []
    };
  }

  const hoursUntilDeparture = (depTime.getTime() - calcTime.getTime()) / (1000 * 60 * 60);

  // If train has already departed
  if (hoursUntilDeparture < 0) {
    return {
      eligibility: "NOT_ELIGIBLE",
      amount: 0,
      grossFare: fare,
      deduction: fare,
      ruleVersion: CURRENT_RULE_VERSION,
      ruleIds: ["RULE_POST_DEPARTURE"],
      explanation: [
        "The scheduled departure time for this train has already passed. Online cancellation is not permitted post-departure."
      ],
      warnings: []
    };
  }

  // Cancellation within 4 hours or after chart preparation for confirmed tickets
  if (hoursUntilDeparture < 4 || chartStatus === "PREPARED") {
    return {
      eligibility: "NOT_ELIGIBLE",
      amount: 0,
      grossFare: fare,
      deduction: fare,
      ruleVersion: CURRENT_RULE_VERSION,
      ruleIds: ["SLAB_WITHIN_4H_OR_CHART_PREPARED"],
      explanation: [
        "Cancellation within 4 hours of departure or after chart preparation is not admissible for refund on confirmed tickets."
      ],
      warnings: [UNVERIFIED_RULE_WARNING]
    };
  }

  // 5. Placeholder time slabs for voluntary cancellation (> 4 hours before departure)
  const slab = PLACEHOLDER_TIME_SLABS.find((s) => {
    if (s.maxHoursBeforeDeparture === null) {
      return hoursUntilDeparture >= s.minHoursBeforeDeparture;
    }
    return (
      hoursUntilDeparture >= s.minHoursBeforeDeparture &&
      hoursUntilDeparture < s.maxHoursBeforeDeparture
    );
  });

  if (!slab) {
    return {
      eligibility: "UNSUPPORTED",
      amount: null,
      grossFare: fare,
      deduction: null,
      ruleVersion: CURRENT_RULE_VERSION,
      ruleIds: [],
      explanation: [
        "We couldn't confidently calculate your refund for this ticket.",
        "The departure timeline does not match any known cancellation window."
      ],
      warnings: []
    };
  }

  const passengerCount = pnrData.passengers.length;
  const flatRate =
    slab.flatPerPassengerByClass[travelClass] ??
    slab.flatPerPassengerByClass["DEFAULT"] ??
    120;
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
    amount,
    grossFare: fare,
    deduction,
    ruleVersion: CURRENT_RULE_VERSION,
    ruleIds: [slab.id],
    explanation: [
      slab.description,
      `Calculated deduction of ₹${deduction} for ${passengerCount} passenger(s) travelling in class ${travelClass}.`
    ],
    warnings
  };
}
