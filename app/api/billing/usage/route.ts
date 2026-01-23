import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/entitlementGuard';
import { getUsageForPeriod } from '@/lib/budget';
import { getEntitlementForUser } from '@/lib/billing';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Get entitlement
    const entitlement = await getEntitlementForUser(userId);
    
    // Get usage (only meaningful for Pro users)
    const usage = await getUsageForPeriod(userId);
    
    return NextResponse.json({
      plan: entitlement.plan,
      status: entitlement.status,
      currentPeriodEnd: entitlement.current_period_end,
      usage: {
        cpuMsUsed: usage.cpuMsUsed,
        cpuMsLimit: usage.cpuMsLimit,
        cpuMsRemaining: usage.remaining,
        jobsCount: usage.jobsCount,
        jobsLimit: usage.jobsLimit,
        periodStart: usage.periodStart.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Usage API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch usage' },
      { status: 500 }
    );
  }
}
