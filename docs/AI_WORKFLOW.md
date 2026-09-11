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

