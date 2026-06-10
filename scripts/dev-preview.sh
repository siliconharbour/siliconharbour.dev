#!/usr/bin/env bash
set -euo pipefail

pnpm run db:migrate
exec pnpm --config.verify-deps-before-run=false run dev
