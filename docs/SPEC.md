# ChaChat Funnel Specification

Status: approved for implementation

Version: 1.2

Last updated: 2026-09-12

## 1. Goal

Build a mobile-first web funnel that introduces ChaChat, asks five product-relevant questions, identifies the visitor by email, presents three plans, processes a fake card payment, and sends a successful purchaser to an install screen.

The implementation must demonstrate:

- a clean anonymous-to-known-user identity transition;
- an analytics model that supports funnel and drop-off queries;
- server-authoritative prices and payment outcomes;
- idempotent purchase handling across double-clicks, retries, refreshes, and multiple tabs;
- a clean `docker compose up` experience with automatic database migrations.

## 2. Product grounding

ChaChat is an 18+ iPhone app for discovering and creating AI characters, text and voice conversations, interactive stories, AI-generated images, and conversations that can remember prior context.

The funnel is framed as a short character-match experience rather than a generic personality test. Quiz answers personalize the result and paywall copy; they do not make medical, psychological, or guaranteed-outcome claims.

Product sources reviewed before implementation:

- https://apps.apple.com/us/app/chachat-talking-ai-character/id6444773124
- https://chachat.app/
- https://docs.chachat.app/product-guides/characters

## 3. Scope

### Included

- Nine screens: landing, five quiz questions, email/result, paywall, install.
- Mobile-first layout with a usable desktop presentation.
- Persistent quiz progress for the active browser.
- Anonymous visitor and funnel-session creation on the first landing request.
- UTM, referrer, and landing URL capture.
- Email identity resolution, including an already-existing email.
- Three database-backed plans.
- Custom card form and deterministic fake payment processor.
- Success, decline, timeout, validation, duplicate-request, and in-progress UI states.
- Database-backed analytics for every meaningful action.
- Unit tests for payment state transitions and idempotency.
- One browser smoke test for the successful funnel when practical.

### Explicitly excluded

- Real payment-provider integration or actual charges.
- Authentication, passwords, and account management.
- Sending email.
- Administration UI or analytics dashboard.
- CMS, localization, nginx, and deployment.
- Storing full card numbers or CVC values.

## 4. Funnel and content

All product copy is in English because the referenced App Store listing is English. The content layer must remain data-driven so wording and answer choices can be changed without changing navigation logic.

1. `landing`
   - Headline: `Meet an AI character made for your kind of conversation`
   - Explain characters, voice, stories, and memory.
   - Require confirmation that the visitor is at least 18.
   - Primary action: `Find my character`.
2. `intent`
   - Question: `What brings you to ChaChat?`
   - Answers: someone to talk to; interactive stories and role-play; create a character; creative inspiration.
3. `character_type`
   - Question: `Who would you like to meet first?`
   - Answers: supportive friend; romantic companion; fantasy/story character; surprise me.
4. `interaction_mode`
   - Question: `How do you want to connect?`
   - Answers: text; voice; AI-generated images; mix of everything.
5. `memory`
   - Question: `What should your character remember?`
   - Answers: interests; ongoing story; preferences and boundaries; keep it casual.
6. `usage_moment`
   - Question: `When would ChaChat fit into your day?`
   - Answers: daily check-in; unwind; immersive story sessions; creative moments.
7. `email`
   - Show a short personalized match summary derived from quiz answers.
   - Ask for email to save the result and reveal the offer.
8. `paywall`
   - Show benefits, three plans, and a custom payment form.
   - Make it explicit that this is a demo checkout and no money is charged.
9. `install`
   - Available only after a successful purchase for the current session.
   - Show the resolved email and primary App Store link.

Back navigation must preserve answers. Forward navigation must not allow skipping required steps. Refreshing a screen must restore server-known progress or safe browser-local draft state.

## 5. Plans

Plans are seeded in the database and selected by stable slug. The backend ignores any client-provided amount or currency.

