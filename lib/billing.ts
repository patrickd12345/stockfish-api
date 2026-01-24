import { getSql } from './database';
import { validateBillingEnv } from './env';
import Stripe from 'stripe';

// Initialize Stripe
// We use a getter to ensure env vars are loaded/validated when needed
let stripeInstance: Stripe | null = null;
let warnedMissingEntitlementsTable = false;

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

function getCurrentPeriodEndFromSubscription(subscription: Stripe.Subscription): Date | null {
  const sub = subscription as { current_period_end?: number };
  if (typeof sub.current_period_end === 'number') {
    return new Date(sub.current_period_end * 1000);
  }
  const latestInvoice = subscription.latest_invoice;
  if (latestInvoice && typeof latestInvoice === 'object' && typeof (latestInvoice as Stripe.Invoice).period_end === 'number') {
    return new Date((latestInvoice as Stripe.Invoice).period_end * 1000);
  }
  return null;
}

export type Plan = 'FREE' | 'PRO';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' | 'TRIALING' | 'NONE';

export interface Entitlement {
  plan: Plan;
  status: SubscriptionStatus;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
}

function defaultEntitlement(): Entitlement {
  return {
    plan: 'FREE',
    status: 'NONE',
    current_period_end: null,
    cancel_at_period_end: false,
  };
}

function isMissingRelationError(error: unknown, relationName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: unknown; message?: unknown };
  const code = typeof maybe.code === 'string' ? maybe.code : '';
  const message = typeof maybe.message === 'string' ? maybe.message : '';
  return code === '42P01' && message.includes(`relation "${relationName}" does not exist`);
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
 * Uses only the database and the current time; never calls Stripe.
 * Pro access stops immediately when current_period_end is in the past.
 */
export async function getEntitlementForUser(userId: string): Promise<Entitlement> {
  const sql = getSql();

  let rows: any[];
  try {
    rows = await sql`
      SELECT plan, status, current_period_end, cancel_at_period_end
      FROM entitlements
      WHERE user_id = ${userId}
    `;
  } catch (error) {
    if (isMissingRelationError(error, 'entitlements')) {
      if (!warnedMissingEntitlementsTable) {
        warnedMissingEntitlementsTable = true;
        console.warn('Billing disabled: missing "entitlements" table. Returning FREE entitlement until billing schema is applied.');
      }
      return defaultEntitlement();
    }
    console.error('Failed to fetch entitlement:', error);
    return defaultEntitlement();
  }

  if (rows.length === 0) {
    return defaultEntitlement();
  }

  const row = rows[0];
  const currentPeriodEnd = row.current_period_end ? new Date(row.current_period_end as string) : null;
  let plan = row.plan as Plan;
  const status = (row.status as string).toUpperCase() as SubscriptionStatus;

  if (plan === 'PRO' && currentPeriodEnd && new Date() > currentPeriodEnd) {
    plan = 'FREE';
  }

  return {
    plan,
    status,
    current_period_end: currentPeriodEnd,
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
  const stripeCustomerId = await getOrCreateStripeCustomerId(userId);

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
  const env = validateBillingEnv();

  // Users who haven't checked out yet won't have a billing customer row.
  // Create one on-demand so "Manage Billing" always works.
  const stripeCustomerId = await getOrCreateStripeCustomerId(userId);

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: env.STRIPE_CUSTOMER_PORTAL_RETURN_URL,
  });

  return { url: session.url };
}

async function getOrCreateStripeCustomerId(userId: string): Promise<string> {
  const stripe = getStripe();
  const sql = getSql();

  const customerRows = await sql`SELECT stripe_customer_id FROM billing_customers WHERE user_id = ${userId}`;
  if (customerRows.length > 0) {
    return customerRows[0].stripe_customer_id as string;
  }

  const customer = await stripe.customers.create({
    metadata: {
      user_id: userId,
    },
  });

  const stripeCustomerId = customer.id;
  await sql`
    INSERT INTO billing_customers (user_id, stripe_customer_id)
    VALUES (${userId}, ${stripeCustomerId})
    ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = ${stripeCustomerId}
  `;

  return stripeCustomerId;
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

  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await updateEntitlementFromSubscription(event);
      break;

    case 'invoice.paid':
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed':
      await updateEntitlementFromInvoice(event);
      break;

    default:
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
    subscription = await stripe.subscriptions.retrieve(session.subscription as string, {
      expand: ['latest_invoice'],
    });
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
  const currentPeriodEnd = getCurrentPeriodEndFromSubscription(subscription);
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
  const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id: string }; parent?: { subscription_details?: { subscription?: string | { id: string } } } };
  const subscriptionRef = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
  if (!subscriptionRef) return;

  const subscriptionId = typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  });

  // Reuse logic
  // We construct a synthetic event or just call the helper with the subscription data
  // Easier to just call the update helper but we need to mock the event structure or refactor.
  // Let's refactor slightly:

  // We'll just call updateEntitlementFromSubscription but we need to pass an event that contains the subscription.
  // Or we create a helper that takes a subscription object.

  const currentPeriodEndFromInvoice =
    typeof invoice.period_end === 'number' ? new Date(invoice.period_end * 1000) : null;

  await updateEntitlementFromSubscriptionObject(subscription, event.id, currentPeriodEndFromInvoice);
}

async function updateEntitlementFromSubscriptionObject(
  subscription: Stripe.Subscription,
  eventId: string,
  currentPeriodEndOverride?: Date | null
) {
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
  const currentPeriodEnd =
    typeof currentPeriodEndOverride === 'undefined'
      ? getCurrentPeriodEndFromSubscription(subscription)
      : currentPeriodEndOverride;
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
