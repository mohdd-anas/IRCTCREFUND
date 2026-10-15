/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RAPIDAPI PNR PROVIDER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Fetches real PNR status data from a RapidAPI-hosted Indian Railways PNR API.
 *
 * Required environment variables:
 *   RAPIDAPI_KEY           — Your X-RapidAPI-Key from rapidapi.com
 *   RAPIDAPI_HOST          — The host header (e.g. "irctc1.p.rapidapi.com")
 *   RAPIDAPI_PNR_ENDPOINT  — Full endpoint URL template with {pnr} placeholder
 *                            e.g. "https://irctc1.p.rapidapi.com/api/v3/getPNRStatus"
 *
 * Hard Rules:
 *   • Raw vendor response is normalized into CanonicalPnr before leaving this adapter.
 *   • No PII is logged (PNR is never logged in plaintext).
 *   • Refund engine & UI never see the raw API response.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { CanonicalPnr, TicketType, BookingStatus, ChartStatus } from "../types";
import type { PnrProvider } from "./types";

/**
 * Shape of the response from popular RapidAPI PNR Status APIs.
 * Supports multiple common response formats.
 */
/**
 * Unified response shape covering multiple RapidAPI IRCTC PNR providers.
 * The irctc-indian-railway-pnr-status API returns: { success, data: { ... } }
 * Other providers may use: { status, message, data: { ... } }
 */
interface RapidApiPnrResponse {
  // Common envelope fields
  status?: boolean;
  success?: boolean;
  message?: string;
  data?: PnrDataPayload;
  // Some APIs return data fields at root level
  pnrNumber?: string;
  trainNumber?: string;
  TrainNo?: string;
}

interface PnrDataPayload {
  pnrNumber?: string;
  Pnr?: string;
  trainNumber?: string;
  TrainNo?: string;
  trainName?: string;
  TrainName?: string;
  sourceStation?: string;
  From?: string;
  boardingPoint?: string;
  destinationStation?: string;
  To?: string;
  reservationUpto?: string;   // irctc-indian-railway-pnr-status uses this
  reservationUpTo?: string;   // some other APIs use this capitalisation
  dateOfJourney?: string;
  Doj?: string;
  DepartureTime?: string;
  departureTime?: string;
  scheduledDepartureTime?: string;
  arrivalDate?: string;
  chartStatus?: string;
  ChartPrepared?: string | boolean;
  chartPrepared?: boolean;
  journeyClass?: string;
  Class?: string;
  class?: string;
  quota?: string;
  Quota?: string;
  passengerQuota?: string;
  bookingFare?: number;
  ticketFare?: number;
  fare?: number;
  BookingFare?: number;
  totalFare?: number;
  ticketType?: string;
  TicketType?: string;
  ticketTypeInPrs?: string;   // "E" = e-ticket, etc.
  bookingStatus?: string;
  passengerList?: Array<{
    passengerSerialNumber?: number;
    bookingStatus?: string;
    BookingStatus?: string;
    bookingStatusDetails?: string;
    currentStatus?: string;
    CurrentStatus?: string;
    currentStatusDetails?: string;
    bookingCoachId?: string;
    bookingBerthNo?: number;
    currentCoachId?: string;
    currentBerthNo?: number;
    passengerQuota?: string;
  }>;
  PassengerStatus?: Array<{
    BookingStatus?: string;
    CurrentStatus?: string;
    Number?: number;
    Coach?: string;
    Berth?: number;
  }>;
  passengers?: Array<{
    bookingStatus?: string;
    currentStatus?: string;
  }>;
}


export class RapidApiPnrProvider implements PnrProvider {
  public readonly name: string = "rapidapi-pnr-provider";

