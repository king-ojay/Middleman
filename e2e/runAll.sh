#!/bin/sh
# Runs the end-to-end flow on every project in playwright.config.js, one at a
# time, each against a fresh API and database (the flow registers fixed
# phone numbers), then merges the results into one HTML report in
# playwright-report/. Each project's screenshots and API log are kept in
# .logs/<project>/. Exits non-zero if any project failed.
#   E2E_MONGO_URI='mongodb://127.0.0.1:27099/middleman_e2e?directConnection=true' npm test
set -u
cd "$(dirname "$0")"
rm -rf blob-report playwright-report
status=0
for project in desktop-chromium desktop-firefox desktop-webkit pixel-7 iphone-14; do
  echo "== $project"
  E2E_PROJECT=$project npx playwright test --project="$project" || status=1
  mkdir -p ".logs/$project" && cp .logs/*.png .logs/api.log ".logs/$project/" 2>/dev/null
done
npx playwright merge-reports --reporter html ./blob-report > /dev/null
npx playwright merge-reports --reporter json ./blob-report > .logs/results.json
echo "HTML report: e2e/playwright-report/index.html; summary: e2e/.logs/results.json"
exit $status
