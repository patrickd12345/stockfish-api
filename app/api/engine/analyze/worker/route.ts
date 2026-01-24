import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { isDbConfigured, connectToDb } from '@/lib/database'
import { analyzeGameWithEngineInternal } from '@/lib/engineAnalysis'
import { storeEngineAnalysis, markAnalysisFailed } from '@/lib/engineStorage'
import { computeEngineSummary } from '@/lib/engineSummaryAnalysis'
import { storeEngineSummary } from '@/lib/engineSummaryStorage'
import {
  claimEngineAnalysisJobs,
  markEngineAnalysisJobDone,
  markEngineAnalysisJobFailed,
  fetchQueuedGamePgn,
  enqueueEngineAnalysisJobs,
} from '@/lib/engineQueue'
import { FeatureAccessError, requireFeatureForUser } from '@/lib/featureGate/server'
import { recordUsageWithAdjustment, estimateCpuMs } from '@/lib/budget'

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

    const userId = request.cookies.get('lichess_user_id')?.value ?? null
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 403 })
    }
    try {
      await requireFeatureForUser('engine_analysis', { userId })
    } catch (error: any) {
      if (error instanceof FeatureAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 })
      }
      throw error
    }

    let jobs = await claimEngineAnalysisJobs(limit, 'stockfish', analysisDepth)
    let autoEnqueued = 0
    if (jobs.length === 0) {
      // Self-heal: if nothing is queued but there is pending work in coverage, enqueue a small batch and try once.
      const enq = await enqueueEngineAnalysisJobs(25, 'stockfish', analysisDepth).catch(() => null)
      autoEnqueued = enq?.enqueued ?? 0
      jobs = await claimEngineAnalysisJobs(limit, 'stockfish', analysisDepth)
      if (jobs.length === 0) {
        return NextResponse.json({ ok: true, processed: 0, autoEnqueued })
      }
    }

    let succeeded = 0
    let failed = 0

    for (const job of jobs) {
      try {
        const pgnText = await fetchQueuedGamePgn(job.gameId)
        if (!pgnText) {
          // This can happen if the queue contains an orphaned job (game deleted) or a row with empty PGN.
          // Do NOT attempt to write into engine_analysis (will violate FK); just fail the queue entry and move on.
          await markEngineAnalysisJobFailed(job.id, 'Missing game/PGN for queued job')
          failed++
          continue
        }

        // Estimate CPU time for budget tracking
        const chess = new (await import('chess.js')).Chess()
        try {
          chess.loadPgn(pgnText)
        } catch {
          await markEngineAnalysisJobFailed(job.id, 'Invalid PGN')
          failed++
          continue
        }
        const gameLength = chess.history().length
        const estimatedCpuMs = estimateCpuMs(analysisDepth, gameLength, 'game')
        
        // Note: Budget is checked when jobs are enqueued, not here.
        // But we still track usage for the worker's user.
        const startTime = Date.now()
        
        const result = await analyzeGameWithEngineInternal(pgnText, stockfishPath, playerNames, analysisDepth)
        await storeEngineAnalysis(job.gameId, result, 'stockfish')
        await markEngineAnalysisJobDone(job.id)
        
        // Record usage (approximate - actual CPU time)
        const actualCpuMs = Date.now() - startTime
        try {
          await recordUsageWithAdjustment(userId, estimatedCpuMs, actualCpuMs, 'game')
        } catch {
          // If usage tracking fails, continue (non-fatal)
        }
        
        succeeded++
      } catch (e: any) {
        const reason = e?.message || 'Unknown engine analysis error'
        const code = e?.code ? String(e.code) : null
        const reasonLower = String(reason).toLowerCase()

        // If the game row is missing, engine_analysis writes will violate FK. Keep the worker healthy by
        // only marking the queue entry failed.
        const isMissingGame =
          code === '23503' ||
          reasonLower.includes('is not present in table') ||
          reasonLower.includes('violates foreign key') ||
          reasonLower.includes('missing game')

        if (!isMissingGame) {
          try {
            await markAnalysisFailed(job.gameId, reason, 'stockfish', null, analysisDepth)
          } catch (err) {
            console.warn('Failed to record engine_analysis failure (continuing):', err)
          }
        }

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
      autoEnqueued,
    })
  } catch (error: any) {
    console.error('Engine analyze worker failed:', error)
    return NextResponse.json({ error: error.message || 'Engine analysis worker failed' }, { status: 500 })
  }
}
