import { NextRequest } from 'next/server';
import { getEntitlementForUser, type Entitlement } from './billing';

export class ForbiddenError extends Error {
  public readonly code = 'PRO_REQUIRED';
  
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Require Pro entitlement for server-side analysis.
 * Extracts lichess_user_id from cookie and verifies Pro plan.
 * Throws ForbiddenError if user is not authenticated or not Pro.
 */
export async function requireProEntitlement(
  request: NextRequest
): Promise<{ userId: string; entitlement: Entitlement }> {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value;
  
  if (!lichessUserId) {
    throw new ForbiddenError('Authentication required');
  }
  
  const entitlement = await getEntitlementForUser(lichessUserId);
  
  if (entitlement.plan !== 'PRO') {
    throw new ForbiddenError('Pro subscription required for server-side analysis');
  }
  
  return { userId: lichessUserId, entitlement };
}

/**
 * Get user ID from request (for Free-tier read-only operations).
 * Returns null if not authenticated.
 */
export async function getUserIdFromRequest(
  request: NextRequest
): Promise<string | null> {
  return request.cookies.get('lichess_user_id')?.value || null;
}
