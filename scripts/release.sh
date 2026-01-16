#!/bin/bash
set -e

VERSION=$1
REPO_ROOT=$(git rev-parse --show-toplevel)

red() { echo -e "\033[31m$1\033[0m"; }
green() { echo -e "\033[32m$1\033[0m"; }
yellow() { echo -e "\033[33m$1\033[0m"; }

if [ -z "$VERSION" ]; then
  red "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 0.2.0"
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  red "Error: Version must be in semver format (e.g., 0.2.0)"
  exit 1
fi

cd "$REPO_ROOT"

CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "dev" ]; then
  red "Error: Must be on dev branch. Currently on: $CURRENT_BRANCH"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  red "Error: Working directory is not clean. Commit or stash changes first."
  git status --short
  exit 1
fi

git fetch origin --tags

if git rev-parse "v$VERSION" >/dev/null 2>&1; then
  red "Error: Tag v$VERSION already exists."
  exit 1
fi

LOCAL_DEV=$(git rev-parse dev)
REMOTE_DEV=$(git rev-parse origin/dev 2>/dev/null || echo "")
if [ -n "$REMOTE_DEV" ] && [ "$LOCAL_DEV" != "$REMOTE_DEV" ]; then
  red "Error: Local dev is not in sync with origin/dev. Pull or push first."
  exit 1
fi

echo ""
yellow "=== Release v$VERSION ==="
echo ""
echo "This will:"
echo "  1. Update packages/connector/package.json to v$VERSION"
echo "  2. Commit and tag v$VERSION on dev"
echo "  3. Push dev and v$VERSION tag"
echo "  4. Merge dev into main"
echo "  5. Push main"
echo ""
read -p "Continue? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

echo ""
green "[1/5] Updating version..."
cd packages/connector && npm version "$VERSION" --no-git-tag-version && cd "$REPO_ROOT"

green "[2/5] Creating commit and tag..."
git add packages/connector/package.json
git commit -m "release: v$VERSION"
git tag "v$VERSION"

green "[3/5] Pushing dev and tag..."
git push origin dev
git push origin "v$VERSION"

green "[4/5] Merging dev into main..."
git checkout main
git pull origin main --ff-only
git merge dev --no-edit

green "[5/5] Pushing main..."
git push origin main

git checkout dev

echo ""
green "=== Release v$VERSION complete ==="
echo ""
echo "  - Tag: v$VERSION"
echo "  - Docker: ghcr.io/synatrahq/connector:$VERSION"
echo "  - Release: https://github.com/synatrahq/synatra/releases/tag/v$VERSION"
echo ""
