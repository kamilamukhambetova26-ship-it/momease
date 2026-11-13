CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"params" text DEFAULT '{}' NOT NULL,
	"link" text DEFAULT '/dashboard' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" integer NOT NULL,
	"target_type" text NOT NULL,
	"target_id" integer NOT NULL,
	"target_user_id" integer NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"handled_by" integer,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "bookings_active_slot_idx";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "date" text;--> statement-breakpoint
-- старые записи были привязаны только к дню недели: ставим ближайшую дату этого дня недели начиная с даты создания (время Астаны, UTC+5)
UPDATE "bookings" b SET "date" = to_char((b.created_at AT TIME ZONE 'UTC' + interval '5 hours')::date + ((s.weekday - (extract(isodow from (b.created_at AT TIME ZONE 'UTC' + interval '5 hours'))::int - 1) + 7) % 7), 'YYYY-MM-DD') FROM "slots" s WHERE s.id = b.slot_id;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_booking_idx" ON "messages" USING btree ("booking_id","id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_open_unique_idx" ON "reports" USING btree ("reporter_id","target_type","target_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_active_slot_date_idx" ON "bookings" USING btree ("slot_id","date") WHERE status in ('pending','confirmed');