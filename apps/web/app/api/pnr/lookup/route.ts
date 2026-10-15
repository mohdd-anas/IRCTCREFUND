import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MockPnrProvider } from "@/app/lib/mock-provider";
import { RobustProviderWrapper, ProviderError } from "@/app/lib/provider-wrapper";
import { getRateLimiter } from "@/app/lib/rate-limiter";
import { hashPnr } from "@/app/lib/crypto";
import { logger } from "@/app/lib/logger";
import { getRepository } from "@/app/lib/db/repository";

const PnrLookupSchema = z.object({
  pnr: z
    .string()
    .regex(/^\d{10}$/, "PNR must be exactly 10 digits"),
});

let providerInstance: RobustProviderWrapper | null = null;

function getRobustProvider(): RobustProviderWrapper {
  if (!providerInstance) {
    const rawProvider = new MockPnrProvider();
    providerInstance = new RobustProviderWrapper(rawProvider);
  }
  return providerInstance;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const reqLogger = logger.withRequestId(requestId);
  const repository = getRepository();

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateLimiter = getRateLimiter();
  const rateLimitResult = await rateLimiter.check(`lookup:${clientIp}`);

  if (!rateLimitResult.allowed) {
    reqLogger.warn("Rate limit exceeded for lookup", { clientIp });
    const res = NextResponse.json(
      { error: "Too many requests. Please wait a moment before trying again." },
      { status: 429 }
    );
    res.headers.set("x-request-id", requestId);
    res.headers.set("Retry-After", Math.ceil(rateLimitResult.resetMs / 1000).toString());
    return res;
  }

  let pnr = "";
  let pnrHash = "";

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Malformed request body. JSON payload expected." },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const parsed = PnrLookupSchema.safeParse(body);

    if (!parsed.success) {
      reqLogger.info("Invalid PNR lookup format submitted");
      return NextResponse.json(
        { error: "Invalid PNR. Please enter a valid 10-digit PNR number." },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    pnr = parsed.data.pnr;
    pnrHash = hashPnr(pnr);

    // Hard Rule: Never log raw PNR
    reqLogger.info("Processing PNR lookup", {
      pnrHash,
      pnrLength: pnr.length,
    });

    // Check short-lived cached snapshot before querying provider
    const cached = await repository.getPnrSnapshot(pnrHash);
    if (cached) {
      reqLogger.info("Returning cached PNR snapshot", { pnrHash });
      await repository.logPnrRequest({
        requestId,
        pnrHash,
        status: "CACHE_HIT",
        latencyMs: Date.now() - startTime,
      });

      const response = NextResponse.json({ pnrData: cached.canonicalJson }, { status: 200 });
      response.headers.set("x-request-id", requestId);
      return response;
    }

    const provider = getRobustProvider();
    const pnrData = await provider.getPnrStatus(pnr, requestId);

    // Persist snapshot with short TTL (minimal data retention)
    await repository.savePnrSnapshot({
      pnrHash,
      canonicalJson: pnrData,
      provider: "mock",
      ttlSeconds: 1800, // 30 minutes
    });

    // Persist request record with salted hash only
    await repository.logPnrRequest({
      requestId,
      pnrHash,
      status: "SUCCESS",
      latencyMs: Date.now() - startTime,
    });

    const response = NextResponse.json({ pnrData }, { status: 200 });
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;

    if (pnrHash) {
      const status =
        error instanceof ProviderError && error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : error instanceof ProviderError && error.code === "TIMEOUT"
            ? "TIMEOUT"
            : "ERROR";

      await repository.logPnrRequest({
        requestId,
        pnrHash,
        status,
        latencyMs,
      }).catch(() => null);
    }

    if (error instanceof ProviderError) {
      if (error.code === "NOT_FOUND") {
        return NextResponse.json(
          {
            error:
              "We couldn't find a ticket with this PNR. Please double-check the number and try again.",
          },
          { status: 404, headers: { "x-request-id": requestId } }
        );
      }

      if (error.code === "TIMEOUT") {
        return NextResponse.json(
          {
            error:
              "The railway inquiry service took too long to respond. Please try again shortly.",
          },
          { status: 504, headers: { "x-request-id": requestId } }
        );
      }
    }

    reqLogger.error("PNR lookup failed with unhandled exception", {
      errorType: error instanceof Error ? error.name : "Unknown",
    });

    return NextResponse.json(
      {
        error:
          "Something went wrong while looking up your PNR. Please try again in a moment.",
      },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
