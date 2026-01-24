import { NextRequest, NextResponse } from 'next/server';
import { getEntitlementForUser } from '@/lib/billing';
import { getRuntimeCapabilitiesSync } from '@/lib/runtimeCapabilities';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const lichessUserId = request.cookies.get('lichess_user_id')?.value;
    if (!lichessUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In development with hosted DB, return dev entitlement if configured
    if (process.env.NODE_ENV === 'development') {
      const capabilities = getRuntimeCapabilitiesSync();
      if (capabilities.hostedDb && process.env.DEV_ENTITLEMENT === 'PRO') {
        // Return PRO entitlement for dev mode (avoids DB call)
        return NextResponse.json({
          plan: 'PRO',
          status: 'ACTIVE',
          current_period_end: null,
          cancel_at_period_end: false,
        });
      }
    }

    const entitlement = await getEntitlementForUser(lichessUserId);
    return NextResponse.json(entitlement);
  } catch (error: any) {
    // Handle hosted DB guard error gracefully
    if (error.message?.includes('Hosted database access blocked')) {
      console.warn('Billing API: Hosted DB blocked in dev mode. Returning FREE entitlement.');
      return NextResponse.json({
        plan: 'FREE',
        status: 'NONE',
        current_period_end: null,
        cancel_at_period_end: false,
      });
    }
    
    console.error('Failed to fetch entitlement:', error);
    return NextResponse.json({
      plan: 'FREE',
      status: 'NONE',
      current_period_end: null,
      cancel_at_period_end: false,
    });
  }
}
