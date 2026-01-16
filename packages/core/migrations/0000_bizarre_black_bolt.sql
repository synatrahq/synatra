CREATE TYPE "public"."copilot_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."copilot_proposal_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."copilot_question_request_status" AS ENUM('pending', 'answered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."copilot_resource_request_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."copilot_tool_status" AS ENUM('started', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."copilot_trigger_request_action" AS ENUM('create', 'update');--> statement-breakpoint
CREATE TYPE "public"."copilot_trigger_request_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."app_id" AS ENUM('intercom', 'github');--> statement-breakpoint
CREATE TYPE "public"."channel_member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."connector_status" AS ENUM('online', 'offline', 'error');--> statement-breakpoint
CREATE TYPE "public"."human_request_authority" AS ENUM('any_member', 'owner_only');--> statement-breakpoint
CREATE TYPE "public"."human_request_fallback" AS ENUM('skip', 'default', 'fail');--> statement-breakpoint
CREATE TYPE "public"."human_request_kind" AS ENUM('form', 'select_rows', 'confirm', 'approval', 'question');--> statement-breakpoint
CREATE TYPE "public"."human_request_status" AS ENUM('pending', 'responded', 'cancelled', 'skipped', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."human_response_status" AS ENUM('responded', 'cancelled', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'rejected', 'canceled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'builder', 'member');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('user', 'assistant', 'tool_call', 'tool_result', 'system', 'error');--> statement-breakpoint
CREATE TYPE "public"."output_kind" AS ENUM('table', 'chart', 'markdown', 'key_value');--> statement-breakpoint
CREATE TYPE "public"."prompt_mode" AS ENUM('template', 'script');--> statement-breakpoint
CREATE TYPE "public"."connection_mode" AS ENUM('direct', 'connector');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('postgres', 'mysql', 'stripe', 'github', 'intercom', 'restapi', 'synatra_ai');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'waiting_human', 'waiting_subagent', 'completed', 'failed', 'cancelled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."thread_kind" AS ENUM('thread', 'playground');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('running', 'waiting_human', 'completed', 'failed', 'cancelled', 'rejected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."trigger_mode" AS ENUM('prompt', 'template', 'script');--> statement-breakpoint
CREATE TYPE "public"."trigger_type" AS ENUM('webhook', 'schedule', 'app');--> statement-breakpoint
CREATE TYPE "public"."version_mode" AS ENUM('current', 'fixed');--> statement-breakpoint
CREATE TABLE "agent_copilot_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "copilot_message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_copilot_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"status" "copilot_proposal_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_copilot_question_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"tool_call_id" text NOT NULL,
	"questions" jsonb NOT NULL,
	"answers" jsonb,
	"status" "copilot_question_request_status" DEFAULT 'pending' NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_copilot_resource_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"explanation" text NOT NULL,
	"suggestions" jsonb NOT NULL,
	"status" "copilot_resource_request_status" DEFAULT 'pending' NOT NULL,
	"resource_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_copilot_thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'New Conversation' NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL,
	"in_flight_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_copilot_tool_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid,
	"tool_name" text NOT NULL,
	"tool_call_id" text,
	"status" "copilot_tool_status" NOT NULL,
	"latency_ms" integer,
	"error" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_copilot_trigger_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"action" "copilot_trigger_request_action" NOT NULL,
	"trigger_id" uuid,
	"explanation" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" "copilot_trigger_request_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"icon" text NOT NULL,
	"icon_color" text NOT NULL,
	"prompt" text NOT NULL,
	"suggested_resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"demo_scenarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_template_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "agent_release" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" text NOT NULL,
	"version_major" integer NOT NULL,
	"version_minor" integer NOT NULL,
	"version_patch" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"runtime_config" jsonb NOT NULL,
	"config_hash" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"template_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'CircleDashed' NOT NULL,
	"icon_color" text DEFAULT 'blue' NOT NULL,
	"current_release_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_working_copy" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"runtime_config" jsonb NOT NULL,
	"config_hash" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"app_id" "app_id" NOT NULL,
	"name" text NOT NULL,
	"credentials" jsonb NOT NULL,
	"metadata" jsonb,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" "channel_member_role" DEFAULT 'member' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'Hash' NOT NULL,
	"icon_color" text DEFAULT 'gray' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "connector_status" DEFAULT 'offline' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"metadata" jsonb,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text,
	"protected" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"run_id" uuid,
	"tool_call_id" text,
	"kind" "human_request_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"authority" "human_request_authority" DEFAULT 'any_member',
	"timeout_ms" integer,
	"fallback" "human_request_fallback",
	"expires_at" timestamp with time zone,
	"status" "human_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_response" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"status" "human_response_status" NOT NULL,
	"responded_by" uuid,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"inviter_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"run_id" uuid,
	"type" "message_type" NOT NULL,
	"content" text,
	"tool_call" jsonb,
	"tool_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "output_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"run_id" uuid,
	"tool_call_id" text,
	"kind" "output_kind" NOT NULL,
	"name" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_release" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"version" text NOT NULL,
	"version_major" integer NOT NULL,
	"version_minor" integer NOT NULL,
	"version_patch" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"mode" "prompt_mode" DEFAULT 'template' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"script" text DEFAULT '' NOT NULL,
	"input_schema" jsonb,
	"content_hash" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
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
CREATE TABLE "prompt_working_copy" (
	"prompt_id" uuid PRIMARY KEY NOT NULL,
	"mode" "prompt_mode" DEFAULT 'template' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"script" text DEFAULT '' NOT NULL,
	"input_schema" jsonb,
	"content_hash" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"connection_mode" "connection_mode" DEFAULT 'direct' NOT NULL,
	"connector_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"type" "resource_type" NOT NULL,
	"managed" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"parent_run_id" uuid,
	"depth" integer DEFAULT 0 NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_release_id" uuid,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"duration_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"organization_id" uuid,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"run_limit" integer NOT NULL,
	"overage_rate" numeric(10, 4),
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"stripe_schedule_id" text,
	"scheduled_plan" text,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "thread_kind" DEFAULT 'thread' NOT NULL,
	"environment_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_release_id" uuid,
	"channel_id" uuid,
	"trigger_id" uuid,
	"trigger_release_id" uuid,
	"is_debug" boolean DEFAULT false NOT NULL,
	"agent_config_hash" text NOT NULL,
	"workflow_id" text NOT NULL,
	"subject" text NOT NULL,
	"status" "thread_status" DEFAULT 'running' NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"skip_reason" text,
	"seq" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"user_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_environment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"webhook_secret" text,
	"debug_secret" text,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_release" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_id" uuid NOT NULL,
	"version" text NOT NULL,
	"version_major" integer NOT NULL,
	"version_minor" integer NOT NULL,
	"version_patch" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"agent_release_id" uuid,
	"agent_version_mode" "version_mode" DEFAULT 'current' NOT NULL,
	"prompt_id" uuid,
	"prompt_release_id" uuid,
	"prompt_version_mode" "version_mode" DEFAULT 'current' NOT NULL,
	"mode" "trigger_mode" DEFAULT 'template' NOT NULL,
	"template" text DEFAULT '' NOT NULL,
	"script" text DEFAULT '' NOT NULL,
	"payload_schema" jsonb,
	"type" "trigger_type" NOT NULL,
	"cron" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"input" jsonb,
	"app_account_id" uuid,
	"app_events" text[],
	"config_hash" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"current_release_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_working_copy" (
	"trigger_id" uuid PRIMARY KEY NOT NULL,
	"agent_release_id" uuid,
	"agent_version_mode" "version_mode" DEFAULT 'current' NOT NULL,
	"prompt_id" uuid,
	"prompt_release_id" uuid,
	"prompt_version_mode" "version_mode" DEFAULT 'current' NOT NULL,
	"mode" "trigger_mode" DEFAULT 'template' NOT NULL,
	"template" text DEFAULT '' NOT NULL,
	"script" text DEFAULT '' NOT NULL,
	"payload_schema" jsonb,
	"type" "trigger_type" DEFAULT 'webhook' NOT NULL,
	"cron" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"input" jsonb,
	"app_account_id" uuid,
	"app_events" text[],
	"config_hash" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"run_limit" integer,
	"runs_user" integer DEFAULT 0 NOT NULL,
	"runs_trigger" integer DEFAULT 0 NOT NULL,
	"runs_subagent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_copilot_message" ADD CONSTRAINT "agent_copilot_message_thread_id_agent_copilot_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_copilot_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_proposal" ADD CONSTRAINT "agent_copilot_proposal_thread_id_agent_copilot_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_copilot_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_proposal" ADD CONSTRAINT "agent_copilot_proposal_message_id_agent_copilot_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_copilot_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_question_request" ADD CONSTRAINT "agent_copilot_question_request_thread_id_agent_copilot_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_copilot_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_question_request" ADD CONSTRAINT "agent_copilot_question_request_message_id_agent_copilot_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_copilot_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_resource_request" ADD CONSTRAINT "agent_copilot_resource_request_thread_id_agent_copilot_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_copilot_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_resource_request" ADD CONSTRAINT "agent_copilot_resource_request_message_id_agent_copilot_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_copilot_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_resource_request" ADD CONSTRAINT "agent_copilot_resource_request_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_thread" ADD CONSTRAINT "agent_copilot_thread_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_thread" ADD CONSTRAINT "agent_copilot_thread_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_thread" ADD CONSTRAINT "agent_copilot_thread_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_tool_log" ADD CONSTRAINT "agent_copilot_tool_log_thread_id_agent_copilot_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_copilot_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_tool_log" ADD CONSTRAINT "agent_copilot_tool_log_message_id_agent_copilot_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_copilot_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_trigger_request" ADD CONSTRAINT "agent_copilot_trigger_request_thread_id_agent_copilot_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_copilot_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_trigger_request" ADD CONSTRAINT "agent_copilot_trigger_request_message_id_agent_copilot_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_copilot_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_copilot_trigger_request" ADD CONSTRAINT "agent_copilot_trigger_request_trigger_id_trigger_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."trigger"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_release" ADD CONSTRAINT "agent_release_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_release" ADD CONSTRAINT "agent_release_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_template_id_agent_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."agent_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_working_copy" ADD CONSTRAINT "agent_working_copy_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_working_copy" ADD CONSTRAINT "agent_working_copy_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_account" ADD CONSTRAINT "app_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_account" ADD CONSTRAINT "app_account_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_account" ADD CONSTRAINT "app_account_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_agent" ADD CONSTRAINT "channel_agent_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_agent" ADD CONSTRAINT "channel_agent_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_agent" ADD CONSTRAINT "channel_agent_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_member" ADD CONSTRAINT "channel_member_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_member" ADD CONSTRAINT "channel_member_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_member" ADD CONSTRAINT "channel_member_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector" ADD CONSTRAINT "connector_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector" ADD CONSTRAINT "connector_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector" ADD CONSTRAINT "connector_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_request" ADD CONSTRAINT "human_request_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_request" ADD CONSTRAINT "human_request_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_response" ADD CONSTRAINT "human_response_request_id_human_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."human_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_response" ADD CONSTRAINT "human_response_responded_by_user_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "output_item" ADD CONSTRAINT "output_item_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "output_item" ADD CONSTRAINT "output_item_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_release" ADD CONSTRAINT "prompt_release_prompt_id_prompt_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_release" ADD CONSTRAINT "prompt_release_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt" ADD CONSTRAINT "prompt_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt" ADD CONSTRAINT "prompt_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt" ADD CONSTRAINT "prompt_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt" ADD CONSTRAINT "prompt_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_working_copy" ADD CONSTRAINT "prompt_working_copy_prompt_id_prompt_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_working_copy" ADD CONSTRAINT "prompt_working_copy_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_config" ADD CONSTRAINT "resource_config_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_config" ADD CONSTRAINT "resource_config_environment_id_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_config" ADD CONSTRAINT "resource_config_connector_id_connector_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_config" ADD CONSTRAINT "resource_config_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_config" ADD CONSTRAINT "resource_config_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_parent_run_id_run_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_agent_release_id_agent_release_id_fk" FOREIGN KEY ("agent_release_id") REFERENCES "public"."agent_release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_event" ADD CONSTRAINT "stripe_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_environment_id_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_agent_release_id_agent_release_id_fk" FOREIGN KEY ("agent_release_id") REFERENCES "public"."agent_release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_trigger_id_trigger_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."trigger"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_trigger_release_id_trigger_release_id_fk" FOREIGN KEY ("trigger_release_id") REFERENCES "public"."trigger_release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_environment" ADD CONSTRAINT "trigger_environment_trigger_id_trigger_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."trigger"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_environment" ADD CONSTRAINT "trigger_environment_environment_id_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_environment" ADD CONSTRAINT "trigger_environment_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_release" ADD CONSTRAINT "trigger_release_trigger_id_trigger_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."trigger"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_release" ADD CONSTRAINT "trigger_release_agent_release_id_agent_release_id_fk" FOREIGN KEY ("agent_release_id") REFERENCES "public"."agent_release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_release" ADD CONSTRAINT "trigger_release_prompt_id_prompt_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompt"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_release" ADD CONSTRAINT "trigger_release_prompt_release_id_prompt_release_id_fk" FOREIGN KEY ("prompt_release_id") REFERENCES "public"."prompt_release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_release" ADD CONSTRAINT "trigger_release_app_account_id_app_account_id_fk" FOREIGN KEY ("app_account_id") REFERENCES "public"."app_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_release" ADD CONSTRAINT "trigger_release_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger" ADD CONSTRAINT "trigger_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger" ADD CONSTRAINT "trigger_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger" ADD CONSTRAINT "trigger_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger" ADD CONSTRAINT "trigger_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_working_copy" ADD CONSTRAINT "trigger_working_copy_trigger_id_trigger_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."trigger"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_working_copy" ADD CONSTRAINT "trigger_working_copy_agent_release_id_agent_release_id_fk" FOREIGN KEY ("agent_release_id") REFERENCES "public"."agent_release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_working_copy" ADD CONSTRAINT "trigger_working_copy_prompt_id_prompt_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompt"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_working_copy" ADD CONSTRAINT "trigger_working_copy_prompt_release_id_prompt_release_id_fk" FOREIGN KEY ("prompt_release_id") REFERENCES "public"."prompt_release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_working_copy" ADD CONSTRAINT "trigger_working_copy_app_account_id_app_account_id_fk" FOREIGN KEY ("app_account_id") REFERENCES "public"."app_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_working_copy" ADD CONSTRAINT "trigger_working_copy_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_period" ADD CONSTRAINT "usage_period_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_copilot_message_thread_idx" ON "agent_copilot_message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_copilot_proposal_thread_idx" ON "agent_copilot_proposal" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_copilot_question_request_thread_idx" ON "agent_copilot_question_request" USING btree ("thread_id","status","created_at");--> statement-breakpoint
CREATE INDEX "agent_copilot_resource_request_thread_idx" ON "agent_copilot_resource_request" USING btree ("thread_id","status","created_at");--> statement-breakpoint
CREATE INDEX "agent_copilot_thread_agent_user_idx" ON "agent_copilot_thread" USING btree ("agent_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_copilot_thread_org_agent_idx" ON "agent_copilot_thread" USING btree ("organization_id","agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_copilot_tool_log_thread_idx" ON "agent_copilot_tool_log" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_copilot_trigger_request_thread_idx" ON "agent_copilot_trigger_request" USING btree ("thread_id","status","created_at");--> statement-breakpoint
CREATE INDEX "agent_template_display_order_idx" ON "agent_template" USING btree ("display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_release_unique_idx" ON "agent_release" USING btree ("agent_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_release_semver_idx" ON "agent_release" USING btree ("agent_id","version_major","version_minor","version_patch");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_org_slug_idx" ON "agent" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "agent_template_idx" ON "agent" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_account_org_name_idx" ON "app_account" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_agent_unique" ON "channel_agent" USING btree ("channel_id","agent_id");--> statement-breakpoint
CREATE INDEX "channel_agent_agent_idx" ON "channel_agent" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_member_unique" ON "channel_member" USING btree ("channel_id","member_id");--> statement-breakpoint
CREATE INDEX "channel_member_member_idx" ON "channel_member" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_org_slug_idx" ON "channel" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "channel_org_idx" ON "channel" USING btree ("organization_id","archived","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_org_name_idx" ON "connector" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_org_slug_idx" ON "environment" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "human_request_thread_status_idx" ON "human_request" USING btree ("thread_id","status","created_at");--> statement-breakpoint
CREATE INDEX "human_request_run_status_idx" ON "human_request" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "human_request_tool_call_idx" ON "human_request" USING btree ("tool_call_id");--> statement-breakpoint
CREATE INDEX "human_request_status_idx" ON "human_request" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "human_request_pending_thread_idx" ON "human_request" USING btree ("thread_id") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "human_response_request_idx" ON "human_response" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_email_org_pending_unique" ON "invitation" USING btree ("email","organization_id") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "member_user_org_unique" ON "member" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "message_thread_idx" ON "message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "message_run_idx" ON "message" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_unique" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "output_item_thread_idx" ON "output_item" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "output_item_run_idx" ON "output_item" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "output_item_tool_call_idx" ON "output_item" USING btree ("tool_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_release_unique_idx" ON "prompt_release" USING btree ("prompt_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_release_semver_idx" ON "prompt_release" USING btree ("prompt_id","version_major","version_minor","version_patch");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_org_slug_idx" ON "prompt" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_config_resource_env_idx" ON "resource_config" USING btree ("resource_id","environment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_org_slug_idx" ON "resource" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "resource_org_type_managed_idx" ON "resource" USING btree ("organization_id","type","managed");--> statement-breakpoint
CREATE INDEX "run_thread_idx" ON "run" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "run_parent_idx" ON "run" USING btree ("parent_run_id");--> statement-breakpoint
CREATE INDEX "run_thread_depth_idx" ON "run" USING btree ("thread_id","depth","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_idx" ON "session" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_identifier_value_idx" ON "verification" USING btree ("identifier","value");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_event_id_idx" ON "stripe_event" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_org_idx" ON "subscription" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "thread_org_agent_idx" ON "thread" USING btree ("organization_id","agent_id","created_at");--> statement-breakpoint
CREATE INDEX "thread_org_agent_release_idx" ON "thread" USING btree ("organization_id","agent_release_id","created_at");--> statement-breakpoint
CREATE INDEX "thread_org_trigger_idx" ON "thread" USING btree ("organization_id","trigger_id","created_at");--> statement-breakpoint
CREATE INDEX "thread_trigger_release_idx" ON "thread" USING btree ("trigger_release_id","created_at");--> statement-breakpoint
CREATE INDEX "thread_org_env_idx" ON "thread" USING btree ("organization_id","environment_id","created_at");--> statement-breakpoint
CREATE INDEX "thread_org_status_idx" ON "thread" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "thread_channel_idx" ON "thread" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "thread_channel_status_idx" ON "thread" USING btree ("channel_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "thread_channel_archived_idx" ON "thread" USING btree ("channel_id","archived","updated_at");--> statement-breakpoint
CREATE INDEX "thread_kind_user_idx" ON "thread" USING btree ("kind","created_by","created_at");--> statement-breakpoint
CREATE INDEX "thread_playground_idx" ON "thread" USING btree ("kind","agent_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trigger_environment_idx" ON "trigger_environment" USING btree ("trigger_id","environment_id");--> statement-breakpoint
CREATE INDEX "trigger_environment_channel_idx" ON "trigger_environment" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "trigger_environment_active_idx" ON "trigger_environment" USING btree ("environment_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "trigger_release_unique_idx" ON "trigger_release" USING btree ("trigger_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "trigger_release_semver_idx" ON "trigger_release" USING btree ("trigger_id","version_major","version_minor","version_patch");--> statement-breakpoint
CREATE UNIQUE INDEX "trigger_org_slug_idx" ON "trigger" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "trigger_current_release_idx" ON "trigger" USING btree ("current_release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_period_org_period_idx" ON "usage_period" USING btree ("organization_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_idx" ON "user" USING btree ("email");