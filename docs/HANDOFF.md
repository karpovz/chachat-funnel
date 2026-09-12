# Implementation Handoff

Updated: 2026-09-11

## Delivered

The nine-screen ChaChat funnel, PostgreSQL identity and analytics, database-priced demo checkout, retries and recovery, automatic Docker migrations, acceptance tests, and evaluator README are implemented. All findings D1–D9 from the independent audit have been addressed; [REMEDIATION.md](REMEDIATION.md) maps each change to verification. [AUDIT.md](AUDIT.md) preserves the original findings against `f8f9f6f`.

- Specification-first commit: `e71599b` (`spec: define funnel architecture and invariants`), preserved.
- Verified scaffold commit: `8e49030` (`scaffold: add verified Next.js app and shared API contracts`).
- Three bounded implementation agents worked only in their assigned frontend, backend, and infrastructure paths. Primary integrated shared contracts and final fixes. The remediation remains in the working tree; no commits or other Git mutations were performed during audit/remediation.

## Environment and running app

- Work was performed in native WSL at `/home/zahar/project/chachat-funnel`.
- Node.js 22.23.2 and pnpm 10.15.0 were installed for this session under `/tmp/chachat-toolchain/node_modules/.bin`; use that PATH for this temporary toolchain. A persistent host setup should install Node.js 22 normally.
- Docker Desktop WSL integration is enabled. Docker access and Next.js build required execution outside the agent sandbox.
- The default Compose project `chachat-funnel` runs the corrected build at http://localhost:3000. App and PostgreSQL are healthy; migration service exits successfully. Existing data counts remained unchanged during update.
- The earlier isolated verification project was stopped without deleting its evidence volume (`chachat-verify-20260911_postgres_data`).
- The historical audit volume (`chachat-audit-20260911_postgres_data`) is also retained. New remediation QA/dev projects cleaned only their own temporary volumes.

## Verification

- `sh scripts/qa.sh`: passed in a disposable Compose project, including production build, frozen dependency installation, Prisma generation, both migrations on an empty database and migration replay, formatting, type generation/TypeScript, and ESLint.
- Vitest with PostgreSQL: **39/39 passed** (19 processor, 10 database invariants, eight HTTP/session tests, two Prisma config security/compatibility tests).
- `scripts/smoke.mjs`: passed against the isolated app, including concurrency, stored replay, terminal success, decline/timeout retries, normalized email reuse, first-touch acquisition, event deduplication, authoritative money, and persistence privacy.
- Mobile Chromium: **12/12 passed**, including both first-tab coordination mechanisms, stale polling, pending-plan recovery before server claim, changed email, rejected events, default selection, retired plans, and browser history.
- All five executable README SQL queries passed in read-only transactions; the Compose log privacy scan passed.
- `sh scripts/qa.sh audit`: passed with no known vulnerabilities and no advisory suppression.
- Docker development startup and source-update verification: passed on separate ports/database. The temporary route and project were removed.
- `docker compose up --build --detach --wait`: passed for the ordinary application after verification; existing database records were retained.

Exact commands are in the README. Mutation tests must run in the isolated QA project. Snapshot tests create their own temporary plans and never modify the seeded catalog. GitHub Actions contains the same QA/audit commands but has not been run remotely because these changes have not been published.

## Integration decisions

- ESLint 10 was incompatible with the bundled React plugin; scaffold verification uses pinned ESLint 9.39.4.
- Purchase responses include the reserved plan snapshot, purchase-owner email, and attempt identifiers. Per-tab pending keys and plan metadata plus ordered response handling make refresh and late polling safe.
- Once checkout starts, the plan and email ownership remain fixed. Resubmitting the same normalized email remains safe.
- Processor timeout is 1.5 seconds; a crashed processing attempt is recovered by a subsequent status/request check after 15 seconds.
- PostgreSQL email-resolution advisory locks return a text cast because Prisma cannot deserialize PostgreSQL's void return type.
- Next.js App Router and Prisma/PostgreSQL remain in place. The scoped `deepmerge-ts` override fixes the config dependency advisory; direct compatibility checks and full generation/migration/build coverage guard it.
- The development command explicitly uses the image's pnpm store and noninteractive offline installation. The QA browser shares the app's loopback network so Web Locks and cryptography work without insecure-origin flags.

## Remaining limitations

This is intentionally a simulated checkout and unverified email identity flow. No real charge, subscription entitlement, authentication, or email delivery is provided. Pending client events survive refresh in per-tab storage but may be lost if the tab closes before delivery. Production hardening and broader browser/accessibility testing are described in the README.
