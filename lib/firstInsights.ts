export interface FirstInsightEvidence {
  gameId: string
  ply: number
  moveNumber?: number
  playedMove?: string
  bestMove?: string | null
  metricLabel?: string
  metricValue?: number
}

export interface FirstInsight {
  id: string
  title: string
  detail: string
  evidence: FirstInsightEvidence[]
}

export interface BlunderFactRow {
  gameId: string
  moveNumber: number
  ply: number
  playedMove: string
  bestMove: string | null
  centipawnLoss: number
}

export interface MissedTacticFactRow {
  gameId: string
  moveNumber: number
  ply: number
  playedMove: string
  bestMove: string | null
  deltaMagnitude: number
}

export interface OpeningExampleRow {
  label: string
  opening: string
  winRate: number
  games: number
  exampleGameId: string
}

function isValidEvidence(e: FirstInsightEvidence): boolean {
  return (
    typeof e?.gameId === 'string' &&
    e.gameId.length > 0 &&
    Number.isFinite(e.ply) &&
    e.ply >= 0
  )
}

function sanitizeTitle(s: string): string {
  const trimmed = String(s || '').trim()
  return trimmed || 'Insight'
}

function formatCp(n: number): string {
  if (!Number.isFinite(n)) return '--'
  return `${Math.round(n)}cp`
}

/**
 * Build 3–5 post-import "First Insights" bullets from stored, factual artifacts.
 * Every insight MUST include at least one (gameId, ply) evidence citation.
 */
export function buildFirstInsightsFromFacts(params: {
  missedTactics: MissedTacticFactRow[]
  blunders: BlunderFactRow[]
  openingExamples?: OpeningExampleRow[]
  maxInsights?: number
}): FirstInsight[] {
  const maxInsights = Math.max(1, Math.min(5, Number(params.maxInsights ?? 5)))

  const missedTactics = Array.isArray(params.missedTactics) ? [...params.missedTactics] : []
  missedTactics.sort((a, b) => (b.deltaMagnitude - a.deltaMagnitude) || (b.ply - a.ply) || a.gameId.localeCompare(b.gameId))

  const blunders = Array.isArray(params.blunders) ? [...params.blunders] : []
  blunders.sort((a, b) => (b.centipawnLoss - a.centipawnLoss) || (b.ply - a.ply) || a.gameId.localeCompare(b.gameId))

  const out: FirstInsight[] = []

  // 1) Missed tactics (top 2)
  for (const mt of missedTactics.slice(0, 2)) {
    const evidence: FirstInsightEvidence = {
      gameId: mt.gameId,
      ply: mt.ply,
      moveNumber: mt.moveNumber,
      playedMove: mt.playedMove,
      bestMove: mt.bestMove,
      metricLabel: 'tactic_delta',
      metricValue: mt.deltaMagnitude,
    }
    if (!isValidEvidence(evidence)) continue

    out.push({
      id: `missed-tactic:${mt.gameId}:${mt.ply}`,
      title: sanitizeTitle('Missed tactic'),
      detail: `Move ${mt.moveNumber}: played ${mt.playedMove}${mt.bestMove ? `, best was ${mt.bestMove}` : ''} (Δ≈${formatCp(mt.deltaMagnitude)})`,
      evidence: [evidence],
    })
    if (out.length >= maxInsights) return out
  }

  // 2) Biggest blunders (top 2)
  for (const b of blunders.slice(0, 2)) {
    const evidence: FirstInsightEvidence = {
      gameId: b.gameId,
      ply: b.ply,
      moveNumber: b.moveNumber,
      playedMove: b.playedMove,
      bestMove: b.bestMove,
      metricLabel: 'centipawn_loss',
      metricValue: b.centipawnLoss,
    }
    if (!isValidEvidence(evidence)) continue

    out.push({
      id: `blunder:${b.gameId}:${b.ply}`,
      title: sanitizeTitle('Big blunder'),
      detail: `Move ${b.moveNumber}: played ${b.playedMove}${b.bestMove ? `, best was ${b.bestMove}` : ''} (loss≈${formatCp(b.centipawnLoss)})`,
      evidence: [evidence],
    })
    if (out.length >= maxInsights) return out
  }

  // 3) Opening performance bullets (optional; cite by linking to the example game at ply 0)
  const openingExamples = Array.isArray(params.openingExamples) ? params.openingExamples : []
  for (const ex of openingExamples.slice(0, 2)) {
    const evidence: FirstInsightEvidence = {
      gameId: ex.exampleGameId,
      ply: 0,
      metricLabel: 'opening_win_rate',
      metricValue: ex.winRate,
    }
    if (!isValidEvidence(evidence)) continue

    out.push({
      id: `opening:${ex.label}:${ex.opening}`,
      title: sanitizeTitle(`${ex.label}: ${ex.opening}`),
      detail: `Win rate ${(ex.winRate * 100).toFixed(1)}% over ${ex.games} games (example linked)`,
      evidence: [evidence],
    })
    if (out.length >= maxInsights) return out
  }

  // Filter any accidental no-evidence entries (hard rule).
  return out.filter((i) => Array.isArray(i.evidence) && i.evidence.some(isValidEvidence)).slice(0, maxInsights)
}

