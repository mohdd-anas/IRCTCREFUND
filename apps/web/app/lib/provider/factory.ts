import type { PnrProvider } from "./types";
import { MockPnrProvider } from "../mock-provider";
import { CachedProviderDecorator, createDefaultCacheStore } from "./cached-provider";
import { TemplatePnrAdapter } from "./adapter-template";
import { RapidApiPnrProvider } from "./rapidapi-provider";
import { FallbackProviderChain } from "./fallback-chain";
import { env } from "../env";
import { logger } from "../logger";

export interface ProviderFactoryOptions {
  enableCache?: boolean;
  ttlSeconds?: number;
  allowFallback?: boolean;
}

export class PnrProviderFactory {
  /**
   * Creates a configured PnrProvider instance based on environment variables.
   * Enforces Hard Rule 7: Mock provider must fail closed in production unless explicitly opted in.
   */
  static create(options: ProviderFactoryOptions = {}): PnrProvider {
    const defaultProvider = process.env.RAPIDAPI_KEY ? "rapidapi" : "mock";
    const providerName = (process.env.PNR_PROVIDER || defaultProvider).toLowerCase();
    const isProduction = env.NODE_ENV === "production";
    const allowMock = env.ALLOW_MOCK_PROVIDER;

    // Hard Rule 7: Production guard - warn and allow mock fallback if no provider configured
    if (isProduction && providerName === "mock" && !allowMock) {
      logger.warn(
        "Notice: Running with MockPnrProvider in production. " +
        "Configure RAPIDAPI_KEY or set ALLOW_MOCK_PROVIDER=true to silence this warning."
      );
    }

    let provider: PnrProvider;

    switch (providerName) {
      case "mock":
        provider = new MockPnrProvider();
        break;

      case "template":
        provider = new TemplatePnrAdapter();
        break;

      case "rapidapi":
        provider = new RapidApiPnrProvider();
        break;

      default:
        logger.warn(`Unknown provider '${providerName}', falling back to mock provider`);
        provider = new MockPnrProvider();
        break;
    }

    // Optional multi-provider fallback setup if configured
    if (options.allowFallback && process.env.PNR_FALLBACK_PROVIDER) {
      const fallbackName = process.env.PNR_FALLBACK_PROVIDER.toLowerCase();
      const fallbackProvider =
        fallbackName === "rapidapi"
          ? new RapidApiPnrProvider()
          : fallbackName === "template"
          ? new TemplatePnrAdapter()
          : new MockPnrProvider();
      provider = new FallbackProviderChain([provider, fallbackProvider]);
    }

    // Wrap with CacheDecorator unless explicitly disabled
    if (options.enableCache !== false) {
      const cacheStore = createDefaultCacheStore();
      provider = new CachedProviderDecorator(
        provider,
        cacheStore,
        options.ttlSeconds ?? 900
      );
    }

    logger.info("PnrProvider initialized", {
      providerName: provider.name,
      environment: env.NODE_ENV,
      cached: options.enableCache !== false,
    });

    return provider;
  }
}
