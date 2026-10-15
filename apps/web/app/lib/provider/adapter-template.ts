/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ADAPTER TEMPLATE FOR REAL PNR PROVIDERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * IMPORTANT LEGAL & ARCHITECTURAL RULES (Hard Rules):
 * 1. Do NOT implement a real provider until commercial use and caching terms
 *    are confirmed in writing (see docs/provider-checklist.md).
 * 2. Absolutely NO scraping, auth bypass, or CAPTCHA solving.
 * 3. The refund engine and UI must NEVER touch a provider's raw response.
 * 4. This adapter must strictly normalize the vendor response into CanonicalPnr.
 * 5. All adapters must pass the contract test suite in __tests__/provider-contract.test.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { CanonicalPnr } from "../types";
import type { PnrProvider } from "./types";

/**
 * Example Vendor Response Format (illustrative):
 */
export interface RawVendorTicketResponse {
  pnr_number: string;
  train: {
    number: string;
    name?: string;
    from: string;
    to: string;
    departure_date: string; // e.g. "2026-11-01"
    departure_time: string; // e.g. "16:20"
  };
  fare_details: {
    total_amount: number;
    journey_class: string; // e.g. "2A", "SL"
    quota_code: string; // e.g. "GN", "TQ"
  };
  booking_info: {
    ticket_category: "GENERAL" | "TATKAL" | "PREMIUM_TATKAL";
    overall_status: "CNF" | "RAC" | "WL";
    chart_prepared: boolean;
  };
  passenger_list: Array<{
    booking_status: string;
    current_status: string;
  }>;
}

export class TemplatePnrAdapter implements PnrProvider {
  public readonly name: string = "template-provider";

  constructor(
    private readonly apiKey: string = "mock-template-key",
    private readonly baseUrl: string = "https://api.example-railway-provider.com"
  ) {}

  async getPnrStatus(pnr: string): Promise<CanonicalPnr> {
    // 1. Validate PNR format locally
    if (!/^\d{10}$/.test(pnr)) {
      throw new Error("INVALID_PNR");
    }

    // 2. Query vendor endpoint (In real adapter: fetch with timeout & auth)
    // const response = await fetch(`${this.baseUrl}/v1/pnr/${pnr}`, {
    //   headers: { Authorization: `Bearer ${this.apiKey}` },
    //   signal: AbortSignal.timeout(4500)
    // });
    // if (response.status === 404) throw new Error("PNR_NOT_FOUND");
    // const rawData: RawVendorTicketResponse = await response.json();

    // For template demonstration purposes, we illustrate normalization:
    const mockRawData = this.generateSampleVendorResponse(pnr);
    return this.normalizeToCanonical(mockRawData);
  }

  /**
   * Normalizes raw vendor response into the immutable CanonicalPnr schema.
   */
  public normalizeToCanonical(raw: RawVendorTicketResponse): CanonicalPnr {
    const travelClass = (raw.fare_details.journey_class || "SL").toUpperCase();
    const quota = (raw.fare_details.quota_code || "GN").toUpperCase();

    const bookingStatus =
      raw.booking_info.overall_status === "CNF"
        ? "CONFIRMED"
        : raw.booking_info.overall_status === "RAC"
          ? "RAC"
          : "WAITLISTED";

    const chartStatus = raw.booking_info.chart_prepared
      ? "PREPARED"
      : "NOT_PREPARED";

    // Combine date + time safely
    const departureTimeIso = `${raw.train.departure_date}T${raw.train.departure_time}:00+05:30`;

    return {
      pnr: raw.pnr_number,
      journey: {
        trainNumber: raw.train.number,
        trainName: raw.train.name,
        source: raw.train.from.toUpperCase(),
        destination: raw.train.to.toUpperCase(),
        journeyDate: raw.train.departure_date,
        departureTime: departureTimeIso,
      },
      booking: {
        fare: raw.fare_details.total_amount,
        class: travelClass,
        quota,
        ticketType: raw.booking_info.ticket_category,
        bookingStatus,
        chartStatus,
      },
      passengers: raw.passenger_list.map((p) => ({
        bookingStatus: p.booking_status,
        currentStatus: p.current_status,
      })),
      metadata: {
        provider: this.name,
        normalizedAt: new Date().toISOString(),
      },
    };
  }

  private generateSampleVendorResponse(pnr: string): RawVendorTicketResponse {
    if (pnr === "0000000000") {
      throw new Error("PNR_NOT_FOUND");
    }

    return {
      pnr_number: pnr,
      train: {
        number: "12424",
        name: "Dibrugarh Rajdhani",
        from: "NDLS",
        to: "DBRG",
        departure_date: "2026-11-01",
        departure_time: "16:20",
      },
      fare_details: {
        total_amount: 3250,
        journey_class: "2A",
        quota_code: "GN",
      },
      booking_info: {
        ticket_category: "GENERAL",
        overall_status: "CNF",
        chart_prepared: false,
      },
      passenger_list: [
        { booking_status: "CNF", current_status: "CNF" },
        { booking_status: "CNF", current_status: "CNF" },
      ],
    };
  }
}
