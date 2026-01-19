import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/database'
import { recordAttempt } from '@/lib/blunderDna'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured' }, { status: 500 })

  try {
    const body = await request.json().catch(() => ({}))
    const drillId = typeof body.drillId === 'string' ? body.drillId : null
    const userMove = typeof body.userMove === 'string' ? body.userMove : null
    const ok = !!body.ok
    if (!drillId) return NextResponse.json({ error: 'Missing drillId' }, { status: 400 })

    await recordAttempt({ lichessUserId, drillId, userMove, ok })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[Blunder DNA] attempt failed:', error)
    return NextResponse.json({ error: error.message || 'Failed to record attempt' }, { status: 500 })
  }
}

