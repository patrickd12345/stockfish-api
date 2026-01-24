import { NextRequest, NextResponse } from 'next/server'
import { connectToDb, getSql, isDbConfigured, isNeonQuotaError } from '@/lib/database'
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
const CACHE_TTL_MS = 15_000
const QUOTA_CIRCUIT_BREAKER_MS = 60_000

type FirstInsightsResponse = {
  ok: true
  ready: boolean
  reason?: string
  errorCode?: 'db_quota' | 'db_error'
  retryable?: boolean
  nextPollMs?: number
  minAnalyzedGames: number
  analysisDepth?: number
  coverage?: { totalGames: number; analyzedGames: number; failedGames: number; pendingGames: number }
  generatedAt?: string
  insights: any[]
}

const cacheByDepth = new Map<number, { at: number; payload: FirstInsightsResponse }>()
let quotaBlockedUntil = 0

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

  try {
    // We only read stored JSONB; no recomputation.
    // IMPORTANT: Do JSONB expansion in Postgres so we don't transfer large blobs.
    const rows = (await sql`
      SELECT
        ea.game_id,
        (t.elem->>'ply')::int AS ply,
        (t.elem->>'moveNumber')::int AS move_number,
        (t.elem->>'playedMove')::text AS played_move,
        NULLIF((t.elem->>'bestMove')::text, '') AS best_move,
        (t.elem->>'deltaMagnitude')::double precision AS delta_magnitude
      FROM engine_analysis ea
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ea.missed_tactics, '[]'::jsonb)) AS t(elem)
      WHERE ea.analysis_failed = false
        AND ea.missed_tactics IS NOT NULL
        AND (t.elem->>'playedMove') IS NOT NULL
        AND (t.elem->>'playedMove') <> ''
        AND (t.elem->>'ply') ~ '^[0-9]+$'
        AND (t.elem->>'moveNumber') ~ '^[0-9]+$'
        AND (t.elem->>'deltaMagnitude') ~ '^[0-9]+(\\.[0-9]+)?$'
      ORDER BY (t.elem->>'deltaMagnitude')::double precision DESC NULLS LAST, ea.analyzed_at DESC
      LIMIT ${limit}
    `) as Array<Record<string, unknown>>

    return rows.map((r) => ({
      gameId: String(r.game_id),
      ply: Number(r.ply),
      moveNumber: Number(r.move_number),
      playedMove: String(r.played_move),
      bestMove: r.best_move ? String(r.best_move) : null,
      deltaMagnitude: Number(r.delta_magnitude),
    }))
  } catch (e) {
    // If column/table doesn't exist yet (or JSON format differs), treat as no facts.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[first-insights] failed to query missed_tactics:', e)
    }
    return []
  }
}

export async function GET(req: NextRequest) {
  const analysisDepth = clampInt(Number(new URL(req.url).searchParams.get('analysisDepth') ?? process.env.ANALYSIS_DEPTH ?? 15), 8, 25)

  if (!isDbConfigured()) {
    const payload: FirstInsightsResponse = {
      ok: true,
      ready: false,
      reason: 'Database not configured',
      retryable: false,
      minAnalyzedGames: MIN_ANALYZED_GAMES,
      coverage: { totalGames: 0, analyzedGames: 0, failedGames: 0, pendingGames: 0 },
      insights: [],
    }
    return NextResponse.json(payload)
  }

  try {
    const now = Date.now()
    if (quotaBlockedUntil > now) {
      const payload: FirstInsightsResponse = {
        ok: true,
        ready: false,
        reason: 'Database transfer quota exceeded. Insights are temporarily unavailable.',
        errorCode: 'db_quota',
        retryable: false,
        minAnalyzedGames: MIN_ANALYZED_GAMES,
        analysisDepth,
        coverage: { totalGames: 0, analyzedGames: 0, failedGames: 0, pendingGames: 0 },
        insights: [],
      }
      return NextResponse.json(payload)
    }

    const cached = cacheByDepth.get(analysisDepth)
    if (cached && now - cached.at < CACHE_TTL_MS) {
      return NextResponse.json(cached.payload)
    }

    await connectToDb()

    const coverage = await getAnalysisCoverage('stockfish', analysisDepth)
    if (coverage.analyzedGames < MIN_ANALYZED_GAMES) {
      const payload: FirstInsightsResponse = {
        ok: true,
        ready: false,
        reason: 'Not enough analyzed games yet',
        minAnalyzedGames: MIN_ANALYZED_GAMES,
        analysisDepth,
        coverage,
        retryable: coverage.pendingGames > 0,
        nextPollMs: coverage.pendingGames > 0 ? 5_000 : undefined,
        insights: [],
      }
      cacheByDepth.set(analysisDepth, { at: now, payload })
      return NextResponse.json(payload)
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

    const payload: FirstInsightsResponse = {
      ok: true,
      ready: filtered.length > 0,
      minAnalyzedGames: MIN_ANALYZED_GAMES,
      analysisDepth,
      coverage,
      generatedAt: new Date().toISOString(),
      retryable: false,
      insights: filtered,
    }

    cacheByDepth.set(analysisDepth, { at: now, payload })
    return NextResponse.json(payload)
  } catch (error: any) {
    if (isNeonQuotaError(error)) {
      quotaBlockedUntil = Date.now() + QUOTA_CIRCUIT_BREAKER_MS
      console.error('First insights API failed (Neon quota):', error)
      const payload: FirstInsightsResponse = {
        ok: true,
        ready: false,
        reason: 'Database transfer quota exceeded. Insights are temporarily unavailable.',
        errorCode: 'db_quota',
        retryable: false,
        minAnalyzedGames: MIN_ANALYZED_GAMES,
        analysisDepth,
        coverage: { totalGames: 0, analyzedGames: 0, failedGames: 0, pendingGames: 0 },
        insights: [],
      }
      return NextResponse.json(payload)
    }

    console.error('First insights API failed:', error)
    // Resilient: return 200 with usable shape.
    const payload: FirstInsightsResponse = {
      ok: true,
      ready: false,
      reason: 'Failed to build first insights',
      errorCode: 'db_error',
      retryable: false,
      minAnalyzedGames: MIN_ANALYZED_GAMES,
      analysisDepth,
      insights: [],
    }
    return NextResponse.json(payload)
  }
}

