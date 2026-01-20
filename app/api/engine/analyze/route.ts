import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { isDbConfigured, connectToDb } from '@/lib/database'
import { analyzeGameWithEngine } from '@/lib/engineAnalysis'
import { getGamesNeedingAnalysis, storeEngineAnalysis, markAnalysisFailed, getAnalysisCoverage } from '@/lib/engineStorage'
import { computeEngineSummary } from '@/lib/engineSummaryAnalysis'
import { storeEngineSummary } from '@/lib/engineSummaryStorage'
import { enqueueEngineAnalysisJobs } from '@/lib/engineQueue'
import { getEntitlementForUser } from '@/lib/billing'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  const body = await request.json().catch(() => ({} as any))
  const limit = Math.max(1, Math.min(25, Number(body?.limit ?? 5)))
  let analysisDepth = Math.max(8, Math.min(25, Number(body?.analysisDepth ?? process.env.ANALYSIS_DEPTH ?? 15)))
  const mode = (body?.mode ?? 'enqueue') as 'enqueue' | 'inline'

  // Entitlement Gating
  // Free users capped at depth 15
  if (lichessUserId) {
    const entitlement = await getEntitlementForUser(lichessUserId)
    if (entitlement.plan !== 'PRO' && analysisDepth > 15) {
      // Cap depth for free users instead of erroring, for better UX?
      // Or block? The prompt says "Pro routes/features are blocked".
      // Let's cap it to allow usage but restricted.
      analysisDepth = 15;
    }
  } else {
    // If not logged in, strict cap (or fail auth if required, but this route seems to work for system jobs too?)
    // Assuming this route is called by client or cron. If client, they should be logged in.
    // If system/cron, no cookie. We should allow cron to run at requested depth if it's internal.
    // But how do we distinguish?
    // Given the context is "MyChessCoach", this route likely powers the UI analysis button.
    // If lichessUserId is present, we enforce limits.
    // If not present, we assume it might be a background job OR unauthenticated user.
    // Let's safe-guard: if no user, cap at 15.
    analysisDepth = Math.min(analysisDepth, 15);
  }

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
        const result = await analyzeGameWithEngine(g.pgn_text, stockfishPath, playerNames, analysisDepth)
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
