import { NextRequest, NextResponse } from "next/server";
import { env } from "@/app/lib/env";

const startTime = Date.now();

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();

  const response = NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      environment: env.NODE_ENV,
      version: "2026.1-draft",
    },
    { status: 200 }
  );

  response.headers.set("x-request-id", requestId);
  return response;
}