  private readonly apiKey: string;
  private readonly apiHost: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options?: {
    apiKey?: string;
    apiHost?: string;
    endpoint?: string;
    timeoutMs?: number;
  }) {
    this.apiKey = options?.apiKey || process.env.RAPIDAPI_KEY || "";
    this.apiHost =
      options?.apiHost ||
      process.env.RAPIDAPI_HOST ||
      "irctc-indian-railway-pnr-status.p.rapidapi.com";
    this.endpoint =
      options?.endpoint ||
      process.env.RAPIDAPI_PNR_ENDPOINT ||
      "https://irctc-indian-railway-pnr-status.p.rapidapi.com/getPNRStatus/{pnr}";
    this.timeoutMs = options?.timeoutMs || 8000;

    if (!this.apiKey) {
      throw new Error(
        "PROVIDER_ERROR: RAPIDAPI_KEY is not configured in environment variables. Please add RAPIDAPI_KEY in your hosting dashboard."
      );
    }
  }

  async getPnrStatus(pnr: string): Promise<CanonicalPnr> {
    if (!/^\d{10}$/.test(pnr)) {
      throw new Error("INVALID_PNR");
    }

    let endpointUrl = this.endpoint;
    if (endpointUrl.includes("{pnr}")) {
      endpointUrl = endpointUrl.replace("{pnr}", encodeURIComponent(pnr));
    }
    const url = new URL(endpointUrl);
    if (!endpointUrl.includes(pnr)) {
      url.searchParams.set("pnrNumber", pnr);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-rapidapi-key": this.apiKey,
        "x-rapidapi-host": this.apiHost,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error("PROVIDER_ERROR: Not authorized. Check your RAPIDAPI_KEY and API subscription.");
    }

    if (response.status === 404) {
      throw new Error("PNR_NOT_FOUND");
    }

    if (response.status === 429) {
      throw new Error("RATE_LIMITED");
    }

    if (!response.ok) {
      throw new Error(`PROVIDER_ERROR: HTTP ${response.status}`);
    }

    const raw = (await response.json()) as RapidApiPnrResponse & Record<string, any>;

    // Handle subscription / auth error returned with HTTP 200
    const rawMsg = (raw.message || "").toLowerCase();
    if (
      rawMsg.includes("not subscribed") ||
      rawMsg.includes("subscribe") ||
      rawMsg.includes("forbidden")
    ) {
      throw new Error("PROVIDER_ERROR: Not subscribed to this RapidAPI. Visit rapidapi.com to subscribe.");
    }

    // Determine if the response was successful
    // irctc-indian-railway-pnr-status: { success: true, data: {...} }
    // Other APIs:                      { status: true,   data: {...} }
    const isSuccess = raw.success === true || raw.status === true;
    const dataObj = (raw.data || (raw.trainNumber || raw.TrainNo ? raw : null)) as
      | (PnrDataPayload & Record<string, any>)
      | null;

    if (!isSuccess || !dataObj) {
      if (
        rawMsg.includes("not found") ||
        rawMsg.includes("flushed") ||
        rawMsg.includes("invalid") ||
        rawMsg.includes("no record") ||
        rawMsg.includes("does not exist")
      ) {
        throw new Error("PNR_NOT_FOUND");
      }
      throw new Error(`PROVIDER_ERROR: ${raw.message || "Unknown error from PNR API"}`);
    }

    return this.normalizeToCanonical(pnr, dataObj);
  }

  /**
   * Normalizes the raw RapidAPI response into CanonicalPnr.
   * Handles field name differences across different RapidAPI PNR providers.
   * Tested against: irctc-indian-railway-pnr-status.p.rapidapi.com
   */
  private normalizeToCanonical(
    pnr: string,
    data: PnrDataPayload & Record<string, any>
  ): CanonicalPnr {
    // Train info
    const trainNumber = data.trainNumber || data.TrainNo || "UNKNOWN";
    const trainName = data.trainName || data.TrainName || undefined;

    // Stations — prefer specific station fields; fallback to reservation fields
    const source = (data.boardingPoint || data.sourceStation || data.From || "???").toUpperCase();
    const destination = (
      data.reservationUpto ||   // irctc-indian-railway-pnr-status
      data.reservationUpTo ||   // other providers
      data.destinationStation ||
      data.To ||
      "???"
    ).toUpperCase();

    // Journey date — parse "Nov 15, 2026 6:15:00 PM" or "2026-11-15" or "15-11-2026"
    const rawDate = data.dateOfJourney || data.Doj || "";
    const journeyDate = this.parseJourneyDate(rawDate);

    // Departure time — build ISO string from date + time
    const rawTime = data.DepartureTime || data.departureTime || data.scheduledDepartureTime || "";
    const departureTime = this.parseDepartureTime(journeyDate, rawTime, data.arrivalDate);

    // Travel class
    const travelClass = (data.journeyClass || data.Class || data.class || "SL").toUpperCase();

    // Quota — check passenger-level quota too
    const quota = (
      data.quota ||
      data.Quota ||
      (data.passengerList?.[0]?.passengerQuota) ||
      "GN"
    ).toUpperCase();

    // Fare — try all field names; ticketFare is used by irctc-indian-railway-pnr-status
    const rawFare = data.bookingFare ?? data.ticketFare ?? data.fare ?? data.BookingFare ?? data.totalFare ?? 0;
    const fare =
      typeof rawFare === "number"
        ? rawFare
        : parseFloat(String(rawFare).replace(/[^0-9.]/g, "")) || 0;

    // Ticket type — ticketTypeInPrs: "E" means e-ticket (GENERAL), "T" = TATKAL, "P" = PREMIUM_TATKAL
    const ticketType = this.normalizeTicketType(
      data.ticketType || data.TicketType || data.ticketTypeInPrs || quota
    );

    // Overall booking status — derive from first passenger if not present at root
    const firstPassenger = data.passengerList?.[0];
    const overallBookingStatusRaw =
      data.bookingStatus ||
      firstPassenger?.bookingStatus ||
      firstPassenger?.bookingStatusDetails ||
      "CNF";
    const bookingStatus = this.normalizeBookingStatus(overallBookingStatusRaw);

    // Chart status — "Chart Not Prepared" is the real API string
    const chartStatus = this.normalizeChartStatus(
      data.chartStatus || data.ChartPrepared || data.chartPrepared
    );

    // Passengers — normalize each one
    const passengerList: Array<Record<string, any>> =
      data.passengerList || data.PassengerStatus || data.passengers || [];

    const passengers = passengerList.map((p) => ({
      bookingStatus:
        p.bookingStatusDetails ||   // e.g. "RLWL/7" — most descriptive
        p.bookingStatus ||
        p.BookingStatus ||
        "UNKNOWN",
      currentStatus:
        p.currentStatusDetails ||   // e.g. "RLWL/5"
        p.currentStatus ||
        p.CurrentStatus ||
        "UNKNOWN",
    }));

    return {
      pnr,
      journey: {
        trainNumber,
        trainName,
        source,
        destination,
        journeyDate,
        departureTime,
      },
      booking: {
        fare,
        class: travelClass,
        quota,
        ticketType,
        bookingStatus,
        chartStatus,
      },
      passengers,
      metadata: {
        provider: this.name,
        normalizedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Parses various date formats into "YYYY-MM-DD".
   * Handles: "Nov 15, 2026 6:15:00 PM", "2026-11-15", "15-11-2026"
   */
  private parseJourneyDate(raw: string): string {
    if (!raw) return new Date().toISOString().split("T")[0];

    // Already ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

    // "Nov 15, 2026 6:15:00 PM" — try native Date parsing
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      // Convert to IST date
      const ist = new Date(parsed.getTime() + 5.5 * 60 * 60 * 1000);
      return ist.toISOString().slice(0, 10);
    }

    // "15-11-2026" or "15/11/2026"
    const ddmmyyyy = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;

    return new Date().toISOString().split("T")[0];
  }

  /**
   * Builds an ISO 8601 departure timestamp.
   * Falls back to arrivalDate if departure is missing.
   */
  private parseDepartureTime(journeyDate: string, rawTime: string, arrivalDate?: string): string {
    if (rawTime) {
      // If rawTime already has T it's ISO
      if (rawTime.includes("T")) return rawTime;

      // "6:15:00 PM" style — parse it
      const timeOnly = rawTime.replace(/\s?(AM|PM)/i, "").trim();
      const isPm = /PM/i.test(rawTime);
      const parts = timeOnly.split(":").map(Number);
      let hours = parts[0] ?? 0;
      const minutes = parts[1] ?? 0;
      if (isPm && hours < 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
      const hh = String(hours).padStart(2, "0");
      const mm = String(minutes).padStart(2, "0");
      return `${journeyDate}T${hh}:${mm}:00+05:30`;
    }

    // Try to get time from the raw dateOfJourney which often embeds it
    if (arrivalDate) {
      const parsed = new Date(arrivalDate);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }

    return `${journeyDate}T00:00:00+05:30`;
  }

  private normalizeTicketType(raw: string | undefined): TicketType {
    if (!raw) return "GENERAL";
    const upper = raw.toUpperCase();
    if (upper.includes("PREMIUM") || upper === "PT" || upper === "P") return "PREMIUM_TATKAL";
    if (upper.includes("TATKAL") || upper === "TQ" || upper === "TK" || upper === "T") return "TATKAL";
    return "GENERAL";
  }

  private normalizeBookingStatus(raw: string | undefined): BookingStatus {
    if (!raw) return "CONFIRMED";
    const upper = raw.toUpperCase();
    if (upper.includes("WL") || upper.includes("WAIT") || upper.includes("RLWL") || upper.includes("GNWL") || upper.includes("PQWL")) return "WAITLISTED";
    if (upper.includes("RAC")) return "RAC";
    return "CONFIRMED";
  }

  private normalizeChartStatus(raw: string | boolean | undefined): ChartStatus {
    if (raw === undefined || raw === null) return "NOT_PREPARED";
    if (typeof raw === "boolean") return raw ? "PREPARED" : "NOT_PREPARED";
    const str = String(raw).toUpperCase();
    // "Chart Not Prepared" → NOT_PREPARED; "Chart Prepared" → PREPARED
    if (str.includes("NOT")) return "NOT_PREPARED";
    if (str.includes("PREPARED")) return "PREPARED";
    if (str === "Y" || str === "TRUE" || str === "1") return "PREPARED";
    return "NOT_PREPARED";
  }
}

