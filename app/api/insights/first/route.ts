import { NextRequest, NextResponse } from 'next/server'
import { connectToDb, getSql, isDbConfigured } from '@/lib/database'
import { getAnalysisCoverage } from '@/lib/engineStorage'
import { loadProgressionSummary } from '@/lib/progressionStorage'
import type { OpeningStats } from '@/types/ProgressionSummary'
import {
  buildFirstInsightsFromFacts,
  type BlunderFactRow,
  type MissedTacticFactRow,
  type OpeningExampleRow,
} from '@/lib/firstInsights'

export const dynamic = 'force-dynamic'

const MIN_ANALYZED_GAMES = 20

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function normalizeOpeningLabel(s: string): string {
  return String(s || '').trim()
}

async function getOpeningExample(opening: OpeningStats): Promise<OpeningExampleRow | null> {
  const name = normalizeOpeningLabel(opening.opening)
  if (!name) return null

  const sql = getSql()
  const rows = (await sql`
    SELECT id
    FROM games
    WHERE opening_name = ${name}
    ORDER BY created_at DESC
    LIMIT 1
  `) as Array<{ id: string }>

  const gameId = rows[0]?.id ? String(rows[0].id) : ''
  if (!gameId) return null

  return {
    label: 'Opening performance',
    opening: name,
    winRate: opening.winRate,
    games: opening.games,
    exampleGameId: gameId,
  }
}

async function loadTopBlunders(limit: number, analysisDepth: number): Promise<BlunderFactRow[]> {
  const sql = getSql()

  try {
    const rows = (await sql`
      SELECT game_id, move_number, ply, played_move, best_move, centipawn_loss
      FROM analysis_blunders
      WHERE analysis_depth = ${analysisDepth}
      ORDER BY centipawn_loss DESC, created_at DESC
      LIMIT ${limit}
    `) as Array<Record<string, unknown>>

    return rows.map((r) => ({
      gameId: String(r.game_id),
      moveNumber: Number(r.move_number),
      ply: Number(r.ply),
      playedMove: String(r.played_move),
      bestMove: r.best_move ? String(r.best_move) : null,
      centipawnLoss: Number(r.centipawn_loss),
    }))
  } catch (e) {
    // If the table doesn't exist yet, treat as no blunder facts.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[first-insights] failed to query analysis_blunders:', e)
    }
    return []
  }
}

async function loadTopMissedTactics(limit: number): Promise<MissedTacticFactRow[]> {
  const sql = getSql()

  // We only read stored JSONB; no recomputation.
  const rows = (await sql`
    SELECT game_id, missed_tactics
    FROM engine_analysis
    WHERE analysis_failed = false
    ORDER BY analyzed_at DESC
    LIMIT 200
  `) as Array<{ game_id: string; missed_tactics: unknown }>

  const facts: MissedTacticFactRow[] = []

  for (const row of rows) {
    const gameId = String(row.game_id)
    const raw = row.missed_tactics
    const arr = Array.isArray(raw) ? raw : []
    for (const item of arr) {
      const it = item as any
      const ply = Number(it?.ply)
      const moveNumber = Number(it?.moveNumber)
      const playedMove = typeof it?.playedMove === 'string' ? it.playedMove : ''
      const bestMove = typeof it?.bestMove === 'string' ? it.bestMove : null
      const deltaMagnitude = Number(it?.deltaMagnitude)
      if (!gameId || !Number.isFinite(ply) || ply < 0) continue
      if (!Number.isFinite(moveNumber) || moveNumber <= 0) continue
      if (!Number.isFinite(deltaMagnitude) || deltaMagnitude <= 0) continue
      if (!playedMove) continue
      facts.push({ gameId, ply, moveNumber, playedMove, bestMove, deltaMagnitude })
    }
  }

  facts.sort((a, b) => (b.deltaMagnitude - a.deltaMagnitude) || (b.ply - a.ply) || a.gameId.localeCompare(b.gameId))
  return facts.slice(0, limit)
}

export async function GET(req: NextRequest) {
  const analysisDepth = clampInt(Number(new URL(req.url).searchParams.get('analysisDepth') ?? process.env.ANALYSIS_DEPTH ?? 15), 8, 25)

  if (!isDbConfigured()) {
    return NextResponse.json({
      ok: true,
      ready: false,
      reason: 'Database not configured',
      minAnalyzedGames: MIN_ANALYZED_GAMES,
      coverage: { totalGames: 0, analyzedGames: 0, failedGames: 0, pendingGames: 0 },
      insights: [],
    })
  }

  try {
    await connectToDb()

    const coverage = await getAnalysisCoverage('stockfish', analysisDepth)
    if (coverage.analyzedGames < MIN_ANALYZED_GAMES) {
      return NextResponse.json({
        ok: true,
        ready: false,
        reason: 'Not enough analyzed games yet',
        minAnalyzedGames: MIN_ANALYZED_GAMES,
        analysisDepth,
        coverage,
        insights: [],
      })
    }

    const [missedTactics, blunders, progression] = await Promise.all([
      loadTopMissedTactics(6),
      loadTopBlunders(6, analysisDepth),
      loadProgressionSummary(),
    ])

    const openingExamples: OpeningExampleRow[] = []
    if (progression?.openings?.strongest?.[0]) {
      const ex = await getOpeningExample(progression.openings.strongest[0])
      if (ex) {
        ex.label = 'Strongest opening'
        openingExamples.push(ex)
      }
    }
    if (progression?.openings?.weakest?.[0]) {
      const ex = await getOpeningExample(progression.openings.weakest[0])
      if (ex) {
        ex.label = 'Weakest opening'
        openingExamples.push(ex)
      }
    }

    const insights = buildFirstInsightsFromFacts({
      missedTactics,
      blunders,
      openingExamples,
      maxInsights: 5,
    })

    // Strict rule: no citations => no insights.
    const filtered = insights.filter((i) => (i.evidence?.length ?? 0) > 0)

    return NextResponse.json({
      ok: true,
      ready: filtered.length > 0,
      minAnalyzedGames: MIN_ANALYZED_GAMES,
      analysisDepth,
      coverage,
      generatedAt: new Date().toISOString(),
      insights: filtered,
    })
  } catch (error: any) {
    console.error('First insights API failed:', error)
    // Resilient: return 200 with usable shape.
    return NextResponse.json({
      ok: true,
      ready: false,
      reason: error?.message || 'Failed to build first insights',
      minAnalyzedGames: MIN_ANALYZED_GAMES,
      insights: [],
    })
  }
}

