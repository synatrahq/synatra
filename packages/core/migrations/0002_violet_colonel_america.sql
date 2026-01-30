CREATE TYPE "public"."recipe_step_type" AS ENUM('tool');--> statement-breakpoint
CREATE TABLE "recipe_edge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"working_copy_recipe_id" uuid,
	"release_id" uuid,
	"from_step_key" text NOT NULL,
	"to_step_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_edge_parent_check" CHECK ((working_copy_recipe_id IS NOT NULL AND release_id IS NULL) OR (working_copy_recipe_id IS NULL AND release_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "recipe_execution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_step_key" text,
	"pending_input_config" jsonb,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_release" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"version" text NOT NULL,
	"version_major" integer NOT NULL,
	"version_minor" integer NOT NULL,
	"version_patch" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"agent_release_id" uuid,
	"agent_version_mode" "version_mode" DEFAULT 'current' NOT NULL,
	"inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config_hash" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"working_copy_recipe_id" uuid,
	"release_id" uuid,
	"step_key" text NOT NULL,
	"label" text NOT NULL,
	"type" "recipe_step_type" DEFAULT 'tool' NOT NULL,
	"config" jsonb NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_step_parent_check" CHECK ((working_copy_recipe_id IS NOT NULL AND release_id IS NULL) OR (working_copy_recipe_id IS NULL AND release_id IS NOT NULL))
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
	"slug" text NOT NULL,
	"description" text,
	"current_release_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_working_copy" (
	"recipe_id" uuid PRIMARY KEY NOT NULL,
	"agent_release_id" uuid,
	"agent_version_mode" "version_mode" DEFAULT 'current' NOT NULL,
	"inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config_hash" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_edge" ADD CONSTRAINT "recipe_edge_working_copy_recipe_id_recipe_working_copy_recipe_id_fk" FOREIGN KEY ("working_copy_recipe_id") REFERENCES "public"."recipe_working_copy"("recipe_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_edge" ADD CONSTRAINT "recipe_edge_release_id_recipe_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."recipe_release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_execution" ADD CONSTRAINT "recipe_execution_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_execution" ADD CONSTRAINT "recipe_execution_release_id_recipe_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."recipe_release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_execution" ADD CONSTRAINT "recipe_execution_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_execution" ADD CONSTRAINT "recipe_execution_environment_id_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_execution" ADD CONSTRAINT "recipe_execution_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_release" ADD CONSTRAINT "recipe_release_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_release" ADD CONSTRAINT "recipe_release_agent_release_id_agent_release_id_fk" FOREIGN KEY ("agent_release_id") REFERENCES "public"."agent_release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_release" ADD CONSTRAINT "recipe_release_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_step" ADD CONSTRAINT "recipe_step_working_copy_recipe_id_recipe_working_copy_recipe_id_fk" FOREIGN KEY ("working_copy_recipe_id") REFERENCES "public"."recipe_working_copy"("recipe_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_step" ADD CONSTRAINT "recipe_step_release_id_recipe_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."recipe_release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_source_thread_id_thread_id_fk" FOREIGN KEY ("source_thread_id") REFERENCES "public"."thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_source_run_id_run_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_working_copy" ADD CONSTRAINT "recipe_working_copy_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_working_copy" ADD CONSTRAINT "recipe_working_copy_agent_release_id_agent_release_id_fk" FOREIGN KEY ("agent_release_id") REFERENCES "public"."agent_release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_working_copy" ADD CONSTRAINT "recipe_working_copy_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_edge_working_copy_idx" ON "recipe_edge" USING btree ("working_copy_recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_edge_release_idx" ON "recipe_edge" USING btree ("release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_edge_working_copy_unique_idx" ON "recipe_edge" USING btree ("working_copy_recipe_id","from_step_key","to_step_key") WHERE working_copy_recipe_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_edge_release_unique_idx" ON "recipe_edge" USING btree ("release_id","from_step_key","to_step_key") WHERE release_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "recipe_execution_recipe_idx" ON "recipe_execution" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_execution_org_idx" ON "recipe_execution" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_release_unique_idx" ON "recipe_release" USING btree ("recipe_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_release_semver_idx" ON "recipe_release" USING btree ("recipe_id","version_major","version_minor","version_patch");--> statement-breakpoint
CREATE INDEX "recipe_release_recipe_idx" ON "recipe_release" USING btree ("recipe_id","created_at");--> statement-breakpoint
CREATE INDEX "recipe_step_working_copy_idx" ON "recipe_step" USING btree ("working_copy_recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipe_step_release_idx" ON "recipe_step" USING btree ("release_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_step_working_copy_key_idx" ON "recipe_step" USING btree ("working_copy_recipe_id","step_key") WHERE working_copy_recipe_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_step_release_key_idx" ON "recipe_step" USING btree ("release_id","step_key") WHERE release_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_org_slug_idx" ON "recipe" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "recipe_org_agent_idx" ON "recipe" USING btree ("organization_id","agent_id","created_at");--> statement-breakpoint
CREATE INDEX "recipe_current_release_idx" ON "recipe" USING btree ("current_release_id");