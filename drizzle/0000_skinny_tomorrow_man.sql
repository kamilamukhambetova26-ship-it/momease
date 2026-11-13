CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer NOT NULL,
	"provider_id" integer NOT NULL,
	"slot_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"district" text DEFAULT 'esil' NOT NULL,
	"price_amount" integer DEFAULT 0 NOT NULL,
	"price_unit" text DEFAULT 'hour' NOT NULL,
	"age_from" integer DEFAULT 0 NOT NULL,
	"age_to" integer DEFAULT 12 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"provider_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'parent' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_active_slot_idx" ON "bookings" USING btree ("slot_id") WHERE status in ('pending','confirmed');--> statement-breakpoint
CREATE INDEX "bookings_parent_idx" ON "bookings" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "bookings_provider_idx" ON "bookings" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "providers_status_kind_idx" ON "providers" USING btree ("status","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "slots_unique_idx" ON "slots" USING btree ("provider_id","weekday","time");