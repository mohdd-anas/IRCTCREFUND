import type { CanonicalPnr } from "./types";
import type { PnrProvider } from "./mock-provider";
import { env } from "./env";
import { logger } from "./logger";

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "TIMEOUT" | "RATE_LIMITED" | "UNAVAILABLE" | "INTERNAL",
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ProviderWrapperOptions {
  timeoutMs?: number;
  maxRetries?: number;
  requestId?: string;
}

/**
 * Wraps any PnrProvider with timeout enforcement, controlled retries,
 * and error sanitization (Hard Rule: never leak provider internals).
 */
export class RobustProviderWrapper implements PnrProvider {
  public readonly name: string;
  private timeoutMs: number;
  private maxRetries: number;

  constructor(
    private innerProvider: PnrProvider,
    options: ProviderWrapperOptions = {}
  ) {
    this.name = `robust(${innerProvider.name})`;
    this.timeoutMs = options.timeoutMs ?? env.PROVIDER_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? env.PROVIDER_MAX_RETRIES;
  }

  async getPnrStatus(pnr: string, requestId?: string): Promise<CanonicalPnr> {
    const reqLogger = requestId ? logger.withRequestId(requestId) : logger;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        const result = await this.executeWithTimeout(pnr);
        return result;
      } catch (err) {
        const providerError = this.normalizeError(err);

        // Never retry 4xx / non-retryable errors
        if (!providerError.isRetryable || attempt > this.maxRetries) {
          reqLogger.error("Provider request failed permanently", {
            code: providerError.code,
            attempt,
            maxRetries: this.maxRetries,
            isRetryable: providerError.isRetryable,
          });
          throw providerError;
        }

        const backoffMs = Math.min(100 * Math.pow(2, attempt), 1000);
        reqLogger.warn("Provider transient error, retrying with backoff", {
          attempt,
          nextAttemptInMs: backoffMs,
          code: providerError.code,
        });

        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new ProviderError(
      "Service is temporarily unavailable. Please try again later.",
      "UNAVAILABLE",
      false
    );
  }

  private async executeWithTimeout(pnr: string): Promise<CanonicalPnr> {
    let timer: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new ProviderError(
            `Provider call timed out after ${this.timeoutMs}ms`,
            "TIMEOUT",
            true
          )
        );
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([
        this.innerProvider.getPnrStatus(pnr),
        timeoutPromise,
      ]);
      return result;
    } finally {
      clearTimeout(timer!);
    }
  }

  private normalizeError(err: unknown): ProviderError {
    if (err instanceof ProviderError) {
      return err;
    }

    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("PNR_NOT_FOUND")) {
      return new ProviderError("PNR not found.", "NOT_FOUND", false);
    }

    if (message.includes("TIMEOUT") || message.includes("timed out")) {
      return new ProviderError("Provider request timed out.", "TIMEOUT", true);
    }

    if (message.includes("RATE_LIMITED")) {
      return new ProviderError("Provider rate limit reached.", "RATE_LIMITED", false);
    }

    if (message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT") || message.includes("503")) {
      return new ProviderError("Provider service is temporarily unreachable.", "UNAVAILABLE", true);
    }

    // Generic fallback: not retryable, sanitized
    return new ProviderError("Provider query failed.", "INTERNAL", false);
  }
}
