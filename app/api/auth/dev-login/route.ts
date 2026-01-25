// DEV-ONLY AUTH BOOTSTRAP — REMOVE WHEN REAL AUTH IS IMPLEMENTED

import { NextRequest, NextResponse } from 'next/server'
import { connectToDb, getSql } from '@/lib/database'

export const runtime = 'nodejs'

/**
 * DEV-only login endpoint for Phase 0 authentication bootstrap.
 * Creates or retrieves a DEV user and sets an auth_session cookie.
 * 
 * This endpoint is only available in development mode.
 * In production, it returns 404.
 */
export async function POST(request: NextRequest) {
  // Enforce DEV-only access
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dev-login/route.ts:15',message:'DEV login endpoint called',data:{cookies:Object.fromEntries(request.cookies.getAll().map(c => [c.name, c.value]))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  try {
    await connectToDb()
    const sql = getSql()

    // Use a stable DEV user ID
    const devUserId = 'dev-user'

    // Create user if it doesn't exist (idempotent)
    await sql`
      INSERT INTO users (id, created_at)
      VALUES (${devUserId}, now())
      ON CONFLICT (id) DO NOTHING
    `

    // Set auth_session cookie with same security settings as lichess_user_id
    // In development, secure cookies are not required (localhost)
    const isSecure = false

    const response = NextResponse.json({ userId: devUserId })
    response.cookies.set('auth_session', devUserId, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    })

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dev-login/route.ts:47',message:'Cookie set in response',data:{userId:devUserId,isSecure,setCookieHeader:response.headers.get('set-cookie')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    return response
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dev-login/route.ts:50',message:'DEV login error',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    console.error('[DEV Auth] Login failed:', error)
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
