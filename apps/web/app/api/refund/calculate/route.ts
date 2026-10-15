import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateRefund } from "@/app/lib/refund-engine";

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
      departureTime: z.string()
    }),
    booking: z.object({
      fare: z.number().positive(),
      class: z.string(),
      quota: z.string(),
      ticketType: z.enum(["GENERAL", "TATKAL", "PREMIUM_TATKAL"]),
      bookingStatus: z.enum(["CONFIRMED", "RAC", "WAITLISTED"]),
      chartStatus: z.enum(["NOT_PREPARED", "PREPARED"])
    }),
    passengers: z
      .array(
        z.object({
          bookingStatus: z.string(),
          currentStatus: z.string()
        })
      )
      .min(1),
    metadata: z.record(z.string(), z.unknown()).optional()
  }),
  calculationTime: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RefundCalcSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid ticket data. Unable to calculate refund." },
        { status: 400 }
      );
    }

    const { pnrData, calculationTime } = parsed.data;

    // Never log raw PNR
    console.log(`[refund/calculate] Refund calculation request, pnr_length=${pnrData.pnr.length}`);

    const result = calculateRefund(pnrData, calculationTime);

    return NextResponse.json({ result });
  } catch (error: unknown) {
    console.error("[refund/calculate] Calculation error (details redacted)");
    return NextResponse.json(
      { error: "Something went wrong while calculating your refund. Please try again." },
      { status: 500 }
    );
  }
}
