import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/database'
import { getEngineQueueStats, requeueStaleProcessingJobs } from '@/lib/engineQueue'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const analysisDepth = Math.max(
    8,
    Math.min(25, Number(request.nextUrl.searchParams.get('analysisDepth') ?? process.env.ANALYSIS_DEPTH ?? 15))
  )

  const engineName = String(request.nextUrl.searchParams.get('engineName') ?? 'stockfish')
  const requeue = String(request.nextUrl.searchParams.get('requeue') ?? 'false') === 'true'

  const requeued = requeue
    ? await requeueStaleProcessingJobs({ engineName, analysisDepth }).catch(() => ({ requeued: 0 }))
    : { requeued: 0 }

  const stats = await getEngineQueueStats(engineName, analysisDepth)

  return NextResponse.json({
    ok: true,
    engineName,
    analysisDepth,
    stats,
    requeued,
    updatedAt: new Date().toISOString(),
  })
}

