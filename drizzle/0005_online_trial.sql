ALTER TABLE "providers" ADD COLUMN "online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "trial" boolean DEFAULT false NOT NULL;