DATABASE_URL ?= postgres://postgres:postgres@localhost:5432/synatra_dev
.PHONY: db-migrate db-seed db-migrations-generate db-migrations-push

db-migrate:
	@DATABASE_URL="$(DATABASE_URL)" pnpm --filter @synatra/core migrate

db-seed:
	@DATABASE_URL="$(DATABASE_URL)" pnpm --filter @synatra/core seed

db-migrations-generate:
	@DATABASE_URL="$(DATABASE_URL)" pnpm --filter @synatra/core migrations:generate

db-migrations-push:
	@DATABASE_URL="$(DATABASE_URL)" pnpm --filter @synatra/core migrations:push

.PHONY: compose-up compose-down compose-logs compose-clean-images compose-clean-data docker-prune
compose-up:
	@docker compose up -d

compose-down:
	@docker compose down

compose-logs:
	@docker compose logs -f

compose-clean-images:
	@docker compose down --rmi all --remove-orphans

compose-clean-data:
	@docker volume rm -f synatra_db_data synatra_demo_db_data

docker-prune:
	@docker system prune -a --volumes

.PHONY: connector-run
connector-run:
ifndef CONNECTOR_TOKEN
	$(error CONNECTOR_TOKEN is required. Create a connector in Console first.)
endif
	@GATEWAY_URL=ws://localhost:3003/connector/ws CONNECTOR_TOKEN=$(CONNECTOR_TOKEN) bun run packages/connector/src/index.ts

.PHONY: release
release:
ifndef VERSION
	$(error VERSION is required. Usage: make release VERSION=0.1.0)
endif
	@./scripts/release.sh $(VERSION)

.PHONY: typecheck test format build
typecheck:
	@pnpm turbo run typecheck

test:
	@pnpm turbo run test

build:
	@pnpm turbo run build

.PHONY: www-dev www-build www-preview
www-dev:
	@pnpm --filter @synatra/www dev

www-build:
	@pnpm --filter @synatra/www build

www-preview:
	@pnpm --filter @synatra/www preview

.PHONY: build-all
build-all:
	@pnpm turbo run build --filter=@synatra/www --filter=@synatra/console --filter=@synatra/server
	@rm -rf packages/server/static
	@mkdir -p packages/server/static
	@cp -r packages/www/dist packages/server/static/www
	@cp -r packages/console/dist packages/server/static/console

format:
	@pnpm exec prettier --write packages

.PHONY: test-resource-gateway
test-resource-gateway:
	@pnpm --filter @synatra/resource-gateway test

.PHONY: test-worker
test-worker:
	@pnpm --filter @synatra/worker test

.PHONY: test-server
test-server:
	@pnpm --filter @synatra/server test

.PHONY: test-code-executor
test-code-executor:
	@pnpm --filter @synatra/code-executor test

FLY_ENV ?= staging
FLY_ORG ?= synatra-$(FLY_ENV)

.PHONY: fly-setup fly-deploy fly-status fly-seed

fly-setup:
	@./infra/fly/scripts/setup.sh $(FLY_ENV)

fly-deploy:
	@FLY_ORG=$(FLY_ORG) ./infra/fly/scripts/deploy-all.sh $(FLY_ENV)

fly-deploy-%:
	@fly deploy --config infra/fly/$(FLY_ENV)/$*.toml

fly-logs-%:
	@fly logs -a $* -o $(FLY_ORG)

fly-status:
	@echo "=== $(FLY_ORG) ===" && \
	fly status -a synatra-staging-server -o $(FLY_ORG) && \
	fly status -a synatra-staging-worker -o $(FLY_ORG) && \
	fly status -a synatra-staging-resource-gateway -o $(FLY_ORG) && \
	fly status -a synatra-staging-code-executor -o $(FLY_ORG)

fly-secrets-%:
	@fly secrets list -a $* -o $(FLY_ORG)

fly-seed:
	@fly ssh console -a synatra-$(FLY_ENV)-server -o $(FLY_ORG) -C "node packages/core/dist/seed.js"

RENDER_ENV ?= staging

.PHONY: render-deploy render-status render-logs

render-deploy:
	@./infra/render/scripts/deploy.sh $(RENDER_ENV)

render-status:
	@./infra/render/scripts/status.sh $(RENDER_ENV)

render-logs-%:
	@render logs --service $*

TEMPORAL_ENV ?= staging

.PHONY: temporal-init temporal-plan temporal-apply

temporal-init:
	@cd infra/temporal && terraform init

temporal-plan:
	@cd infra/temporal && terraform plan -var-file=$(TEMPORAL_ENV).tfvars

temporal-apply:
	@cd infra/temporal && terraform apply -var-file=$(TEMPORAL_ENV).tfvars
