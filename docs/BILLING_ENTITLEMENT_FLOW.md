# Billing → Entitlement Flow

Stripe subscription events drive authoritative Free/Pro entitlement. The server is the sole authority; Stripe is an input. No runtime Stripe calls; no client-derived plan.

---

## A. Data model

Minimal tables (see `lib/sql/migrations/001_billing.sql`):

| Table | Purpose |
|-------|---------|
| **billing_customers** | `user_id` (our id) ↔ `stripe_customer_id`. One row per user. |
| **entitlements** | One row per user: `plan` (FREE \| PRO), `status`, `current_period_end` (entitlement expiration), `cancel_at_period_end`, `stripe_subscription_id`, `stripe_price_id`, `updated_from_event_id`, `updated_at`. |
| **webhook_events** | Idempotency: `stripe_event_id` (PK), `type`, `created`, `livemode`, `payload_json`, `received_at`. |

- **Stripe customer id**: `billing_customers.stripe_customer_id`.
- **Stripe subscription id**: `entitlements.stripe_subscription_id`.
- **Current plan**: `entitlements.plan` (`FREE` \| `PRO`).
- **Entitlement expiration**: `entitlements.current_period_end`. Optional; when set, Pro is only effective while `now <= current_period_end`. Read path enforces this so access stops immediately after expiration even if a webhook is delayed.

No roles, feature flags, or extra tables.

---

## B. Webhook endpoint

**Route**: `POST /api/billing/webhook`

1. **Body**: Read raw body with `request.text()` (required for signature verification).
2. **Signature**: Require `Stripe-Signature` header. Verify with `stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET)`. On failure → 400.
3. **Events handled** (at least):
   - `checkout.session.completed` → load subscription, upsert entitlement.
   - `customer.subscription.created` / `customer.subscription.updated` / `customer.subscription.deleted` → upsert entitlement from subscription.
   - `invoice.paid` / `invoice.payment_succeeded` / `invoice.payment_failed` → resolve subscription from invoice, fetch subscription, upsert entitlement.

**Idempotency**: Before applying any entitlement change, insert into `webhook_events` with `INSERT ... ON CONFLICT (stripe_event_id) DO NOTHING RETURNING stripe_event_id`. If no row is returned, the event was already processed → skip entitlement update and return. Processing is done only on the first insert.

---

## C. Entitlement updates

**Source**: Subscription (from event payload or from Stripe when starting from `checkout.session.completed` / invoice).

- **Plan**: `subscription.status` → `mapStatusToPlan(status)`: `active` or `trialing` ⇒ PRO; anything else ⇒ FREE.
- **Expiration**: `current_period_end` from `subscription.current_period_end` (or from `subscription.latest_invoice.period_end` / `invoice.period_end` when updating from an invoice).
- **Upsert**: `INSERT INTO entitlements (...) ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end, ...`.

**On successful payment / active subscription**: Plan is set to PRO and `current_period_end` is set from the subscription/invoice.

**On cancellation, deletion, or non-payment**: Subscription status is no longer `active`/`trialing` → `mapStatusToPlan` returns FREE → upsert writes FREE. Downgrade is applied when the webhook is processed.

**Immediate downgrade after expiration**: Even if a webhook is delayed, the read path enforces expiration. In `getEntitlementForUser()`, if `plan === 'PRO'` and `current_period_end` is set and `now > current_period_end`, the returned `plan` is forced to FREE. So access stops as soon as the period end is in the past, with or without a new Stripe event.

---

## D. Runtime checks

`requireFeatureForUser(feature, { userId })` and any logic that needs “is this user allowed?” use **only**:

1. **Database**: `getEntitlementForUser(userId)` reads from `entitlements` (and applies the `now > current_period_end` rule above).
2. **Current time**: Used inside `getEntitlementForUser()` to compare with `current_period_end`.

There are **no** Stripe API calls in the request path. No polling, no live subscription checks. Entitlement is determined solely from the DB and the clock.

---

## E. Failure modes

| Scenario | Behavior | Convergence |
|----------|----------|-------------|
| **Delayed webhook** | User may remain Pro until the webhook is delivered and processed. Once it is processed, entitlement is updated. If the period has ended, the **read-path rule** (`now > current_period_end` ⇒ FREE) already downgrades effective access, so the user does not get Pro past expiration even before the webhook. | Correct state after webhook; effective access was already correct at read time after expiration. |
| **Duplicate webhook delivery** | Second delivery inserts into `webhook_events` with the same `stripe_event_id` → conflict → no new row → no processing. First delivery’s entitlement upsert remains. | Idempotent; entitlement does not change twice. |
| **Webhook after deploy/restart** | No in-memory state is used. Idempotency is keyed by `stripe_event_id` in the DB. If the event was already processed before the restart, the duplicate is skipped. If it is new, it is processed once. | Restart-safe; system converges to the same state as if the event were processed once. |
| **Missing webhook** | Entitlement does not change until a later event or manual correction. Stripe retries; operations can repair from Stripe data (e.g. re-send or backfill from Dashboard/API) if needed. | Converges when a subsequent event is processed or data is repaired. |

All logic is idempotent and restart-safe: no reliance on in-memory caches or “only run once” logic outside of the `webhook_events` insert.

---

## Flow summary

1. **Stripe** sends a webhook to `POST /api/billing/webhook`.
2. **Route** verifies signature, then calls `handleWebhook(event)`.
3. **handleWebhook** tries to insert the event into `webhook_events`. If the insert yields no row (duplicate id), it returns without updating entitlement.
4. **Event handler** (subscription or invoice) resolves `user_id` from `billing_customers` or metadata, computes `plan` and `current_period_end` from the subscription/invoice, and upserts `entitlements`.
5. **Next request** that needs a gated feature calls `requireFeatureForUser(feature, { userId })` → `getEntitlementForUser(userId)` → read from DB, apply `now > current_period_end` ⇒ FREE, then enforce tier allowance for the feature.

No pricing UI, no plan inferred from the client, no Stripe calls at request time.
