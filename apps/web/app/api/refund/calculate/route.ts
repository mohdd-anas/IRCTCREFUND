import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateRefund } from "@/app/lib/refund-engine";
import { getRateLimiter } from "@/app/lib/rate-limiter";
import { hashPnr } from "@/app/lib/crypto";
import { logger } from "@/app/lib/logger";
import { getRepository } from "@/app/lib/db/repository";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Re-validate input independently — never trust the caller (Hard Rule)
const RefundCalcSchema = z.object({
  pnrData: z.object({
    pnr: z.string().regex(/^\d{10}$/),
    journey: z.object({
      trainNumber: z.string(),
      trainName: z.string().optional(),
      source: z.string(),
      destination: z.string(),
      journeyDate: z.string(),
      departureTime: z.string(),
    }),
    booking: z.object({
      fare: z.number().positive(),
      class: z.string(),
      quota: z.string(),
      ticketType: z.enum(["GENERAL", "TATKAL", "PREMIUM_TATKAL"]),
      bookingStatus: z.enum(["CONFIRMED", "RAC", "WAITLISTED"]),
      chartStatus: z.enum(["NOT_PREPARED", "PREPARED"]),
    }),
    passengers: z
      .array(
        z.object({
          bookingStatus: z.string(),
          currentStatus: z.string(),
        })
      )
      .min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  calculationTime: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const reqLogger = logger.withRequestId(requestId);
  const repository = getRepository();

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateLimiter = getRateLimiter();
  const rateLimitResult = await rateLimiter.check(`calc:${clientIp}`);

  if (!rateLimitResult.allowed) {
    reqLogger.warn("Rate limit exceeded for calculate", { clientIp });
    const res = NextResponse.json(
      { error: "Too many requests. Please wait a moment before trying again." },
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

    const parsed = RefundCalcSchema.safeParse(body);

    if (!parsed.success) {
      reqLogger.info("Invalid refund calculation payload submitted");
      return NextResponse.json(
        { error: "Invalid ticket data. Unable to calculate refund." },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const { pnrData, calculationTime } = parsed.data;
    const pnrHash = hashPnr(pnrData.pnr);

    // Hard Rule: Never log raw PNR
    reqLogger.info("Calculating refund", {
      pnrHash,
      pnrLength: pnrData.pnr.length,
      trainNumber: pnrData.journey.trainNumber,
      travelClass: pnrData.booking.class,
    });

    // Pure engine calculation (DB-free engine execution)
    const result = calculateRefund(pnrData, calculationTime);

    // Persist calculation record for full auditability (non-fatal if DB is temporarily unreachable)
    let calculationId = crypto.randomUUID();
    try {
      const saved = await repository.saveCalculation({
        requestId,
        pnrHash,
        inputSnapshot: pnrData,
        ruleVersion: result.ruleVersion,
        provider: pnrData.metadata?.provider ? String(pnrData.metadata.provider) : "provider",
        result,
      });
      calculationId = saved.id;
    } catch (saveErr) {
      reqLogger.warn("Calculation audit could not be persisted to database", {
        error: saveErr instanceof Error ? saveErr.message : String(saveErr),
      });
    }

    const response = NextResponse.json(
      { result, calculationId },
      { status: 200 }
    );
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error: unknown) {
    reqLogger.error("Refund calculation failed with unhandled exception", {
      errorType: error instanceof Error ? error.name : "Unknown",
    });

    return NextResponse.json(
      {
        error:
          "Something went wrong while calculating your refund. Please try again.",
      },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
