import type { NextRequest } from 'next/server'
import { FeatureAccessError, requireFeatureForUser } from '@/lib/featureGate/server'
import { getAuthContext } from '@/lib/auth'

export class LichessAccessError extends Error {
  public readonly status: number

  constructor(message: string, status: number = 403) {
    super(message)
    this.name = 'LichessAccessError'
    this.status = status
  }
}

export async function requireLichessLiveAccess(request: NextRequest): Promise<string> {
  // Check app authentication first
  const authContext = getAuthContext(request)
  if (!authContext) {
    throw new LichessAccessError('Authentication required', 403)
  }

  // For Lichess features, we need the lichess_user_id cookie (not just app auth)
  const lichessUserId = request.cookies.get('lichess_user_id')?.value ?? null
  if (!lichessUserId) {
    throw new LichessAccessError('Lichess account not connected. Please connect your Lichess account.', 403)
  }

  try {
    // Gate on the authenticated app user (entitlements are keyed by app identity),
    // while still requiring a connected Lichess account via cookie.
    await requireFeatureForUser('lichess_live', { userId: authContext.userId })
  } catch (error: any) {
    if (error instanceof FeatureAccessError) {
      throw new LichessAccessError(error.message, 403)
    }
    throw error
  }
  return lichessUserId
}
