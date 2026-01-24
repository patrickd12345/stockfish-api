# Auth & Entitlement Audit

**Date:** 2025-01-23  
**Scope:** Authentication and Free vs Pro entitlement only. No redesign of logging, UI, pricing, or Stripe checkout.

---

## A. Authentication

### How the app authenticates

- **Mechanism:** Lichess OAuth. User completes flow at `/api/lichess/oauth/start` → Lichess → `/api/lichess/oauth/callback`.
- **Callback** (`app/api/lichess/oauth/callback/route.ts`): Exchanges code for token, fetches Lichess account, stores token, sets HTTP-only cookie `lichess_user_id` = `account.id` (Lichess username).
- **Cookie:** `lichess_user_id`; `httpOnly`, `secure` in production, `sameSite: 'lax'`, `path: '/'`, `maxAge: 30 days`.

### Stable internal user ID

- **Server-side user identifier:** `lichess_user_id` cookie value. Used as `user_id` in `entitlements`, `billing_customers`, `pro_usage`, and elsewhere. No separate internal UUID; Lichess username is the stable id.

### Protected endpoints and identity

- **Identity source:** `request.cookies.get('lichess_user_id')?.value`.
- **Helpers:**  
  - `requireFeatureForUser(feature, { userId })` → throws if not authenticated or not allowed; returns `{ userId, tier }` otherwise.
- **Endpoints that must have identity:** All gated endpoints use the `lichess_user_id` cookie and `requireFeatureForUser`. No endpoint infers user from body/query; all use the cookie.

**Finding:** Auth is cookie-based and consistent. No ambiguity on “who is the user” for routes that check it.

---

## B. Entitlement model

### Where Free vs Pro is stored

- **Table:** `entitlements` (see `lib/sql/migrations/001_billing.sql`).
- **Columns:** `user_id` (PK), `plan` ('FREE'|'PRO'), `status`, `current_period_end`, `cancel_at_period_end`, `stripe_subscription_id`, etc.
- **Filled by:** Stripe webhooks (`customer.subscription.*`, `checkout.session.completed`, `invoice.*`) via `handleWebhook` → `updateEntitlementFromSubscription` / `updateEntitlementFromInvoice` → `INSERT ... ON CONFLICT (user_id) DO UPDATE` on `entitlements`.

### Single authoritative check

- **Canonical check:** `requireFeatureForUser(feature, { userId })` in `lib/featureGate/server.ts`.
- **Implementation:** Reads `lichess_user_id` from cookie; if missing → rejects with auth message. Calls `getEntitlementForUser(lichessUserId)` and applies tier allowances for the feature. Returns `{ userId, tier }` only when authenticated and allowed.
- **Plan source:** `getEntitlementForUser(userId)` reads from DB `entitlements` only. No client input is used for plan.

### Expiration

- **Stored:** `current_period_end` and Stripe `status` drive effective access. `plan` is set from `mapStatusToPlan(status)` in webhook handlers: `active` or `trialing` → PRO, else FREE.
- **When it takes effect:** On next webhook that updates the subscription (e.g. `customer.subscription.updated` / `customer.subscription.deleted`). There is no per-request “if now > current_period_end then force FREE” in app code; expiration is reflected when Stripe sends the corresponding event and we upsert `entitlements`.
- **Conclusion:** Expiration is supported via webhook-driven status/plan. If product needs stricter “hard stop at current_period_end” before the next webhook, that would require an extra check in `getEntitlementForUser` or in `requireFeatureForUser` (e.g. treat as FREE when `current_period_end && now > current_period_end`). Not implemented today.

---

## C. Server enforcement

### Endpoints that spend compute or money

| Endpoint | Auth | Pro enforced? | Notes |
|----------|------|----------------|--------|
| `POST /api/engine/analyze` | cookie | Yes via `requireFeatureForUser(engine_analysis)` | Correct. |
| `POST /api/engine/analyze/worker` | cookie | Yes via `requireFeatureForUser(engine_analysis)` | Correct. |
| `POST /api/analysis/run` | cookie | Yes via `requireFeatureForUser(<by type>)` | Correct. |
| `POST /api/blunder-dna/analyze` | cookie | Yes via `requireFeatureForUser(blunder_dna)` | Correct. |
| `POST /api/batch-analysis` | cookie | Yes via `requireFeatureForUser(batch_analysis)` | Correct. |
| `POST /api/process-pgn` | optional cookie | Partial | Engine “analyze now” and batch run gated by `requireFeatureForUser(...)`. |
| `POST /api/import/chesscom` | optional cookie | Partial | Same as process-pgn: “analyze now” and batch are gated by `requireFeatureForUser(...)`. |
| `GET /api/engine/coverage` | none | No | Read-only stats; light DB read. Not treated as paid. |
| `GET /api/engine/queue/diagnostics` | none | No | Read-only queue stats; can requeue stale jobs. Not treated as paid. |
| `GET /api/billing/usage` | cookie | No entitlement gate | Returns plan/usage for the authenticated user. Read-only; no spend. |
| `GET /api/billing/subscription` | cookie | No entitlement gate | Returns entitlement for the authenticated user. Read-only. |
| `POST /api/chat` | none | No | Calls LLM. Out of scope for *minimal* auth/entitlement changes; product may treat chat as Free or Pro later. |

