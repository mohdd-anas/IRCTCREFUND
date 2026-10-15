CREATE TABLE "pnr_requests" (
	"request_id" text PRIMARY KEY NOT NULL,
	"pnr_hash" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pnr_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"pnr_hash" text NOT NULL,
	"canonical_json" jsonb NOT NULL,
	"provider" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_calculations" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text,
	"pnr_hash" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"rule_version" text NOT NULL,
	"provider" text NOT NULL,
	"result" jsonb NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"rule_type" text NOT NULL,
	"ticket_type" text,
	"class" text,
	"quota" text,
	"conditions" jsonb,
	"calculation" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"source" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pnr_requests_pnr_hash_idx" ON "pnr_requests" USING btree ("pnr_hash");--> statement-breakpoint
CREATE INDEX "pnr_requests_created_at_idx" ON "pnr_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pnr_snapshots_pnr_hash_idx" ON "pnr_snapshots" USING btree ("pnr_hash");--> statement-breakpoint
CREATE INDEX "pnr_snapshots_expires_at_idx" ON "pnr_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "refund_calculations_pnr_hash_idx" ON "refund_calculations" USING btree ("pnr_hash");--> statement-breakpoint
CREATE INDEX "refund_calculations_request_id_idx" ON "refund_calculations" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "refund_calculations_timestamp_idx" ON "refund_calculations" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "refund_rules_version_idx" ON "refund_rules" USING btree ("version");--> statement-breakpoint
CREATE INDEX "refund_rules_status_idx" ON "refund_rules" USING btree ("status");