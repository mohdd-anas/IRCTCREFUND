"use client";

import { useState } from "react";
import type { CanonicalPnr, RefundResult } from "@/app/lib/types";

interface RefundResultViewProps {
  pnrData: CanonicalPnr;
  result: RefundResult;
  onReset: () => void;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function getStatusClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "CNF" || s === "CONFIRMED") return "status-cnf";
  if (s.includes("WL") || s.includes("WAITLIST")) return "status-wl";
  if (s.includes("RAC")) return "status-rac";
  return "";
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function quotaLabel(q: string): string {
  switch (q) {
    case "GN": return "General";
    case "TQ": return "Tatkal";
    case "PT": return "Premium Tatkal";
    case "LD": return "Ladies";
    case "HP": return "Handicapped";
    case "DF": return "Defence";
    default: return q;
  }
}

export default function RefundResultView({
  pnrData,
  result,
  onReset,
}: RefundResultViewProps) {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const { journey, booking, passengers } = pnrData;

  // UNSUPPORTED path — no amount shown at all
  if (result.eligibility === "UNSUPPORTED") {
    return (
      <div className="result-section" role="region" aria-live="polite">
        <div className="unsupported-card">
          <p className="unsupported-heading">
            We couldn&apos;t confidently calculate your refund for this ticket.
          </p>
          {result.explanation.map((line, i) => (
            <p key={i} className="unsupported-text">
              {line}
            </p>
          ))}
        </div>

        <button className="btn-secondary" onClick={onReset}>
          Check another PNR
        </button>

        <p className="disclaimer">
          Independent service. Not affiliated with IRCTC or Indian Railways.
          Refund amounts are estimates; actual refunds are determined by the
          applicable railway rules and ticketing system.
        </p>
      </div>
    );
  }

  const isRefundPositive = result.amount !== null && result.amount > 0;

  return (
    <div className="result-section" role="region" aria-live="polite">
      {/* Route line */}
      <div className="route-line">
        {journey.source}
        <span className="route-arrow">→</span>
        {journey.destination}
      </div>

      {/* Train info */}
      <div className="train-info">
        <span className="train-number">{journey.trainNumber}</span>
        {journey.trainName && ` ${journey.trainName}`}
        {" · "}
        <span className="train-date">{formatDate(journey.journeyDate)}</span>
        {journey.departureTime && ` at ${formatTime(journey.departureTime)}`}
      </div>

      {/* Ticket detail rows */}
      <div className="ticket-details">
        <div className="detail-row">
          <span className="detail-label">Class</span>
          <span className="detail-value">{booking.class}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Quota</span>
          <span className="detail-value">{quotaLabel(booking.quota)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Ticket type</span>
          <span className="detail-value">
            {booking.ticketType === "GENERAL"
              ? "General"
              : booking.ticketType === "TATKAL"
                ? "Tatkal"
                : "Premium Tatkal"}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Booking status</span>
          <span className="detail-value">{booking.bookingStatus}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Chart</span>
          <span className="detail-value">
            {booking.chartStatus === "PREPARED" ? "Prepared" : "Not prepared"}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Fare paid</span>
          <span className="detail-value mono">
            {formatCurrency(booking.fare)}
          </span>
        </div>
      </div>

      {/* Passengers */}
      <div className="passengers-section">
        <div className="passengers-title">
          Passengers ({passengers.length})
        </div>
        {passengers.map((p, i) => (
          <div key={i} className="passenger-row">
            <span className="passenger-label">Passenger {i + 1}</span>
            <span className={`passenger-status ${getStatusClass(p.currentStatus)}`}>
              {p.currentStatus}
            </span>
          </div>
        ))}
      </div>

      {/* Refund ledger */}
      <div className="refund-ledger">
        <div className="ledger-row">
          <span className="ledger-label">Fare paid</span>
          <span className="ledger-value">
            {formatCurrency(result.grossFare)}
          </span>
        </div>
        {result.deduction !== null && (
          <div className="ledger-row">
            <span className="ledger-label">Cancellation deduction</span>
            <span className="ledger-value" style={{ color: "var(--rust)" }}>
              &minus;{formatCurrency(result.deduction)}
            </span>
          </div>
        )}
        <hr className="ledger-divider" />
        <div className="ledger-row ledger-total">
          <span className="ledger-label">Estimated refund</span>
          <span
            className={`ledger-value ${isRefundPositive ? "refund-positive" : "refund-zero"}`}
          >
            {result.amount !== null ? formatCurrency(result.amount) : "—"}
          </span>
        </div>
      </div>

      {/* Explanation */}
      {result.explanation.length > 0 && (
        <div className="explanation-section">
          <button
            className="explanation-toggle"
            onClick={() => setExplanationOpen(!explanationOpen)}
            aria-expanded={explanationOpen}
            aria-controls="explanation-content"
          >
            <span>How did we calculate this?</span>
            <span
              className={`explanation-chevron ${explanationOpen ? "open" : ""}`}
            >
              ▼
            </span>
          </button>
          {explanationOpen && (
            <ul className="explanation-list" id="explanation-content">
              {result.explanation.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="warning-notice" role="alert">
          {result.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      <button className="btn-secondary" onClick={onReset}>
        Check another PNR
      </button>

      <p className="disclaimer">
        Independent service. Not affiliated with IRCTC or Indian Railways.
        Refund amounts are estimates; actual refunds are determined by the
        applicable railway rules and ticketing system.
      </p>
    </div>
  );
}