| Slug       | Display name |    Amount | Billing description | Default |
| ---------- | ------------ | --------: | ------------------- | ------- |
| `monthly`  | Monthly      | USD 29.99 | billed monthly      | No      |
| `annual`   | Annual       | USD 59.99 | billed yearly       | Yes     |
| `lifetime` | Lifetime     | USD 89.99 | one-time access     | No      |

Amounts are stored as integer minor units. A purchase stores a snapshot of plan name, amount, currency, and billing description so later plan changes do not rewrite purchase history.

## 6. Identity model

### Identifiers

- `visitor_id`: opaque UUID stored in a secure-by-default, HTTP-only, same-site cookie. It represents a browser, not necessarily a person.
- `session_id`: one funnel visit. A new session is created when no active resumable session exists.
- `user_id`: nullable until a valid email is submitted.

### Resolution rules

1. The first request creates or loads a visitor and creates a funnel session with acquisition context.
2. All pre-email actions attach to the same visitor and session.
3. Email is trimmed and normalized to lowercase.
4. Email submission runs in a transaction: upsert the user by normalized email, attach the current session to that user, update the visitor's last resolved user, and record authoritative identity events.
5. An email that already exists resolves to the existing user; it never creates a duplicate user.
6. A new browser entering an existing email attaches its current session to that existing user.
7. A returning browser may pre-resolve a new session to its last known user, but an explicitly submitted different email reassigns only the current session. Earlier sessions retain their original user ownership.

The authoritative historical path is `users <- funnel_sessions <- events`. Event rows may contain a nullable `user_id` snapshot for convenience, but correct queries must remain possible through the session relationship.

## 7. Data model

### `users`

- `id uuid primary key`
- `email text not null`
- `normalized_email text not null unique`
- `created_at`, `updated_at`

### `visitors`

- `id uuid primary key`
- `last_resolved_user_id uuid null`
- `created_at`, `last_seen_at`

### `funnel_sessions`

