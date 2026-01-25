import 'server-only'

import type { NextRequest } from 'next/server'

/**
 * Phase 0 Auth: Core authentication helper
 * 
 * Returns user identity from request cookies. Checks Phase 0 auth_session cookie first,
 * then falls back to existing Lichess OAuth flow (lichess_user_id cookie).
 * 
 * This is the single source of truth for user identity across the application.
 * 
 * @param request - Next.js request object
 * @returns User context with userId, or null if not authenticated
 */
export function getAuthContext(request: NextRequest): { userId: string } | null {
  // Check Phase 0 auth cookie first
  const authSession = request.cookies.get('auth_session')?.value
  if (authSession) {
    return { userId: authSession }
  }

  // Fall back to existing Lichess OAuth flow
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (lichessUserId) {
    return { userId: lichessUserId }
  }

  return null
}
