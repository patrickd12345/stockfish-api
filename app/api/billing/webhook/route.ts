import { NextRequest, NextResponse } from 'next/server';
import { handleWebhook, getStripe } from '@/lib/billing';
import { validateBillingEnv } from '@/lib/env';

export const runtime = 'nodejs';
// We need to disable default body parsing to handle the raw stream for signature verification
// But in Next.js App Router, we just read the text() from request.

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    const env = validateBillingEnv();
    const stripe = getStripe();

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      console.error(`⚠️  Webhook signature verification failed.`, err.message);
      return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
    }

    await handleWebhook(event);

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