- `id uuid primary key`
- `visitor_id uuid not null`
- `user_id uuid null`
- `funnel_version text not null`
- `current_step text not null`
- `landing_url text not null`
- `referrer text null`
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` nullable
- `user_agent text null`
- `started_at`, `updated_at`, `completed_at null`

### `events`

- `id uuid primary key`
- `client_event_id uuid null unique`
- `visitor_id uuid not null`
- `session_id uuid not null`
- `user_id uuid null`
- `name text not null`
- `screen text null`
- `step_index integer null`
- `funnel_version text not null`
- `properties jsonb not null default '{}'`
- `occurred_at`, `received_at`

Indexes must support `(name, occurred_at)`, `(session_id, occurred_at)`, and `(user_id, occurred_at)` queries.

### `quiz_answers`

- `id uuid primary key`
- `session_id uuid not null`
- `question_id text not null`
- `answer_ids jsonb not null`
- `answered_at`, `updated_at`
- unique `(session_id, question_id)`

### `plans`

- `id uuid primary key`
- `slug text not null unique`
- `name text not null`
- `amount_minor integer not null`
- `currency char(3) not null`
- `billing_description text not null`
- `is_active boolean not null`
- `sort_order integer not null`

### `purchases`

- `id uuid primary key`
- `checkout_key uuid not null unique`
- `session_id uuid not null unique`
- `user_id uuid not null`
- `plan_id uuid not null`
- price and plan snapshot fields
- `status`: `created | processing | succeeded | failed`
- `failure_code`, `failure_message` nullable
- `created_at`, `updated_at`, `succeeded_at` nullable

### `payment_attempts`

- `id uuid primary key`
- `purchase_id uuid not null`
- `idempotency_key uuid not null unique`
- `attempt_number integer not null`
- `status`: `processing | succeeded | declined | timed_out | failed`
- `card_brand`, `card_last4` nullable
- `processor_reference`, `failure_code`, `failure_message` nullable
- `started_at`, `finished_at`, `duration_ms` nullable
- unique `(purchase_id, attempt_number)`

The schema must prevent more than one active processing attempt for a purchase, using a partial unique index or an equivalent transactional invariant.

## 8. Event contract

Every event contains the identifiers and timestamps described above. No event may include email, full PAN, expiry, CVC, or cardholder name in `properties`.

| Event                   | Authority                | Important properties                           |
| ----------------------- | ------------------------ | ---------------------------------------------- |
| `session_started`       | server                   | acquisition context summary                    |
| `screen_viewed`         | client, deduplicated     | screen, step index                             |
| `age_confirmed`         | client                   | confirmed=true                                 |
| `quiz_answered`         | server                   | question ID, answer IDs, step index            |
| `back_clicked`          | client                   | from screen, to screen                         |
| `email_submitted`       | server                   | existing user boolean                          |
| `identity_resolved`     | server                   | existing user boolean                          |
| `plan_selected`         | client                   | plan ID/slug, server-known display amount      |
| `payment_submitted`     | client                   | plan slug only                                 |
| `purchase_attempted`    | server                   | purchase ID, attempt number                    |
| `purchase_succeeded`    | server                   | purchase ID, plan snapshot, amount, currency   |
| `purchase_failed`       | server                   | purchase ID, failure code, retryable, duration |
| `install_screen_viewed` | server or guarded client | purchase ID                                    |
| `install_link_clicked`  | client                   | destination                                    |

Analytics ingestion is at-least-once. A repeated `client_event_id` returns success without inserting another row.

### Durable delivery contract (2026-09-12)

- Client events are committed to a shared IndexedDB queue before delivery. Closing a tab preserves pending events; the next visit resumes delivery for the same server-confirmed session using the original `client_event_id` values.
- Queue insertion and acknowledgement use transactions on individual records. Concurrent tabs may deliver the same event, which the server deduplicates, but cannot overwrite another tab's pending events. Only an acknowledged or permanently rejected record is removed.
- Existing per-tab event queues are imported into IndexedDB before their old storage is cleared. Bootstrap verifies queue storage is available; unavailable browser storage produces a retryable initialization error.
- Delivery always includes the queued event's expected session. Events belonging to another session are retained and never reassigned to the current cookie session. Clearing/evicting browser storage or never returning before delivery can still prevent client-event recovery.

### Audit remediation contracts (2026-09-11)

- First browser bootstrap is serialized across tabs with a Web Lock, with an IndexedDB lease fallback. The lock covers the entire session response, including cookie application. If coordination is unavailable, show a retryable initialization error instead of racing cookie creation.
- Every subsequent browser session operation includes `x-chachat-session` with the session it expects. Cookies remain the authorization; an expectation mismatch is `409 session_changed` and cannot silently attach old-tab actions to a new session. Bootstrap omits this expectation and rechecks cookies under the browser lock.
- A session remains resumable for the 90-day absolute cookie lifetime, including a completed purchase. A visit tomorrow resumes that history and retains its first acquisition. Cookie expiry/reset begins a new anonymous session. Funnel versions identify immutable question contracts; a breaking question change requires a new version and an explicit migration or restart policy before release, rather than silently reusing old answers.
- `POST /api/session/age` takes `{clientEventId}` and returns `PublicSession`; it transactionally confirms age and records the deduplicated `age_confirmed` event. This business transition does not wait for unrelated client analytics. The original validated age event ingestion remains supported.
- Payment results include `planId`, the authoritative purchase owner's `email`, and the returned attempt's `attemptId`/`idempotencyKey` (nullable without an attempt). Historical key replay returns that historical attempt. These identifiers do not authorize access.
- The browser stores its pending attempt key and matching plan slug in per-tab session storage before sending the request. If refresh happens before a server claim is visible, recovery retains the same key and plan and locks plan selection until the outcome is known. It ignores stale status responses and clears only the pending key corresponding to the observed terminal attempt or a known rejection before an attempt was created. Install displays the purchase owner's confirmed email.
- A reserved purchase always retries its stored plan/price snapshot, even if the live plan becomes inactive. New purchases require an active plan. Checkout displays the reserved snapshot even when the catalog no longer returns that plan.
- `plan_selected` includes `source=default|manual`. Default selection is recorded once per session; manual choices remain distinct actions. Event money is server-authoritative. Historical selection of an inactive but existing plan may still be recorded.
- Permanently invalid client events are removed from the delivery queue with bounded diagnostics containing only event ID/name and a fixed reason; subsequent valid events continue. Network/5xx and session/authentication failures retain their events for recovery. No card input or arbitrary error message is placed in diagnostics.
- Question order and accepted answer IDs come from one shared definition. UI content must type-check against it.
- All invariant/browser checks run in a disposable Docker Compose project, and CI uses the same entrypoint. Test fixtures must never mutate the developer's normal application database.

## 9. API boundaries

Exact URLs may change during scaffold, but responsibilities must remain separate:

- `POST /api/session`: create or resume visitor/session and return public session state.
- `POST /api/session/age`: confirm age and advance the session independently of the analytics delivery queue.
- `POST /api/events`: ingest a validated, deduplicated client event.
- `PUT /api/quiz/:questionId`: upsert an answer, record the event, advance progress.
- `POST /api/identity/email`: resolve email and attach the current session.
- `GET /api/plans`: return active plan display data.
- `POST /api/purchases`: create/reuse the current checkout purchase and process one attempt.
- `GET /api/purchases/current`: recover processing/final state after refresh.

All endpoints derive visitor/session identity from server-issued cookies. IDs supplied by the client are never sufficient authorization on their own.

## 10. Fake payment processor

The processor accepts syntactically valid future expiry and CVC values and uses normalized card number rules:

- `4242424242424242`: success.
- `4000000000000002`: decline with `card_declined`.
- `4000000000009995`: simulated processor timeout, converted by the application to terminal `timed_out` within a bounded interval.
- Any other Luhn-valid card: success.
- Invalid card, expiry, or CVC: validation error before an attempt is processed.

Only brand and last four digits may survive the processor boundary.

### Purchase state machine

1. Resolve the active session and its user; reject checkout before email resolution.
2. Lock the session and fetch the single purchase for this checkout.
3. A new purchase requires an active plan and snapshots its authoritative price. Existing purchases retain their immutable offer even when the live plan is retired.
4. For a repeated idempotency key, return the stored attempt result.
5. If the purchase succeeded, return the existing success result.
6. If another attempt is processing, return `202` with the purchase status.
7. Otherwise atomically claim processing and create the next attempt.
8. Run the fake processor with a server-side deadline.
9. In a final transaction, update attempt and purchase status and insert the corresponding authoritative analytics event.
10. A failed or timed-out purchase may be retried with a new attempt key; a successful purchase may not.

## 11. Required acceptance scenarios

- Clean `docker compose up --build` starts Postgres, applies migrations, and exposes the app on localhost.
- Happy path produces one user, session, complete event history, purchase, and successful attempt.
- Decline shows an actionable inline error and permits retry.
- Timeout terminates, is stored, and permits retry without an infinite spinner.
- Double-click with one key produces one attempt result.
- Two tabs cannot process two attempts simultaneously or create two purchases for the same session.
- Refresh during processing recovers through the current-purchase endpoint.
- Repeated analytics delivery does not duplicate an event.
- Undelivered analytics survive closing all funnel tabs and are delivered once after the same browser returns; concurrent tabs preserve each other's queued events.
- Existing email resolves to the existing user and retains the new session's pre-email history.
- UTM, referrer, and landing URL are queryable from the first session.
- Direct access to install without success is rejected or redirected.
- Database and logs contain no full card number or CVC.

## 12. Required README evidence

The final README must include:

- prerequisites and the single Docker Compose start command;
- application URL and clean-reset instructions;
- test-card behavior;
- architecture and identity summary;
- idempotency/concurrency explanation;
- test commands;
- executable SQL for paywall conversion, quiz-step drop-off, plan conversion, and payment failures/recovery;
- deliberate cuts and what would be improved with more time;
- a short evaluator-first walkthrough.
