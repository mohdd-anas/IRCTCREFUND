import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Indian Railways Ticket Refund Rules (2026 Guide) — Verified vs Pending Rules",
  description:
    "Comprehensive guide to Indian Railways cancellation and refund rules: confirmed Tatkal rules, waitlisted chart preparation rules, and unverified timing slabs.",
};

export default function TrainTicketRefundRulesPage() {
  return (
    <article className="content-card">
      <h1>Indian Railways Train Ticket Refund Rules (2026 Guide)</h1>
      <p>
        Understanding Indian Railways refund rules can be complex because deductions vary
        widely depending on booking quota, travel class, confirmation status at chart preparation,
        and the exact hours prior to scheduled departure.
      </p>
      <p>
        At RailRefund, we maintain an auditable rules engine. Below is a complete breakdown
        of all rules, explicitly categorized into <strong>Officially Verified Rules</strong> and
        <strong> Pending / Placeholder Rules</strong> awaiting primary-source gazette verification.
      </p>

      <h2>1. Officially Confirmed Rules (Verified)</h2>
      <p>
        These rules have been verified against published Indian Railways Railway Passengers
        (Cancellation of Ticket and Refund of Fare) statutory notifications:
      </p>

      <div className="rules-table-container">
        <table className="rules-table">
          <thead>
            <tr>
              <th>Rule ID</th>
              <th>Scenario</th>
              <th>Status</th>
              <th>Refund & Deductions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>RULE_TATKAL_CONFIRMED_VOLUNTARY</code>
              </td>
              <td>Confirmed Tatkal or Premium Tatkal ticket cancelled voluntarily</td>
              <td>
                <span className="badge-verified">Verified</span>
              </td>
              <td>
                <strong>Zero Refund (₹0)</strong>. No refund of fare is granted on voluntary
                cancellation of confirmed Tatkal / Premium Tatkal tickets.
              </td>
            </tr>
            <tr>
              <td>
                <code>RULE_WAITLISTED_CHART_PREPARED_AUTO</code>
              </td>
              <td>Fully Waitlisted ticket remaining on waitlist after chart preparation</td>
              <td>
                <span className="badge-verified">Verified</span>
              </td>
              <td>
                <strong>100% Full Refund</strong>. Auto-cancelled by the railway ticketing
                system. Zero cancellation charge or clerkage deducted.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>2. Placeholder Cancellation Timing Slabs (Pending Verification)</h2>
      <p>
        For voluntary cancellation of confirmed general tickets, deductions follow progressive
        time windows. In our current ruleset (<code>2026.1-draft</code>), these time slabs are
        marked as <strong>unverified placeholders</strong> until officially confirmed against a
        primary-source railway circular:
      </p>

      <div className="rules-table-container">
        <table className="rules-table">
          <thead>
            <tr>
              <th>Time Window Prior to Departure</th>
              <th>Deduction Formula</th>
              <th>Verification Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>More than 48 hours</strong>
              </td>
              <td>
                Flat deduction per passenger based on class:
                <br />
                • 1A / Executive: ₹240
                <br />
                • 2A / First Class: ₹200
                <br />
                • 3A / 3E / Chair Car: ₹180
                <br />
                • Sleeper (SL): ₹120
                <br />• Second Class (2S): ₹60
              </td>
              <td>
                <span className="badge-unverified">Pending Circular</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Between 12 hours and 48 hours</strong>
              </td>
              <td>
                <strong>25% of ticket fare</strong> (subject to the minimum flat rate per passenger
                for the class).
              </td>
              <td>
                <span className="badge-unverified">Pending Circular</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Between 4 hours and 12 hours</strong>
              </td>
              <td>
                <strong>50% of ticket fare</strong> (subject to the minimum flat rate per passenger
                for the class).
              </td>
              <td>
                <span className="badge-unverified">Pending Circular</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Less than 4 hours or after chart preparation</strong>
              </td>
              <td>
                <strong>Zero Refund (100% deduction)</strong>. No refund admissible if cancelled
                within 4 hours of scheduled departure on confirmed tickets.
              </td>
              <td>
                <span className="badge-unverified">Pending Circular</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Post-Departure</strong>
              </td>
              <td>
                <strong>Zero Refund</strong>. Online cancellation is closed after train departure.
                TDR filing may be required under special operational circumstances.
              </td>
              <td>
                <span className="badge-unverified">Pending Circular</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>3. Special Scenarios & Unsupported Edge Cases</h2>
      <h3>Partially Confirmed Tickets (Mixed Passenger Statuses)</h3>
      <p>
        When some passengers on a PNR are confirmed while others remain RAC or Waitlisted, Indian
        Railways permits cancellation rules that differ from standard uniform tickets. RailRefund
        marks these tickets as <code>UNSUPPORTED</code> and does not display an estimated number,
        preventing misleading expectations.
      </p>

      <h3>Waitlisted Tickets Cancelled Before Charting</h3>
      <p>
        If a waitlisted ticket is manually cancelled before chart preparation, Indian Railways
        deducts a nominal clerkage fee (typically ₹60 per passenger plus applicable GST), returning
        the remaining gross balance.
      </p>

      <h2>4. Mandatory Notice & Verification Protocol</h2>
      <p>
        RailRefund publishes transparent rules verification procedures in our engineering
        documentation. To track or propose circular updates, consult{" "}
        <code>docs/rules-verification.md</code> in our documentation archive.
      </p>
      <p className="disclaimer">
        Independent service. Not affiliated with IRCTC or Indian Railways. Refund amounts are
        estimates; actual refunds are determined by the applicable railway rules and ticketing
        system.
      </p>
    </article>
  );
}
