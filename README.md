# ChaChat character-match funnel

A mobile-first, nine-screen demo: discover ChaChat, answer five questions, save a character match by email, choose a plan, and complete a simulated card checkout. **No real payments are made.**

## Run

Install Docker Desktop with Linux containers and, on Windows, enable integration for your WSL distro. From this repository in a native Linux/WSL shell:

```sh
docker compose up --build
```

Open **http://localhost:3000**. Compose waits for PostgreSQL health, applies the committed migrations (including three seeded plans), then starts the application. No manual database setup or `.env` copy is needed for Compose.

To stop while retaining data: `docker compose down`. To erase this demo's database and start over:

```sh
docker compose down --volumes
docker compose up --build
```

The volume reset permanently deletes this Compose project's saved demo data. Clear this site's browser storage/cookies for a fresh browser identity as well.

## Evaluator walkthrough

1. Open `http://localhost:3000/?utm_source=evaluator&utm_campaign=demo` in a fresh browser context.
2. Confirm you are 18+, answer all five questions, and enter an email. Back navigation retains answers.
3. Review Monthly ($29.99), Annual ($59.99, default), and Lifetime ($89.99). These are database prices.
4. Submit a test card below with a future expiry, a three-digit CVC, a demo name, country, and postal code.
5. For a decline or timeout, retry with the success card. A successful purchase unlocks the App Store link. Refresh preserves server-known progress and payment state.
6. In another private browser context, complete the quiz with the same email to inspect identity merging and the SQL below.

| Test card | Result |
| --- | --- |
| `4242424242424242` | Success |
| `4000000000000002` | Decline; a new attempt can retry |
| `4000000000009995` | Bounded simulated timeout; a new attempt can retry |
| Other Luhn-valid numbers | Success |
| Invalid card, expiry, or CVC | Validation error before processing |

Use only test data. Card fields remain transient; only card brand and last four digits are persisted.

## Architecture and identity

Next.js App Router serves the interface and thin API routes. Zod validates external input; business logic lives under `src/server`. Prisma maps the PostgreSQL schema, and committed SQL migrations enforce payment uniqueness and seed plans. Screen content is separate from navigation and networking.

The browser begins anonymously with HTTP-only, same-site visitor/session cookies. Acquisition context is recorded when the session is first created. Email is trimmed and lowercased; transactional resolution reuses an existing normalized email and attaches the current session. The authoritative history joins `users ← funnel_sessions ← events`, so pre-email actions remain queryable after resolution. Reassigning an email does not rewrite older sessions.

Client analytics use stable UUID delivery IDs with a database unique constraint. Server-owned identity, quiz, and payment events use server timestamps. Event properties are restricted so checkout secrets and email cannot be copied into analytics. Prices and purchase snapshots come from database plans.

## Payment consistency

A unique session constraint allows one purchase per funnel session. Transactions serialize competing purchase claims; a partial unique index permits one processing attempt per purchase. Each attempt has a globally unique idempotency key. Replaying a key returns its stored attempt outcome, while a new key can retry a failed purchase. Success is terminal. The current-purchase endpoint recovers processing/final state after refresh. The simulator deadline is 1.5 seconds; polling recovers attempts left processing by a crash after 15 seconds. The plan and email become fixed once checkout starts; re-submitting the same normalized email remains safe.

Local Compose explicitly permits cookies over HTTP. HTTPS deployments must use secure cookies. This is a demo identity flow, not authentication or proof of email ownership.

## Development and checks

Use **Linux-native Node.js 22 and pnpm 10.15.0**, including inside WSL; avoid Windows executables against a WSL UNC path. The lockfile is committed.

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test` runs the processor unit tests and skips database tests unless `RUN_DB_TESTS=1` is set. After Compose is healthy, run the API/persistence and log checks:

```sh
docker compose run --rm -e BASE_URL=http://app:3000 migrate node scripts/smoke.mjs
node scripts/check-compose-logs.mjs
```

The smoke script retains tagged demo evidence. For the PostgreSQL invariant suite, use the disposable Compose database:

```sh
docker compose run --rm -e RUN_DB_TESTS=1 \
  -v "$PWD/src:/app/src:ro" -v "$PWD/tests:/app/tests:ro" \
  -v "$PWD/vitest.config.ts:/app/vitest.config.ts:ro" migrate pnpm test
