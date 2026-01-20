import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const lichessUserId = request.cookies.get('lichess_user_id')?.value;
    if (!lichessUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { interval } = body;

    if (interval !== 'monthly' && interval !== 'yearly') {
      return NextResponse.json({ error: 'Invalid interval' }, { status: 400 });
    }

    const { url } = await createCheckoutSession(lichessUserId, interval);

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error('Checkout session creation failed:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
