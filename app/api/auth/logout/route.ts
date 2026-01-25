import { NextRequest, NextResponse } from 'next/server'

/**
 * Logout endpoint for Phase 0 authentication.
 * Clears the auth_session cookie.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true })
  
  // Clear auth_session cookie
  response.cookies.delete('auth_session')
  
  return response
}
