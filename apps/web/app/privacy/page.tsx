import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — RailRefund",
  description:
    "RailRefund privacy policy: zero permanent storage of raw PNRs, salted SHA-256 hashing, and complete data minimization.",
};

export default function PrivacyPage() {
  return (
    <article className="content-card">
      <h1>Privacy Policy</h1>
      <p>
        RailRefund operates under strict data minimization and user privacy principles.
        This Privacy Policy explains how information is handled when you use our refund
        calculation tool.
      </p>

      <h2>1. No Storage of Raw PNR Numbers</h2>
      <p>
        Your 10-digit Passenger Name Record (PNR) number is personal travel data.
        <strong> RailRefund does NOT permanently store, index, or log raw PNR numbers.</strong>
      </p>
      <ul>
        <li>
          All request telemetry and calculation audit logs record only a one-way
          salted cryptographic hash (SHA-256) of your PNR.
        </li>
        <li>
          Raw PNR numbers are never written to application logs, persistent databases,
          or external telemetry collectors.
        </li>
      </ul>

      <h2>2. Short-Lived Caching (TTL)</h2>
      <p>
        To protect railway inquiry systems from redundant traffic and improve response speed,
        the ticket metadata returned by providers is temporarily cached for up to 30 minutes.
        These snapshots are stored using hashed keys and are automatically deleted by a scheduled
        TTL cleanup script.
      </p>

      <h2>3. Third-Party Monitoring & Telemetry</h2>
      <ul>
        <li>
          <strong>Error Tracking:</strong> Any error reports captured for system reliability
          are scrubbed of personally identifiable information (PII) before transmission.
        </li>
        <li>
          <strong>Product Analytics:</strong> Event metrics record only operational aggregates
          (e.g., calculation volume, latency percentiles, unsupported rule frequency). No PNR,
          passenger names, or coach numbers are ever included in analytics payloads.
        </li>
      </ul>

      <h2>4. Independence Notice</h2>
      <p>
        RailRefund is an independent service not affiliated with IRCTC or Indian Railways.
        Refund amounts calculated are estimates; actual refunds are governed by the ticketing
        authority.
      </p>

      <h2>5. Inquiries & Data Rights</h2>
      <p>
        Because we do not store personal profiles, names, email addresses, or unhashed PNRs,
        there is no identifiable user dossier stored on our systems. If you have questions
        regarding our privacy architecture, please contact us via our repository issue tracker.
      </p>
    </article>
  );
}
