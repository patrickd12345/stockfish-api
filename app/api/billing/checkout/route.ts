import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/billing';
import { getAuthContext } from '@/lib/auth';

export const runtime = 'nodejs';

function parseMissingBillingEnvVars(error: unknown): string[] | null {
  const message = error instanceof Error ? error.message : '';
  const prefix = 'Missing or invalid Billing environment variables: ';
  if (!message.startsWith(prefix)) return null;

  const json = message.slice(prefix.length).trim();
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return Object.keys(parsed);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = getAuthContext(request);
    if (!authContext?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { interval } = body;

    if (interval !== 'monthly' && interval !== 'yearly') {
      return NextResponse.json({ error: 'Invalid interval' }, { status: 400 });
    }

    const { url } = await createCheckoutSession(authContext.userId, interval);

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error('Checkout session creation failed:', error);
    const missing = parseMissingBillingEnvVars(error);
    if (missing) {
      return NextResponse.json(
        {
          error: `Billing is not configured. Missing env vars: ${missing.join(', ')}`,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
