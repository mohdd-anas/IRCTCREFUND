import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MockPnrProvider } from "@/app/lib/mock-provider";
import { RobustProviderWrapper, ProviderError } from "@/app/lib/provider-wrapper";
import { getRateLimiter } from "@/app/lib/rate-limiter";
import { hashPnr } from "@/app/lib/crypto";
import { logger } from "@/app/lib/logger";

const PnrLookupSchema = z.object({
  pnr: z
    .string()
    .regex(/^\d{10}$/, "PNR must be exactly 10 digits"),
});

// Singleton provider instance with robust wrapper
let providerInstance: RobustProviderWrapper | null = null;

function getRobustProvider(): RobustProviderWrapper {
  if (!providerInstance) {
    const rawProvider = new MockPnrProvider();
    providerInstance = new RobustProviderWrapper(rawProvider);
  }
  return providerInstance;
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const reqLogger = logger.withRequestId(requestId);

  // Rate limiting by client IP or forwarded IP
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateLimiter = getRateLimiter();
  const rateLimitResult = await rateLimiter.check(`lookup:${clientIp}`);

  if (!rateLimitResult.allowed) {
    reqLogger.warn("Rate limit exceeded for lookup", { clientIp });
    const res = NextResponse.json(
      {
        error: "Too many requests. Please wait a moment before trying again.",
      },
      { status: 429 }
    );
    res.headers.set("x-request-id", requestId);
    res.headers.set("Retry-After", Math.ceil(rateLimitResult.resetMs / 1000).toString());
    return res;
  }

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

    const { pnr } = parsed.data;
    const pnrHash = hashPnr(pnr);

    // Hard Rule: Never log raw PNR
    reqLogger.info("Processing PNR lookup", {
      pnrHash,
      pnrLength: pnr.length,
    });

    const provider = getRobustProvider();
    const pnrData = await provider.getPnrStatus(pnr, requestId);

    const response = NextResponse.json({ pnrData }, { status: 200 });
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error: unknown) {
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
