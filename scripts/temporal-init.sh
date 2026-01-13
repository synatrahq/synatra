#!/bin/bash
# Wait for Temporal to be ready
echo "Waiting for Temporal server..."
until temporal operator namespace describe default 2>/dev/null; do
  sleep 2
done

echo "Adding custom search attributes..."

temporal operator search-attribute create \
  --name OrganizationId --type Keyword 2>/dev/null || true

temporal operator search-attribute create \
  --name AgentId --type Keyword 2>/dev/null || true

temporal operator search-attribute create \
  --name TriggerId --type Keyword 2>/dev/null || true

temporal operator search-attribute create \
  --name EnvironmentId --type Keyword 2>/dev/null || true

temporal operator search-attribute create \
  --name CaseStatus --type Keyword 2>/dev/null || true

temporal operator search-attribute create \
  --name ThreadStatus --type Keyword 2>/dev/null || true

temporal operator search-attribute create \
  --name PlaygroundStatus --type Keyword 2>/dev/null || true

echo "Search attributes configured:"
temporal operator search-attribute list

echo "Temporal initialization complete."
