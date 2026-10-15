import { hashPnr } from "./crypto";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

/**
 * Redacts any accidental 10-digit PNR string patterns from metadata values.
 */
function sanitizeMeta(value: unknown): unknown {
  if (typeof value === "string") {
    // If it looks like a 10-digit number, replace with salted hash prefix or redacted
    if (/^\d{10}$/.test(value)) {
      return `[REDACTED_PNR_HASH:${hashPnr(value).substring(0, 8)}]`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeMeta);
  }
  if (value !== null && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.toLowerCase() === "pnr" && typeof v === "string") {
        sanitized["pnrHash"] = hashPnr(v);
        sanitized["pnrLength"] = v.length;
      } else {
        sanitized[k] = sanitizeMeta(v);
      }
    }
    return sanitized;
  }
  return value;
}

export class Logger {
  constructor(private context: string, private requestId?: string) {}

  withRequestId(requestId: string): Logger {
    return new Logger(this.context, requestId);
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...(this.requestId ? { requestId: this.requestId } : {}),
      ...(meta ? (sanitizeMeta(meta) as Record<string, unknown>) : {}),
    };

    const serialized = JSON.stringify(entry);

    if (level === "error") {
      console.error(serialized);
    } else if (level === "warn") {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.log("error", message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.log("debug", message, meta);
  }
}

export const logger = new Logger("app");
