# RailRefund — PNR Provider Onboarding Checklist

> **Mandatory Review Before Contracting**: A real provider adapter may **only** be implemented after every item on this checklist has been validated and approved in writing. Under no circumstances should an unofficial or scraping-based provider be connected.

---

## 1. Legitimate API & Legal Sourcing
- [ ] **Official Licensing**: Does the provider obtain railway data through legitimate, authorized upstream channels (e.g. CRIS / Indian Railways authorized commercial B2B data licensing)?
- [ ] **No Scraping or Automation**: Is the provider free of headless browser scraping, CAPTCHA bypasses, unauthorized session hijacking, or reverse-engineered private IRCTC APIs?
- [ ] **Contractual Indemnity**: Does the vendor agreement indemnify RailRefund against third-party claims relating to unauthorized data extraction?

## 2. Commercial Rights & Permissions
- [ ] **Commercial Use Permitted in Writing**: Does the vendor's Terms of Service explicitly permit commercial redistribution and monetization of the inquiry response data?
- [ ] **Sub-licensing Rights**: Are we legally permitted to transform, derive calculations from, and present the resulting ticket metadata to end users?

## 3. Caching & Storage Terms
- [ ] **Caching Permitted in Writing**: Does the provider agreement explicitly authorize caching PNR inquiry results for at least 15–60 minutes?
- [ ] **Data Retention Compliance**: Does our retention policy comply with provider restrictions on historical data persistence? (RailRefund stores only salted SHA-256 hashes of PNRs with a 30-minute snapshot TTL).

## 4. Rate Limits & Throughput SLA
- [ ] **Quota & Concurrency**: What is the maximum requests per second (RPS) and daily limit?
- [ ] **Burst Allowance**: Does the provider accommodate burst traffic (e.g., during Tatkal cancellation hours)?
- [ ] **Rate Limit Headers**: Does the provider return standard `RateLimit-*` or `Retry-After` HTTP headers on throttling?

## 5. Uptime & SLA Guarantees
- [ ] **Availability SLA**: Is there a documented uptime guarantee (minimum 99.5% recommended)?
- [ ] **Maintenance Windows**: Are planned downtime windows published in advance with machine-readable status pages?
- [ ] **Response Latency**: Does the provider meet a p95 latency threshold under 2,000ms?

## 6. Pricing & Billing Model
- [ ] **Billing Unit**: Is billing per-query, per-successful-resolution, or fixed monthly?
- [ ] **Non-Found PNR Billing**: Are 404/invalid PNR queries billed at the full rate?
- [ ] **Overage Protection**: Are hard billing caps configurable to prevent runaway costs?

## 7. Fallback & Redundancy Strategy
- [ ] **Secondary Provider Available**: Is there a secondary provider configured in the `FallbackProviderChain`?
- [ ] **Distinct Infrastructure**: Does the fallback provider utilize separate upstream routing to prevent correlated outages?

## 8. Trademark & Privacy Compliance
- [ ] **Strict PNR Privacy**: RailRefund architecture guarantees raw 10-digit PNRs are never logged or stored permanently; ensure vendor logs similarly respect user privacy.
- [ ] **Independence Disclaimers**: Ensure our mandatory disclaimer remains prominent on all surfaces:
  > *"Independent service. Not affiliated with IRCTC or Indian Railways. Refund amounts are estimates; actual refunds are determined by the applicable railway rules and ticketing system."*
- [ ] **No Brand Misrepresentation**: Verify no IRCTC, CRIS, or Indian Railways logos or trademarks are used in ways that suggest official affiliation.

## 9. Failure Modes & Degradation
- [ ] **Fail-Closed Principle**: If the provider is unreachable, does the system fail closed with clean, generic error messages rather than guessing data?
- [ ] **Timeout Enforcement**: All provider invocations must be bound to a strict 5-second timeout via `RobustProviderWrapper`.
- [ ] **Error Isolation**: No vendor stack traces, API keys, or private endpoint URLs may ever leak to the client or public logs.
