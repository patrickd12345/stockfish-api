import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured, isNeonQuotaError } from '@/lib/database'
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

  try {
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
  } catch (error: unknown) {
    if (isNeonQuotaError(error)) {
      return NextResponse.json({
        ok: true,
        engineName,
        analysisDepth,
        stats: { total: 0, pending: 0, processing: 0, done: 0, failed: 0, staleProcessing: 0 },
        requeued: { requeued: 0 },
        updatedAt: new Date().toISOString(),
        quotaExceeded: true,
      })
    }
    throw error
  }
}

