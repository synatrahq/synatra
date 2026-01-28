CREATE TYPE "public"."recipe_execution_status" AS ENUM('pending', 'running', 'waiting_input', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "recipe_execution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "recipe_execution_status" DEFAULT 'pending' NOT NULL,
	"current_step_id" text,
	"pending_input_config" jsonb,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"channel_id" uuid,
	"source_thread_id" uuid,
	"source_run_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_execution" ADD CONSTRAINT "recipe_execution_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_execution" ADD CONSTRAINT "recipe_execution_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_execution" ADD CONSTRAINT "recipe_execution_environment_id_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_execution" ADD CONSTRAINT "recipe_execution_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_source_thread_id_thread_id_fk" FOREIGN KEY ("source_thread_id") REFERENCES "public"."thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_source_run_id_run_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_execution_recipe_idx" ON "recipe_execution" USING btree ("recipe_id","created_at");--> statement-breakpoint
CREATE INDEX "recipe_execution_org_idx" ON "recipe_execution" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "recipe_execution_status_idx" ON "recipe_execution" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "recipe_org_idx" ON "recipe" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "recipe_org_agent_idx" ON "recipe" USING btree ("organization_id","agent_id","created_at");--> statement-breakpoint
CREATE INDEX "recipe_channel_idx" ON "recipe" USING btree ("channel_id","created_at");