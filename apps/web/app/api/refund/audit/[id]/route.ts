import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/app/lib/db/repository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const repository = getRepository();

  const audit = await repository.getCalculationAudit(id);

  if (!audit) {
    return NextResponse.json(
      { error: "Calculation record not found." },
      { status: 404, headers: { "x-request-id": requestId } }
    );
  }

  const response = NextResponse.json({ audit }, { status: 200 });
  response.headers.set("x-request-id", requestId);
  return response;
}
