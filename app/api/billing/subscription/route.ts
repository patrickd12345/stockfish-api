import { NextRequest, NextResponse } from 'next/server';
import { getEntitlementForUser } from '@/lib/billing';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const lichessUserId = request.cookies.get('lichess_user_id')?.value;
    if (!lichessUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entitlement = await getEntitlementForUser(lichessUserId);
    return NextResponse.json(entitlement);
  } catch (error: any) {
    console.error('Failed to fetch entitlement:', error);
    return NextResponse.json({
      plan: 'FREE',
      status: 'NONE',
      current_period_end: null,
      cancel_at_period_end: false,
    });
  }
}
