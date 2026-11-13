CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"doc_type" text NOT NULL,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "segment" text DEFAULT 'care_home' NOT NULL;--> statement-breakpoint
UPDATE "providers" SET "segment" = CASE "kind" WHEN 'tutor' THEN 'school_subjects' WHEN 'club' THEN 'art' ELSE 'care_home' END;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_provider_idx" ON "documents" USING btree ("provider_id");