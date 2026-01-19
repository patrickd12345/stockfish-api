import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/database'
import { buildAndStoreTodayQueue, getDrillsByIds, getPatternSummaries, getTodayQueue } from '@/lib/blunderDna'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured' }, { status: 500 })

  try {
    const today = new Date().toISOString().slice(0, 10)
    const existing = await getTodayQueue(lichessUserId, today)
    const ids = existing.length > 0 ? existing : await buildAndStoreTodayQueue(lichessUserId, today)
    const drills = await getDrillsByIds(lichessUserId, ids)
    const patterns = await getPatternSummaries(lichessUserId)
    return NextResponse.json({ date: today, drills, patterns })
  } catch (error: any) {
    console.error('[Blunder DNA] daily failed:', error)
    return NextResponse.json({ error: error.message || 'Failed to load daily drills' }, { status: 500 })
  }
}

