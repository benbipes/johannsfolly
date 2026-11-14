import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function git(command) {
  try {
    return execSync(`git ${command}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

// The release number is the count of commits on main, so every deploy gets a higher one.
// Deploys only run from a clean main that matches GitHub, so every phone agrees on it.
const release = {
  version: Number(git('rev-list --count HEAD')) || 0,
  commit: git('rev-parse --short HEAD') || 'dev',
  released: new Date().toISOString(),
};

// The live site, which the iOS app checks for a newer release than the one it bundles.
const LIVE_SITE_URL = 'https://benbipes.github.io/johannsfolly/';

// Publishes version.json next to the site, so running copies can see a newer release.
function releaseFile() {
  return {
    name: 'release-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(release) });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), releaseFile()],
  define: {
    __APP_RELEASE__: JSON.stringify(release),
    __LIVE_SITE_URL__: JSON.stringify(LIVE_SITE_URL),
  },
});