```

These tests remove their own fixtures; one temporarily changes and restores a seeded plan price to verify snapshot immutability. Run them separately from browser tests.

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests use mobile Chromium. They cover the full funnel, guarded install, answer persistence, decline/timeout retry, and refresh during processing. On a minimal Linux host, install Chromium's system dependencies with `pnpm exec playwright install --with-deps chromium`.

For local development, set `DATABASE_URL` to a reachable PostgreSQL database, run `pnpm db:migrate`, then `pnpm dev`. Compose's database hostname `db` resolves only inside its Docker network.

## Verification evidence

Verified on 2026-09-11: clean default Compose startup with automatic migrations; production build, lint and typecheck; 26 unit/PostgreSQL tests; API/persistence acceptance smoke; three mobile Chromium scenarios; five README SQL queries; and the Compose log secret scan. See [the handoff](docs/HANDOFF.md) for environment details and [the workflow log](docs/AI_WORKFLOW.md) for integration decisions.

## Analytics SQL

Run these queries with `docker compose exec -T db psql -U chachat -d chachat`. Counts use distinct sessions or purchases to avoid retry/view inflation. No event-level user snapshot is required for historical attribution.

### Paywall-to-purchase conversion

```sql
WITH exposed AS (
  SELECT DISTINCT session_id FROM events
  WHERE name = 'screen_viewed' AND screen = 'paywall'
)
SELECT count(*) AS paywall_sessions,
       count(*) FILTER (WHERE p.status = 'succeeded') AS purchased_sessions,
       round(100.0 * count(*) FILTER (WHERE p.status = 'succeeded')
             / NULLIF(count(*), 0), 2) AS conversion_percent
FROM exposed e
LEFT JOIN purchases p ON p.session_id = e.session_id;
```

### Quiz-step drop-off

```sql
WITH steps(question_id, ordinal) AS (
  VALUES ('intent',1), ('character_type',2), ('interaction_mode',3),
         ('memory',4), ('usage_moment',5)
), views AS (
  SELECT DISTINCT screen, session_id
  FROM events WHERE name = 'screen_viewed'
)
SELECT s.question_id, count(v.session_id) AS viewed,
       count(a.session_id) AS answered_among_viewed,
       round(100.0 * (count(v.session_id) - count(a.session_id))
             / NULLIF(count(v.session_id),0), 2) AS viewed_not_answered_percent
FROM steps s LEFT JOIN views v ON v.screen = s.question_id
LEFT JOIN quiz_answers a ON a.question_id = s.question_id
                       AND a.session_id = v.session_id
GROUP BY s.question_id, s.ordinal ORDER BY s.ordinal;
```

Client analytics can be blocked or delayed, so view-based metrics describe observed traffic; server answers and purchase facts are authoritative.

### Plan checkout conversion

```sql
SELECT plan_slug, currency, count(*) AS checkouts,
       count(*) FILTER (WHERE status = 'succeeded') AS successes,
       round(100.0 * count(*) FILTER (WHERE status = 'succeeded')
             / NULLIF(count(*),0),2) AS checkout_conversion_percent,
       COALESCE(sum(amount_minor) FILTER (WHERE status = 'succeeded'),0)
         AS successful_amount_minor
FROM purchases GROUP BY plan_slug, currency ORDER BY plan_slug;
```

This denominator is created checkouts, not all plan impressions. Purchase snapshot fields preserve historical pricing.

### Payment failures and subsequent recovery

```sql
SELECT a.failure_code, count(*) AS failed_attempts,
       count(DISTINCT a.purchase_id) AS affected_purchases,
       count(DISTINCT a.purchase_id) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM payment_attempts later
           WHERE later.purchase_id = a.purchase_id
             AND later.attempt_number > a.attempt_number
             AND later.status = 'succeeded'
         )
       ) AS recovered_purchases
FROM payment_attempts a
WHERE a.status IN ('declined','timed_out','failed')
GROUP BY a.failure_code ORDER BY a.failure_code;
```

### Resolved user's pre-email history and acquisition

```sql
SELECT u.normalized_email, s.id AS session_id, s.utm_source,
       s.utm_campaign, s.landing_url, s.referrer,
       e.name, e.screen, e.occurred_at
FROM users u JOIN funnel_sessions s ON s.user_id = u.id
JOIN events e ON e.session_id = s.id
ORDER BY u.normalized_email, s.started_at, e.occurred_at;
```

## Deliberate cuts

There is no real payment provider, authentication, email delivery, analytics dashboard, CMS, localization, or deployment setup. The character match is a lightweight copy personalization, not a psychological assessment. Product grounding and acceptance criteria are in [the specification](docs/SPEC.md).

For production, replace the simulator with provider tokenization and webhook reconciliation, add verified account access, abuse controls, operational monitoring, privacy/retention policy, and a durable processor recovery worker. Broaden browser/accessibility coverage and test under sustained database contention. Pending client analytics survive refresh in per-tab session storage; closing a tab before delivery can discard them. A production durable queue would strengthen delivery across tab closure.

The specification preceded application code in commit `e71599b`; the verified scaffold is `8e49030`. [AI_WORKFLOW.md](docs/AI_WORKFLOW.md) records file ownership and actual delivery checkpoints.
