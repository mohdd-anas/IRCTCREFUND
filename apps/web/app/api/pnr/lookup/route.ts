import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MockPnrProvider } from "@/app/lib/mock-provider";

const PnrLookupSchema = z.object({
  pnr: z
    .string()
    .regex(/^\d{10}$/, "PNR must be exactly 10 digits")
});

// Singleton provider instance
let provider: InstanceType<typeof MockPnrProvider> | null = null;

function getProvider() {
  if (!provider) {
    provider = new MockPnrProvider();
  }
  return provider;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = PnrLookupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid PNR. Please enter a valid 10-digit PNR number." },
        { status: 400 }
      );
    }

    const { pnr } = parsed.data;

    // Never log raw PNR — log only length
    console.log(`[pnr/lookup] PNR lookup request, length=${pnr.length}`);

    const pnrProvider = getProvider();
    const pnrData = await pnrProvider.getPnrStatus(pnr);

    return NextResponse.json({ pnrData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "PNR_NOT_FOUND") {
      return NextResponse.json(
        { error: "We couldn't find a ticket with this PNR. Please double-check the number and try again." },
        { status: 404 }
      );
    }

    console.error("[pnr/lookup] Provider error (details redacted)");
    return NextResponse.json(
      { error: "Something went wrong while looking up your PNR. Please try again in a moment." },
      { status: 500 }
    );
  }
}
