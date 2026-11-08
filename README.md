# Johann's Folly

A darts scoring game for WFFFL. Each player scores on their own phone, and the phones keep the game in sync.

Play it at https://benbipes.github.io/johannsfolly/. You need the group code to get in.

## Working on it

You need Node 22.12 or newer.

```
npm ci
npm run dev
```

Before pushing, run `npm test` and `npm run lint`. GitHub runs them too.

See [AGENTS.md](AGENTS.md) for how the repo works, how the game syncs, and how to deploy.
