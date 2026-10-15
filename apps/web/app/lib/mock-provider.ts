/**
 * MockPnrProvider — fabricated test data only.
 * MUST NOT be enabled in production (Hard Rule 7).
 * Keyed on last digit of PNR:
 *   0 → confirmed, far-out general ticket
 *   1 → confirmed Tatkal
 *   2 → fully waitlisted after chart prep
 *   3 → mixed passenger statuses (triggers UNSUPPORTED)
 *   anything else → 404-style error
 */

import type { CanonicalPnr } from "./types";

export interface PnrProvider {
  getPnrStatus(pnr: string): Promise<CanonicalPnr>;
}

export class MockPnrProvider implements PnrProvider {
  constructor() {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PROVIDER !== "true") {
      throw new Error(
        "MockPnrProvider cannot be used in production. " +
        "Set PNR_PROVIDER to a real provider or set ALLOW_MOCK_PROVIDER=true for testing."
      );
    }
  }

  async getPnrStatus(pnr: string): Promise<CanonicalPnr> {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 300));

    const lastDigit = pnr.charAt(pnr.length - 1);

    switch (lastDigit) {
      case "0":
        return this.confirmedFarOut(pnr);
      case "1":
        return this.confirmedTatkal(pnr);
      case "2":
        return this.fullyWaitlisted(pnr);
      case "3":
        return this.mixedPassengers(pnr);
      default:
        throw new Error("PNR_NOT_FOUND");
    }
  }

  private confirmedFarOut(pnr: string): CanonicalPnr {
    // Journey date is 10 days from now (> 48h window)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const journeyDate = futureDate.toISOString().split("T")[0];
    const departureTime = `${journeyDate}T06:00:00+05:30`;

    return {
      pnr,
      journey: {
        trainNumber: "12229",
        trainName: "Lucknow Mail",
        source: "LKO",
        destination: "NDLS",
        journeyDate,
        departureTime
      },
      booking: {
        fare: 1185,
        class: "3A",
        quota: "GN",
        ticketType: "GENERAL",
        bookingStatus: "CONFIRMED",
        chartStatus: "NOT_PREPARED"
      },
      passengers: [
        { bookingStatus: "CNF", currentStatus: "CNF" },
        { bookingStatus: "CNF", currentStatus: "CNF" }
      ]
    };
  }

  private confirmedTatkal(pnr: string): CanonicalPnr {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const journeyDate = futureDate.toISOString().split("T")[0];
    const departureTime = `${journeyDate}T16:35:00+05:30`;

    return {
      pnr,
      journey: {
        trainNumber: "12002",
        trainName: "Bhopal Shatabdi",
        source: "NDLS",
        destination: "BPL",
        journeyDate,
        departureTime
      },
      booking: {
        fare: 1755,
        class: "CC",
        quota: "TQ",
        ticketType: "TATKAL",
        bookingStatus: "CONFIRMED",
        chartStatus: "NOT_PREPARED"
      },
      passengers: [
        { bookingStatus: "CNF", currentStatus: "CNF" }
      ]
    };
  }

  private fullyWaitlisted(pnr: string): CanonicalPnr {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    const journeyDate = futureDate.toISOString().split("T")[0];
    const departureTime = `${journeyDate}T23:55:00+05:30`;

    return {
      pnr,
      journey: {
        trainNumber: "12952",
        trainName: "Mumbai Rajdhani",
        source: "NDLS",
        destination: "BCT",
        journeyDate,
        departureTime
      },
      booking: {
        fare: 2930,
        class: "2A",
        quota: "GN",
        ticketType: "GENERAL",
        bookingStatus: "WAITLISTED",
        chartStatus: "PREPARED"
      },
      passengers: [
        { bookingStatus: "WL/12", currentStatus: "WL/8" },
        { bookingStatus: "WL/13", currentStatus: "WL/9" },
        { bookingStatus: "WL/14", currentStatus: "WL/10" }
      ]
    };
  }

  private mixedPassengers(pnr: string): CanonicalPnr {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const journeyDate = futureDate.toISOString().split("T")[0];
    const departureTime = `${journeyDate}T22:30:00+05:30`;

    return {
      pnr,
      journey: {
        trainNumber: "12301",
        trainName: "Howrah Rajdhani",
        source: "NDLS",
        destination: "HWH",
        journeyDate,
        departureTime
      },
      booking: {
        fare: 3450,
        class: "1A",
        quota: "GN",
        ticketType: "GENERAL",
        bookingStatus: "CONFIRMED",
        chartStatus: "NOT_PREPARED"
      },
      passengers: [
        { bookingStatus: "CNF", currentStatus: "CNF" },
        { bookingStatus: "WL/1", currentStatus: "WL/3" }
      ]
    };
  }
}
