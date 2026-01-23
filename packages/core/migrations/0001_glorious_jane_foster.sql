CREATE TYPE "public"."schedule_mode" AS ENUM('interval', 'cron');--> statement-breakpoint
ALTER TABLE "trigger_release" ADD COLUMN "schedule_mode" "schedule_mode" DEFAULT 'interval' NOT NULL;--> statement-breakpoint
ALTER TABLE "trigger_working_copy" ADD COLUMN "schedule_mode" "schedule_mode" DEFAULT 'interval' NOT NULL;