import type { CanonicalPnr } from "../types";
import type { PnrProvider } from "./types";
import { logger } from "../logger";

export class FallbackProviderChain implements PnrProvider {
  public readonly name: string;

  constructor(private providers: PnrProvider[]) {
    if (!providers || providers.length === 0) {
      throw new Error("FallbackProviderChain requires at least one provider.");
    }
    this.name = `chain(${providers.map((p) => p.name).join("->")})`;
  }

  async getPnrStatus(pnr: string): Promise<CanonicalPnr> {
    const errors: Array<{ provider: string; error: string }> = [];

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];

      try {
        const result = await provider.getPnrStatus(pnr);
        if (i > 0) {
          logger.info("Fallback provider succeeded", {
            succeededProvider: provider.name,
            attemptIndex: i,
          });
        }
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        // Hard Rule: Do NOT fallback if PNR is explicitly not found (404)
        if (errorMessage.includes("PNR_NOT_FOUND") || errorMessage.includes("not found")) {
          throw err;
        }

        errors.push({ provider: provider.name, error: errorMessage });

        logger.warn("Provider in fallback chain failed, attempting next", {
          failedProvider: provider.name,
          nextIndex: i + 1,
          hasNext: i + 1 < this.providers.length,
          error: errorMessage,
        });
      }
    }

    logger.error("All providers in fallback chain exhausted", { errors });
    throw new Error(
      `All providers in chain failed: ${errors
        .map((e) => `${e.provider}: ${e.error}`)
        .join("; ")}`
    );
  }
}
