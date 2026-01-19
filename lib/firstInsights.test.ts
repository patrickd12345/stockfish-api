import { describe, expect, it } from 'vitest'
import { buildFirstInsightsFromFacts } from '@/lib/firstInsights'

describe('buildFirstInsightsFromFacts', () => {
  it('emits only insights with (gameId, ply) evidence', () => {
    const insights = buildFirstInsightsFromFacts({
      missedTactics: [
        {
          gameId: 'g1',
          ply: 10,
          moveNumber: 6,
          playedMove: 'Qxd4',
          bestMove: 'Qe2',
          deltaMagnitude: 320,
        },
      ],
      blunders: [
        {
          gameId: 'g2',
          ply: 22,
          moveNumber: 12,
          playedMove: 'Bxf7+',
          bestMove: 'Be2',
          centipawnLoss: 650,
        },
      ],
      openingExamples: [
        {
          label: 'Strongest opening',
          opening: 'Sicilian Defense',
          winRate: 0.72,
          games: 18,
          exampleGameId: 'g3',
        },
      ],
    })

    expect(insights.length).toBeGreaterThan(0)
    for (const insight of insights) {
      expect(Array.isArray(insight.evidence)).toBe(true)
      expect(insight.evidence.length).toBeGreaterThan(0)
      for (const ev of insight.evidence) {
        expect(typeof ev.gameId).toBe('string')
        expect(ev.gameId.length).toBeGreaterThan(0)
        expect(Number.isFinite(ev.ply)).toBe(true)
        expect(ev.ply).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('sorts missed tactics by delta and blunders by loss', () => {
    const insights = buildFirstInsightsFromFacts({
      missedTactics: [
        { gameId: 'a', ply: 1, moveNumber: 1, playedMove: 'a3', bestMove: 'd4', deltaMagnitude: 50 },
        { gameId: 'b', ply: 2, moveNumber: 2, playedMove: 'h4', bestMove: 'Nf3', deltaMagnitude: 400 },
      ],
      blunders: [
        { gameId: 'c', ply: 3, moveNumber: 2, playedMove: 'Qh5', bestMove: 'e4', centipawnLoss: 900 },
        { gameId: 'd', ply: 4, moveNumber: 3, playedMove: 'g4', bestMove: 'd4', centipawnLoss: 100 },
      ],
      maxInsights: 4,
    })

    expect(insights[0]?.id).toContain('missed-tactic:b:2')
    expect(insights[1]?.id).toContain('missed-tactic:a:1')
    expect(insights[2]?.id).toContain('blunder:c:3')
    expect(insights[3]?.id).toContain('blunder:d:4')
  })
})

