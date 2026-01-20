# Synatra

The AI workspace where you collaborate with AI agents like colleagues. Stop building internal tools. Just chat with AI that handles the work, generates the UI, and asks when it needs you.

[![Watch the demo](https://synatrahq.com/videos/demo-poster.webp)](https://synatrahq.com)

## What is Synatra?

Synatra replaces internal tools with AI agents that:

- Execute tasks using your databases, APIs, and external services (PostgreSQL, MySQL, Stripe, GitHub, Intercom)
- Generate on-demand UI (forms, tables, charts) for user interaction
- Ask for approval before executing sensitive actions
- Run proactively on schedules, webhooks, and app events
- Support multiple LLM providers (OpenAI, Anthropic, Google)

Built for teams tired of maintaining internal tools, custom dashboards, admin panels, and one-off scripts.

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

# Configure environment
cp .env.example .env
# Edit .env and add your LLM API keys

# Start all services
make compose-up

# Apply database migrations
make db-migrate

# Seed development data (optional)
make db-seed
```

### Access

| Service | URL |
|---------|-----|
| Console | http://localhost:5173 |
| API Server | http://localhost:8787 |
| Temporal UI | http://localhost:8080 |

## Environment Variables

Copy `.env.example` to `.env` and configure:

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - Auth secret (generate: `openssl rand -base64 32`)
- `ENCRYPTION_KEY` - Credential encryption key (generate: `openssl rand -base64 32`)
- `SERVICE_SECRET` - Inter-service auth token (generate: `openssl rand -base64 32`)

See `.env.example` for all configuration options.

## Documentation

Learn more about building with Synatra:

- [Documentation](https://synatrahq.com/docs) - Full guides and API reference
- [Agents](https://synatrahq.com/docs/concepts/agents) - Configure AI executors
- [Tools](https://synatrahq.com/docs/concepts/tools) - Define custom functions
- [Resources](https://synatrahq.com/docs/concepts/resources) - Connect external services
- [Triggers](https://synatrahq.com/docs/concepts/triggers) - Automate workflows

## Security

- Isolated VM sandbox for code execution (memory/CPU limits)
- Network-isolated internal services (executor, gateway)
- AES-encrypted credentials (decrypted only in resource-gateway)
- Role-based access control on all endpoints

## Community

- [GitHub Discussions](https://github.com/synatrahq/synatra/discussions) - Questions, ideas, and feedback
- [Report a bug](https://github.com/synatrahq/synatra/issues)

## Contributing

1. Follow existing patterns in the codebase
2. Run `make typecheck` and `make test` before committing
3. Keep commits atomic and focused

See [AGENTS.md](./AGENTS.md) for code style guidelines.
