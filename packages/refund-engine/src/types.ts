export type TicketType = "GENERAL" | "TATKAL" | "PREMIUM_TATKAL";
export type BookingStatus = "CONFIRMED" | "RAC" | "WAITLISTED";
export type ChartStatus = "NOT_PREPARED" | "PREPARED";
export type Eligibility = "ELIGIBLE" | "NOT_ELIGIBLE" | "UNSUPPORTED";

export interface Passenger {
  bookingStatus: string;
  currentStatus: string;
}

export interface JourneyDetails {
  trainNumber: string;
  trainName?: string;
  source: string;
  destination: string;
  journeyDate: string; // YYYY-MM-DD
  departureTime: string; // ISO with offset, e.g. 2026-10-15T06:00:00+05:30
}

export interface BookingDetails {
  fare: number;
  class: string; // e.g. "1A", "2A", "3A", "SL", "CC", "2S"
  quota: string; // e.g. "GN", "TQ", "PT"
  ticketType: TicketType;
  bookingStatus: BookingStatus;
  chartStatus: ChartStatus;
}

export interface CanonicalPnr {
  pnr: string;
  journey: JourneyDetails;
  booking: BookingDetails;
  passengers: Passenger[];
  metadata?: Record<string, unknown>;
}

export interface RefundResult {
  eligibility: Eligibility;
  amount: number | null;
  grossFare: number;
  deduction: number | null;
  ruleVersion: string;
  ruleIds: string[];
  explanation: string[];
  warnings: string[];
}

export interface PnrProvider {
  getPnrStatus(pnr: string): Promise<CanonicalPnr>;
}
