# AI-Assisted Delivery Workflow

This file records the intended and actual collaboration model for the assignment. It is not a claim that agents independently designed the product: the primary agent owns decisions, integration, and verification.

## Working model

The project uses one primary integrator and bounded subagents. All agents share one working tree, so file ownership is used instead of parallel Git operations.

### Primary integrator

Owns:

- product, data, analytics, API, and payment decisions;
- `docs/**`, `AGENTS.md`, package manifests, lockfile, and shared contracts;
- Git operations and commits;
- cross-cutting integration;
- final migrations, README audit, tests, and clean Docker verification.

### Product/frontend agent

May edit only:

- `src/app/(funnel)/**`
- `src/components/**`
- `src/hooks/**`
- `src/content/**`
- `src/styles/**`
- purpose-built assets under `public/**`

It must not edit API routes, database code, package manifests, lockfiles, or shared contracts.

### Backend/data agent

May edit only:

- `prisma/**`
- `src/server/**`
- `src/app/api/**`
- backend-focused tests under `tests/payment/**` and `tests/server/**`

It must not edit funnel UI, package manifests, lockfiles, or shared contracts.

### Infrastructure/QA agent

May edit only:

- `Dockerfile`
- `compose.yaml`
- `.dockerignore`
- `scripts/**`
- `tests/e2e/**`

README changes are proposed to the primary integrator rather than applied concurrently.

## Delivery waves

1. Research: independent product, architecture, and evaluator passes; no code edits.
2. Specification: the primary integrator resolves conflicts and writes the specification before code.
3. Scaffold: the primary integrator creates the framework, dependencies, and shared contracts.
4. Parallel implementation: frontend, backend, and infrastructure agents work only in owned paths.
5. Integration: the primary integrator connects the surfaces and fixes cross-cutting behavior.
6. Adversarial review: agents inspect identity, analytics, payments, accessibility, and evaluator experience.
7. Verification: the primary integrator runs the clean Docker path and approves the final README.

## Agent task contract

Every implementation task includes this contract:

> Read `AGENTS.md` and `docs/SPEC.md` completely before editing. Work only in the explicitly assigned paths. Do not edit package manifests, lockfiles, common configuration, shared contracts, or Git state. If the specification or a shared contract must change, stop that part and report the proposed change to the primary integrator. Preserve unrelated changes. Run the checks relevant to your area. Report changed files, commands run, results, and unresolved risks.

## Checkpoints

- C0: specification exists in Git before application code.
- C1: scaffold starts and type-checks.
- C2: UI and API compile against frozen shared contracts.
- C3: happy path works with PostgreSQL.
- C4: failure, retry, refresh, double-click, and two-tab cases pass.
- C5: clean Docker Compose startup and documented SQL queries pass.

## Decision and activity log

- 2026-09-11: inspected the empty repository and assignment.
- 2026-09-11: used independent research passes for product direction, technical architecture, and execution planning.
- 2026-09-11: selected a nine-screen character-match funnel and a Next.js/PostgreSQL architecture.
- 2026-09-11: selected database-enforced idempotency with a single purchase per funnel session and multiple historical attempts.
- 2026-09-11: wrote the implementation specification before scaffolding application code.

This log should be updated only with work that actually occurred.


- 2026-09-11: continued in native WSL, removed only the verified partial node_modules directory, installed Node.js 22.23.2 and pnpm 10.15.0, and created pnpm-lock.yaml.
- 2026-09-11: corrected ESLint plugin compatibility to ESLint 9.39.4; scaffold typecheck, lint, and production build passed. Committed scaffold separately as 8e49030; e71599b remains intact.
- 2026-09-11: started bounded frontend, backend, and infrastructure implementation agents under the ownership rules above. Primary owns integration, manifests, README, and final verification.
- 2026-09-11: Docker Desktop WSL integration enabled by the user and daemon access verified. Added Playwright as an approved development dependency for browser acceptance coverage.
- 2026-09-11: primary approved one shared contract extension: purchase responses include `planSlug`, allowing a refreshed checkout to display the actual reserved plan. Purchase price snapshots remain immutable across retries.
- 2026-09-11: acceptance tests exposed Prisma's unsupported void advisory-lock result during email resolution; primary cast the lock result to text, then all 26 unit/PostgreSQL tests and the API smoke passed.
- 2026-09-11: extended purchase responses with the stored name, amount, currency, and billing description as well as slug. Checkout now displays the immutable snapshot after refresh even if live plan data changes.
- 2026-09-11: final default `docker compose up --build -d` created a fresh database volume, applied migrations automatically, and started healthy app/PostgreSQL services. API smoke, 26 unit/PostgreSQL tests, five README SQL queries, and Compose log privacy scan passed.
- 2026-09-11: mobile Chromium verified happy path, failure retries, and refresh during processing; landing visual reviews at 390px and 1440px found no overflow or browser errors. README and handoff record reproducible checks and remaining demo limitations.
