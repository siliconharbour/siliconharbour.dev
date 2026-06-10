---
id: s-c09b
status: open
deps: []
links: []
created: 2026-06-10T19:10:01Z
type: chore
priority: 3
assignee: Jack Arthur Harrhy
tags: [deps]
---
# Bump sharp 0.34.5 -> 0.35.0 (with package.json types patch)

## What

Ran 'pnpm dlx npm-check-updates' to refresh deps. Only one update available: sharp 0.34.5 -> 0.35.0.

## Sharp 0.35 breaking changes audit

- Requires Node.js >= 20.9.0 — fine, we're on 25.4.0.
- Removed 'install' script — fine, we use prebuilt binaries.
- Removed deprecated failOnError, paletteBitDepth, jp2k, sharpen properties — grep confirmed none in our codebase.
- Lossy AVIF tuning changed — we only output WebP.
- limitInputChannels: 5 default — fine, our images are RGB/RGBA.

## Sharp 0.35 packaging bug

Sharp 0.35.0 adds an ESM build but the exports map is missing a 'types' condition:

  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  }

With moduleResolution: 'bundler', TS resolves the runtime through the exports map but can't find types because there's no co-located .d.mts and no 'types' condition. This produced 3 new TS warnings (one per sharp import site) — harmless at runtime but raises the tsc baseline from 130 to 133.

## Fix

Applied a pnpm patch (patches/sharp.patch) adding the missing 'types' condition:

  "exports": {
    ".": {
      "types": "./lib/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  }

Persists via pnpm-workspace.yaml patchedDependencies. Drop the patch once sharp 0.35.1+ ships the fix upstream.

## Verification

- pnpm run build, lint:fix, test --run all pass.
- tsc --noEmit baseline restored to 130 errors (same as before bump).
- Re-ran generateCoverFromIcon against the SmartICE icon — output is identical to pre-upgrade.

