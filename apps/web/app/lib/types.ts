/**
 * Shared CanonicalPnr / RefundResult types for the web app.
 * Mirrors packages/refund-engine/src/types.ts exactly.
 * (In a production setup these would be imported from the workspace package.)
 */

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
  journeyDate: string;
  departureTime: string;
}

export interface BookingDetails {
  fare: number;
  class: string;
  quota: string;
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
