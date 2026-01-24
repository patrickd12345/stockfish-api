import type { NextRequest } from 'next/server'
import { FeatureAccessError, requireFeatureForUser } from '@/lib/featureGate/server'

export class LichessAccessError extends Error {
  public readonly status: number

  constructor(message: string, status: number = 403) {
    super(message)
    this.name = 'LichessAccessError'
    this.status = status
  }
}

export async function requireLichessLiveAccess(request: NextRequest): Promise<string> {
  const userId = request.cookies.get('lichess_user_id')?.value ?? null
  if (!userId) {
    throw new LichessAccessError('Authentication required', 403)
  }
  try {
    await requireFeatureForUser('lichess_live', { userId })
  } catch (error: any) {
    if (error instanceof FeatureAccessError) {
      throw new LichessAccessError(error.message, 403)
    }
    throw error
  }
  return userId
}
