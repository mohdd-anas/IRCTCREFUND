import { logger } from "./logger";
import { hashPnr } from "./crypto";

export interface TelemetryEvent {
  event: string;
  properties?: Record<string, unknown>;
}

export interface MetricEntry {
  name: "lookup_success" | "lookup_failure" | "provider_latency_ms" | "unsupported_scenario_count";
  value: number;
  tags?: Record<string, string>;
}

/**
 * Scrubs any potential PII (specifically 10-digit PNR sequences) from telemetry payloads.
 */
function scrubPII(value: unknown): unknown {
  if (typeof value === "string") {
    // Replace 10-digit sequences with redacted salted hash prefix
    return value.replace(/\b\d{10}\b/g, (match) => `[REDACTED_PNR:${hashPnr(match).slice(0, 8)}]`);
  }
  if (Array.isArray(value)) {
    return value.map(scrubPII);
  }
  if (value !== null && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.toLowerCase().includes("pnr") && typeof v === "string" && /^\d{10}$/.test(v)) {
        cleaned["pnrHash"] = hashPnr(v);
      } else {
        cleaned[k] = scrubPII(v);
      }
    }
    return cleaned;
  }
  return value;
}

export class TelemetryService {
  private static instance: TelemetryService | null = null;

  static getInstance(): TelemetryService {
    if (!this.instance) {
      this.instance = new TelemetryService();
    }
    return this.instance;
  }

  /**
   * Tracks operational metrics: lookup success/failure, provider latency, unsupported count.
   */
  trackMetric(metric: MetricEntry): void {
    logger.info(`[metric:${metric.name}]`, {
      metric: metric.name,
      value: metric.value,
      tags: metric.tags,
    });
  }

  /**
   * Tracks analytics event with PostHog (when configured), strictly omitting raw PNR.
   */
  trackEvent(eventName: string, properties: Record<string, unknown> = {}): void {
    const sanitizedProps = scrubPII(properties) as Record<string, unknown>;

    logger.debug(`[event:${eventName}]`, sanitizedProps);

    // If PostHog key configured on client/server:
    if (process.env.POSTHOG_API_KEY && process.env.POSTHOG_HOST) {
      // Forward sanitizedProps to PostHog HTTP capture endpoint without third-party SDK bloat
      fetch(`${process.env.POSTHOG_HOST}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.POSTHOG_API_KEY,
          event: eventName,
          properties: {
            ...sanitizedProps,
            distinct_id: "anonymous-rail-user",
          },
        }),
      }).catch(() => null);
    }
  }

  /**
   * Captures errors to Sentry (when configured), ensuring full PII scrubbing.
   */
  captureError(err: unknown, context: Record<string, unknown> = {}): void {
    const sanitizedContext = scrubPII(context) as Record<string, unknown>;
    const errorMessage = err instanceof Error ? err.message : String(err);
    const sanitizedMessage = scrubPII(errorMessage) as string;

    logger.error("Telemetry error captured", {
      error: sanitizedMessage,
      context: sanitizedContext,
    });

    if (process.env.SENTRY_DSN) {
      // Forward PII-scrubbed exception to Sentry store API
      fetch(process.env.SENTRY_DSN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: sanitizedMessage,
          level: "error",
          extra: sanitizedContext,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => null);
    }
  }
}

export const telemetry = TelemetryService.getInstance();
