import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About RailRefund — Independent Ticket Refund Calculator",
  description:
    "Learn about RailRefund: an independent tool that estimates Indian Railways cancellation refunds using transparent, auditable rules.",
};

export default function AboutPage() {
  return (
    <article className="content-card">
      <h1>About RailRefund</h1>
      <p>
        RailRefund is an independent computational utility built to help Indian Railways
        passengers quickly understand cancellation deductions and estimated refund amounts
        before cancelling their train tickets.
      </p>

      <h2>Our Architecture & Core Principles</h2>
      <p>
        Calculating ticket refunds under Indian Railways rules involves multiple interdependent
        factors: booking class, quota, confirmation status at chart preparation, and the exact
        hours remaining until scheduled departure.
      </p>
      <ul>
        <li>
          <strong>Full Separation of Concerns:</strong> Ticket data retrieval and refund computation
          are completely decoupled. The refund engine contains pure calculation logic and never
          interacts directly with external booking providers.
        </li>
        <li>
          <strong>Radical Transparency:</strong> Every calculation returns a line-by-line explanation
          of how deductions were derived. We distinguish strictly between officially verified
          rules and unverified estimation slabs.
        </li>
        <li>
          <strong>No Guesswork:</strong> When ticket conditions are uncertain—such as partial passenger
          cancellations or split statuses—our engine returns <code>UNSUPPORTED</code> rather than
          guessing a misleading rupee figure.
        </li>
        <li>
          <strong>Privacy by Design:</strong> We never log or permanently store raw 10-digit PNR
          numbers. All database indexes and telemetry records use salted cryptographic hashes (SHA-256).
        </li>
      </ul>

      <h2>Important Disclaimer & Independence</h2>
      <p>
        RailRefund is an <strong>independent informational service</strong>. We are
        <strong> not affiliated, associated, authorized, endorsed by, or in any way officially
        connected with Indian Railways, IRCTC (Indian Railway Catering and Tourism Corporation),
        or CRIS (Centre for Railway Information Systems)</strong>.
      </p>
      <p>
        All calculations presented on this website are estimates. Actual refund amounts are
        determined exclusively by the applicable railway rules and ticketing systems at the time
        of cancellation. To process an official cancellation or claim an actual refund, passengers
        must use official railway channels (e.g., irctc.co.in or PRS station reservation counters).
      </p>
    </article>
  );
}
