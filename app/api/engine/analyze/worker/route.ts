import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { isDbConfigured, connectToDb } from '@/lib/database'
import { analyzeGameWithEngine } from '@/lib/engineAnalysis'
import { storeEngineAnalysis, markAnalysisFailed } from '@/lib/engineStorage'
import { computeEngineSummary } from '@/lib/engineSummaryAnalysis'
import { storeEngineSummary } from '@/lib/engineSummaryStorage'
import {
  claimEngineAnalysisJobs,
  markEngineAnalysisJobDone,
  markEngineAnalysisJobFailed,
  fetchQueuedGamePgn,
} from '@/lib/engineQueue'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({} as any))
  const limit = Math.max(1, Math.min(10, Number(body?.limit ?? 3)))
  const analysisDepth = Math.max(8, Math.min(25, Number(body?.analysisDepth ?? process.env.ANALYSIS_DEPTH ?? 15)))

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

    const jobs = await claimEngineAnalysisJobs(limit, 'stockfish', analysisDepth)
    if (jobs.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 })
    }

    let succeeded = 0
    let failed = 0

    for (const job of jobs) {
      try {
        const pgnText = await fetchQueuedGamePgn(job.gameId)
        if (!pgnText) {
          throw new Error('Missing PGN for queued game')
        }

        const result = await analyzeGameWithEngine(pgnText, stockfishPath, playerNames, analysisDepth)
        await storeEngineAnalysis(job.gameId, result, 'stockfish')
        await markEngineAnalysisJobDone(job.id)
        succeeded++
      } catch (e: any) {
        const reason = e?.message || 'Unknown engine analysis error'
        await markAnalysisFailed(job.gameId, reason, 'stockfish', null, analysisDepth)
        await markEngineAnalysisJobFailed(job.id, reason)
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

    return NextResponse.json({
      ok: true,
      processed: jobs.length,
      succeeded,
      failed,
      analysisDepth,
    })
  } catch (error: any) {
    console.error('Engine analyze worker failed:', error)
    return NextResponse.json({ error: error.message || 'Engine analysis worker failed' }, { status: 500 })
  }
}
