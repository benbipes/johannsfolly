#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_URL="$(git -C "$REPO_DIR" config --get remote.origin.url)"

echo "🎯 Building Johann's Folly..."
npm run build

echo "📄 Copying 404.html for SPA routing on GitHub Pages..."
cp dist/index.html dist/404.html

echo "🚀 Deploying dist to gh-pages branch on GitHub..."
cd dist
rm -rf .git
git init -b gh-pages
git config user.name "Benjamin Bipes"
git config user.email "ben@Bens-MacBook-Pro-13.local"
git add -A
git commit -m "Deploy Johann's Folly to GitHub Pages"
git remote add origin "$REMOTE_URL"
git push -f origin gh-pages
rm -rf .git

echo "✅ Successfully deployed to gh-pages branch!"
