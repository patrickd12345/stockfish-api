import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured, isNeonQuotaError } from '@/lib/database'
import { buildAndStoreTodayQueue, getDrillsByIds, getPatternSummaries, getTodayQueue } from '@/lib/blunderDna'
import { getRuntimeCapabilitiesSync } from '@/lib/runtimeCapabilities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  // In development with hosted DB, return empty data to avoid quota errors
  if (process.env.NODE_ENV === 'development') {
    const capabilities = getRuntimeCapabilitiesSync()
    if (capabilities.hostedDb && process.env.LOCAL_DB !== 'true') {
      console.warn('[Blunder DNA] daily: Hosted DB blocked in dev mode. Returning empty drills.')
      const today = new Date().toISOString().slice(0, 10)
      return NextResponse.json({ date: today, drills: [], patterns: [] })
    }
  }
  
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured' }, { status: 500 })

  try {
    const today = new Date().toISOString().slice(0, 10)
    const existing = await getTodayQueue(lichessUserId, today)
    const ids = existing.length > 0 ? existing : await buildAndStoreTodayQueue(lichessUserId, today)
    const drills = await getDrillsByIds(lichessUserId, ids)
    const patterns = await getPatternSummaries(lichessUserId)
    return NextResponse.json({ date: today, drills, patterns })
  } catch (error: any) {
    if (isNeonQuotaError(error)) {
      console.warn('[Blunder DNA] daily: Neon quota exceeded. Returning empty drills.')
      const today = new Date().toISOString().slice(0, 10)
      return NextResponse.json({
        date: today,
        drills: [],
        patterns: [],
        quotaExceeded: true,
        error: 'Database data transfer quota exceeded. Upgrade your database plan or try again later.',
      })
    }
    // Handle hosted DB guard error gracefully
    if (error.message?.includes('Hosted database access blocked')) {
      console.warn('[Blunder DNA] daily: Hosted DB blocked. Returning empty drills.')
      const today = new Date().toISOString().slice(0, 10)
      return NextResponse.json({ date: today, drills: [], patterns: [] })
    }
    console.error('[Blunder DNA] daily failed:', error)
    return NextResponse.json({ error: error.message || 'Failed to load daily drills' }, { status: 500 })
  }
}

