#!/usr/bin/env bash
# Builds the site and replaces the live GitHub Pages site with it.
# Runs on the bash 3.2 that ships with macOS, and on Git Bash on Windows.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

fail() {
  echo "❌ $1" >&2
  exit 1
}

REMOTE_URL="$(git config --get remote.origin.url)" || fail "This repo has no origin remote."
DEPLOYER_NAME="$(git config --get user.name)" || fail "Set your name first: git config --global user.name \"Your Name\""
DEPLOYER_EMAIL="$(git config --get user.email)" || fail "Set your email first: git config --global user.email \"you@example.com\""

echo "🔍 Checking that main is clean and up to date..."
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || fail "Deploy from main. You are on $BRANCH."
[ -z "$(git status --porcelain)" ] || fail "You have uncommitted changes. Commit or stash them first."
git fetch --quiet origin main
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
[ "$LOCAL" = "$REMOTE" ] || fail "Your main doesn't match GitHub's. Run git pull, and push any commits, first."

echo "🧪 Running tests and lint..."
npm test
npm run lint

echo "🎯 Building Johann's Folly..."
npm run build

echo "📄 Copying 404.html for SPA routing on GitHub Pages..."
cp dist/index.html dist/404.html

echo "🚀 Deploying dist to the gh-pages branch on GitHub..."
SOURCE_COMMIT="$(git rev-parse --short HEAD)"
cd dist
cleanup() {
  rm -rf "$REPO_DIR/dist/.git"
}
trap cleanup EXIT
rm -rf .git
git init --quiet -b gh-pages
git config user.name "$DEPLOYER_NAME"
git config user.email "$DEPLOYER_EMAIL"
git add -A
git commit --quiet -m "Deploy Johann's Folly from main at $SOURCE_COMMIT"
git remote add origin "$REMOTE_URL"
git push -f origin gh-pages

echo "✅ Deployed main at $SOURCE_COMMIT. GitHub can take a minute or two to update the live site."