- **Conclusion:** Every **paid** server-side action that was in scope uses the DB-backed entitlement and `requireFeatureForUser(feature, { userId })` before running batch/engine work. No endpoint infers plan from client input.

---

## D. Stripe integration sanity check

### How webhooks update entitlement

- **Route:** `POST /api/billing/webhook`. Verifies `stripe-signature`, parses body as `Stripe.Event`, calls `handleWebhook(event)` from `lib/billing.ts`.
- **Handler:** `handleWebhook` inserts into `webhook_events(stripe_event_id, type, created, livemode, payload_json)` with `ON CONFLICT (stripe_event_id) DO NOTHING RETURNING stripe_event_id`. If no row is returned, the event is considered already processed and the function returns without updating entitlement.
- **Events that change entitlement:** `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`. All drive an upsert into `entitlements` keyed by `user_id` (resolved from `billing_customers.stripe_customer_id` or subscription metadata).

### Idempotency

- **Duplicate events:** `webhook_events.stripe_event_id` is the idempotency key. First occurrence inserts and processing continues; second occurrence does not insert, so processing is skipped. Entitlement updates are done only after a successful insert.
- **Repeated processing of same logical change:** Entitlement update is `INSERT ... ON CONFLICT (user_id) DO UPDATE SET ...`. Re-running the same event would write the same values again; no inconsistency.

### Propagation

- **When:** As soon as the webhook request completes and the upsert commits. No queue or eventual sync.
- **Next request:** The very next in-app request that calls `getEntitlementForUser(userId)` or `requireFeatureForUser(feature, { userId })` sees the new plan/status.

---

## E. Failure modes

| Scenario | Behavior |
|----------|----------|
| **User unauthenticated** | No `lichess_user_id` cookie. `requireFeatureForUser` rejects with auth message → handler returns 403. |
| **User Free hits Pro endpoint** | `requireFeatureForUser` calls `getEntitlementForUser`; tier not allowed → error “Upgrade required to use Feature X.” |
| **Pro subscription expires** | Stripe sends `customer.subscription.updated` or `customer.subscription.deleted` with status that maps to FREE. Webhook upserts `entitlements` with `plan = 'FREE'`. Next request that checks entitlement sees FREE and is rejected if it requires Pro. |
| **Stripe webhook delayed** | User may still be treated as Pro until the webhook is delivered and processed. No automatic “current_period_end” cutoff in app code today. |
| **Stripe webhook missed** | Entitlement does not change until a later event or manual repair. Mitigations: Stripe retries; idempotency avoids double apply; support can re-trigger or correct `entitlements` from Stripe data. |

---

## Summary

- **Auth:** Lichess OAuth sets `lichess_user_id` cookie; that value is the server-side user id. All protected routes use that cookie plus `requireFeatureForUser`.
- **Entitlement:** Single source of truth is the `entitlements` table, updated only by Stripe webhooks. Single authoritative check for “can do paid server work” is `requireFeatureForUser(feature, { userId })`. No plan is taken from client input.
- **Enforcement:** All paid engine/analysis endpoints and the batch-analysis trigger now require Pro (or explicit Pro check before running batch). Batch is only run for Pro users from process-pgn and import/chesscom.
- **Stripe:** Webhooks are idempotent on `stripe_event_id` and update `entitlements` immediately; propagation is on the next request.

**Bugs fixed in this pass:**

1. **POST /api/batch-analysis** — Now requires tier policy via `requireFeatureForUser(batch_analysis)`; returns 403 when not authenticated or not allowed.
2. **runBatchAnalysis() from process-pgn and import/chesscom** — Invoked only when the importing user has Pro (`hasProAccess`), so Free users no longer trigger server-side batch analysis.

**Optional follow-ups (not done in this audit):**

- Add a “hard” expiration check in `getEntitlementForUser` or `requireFeatureForUser` using `current_period_end` if you need to downgrade before the next webhook.
- Decide whether `POST /api/chat` (and any other LLM/compute routes) should require auth and/or Pro and add the corresponding checks.
