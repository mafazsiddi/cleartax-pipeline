ALTER TABLE "issues" ADD COLUMN "assignor_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "property" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "attachment_link" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issues" ADD CONSTRAINT "issues_assignor_id_users_id_fk" FOREIGN KEY ("assignor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
