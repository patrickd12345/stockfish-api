import { getSql } from './database';
import { validateBillingEnv } from './env';
import Stripe from 'stripe';

// Initialize Stripe
// We use a getter to ensure env vars are loaded/validated when needed
let stripeInstance: Stripe | null = null;

export function getStripe() {
  if (!stripeInstance) {
    const env = validateBillingEnv();
    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16' as any, // Use a recent stable version or match repo
      typescript: true,
    });
  }
  return stripeInstance;
}

export type Plan = 'FREE' | 'PRO';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' | 'TRIALING' | 'NONE';

export interface Entitlement {
  plan: Plan;
  status: SubscriptionStatus;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
}

/**
 * Maps Stripe subscription status to our internal Plan.
 * Rule: ACTIVE/TRIALING => PRO access. Everything else => FREE access.
 */
export function mapStatusToPlan(status: string | null | undefined): Plan {
  if (status === 'active' || status === 'trialing') {
    return 'PRO';
  }
  return 'FREE';
}

/**
 * Gets the entitlement for a user.
 * This is the canonical source of truth for "Is this user Pro?".
 */
export async function getEntitlementForUser(userId: string): Promise<Entitlement> {
  const sql = getSql();

  // Query the entitlements table
  const rows = await sql`
    SELECT plan, status, current_period_end, cancel_at_period_end
    FROM entitlements
    WHERE user_id = ${userId}
  `;

  if (rows.length === 0) {
    return {
      plan: 'FREE',
      status: 'NONE',
      current_period_end: null,
      cancel_at_period_end: false,
    };
  }

  const row = rows[0];

  // Double-check the plan logic here, although the webhook should have set 'plan' correctly.
  // We trust the DB 'plan' column which is derived from status during webhook processing.
  // But we can also re-derive it to be safe or just return what's there.
  // The prompt says: "Source of truth for entitlement: Stripe Subscription object status... plan is PRO only if status in {active, trialing}"

  return {
    plan: row.plan as Plan,
    status: (row.status as string).toUpperCase() as SubscriptionStatus,
    current_period_end: row.current_period_end ? new Date(row.current_period_end as string) : null,
    cancel_at_period_end: !!row.cancel_at_period_end,
  };
}

/**
 * Creates a Stripe Checkout Session for a subscription.
 */
export async function createCheckoutSession(userId: string, interval: 'monthly' | 'yearly') {
  const stripe = getStripe();
  const sql = getSql();
  const env = validateBillingEnv();

  // 1. Get or create billing customer
  let stripeCustomerId: string;
  const customerRows = await sql`SELECT stripe_customer_id FROM billing_customers WHERE user_id = ${userId}`;

  if (customerRows.length > 0) {
    stripeCustomerId = customerRows[0].stripe_customer_id as string;
  } else {
    // Create new customer in Stripe
    // We might want to pass email if we have it, but we only have user_id (lichess id) here easily.
    // If we had an email, we'd pass it. For now, metadata is key.
    const customer = await stripe.customers.create({
      metadata: {
        user_id: userId,
      },
    });
    stripeCustomerId = customer.id;

    // Save to DB
    await sql`
      INSERT INTO billing_customers (user_id, stripe_customer_id)
      VALUES (${userId}, ${stripeCustomerId})
      ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = ${stripeCustomerId}
    `;
  }

  // 2. Determine price ID
  const priceId = interval === 'monthly'
    ? env.STRIPE_PRO_PRICE_ID_MONTHLY
    : env.STRIPE_PRO_PRICE_ID_YEARLY;

  // 3. Create Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: env.STRIPE_CHECKOUT_SUCCESS_URL.replace('{CHECKOUT_SESSION_ID}', '{CHECKOUT_SESSION_ID}'),
    cancel_url: env.STRIPE_CHECKOUT_CANCEL_URL,
    metadata: {
      user_id: userId,
    },
    allow_promotion_codes: true,
  });

  return { url: session.url };
}

/**
 * Creates a Stripe Customer Portal session.
 */
export async function createPortalSession(userId: string) {
  const stripe = getStripe();
  const sql = getSql();
  const env = validateBillingEnv();

  const customerRows = await sql`SELECT stripe_customer_id FROM billing_customers WHERE user_id = ${userId}`;
  if (customerRows.length === 0) {
    throw new Error("No billing customer found for user");
  }
  const stripeCustomerId = customerRows[0].stripe_customer_id as string;

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: env.STRIPE_CUSTOMER_PORTAL_RETURN_URL,
  });

  return { url: session.url };
}

/**
 * Handles Stripe Webhooks to update entitlements.
 * Idempotency is handled by checking webhook_events table before calling this or inside this.
 */
