import { NextRequest, NextResponse } from "next/server";
import { env } from "@/app/lib/env";

const startTime = Date.now();

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();

  const providerName = (
    process.env.PNR_PROVIDER ||
    (process.env.RAPIDAPI_KEY ? "rapidapi" : "mock")
  ).toLowerCase();

  const hasRapidApiKey = Boolean(process.env.RAPIDAPI_KEY || env.RAPIDAPI_KEY);
  const allowMock =
    process.env.ALLOW_MOCK_PROVIDER === "true" ||
    (process.env.ALLOW_MOCK_PROVIDER === undefined && env.ALLOW_MOCK_PROVIDER);

  const response = NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      environment: process.env.NODE_ENV || env.NODE_ENV,
      version: "2026.1-draft",
      diagnostics: {
        provider: providerName,
        rapidApiKeyConfigured: hasRapidApiKey,
        allowMockProvider: allowMock,
        database: process.env.DATABASE_URL ? "postgres" : "in-memory",
        redis: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
          ? "upstash"
          : "in-memory",
        providerTimeoutMs: env.PROVIDER_TIMEOUT_MS,
        providerMaxRetries: env.PROVIDER_MAX_RETRIES,
      },
    },
    { status: 200 }
  );

  response.headers.set("x-request-id", requestId);
  return response;
}
