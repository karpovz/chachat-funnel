# Repository Instructions for AI Agents

## Mission

Build the ChaChat assessment funnel described in `docs/SPEC.md`. Correct identity, analytics, payment state, and Docker behavior have priority over visual polish.

## Read before editing

1. Read `docs/SPEC.md` completely.
2. Read `docs/AI_WORKFLOW.md` and respect the assigned ownership boundary.
3. Inspect the current working tree before changing files.
4. Do not reinterpret an invariant silently. Report a needed contract change to the primary integrator.

## Core invariants

- The browser starts anonymous; email resolution and payment must preserve one queryable history.
- Acquisition context is captured at the first session request.
- Business facts use server time and server-authoritative values.
- Client event delivery is deduplicated by `client_event_id`.
- Email and payment outcome events are emitted by the server.
- A funnel session has at most one purchase.
- A purchase has at most one processing attempt at a time.
- Retried idempotency keys return their stored result.
- Failed purchases may have new attempts; successful purchases may not.
- Amount and currency come from the database, never from client input.
- Never persist or log full PAN, expiry, CVC, or cardholder name.
- Install is available only after confirmed purchase success.
- `docker compose up` must apply migrations automatically.

## Engineering conventions

- Use strict TypeScript. Do not add `any` to bypass a contract.
- Validate every external payload with Zod at the server boundary.
- Keep route handlers thin; business logic belongs under `src/server/**`.
- Keep UI content/configuration separate from navigation and network logic.
- Store monetary amounts as integer minor units with an explicit currency.
- Use UTC `timestamptz` values for persisted timestamps.
- Prefer database constraints over client-only or process-local guards.
- Make migrations deterministic and safe on an empty database.
- Do not introduce a dependency without approval from the primary integrator.
- Preserve the package manager and lockfile chosen during scaffold.

## Testing priorities

Test behavior, not implementation details. Highest-value cases are:

1. same idempotency key returns one stored attempt;
2. simultaneous requests yield one purchase and one active attempt;
3. success is terminal;
4. decline and timeout are stored and retryable;
5. an existing normalized email resolves to one user;
6. duplicate client events insert once;
7. full card data never appears in persisted records;
8. clean Docker startup applies migrations.

## Collaboration rules

- Work only inside paths assigned in the task prompt.
- Do not run Git commit, checkout, merge, rebase, reset, or stash.
- Do not overwrite or undo another agent's work.
- Do not edit shared barrel files from multiple workstreams.
- If another area must change, send the primary integrator the smallest concrete proposal.
- Finish with a list of changed files, checks run, their results, and remaining risks.

## Definition of done

A task is not complete merely because it compiles. It must satisfy its relevant acceptance scenarios in `docs/SPEC.md`, preserve the invariants above, and include focused verification.

