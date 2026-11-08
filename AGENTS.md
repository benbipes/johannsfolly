# Johann's Folly

A multiplayer darts scoring game for phones, built with React, Vite and Capacitor (iOS). The web version runs on GitHub Pages.

## Commands

- `npm ci`: install dependencies. Needs Node 22.12 or newer.
- `npm run dev`: run the app locally.
- `npm test`: run the tests with Vitest.
- `npm run lint`: run oxlint.
- `npm run build`: build the site into `dist/`.

## Working in this repo

- Commit straight to `main`, and run `git pull` before starting.
- Run `npm test` and `npm run lint` before pushing. GitHub also runs them, plus the build, on every push to `main` and on pull requests.
- Put tests next to the code they cover, as `src/<name>.test.js`.
- This repo is public. Keep details of unfixed security problems out of commits, pull requests, issues and docs.

## Deploying

There is no automatic deploy. `npm run deploy` builds the site and force-pushes it to `gh-pages`, replacing the live site.

- The script stops unless you're on `main` with no uncommitted changes and match GitHub's `main`. It then runs the tests and lint before building, and commits as you, using your git name and email.
- Check that nobody else is deploying at the same time.
- On Windows, `bash` can point to WSL, so use Git Bash:
  `& "C:\Program Files\Git\bin\bash.exe" scripts/deploy-gh-pages.sh`
- GitHub Pages treats file names as case-sensitive, but Windows and macOS don't. Paths in code must match the tracked file name exactly.
- After deploying, check the live site. GitHub can take a minute or two to update it.
- The iOS app bundles its own copy of the site, so a Pages deploy doesn't update it.

## How the game syncs

- Each phone holds its own copy of the game and shares it with the others. `mergeGameState` in `src/gameLogic.js` combines the copies.
- Players score at the same time, so changes to turn or round logic must handle turns arriving together, in either order. Cover that with tests.
- `src/networkSync.js` handles the connection between phones, and `src/useGameSync.js` connects it to React.
