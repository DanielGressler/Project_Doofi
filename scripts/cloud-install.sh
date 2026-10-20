#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Project_Doofi
npm ci --cache /workspace/.cache/npm --no-audit
npm run db:migrate
npm run db:seed
npm run check
npm run lint
npm test
npm run build