export async function handleWebhook(event: Stripe.Event) {
  const sql = getSql();

  // 1. Log event for idempotency / audit
  // The caller (route handler) should typically check existence first,
  // but we can do an INSERT ON CONFLICT DO NOTHING and check result.

  // We'll upsert the event log first.
  const payloadStr = JSON.stringify(event.data.object);

  // Insert event if not exists
  const eventRows = await sql`
    INSERT INTO webhook_events (stripe_event_id, type, created, livemode, payload_json)
    VALUES (
      ${event.id},
      ${event.type},
      to_timestamp(${event.created}),
      ${event.livemode},
      ${payloadStr}
    )
    ON CONFLICT (stripe_event_id) DO NOTHING
    RETURNING stripe_event_id
  `;

  // If no row returned, it meant it already existed (idempotent no-op)
  // HOWEVER, strictly speaking, we might have crashed *after* inserting event but *before* processing it.
  // The prompt says "Entitlements update must be idempotent: if stripe_event_id exists, NO-OP."
  // So we strictly obey that: if we've seen this ID, we assume we processed it or are processing it.
  if (eventRows.length === 0) {
    console.log(`Webhook event ${event.id} already processed. Skipping.`);
    return;
  }

  // 2. Process specific events
  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await updateEntitlementFromSubscription(event);
      break;

    // Invoices can be useful for identifying failures, but subscription status usually reflects this (past_due).
    // The prompt lists these events to handle.
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed':
      await updateEntitlementFromInvoice(event);
      break;

    default:
      // console.log(`Unhandled relevant event type: ${event.type}`);
      break;
  }
}

async function updateEntitlementFromSubscription(event: Stripe.Event) {
  const sql = getSql();
  let subscription: Stripe.Subscription;

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== 'subscription' || !session.subscription) return;
    const stripe = getStripe();
    subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  } else {
    subscription = event.data.object as Stripe.Subscription;
  }

  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  // Find user_id from billing_customers or metadata
  // We prefer metadata on the subscription/customer if we put it there, but we stored it in billing_customers map.
  // Let's look up billing_customers by stripe_customer_id.
  const customerRows = await sql`
    SELECT user_id FROM billing_customers WHERE stripe_customer_id = ${stripeCustomerId}
  `;

  let userId: string | null = null;
  if (customerRows.length > 0) {
    userId = customerRows[0].user_id as string;
  }

  // Fallback: Check metadata on subscription (might not be propagated from checkout unless configured)
  if (!userId && subscription.metadata && subscription.metadata.user_id) {
    userId = subscription.metadata.user_id;
  }

  if (!userId) {
    console.error(`Could not find user_id for Stripe Customer ${stripeCustomerId}`);
    return;
  }

  const status = subscription.status;
  const plan = mapStatusToPlan(status);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;
  const priceId = subscription.items.data[0]?.price.id;

  await sql`
    INSERT INTO entitlements (
      user_id, plan, status, current_period_end, cancel_at_period_end,
      stripe_subscription_id, stripe_price_id, updated_from_event_id, updated_at
    )
    VALUES (
      ${userId}, ${plan}, ${status}, ${currentPeriodEnd}, ${cancelAtPeriodEnd},
      ${subscription.id}, ${priceId}, ${event.id}, now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      plan = EXCLUDED.plan,
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      stripe_price_id = EXCLUDED.stripe_price_id,
      updated_from_event_id = EXCLUDED.updated_from_event_id,
      updated_at = now()
  `;
}

async function updateEntitlementFromInvoice(event: Stripe.Event) {
  // Usually the subscription update event follows invoice events and carries the status change (e.g. to past_due),
  // so we might not strictly need to process invoice events if we rely on subscription.* events.
  // However, the prompt asked to handle them.
  // We can just fetch the subscription and update the same way to be sure.

  const invoice = event.data.object as Stripe.Invoice;
  if (!invoice.subscription) return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);

  // Reuse logic
  // We construct a synthetic event or just call the helper with the subscription data
  // Easier to just call the update helper but we need to mock the event structure or refactor.
  // Let's refactor slightly:

  // We'll just call updateEntitlementFromSubscription but we need to pass an event that contains the subscription.
  // Or we create a helper that takes a subscription object.

  await updateEntitlementFromSubscriptionObject(subscription, event.id);
}

async function updateEntitlementFromSubscriptionObject(subscription: Stripe.Subscription, eventId: string) {
  const sql = getSql();
  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const customerRows = await sql`
    SELECT user_id FROM billing_customers WHERE stripe_customer_id = ${stripeCustomerId}
  `;

  let userId: string | null = null;
  if (customerRows.length > 0) {
    userId = customerRows[0].user_id as string;
  }

  if (!userId && subscription.metadata && subscription.metadata.user_id) {
    userId = subscription.metadata.user_id;
  }

  if (!userId) {
    console.error(`Could not find user_id for Stripe Customer ${stripeCustomerId}`);
    return;
  }

  const status = subscription.status;
  const plan = mapStatusToPlan(status);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;
  const priceId = subscription.items.data[0]?.price.id;

  await sql`
    INSERT INTO entitlements (
      user_id, plan, status, current_period_end, cancel_at_period_end,
      stripe_subscription_id, stripe_price_id, updated_from_event_id, updated_at
    )
    VALUES (
      ${userId}, ${plan}, ${status}, ${currentPeriodEnd}, ${cancelAtPeriodEnd},
      ${subscription.id}, ${priceId}, ${eventId}, now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      plan = EXCLUDED.plan,
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      stripe_price_id = EXCLUDED.stripe_price_id,
      updated_from_event_id = EXCLUDED.updated_from_event_id,
      updated_at = now()
  `;
}
