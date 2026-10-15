export interface RefundRule {
  id: string;
  name: string;
  description: string;
  verified: boolean;
  source?: string;
}

export interface TimeSlabRule extends RefundRule {
  minHoursBeforeDeparture: number;
  maxHoursBeforeDeparture: number | null;
  deductionType: "FLAT" | "PERCENTAGE_WITH_MIN" | "FULL_FARE";
  percentage?: number;
  flatPerPassengerByClass: Record<string, number>;
}

export const CURRENT_RULE_VERSION = "2026.1-draft";

// Confirmed Rules (Hard Rule: Only two rules are confirmed)
export const CONFIRMED_RULES: Record<string, RefundRule> = {
  RULE_TATKAL_CONFIRMED_VOLUNTARY: {
    id: "RULE_TATKAL_CONFIRMED_VOLUNTARY",
    name: "Confirmed Tatkal Voluntary Cancellation",
    description: "No refund is admissible on voluntary cancellation of confirmed Tatkal tickets.",
    verified: true,
    source: "Indian Railways Railway Passengers (Cancellation of Ticket and Refund of Fare) Rules"
  },
  RULE_WAITLISTED_CHART_PREPARED_AUTO: {
    id: "RULE_WAITLISTED_CHART_PREPARED_AUTO",
    name: "Fully Waitlisted After Chart Preparation Auto-Cancel",
    description: "Names of all passengers remaining fully on waitlist after chart preparation are dropped and tickets automatically cancelled with full refund.",
    verified: true,
    source: "Indian Railways Railway Passengers (Cancellation of Ticket and Refund of Fare) Rules"
  }
};

// Placeholder Time Slabs (Hard Rule: verified must remain false)
export const PLACEHOLDER_TIME_SLABS: TimeSlabRule[] = [
  {
    id: "SLAB_MORE_THAN_48H",
    name: "Cancellation more than 48 hours before departure",
    description: "Flat cancellation charge per passenger depending on class.",
    verified: false,
    minHoursBeforeDeparture: 48,
    maxHoursBeforeDeparture: null,
    deductionType: "FLAT",
    flatPerPassengerByClass: {
      "1A": 240,
      "EC": 240,
      "2A": 200,
      "3A": 180,
      "CC": 180,
      "3E": 180,
      "SL": 120,
      "2S": 60,
      "DEFAULT": 120
    }
  },
  {
    id: "SLAB_12H_TO_48H",
    name: "Cancellation between 12 and 48 hours before departure",
    description: "25% of the fare subject to the minimum flat rate per passenger.",
    verified: false,
    minHoursBeforeDeparture: 12,
    maxHoursBeforeDeparture: 48,
    deductionType: "PERCENTAGE_WITH_MIN",
    percentage: 0.25,
    flatPerPassengerByClass: {
      "1A": 240,
      "EC": 240,
      "2A": 200,
      "3A": 180,
      "CC": 180,
      "3E": 180,
      "SL": 120,
      "2S": 60,
      "DEFAULT": 120
    }
  },
  {
    id: "SLAB_4H_TO_12H",
    name: "Cancellation between 4 and 12 hours before departure (up to chart prep)",
    description: "50% of the fare subject to the minimum flat rate per passenger.",
    verified: false,
    minHoursBeforeDeparture: 4,
    maxHoursBeforeDeparture: 12,
    deductionType: "PERCENTAGE_WITH_MIN",
    percentage: 0.50,
    flatPerPassengerByClass: {
      "1A": 240,
      "EC": 240,
      "2A": 200,
      "3A": 180,
      "CC": 180,
      "3E": 180,
      "SL": 120,
      "2S": 60,
      "DEFAULT": 120
    }
  }
];

export const UNVERIFIED_RULE_WARNING =
  "This estimate uses cancellation rules that haven't been verified against an official source yet.";
