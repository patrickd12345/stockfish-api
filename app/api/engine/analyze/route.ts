import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { isDbConfigured, connectToDb } from '@/lib/database'
import { analyzeGameWithEngineInternal } from '@/lib/engineAnalysis'
import { getGamesNeedingAnalysis, storeEngineAnalysis, markAnalysisFailed, getAnalysisCoverage } from '@/lib/engineStorage'
import { computeEngineSummary } from '@/lib/engineSummaryAnalysis'
import { storeEngineSummary } from '@/lib/engineSummaryStorage'
import { enqueueEngineAnalysisJobs } from '@/lib/engineQueue'
import { requireProEntitlement, ForbiddenError } from '@/lib/entitlementGuard'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  let _userId: string
  try {
    const ent = await requireProEntitlement(request)
    _userId = ent.userId
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 })
    }
    throw e
  }

  const body = await request.json().catch(() => ({} as any))
  const limit = Math.max(1, Math.min(25, Number(body?.limit ?? 5)))
  const analysisDepth = Math.max(8, Math.min(25, Number(body?.analysisDepth ?? process.env.ANALYSIS_DEPTH ?? 15)))
  const mode = (body?.mode ?? 'enqueue') as 'enqueue' | 'inline'

  // Player names for POV + blunder assignment
  const playerNames =
    process.env.CHESS_PLAYER_NAMES?.split(',').map(s => s.trim()).filter(Boolean) ?? [
      'patrickd1234567',
      'patrickd12345678',
      'anonymous19670705',
    ]

  // Stockfish path: prefer env, fall back to bundled binaries
  const stockfishPath =
    process.env.STOCKFISH_PATH?.trim() ||
    (process.platform === 'win32'
      ? path.join(process.cwd(), 'stockfish.exe')
      : path.join(process.cwd(), 'stockfish'))

  try {
    await connectToDb()

    if (mode === 'enqueue') {
      const before = await getAnalysisCoverage('stockfish', analysisDepth)
      const { enqueued, skipped } = await enqueueEngineAnalysisJobs(limit, 'stockfish', analysisDepth)
      const after = await getAnalysisCoverage('stockfish', analysisDepth)

      return NextResponse.json(
        {
          ok: true,
          mode,
          queuedRequested: limit,
          enqueued,
          skipped,
          analysisDepth,
          coverage: {
            before,
            after,
          },
        },
        { status: 202 }
      )
    }

    const before = await getAnalysisCoverage('stockfish', analysisDepth)
    const games = await getGamesNeedingAnalysis(limit, 'stockfish', analysisDepth)

    let succeeded = 0
    let failed = 0

    for (const g of games) {
      try {
        const result = await analyzeGameWithEngineInternal(g.pgn_text, stockfishPath, playerNames, analysisDepth)
        await storeEngineAnalysis(g.id, result, 'stockfish')
        succeeded++
      } catch (e: any) {
        await markAnalysisFailed(g.id, e?.message || 'Unknown engine analysis error', 'stockfish', null, analysisDepth)
        failed++
      }
    }

    // Refresh engine summary (cheap compared to analysis; keeps UI/chat consistent)
    try {
      const summary = await computeEngineSummary()
      await storeEngineSummary(summary)
    } catch (e) {
      // Non-fatal; analysis results are still stored.
      console.warn('Failed to rebuild engine summary:', e)
    }

    const after = await getAnalysisCoverage('stockfish', analysisDepth)

    return NextResponse.json({
      ok: true,
      mode,
      analyzedRequested: limit,
      analyzedReturned: games.length,
      succeeded,
      failed,
      analysisDepth,
      coverage: {
        before,
        after,
      },
    })
  } catch (error: any) {
    console.error('Engine analyze API failed:', error)
    return NextResponse.json({ error: error.message || 'Engine analysis failed' }, { status: 500 })
  }
}
