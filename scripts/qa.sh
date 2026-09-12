#!/bin/sh
set -eu

# A private project means no shared app ports, database, or cleanup targets.
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
qa_workspace=$(mktemp -d "${TMPDIR:-/tmp}/chachat-qa.XXXXXX")
qa_project=$(basename "$qa_workspace" | tr '[:upper:].' '[:lower:]-')

compose() {
  docker compose --project-name "$qa_project" --file compose.qa.yaml "$@"
}

cleanup() {
  qa_status=$?
  trap - EXIT HUP INT TERM
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rmdir "$qa_workspace"
  exit "$qa_status"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

case "${1:-test}" in
  audit)
    compose build qa
    compose run --rm --no-deps qa pnpm audit --audit-level high
    ;;
  test)
    compose build app migrate qa
    compose up --detach --wait --wait-timeout 120 db
    compose run --rm --no-deps migrate
    compose run --rm --no-deps qa sh -c 'pnpm format:check && pnpm typecheck && pnpm lint && pnpm test'
    compose up --detach --wait --wait-timeout 120 app
    compose run --rm --no-deps qa node scripts/smoke.mjs
    compose run --rm --no-deps browser pnpm test:e2e
    compose run --rm --no-deps qa node scripts/check-readme-sql.mjs
    compose logs --no-color db migrate app | compose run --rm --no-deps -T qa node scripts/check-compose-logs.mjs --stdin
    printf '%s\n' 'PASS: isolated Docker QA, browser regressions, README SQL, and log privacy'
    ;;
  *)
    printf '%s\n' 'Usage: sh scripts/qa.sh [test|audit]' >&2
    exit 2
    ;;
esac
