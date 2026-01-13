# Synatra

An AI agent platform with human-in-the-loop approval workflows, secure code execution, and durable task orchestration.

## What is Synatra?

Synatra enables teams to build, deploy, and manage autonomous AI agents that can:

- Execute tasks using multiple LLM providers (OpenAI, Anthropic, Google)
- Call user-defined tools with configurable approval workflows
- Connect to external resources (PostgreSQL, MySQL, Stripe, GitHub, Intercom)
- Generate on-demand UI widgets (forms, tables, charts) for user interaction
- Respond to triggers (cron schedules, webhooks, app events)
- Maintain persistent conversation threads with approval gates

## Key Features

- **Human-in-the-Loop** - Configurable approval workflows before agents execute sensitive actions
- **On-Demand UI** - Agents generate forms, tables, charts, and confirmations as needed
- **Durable Execution** - Temporal-based orchestration with automatic state recovery and unlimited workflow duration
- **Secure Sandbox** - User code runs in isolated VMs with memory limits and network isolation
- **Proactive Triggers** - Cron schedules, webhooks, and app events to start agent workflows
- **Multi-Tenant** - Organizations, role-based access control, and environment separation
- **Resource Gateway** - Centralized external access with connection pooling and encrypted credentials

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 Frontend                                     │
│    console (SolidJS)  ─────────────────▶  server (Hono API Gateway)         │
└───────────────────────────────────────────────────┬─────────────────────────┘
                                                    │
┌───────────────────────────────────────────────────┼─────────────────────────┐
│                                 Backend           │                          │
│                                                   ▼                          │
│   ┌──────────┐     ┌─────────────────────────────────────────────────┐      │
│   │ postgres │     │                  Temporal                        │      │
│   │ (App DB) │     │  ┌────────┐  ┌────────────┐  ┌───────────────┐  │      │
│   └──────────┘     │  │ Server │  │ PostgreSQL │  │ Temporal UI   │  │      │
│                    │  └────────┘  └────────────┘  │ localhost:8080│  │      │
│                    └─────────────────────────────────────────────────┘      │
│                                      │                                       │
│                                      ▼                                       │
│                               ┌────────────┐                                 │
│                               │   worker   │ (Temporal Worker)               │
│                               └─────┬──────┘                                 │
│                                     │                                        │
└─────────────────────────────────────┼────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────┼────────────────────────────────────────┐
│                          Internal Networks (isolated)                        │
│                                     │                                        │
│        ┌────────────────────────────┴────────────────────────────┐          │
│        ▼                                                         ▼          │
│   ┌──────────────┐                                    ┌──────────────────┐  │
│   │code-executor │ (isolated-vm sandbox)              │ resource-gateway │  │
│   │              │ ─────────────────────────────────▶ │                  │  │
│   └──────────────┘                                    └────────┬─────────┘  │
│                                                                │            │
└────────────────────────────────────────────────────────────────┼────────────┘
                                                                 │
                                                                 ▼
                                               ┌────────────────────────────┐
                                               │    External Resources      │
                                               │  (Customer DBs, Stripe)    │
                                               └────────────────────────────┘
```

## Project Structure

```
synatra/
├── packages/
│   ├── core/              # Shared data layer, schemas, permissions (Drizzle ORM)
│   ├── server/            # REST API gateway, authentication (Hono, better-auth)
│   ├── console/           # Web UI (SolidJS, Tailwind CSS)
│   ├── worker/            # Temporal workflow execution (AI SDK for LLM calls)
│   ├── code-executor/     # Isolated VM for user code (isolated-vm)
│   ├── resource-gateway/  # External resource access (pg, mysql2, stripe)
│   └── service-call/      # Inter-service communication utilities
├── ai/                    # Architecture documentation
├── compose.yaml           # Docker Compose configuration
├── temporal.yaml          # Temporal service configuration
└── Makefile               # Development commands
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | SolidJS, Tailwind CSS v4, Vite |
| API | Hono, better-auth |
| Database | PostgreSQL 18, Drizzle ORM |
| Workflow | Temporal |
| AI/LLM | Vercel AI SDK (OpenAI, Anthropic, Google) |
| Sandbox | isolated-vm |
| Runtime | Node.js 22, pnpm 10 |

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- Docker & Docker Compose

### Setup

```bash
# Clone and install dependencies
git clone https://github.com/synatrahq/synatra.git
cd synatra
pnpm install

# Copy environment variables
cp .env.example .env

# Start all services
make compose-up

# Apply database migrations
make db-migrations-push
```

### Access

| Service | URL |
|---------|-----|
| Console (Web UI) | http://localhost:5173 |
| API Server | http://localhost:8787 |
| Temporal UI | http://localhost:8080 |

## Development Commands

```bash
# Docker Compose
make compose-up        # Start all services
make compose-down      # Stop services
make compose-logs      # Tail logs

# Database
make db-migrations-generate   # Create new migration
make db-migrations-push       # Apply pending migrations

# Code Quality
make typecheck         # TypeScript validation (all packages)
make format            # Prettier formatting
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Authentication secret |
| `BETTER_AUTH_URL` | Auth callback URL |
| `APP_ORIGINS` | CORS allowed origins |
| `SERVICE_SECRET` | Inter-service authentication (32+ chars) |
| `ENCRYPTION_KEY` | Resource credential encryption (base64, 32 bytes) |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key (optional) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI API key (optional) |

Generate encryption key: `openssl rand -base64 32`

## Core Concepts

### Agents

AI executors with versioned configurations. Each agent has:
- Working copy (draft state)
- Releases (published, immutable versions with semantic versioning)
- Model configuration (provider, temperature, system prompt)
- Assigned tools
- UI widget generation (forms, tables, charts, confirmations)

### Threads

Persistent conversation history following an email/Slack mental model:
- Status lifecycle: `active` → `waiting_approval` → `waiting_user` → `completed`
- Triggered by cron schedules, webhooks, or app events
- Stores messages, tool calls, and results

### Tools

User-defined functions that agents can call:
- Custom code executed in isolated sandboxes
- Approval policies: `auto-approve`, `owner-only`, `any-member`, `self-approval`
- Optional review requirements and timeouts
- Access to resources via `context.resources`

### Resources

External integrations with encrypted credentials:
- PostgreSQL / MySQL databases
- Stripe payment APIs
- GitHub repository APIs
- Intercom customer communication

### Triggers

Automated workflow initiation:
- Schedule triggers (cron expressions)
- Webhook triggers (HTTP endpoints)
- App event triggers (GitHub, Stripe, Intercom events)
- Template-based prompt injection

### Channels

Organized spaces for collaboration:
- Role-based membership (owner, admin, builder, member)
- Thread history
- Agent assignments

## Security

- **Network Isolation**: `executor` and `gateway` networks are internal-only
- **Sandbox Execution**: isolated-vm with memory/CPU limits, no-new-privileges
- **Encrypted Credentials**: AES encryption for sensitive fields, decrypted only in resource-gateway
- **Role-Based Access**: Permissions checked on every endpoint
- **Supply Chain**: pnpm blocks packages released less than 2 days ago

## Contributing

1. Check existing implementations before creating new functions
2. Follow patterns established in the codebase
3. Run `make typecheck` and `make format` before committing
4. Keep commits atomic and focused

See [CLAUDE.md](./CLAUDE.md) for detailed code style guidelines.
