import { formatEngineSummaryForPrompt, formatProgressionSummaryForPrompt } from '@/lib/promptFormatters'
import type { EngineSummary } from '@/types/EngineSummary'
import type { ProgressionSummary } from '@/types/ProgressionSummary'

describe('lib/promptFormatters', () => {
  it('formats ProgressionSummary with authoritative markers and key stats', () => {
    const summary: ProgressionSummary = {
      id: 's1',
      computedAt: '2026-01-18T00:00:00.000Z',
      gameCountUsed: 100,
      totalGames: 100,
      period: { start: '2026-01-01', end: '2026-01-18', days: 17 },
      overall: {
        winRate: 0.6,
        drawRate: 0.1,
        lossRate: 0.3,
        avgAccuracy: 88.2,
        avgBlunders: 0.25,
        gamesWithAccuracy: 80,
        gamesWithBlunderData: 100,
        unknownResults: 0,
      },
      trends: {
        accuracy: { direction: 'improving', deltaLast50: 3.3 },
        blunders: { direction: 'stable', deltaLast50: 0 },
        winRate: { direction: 'declining', deltaLast50: -0.1 },
      },
      openings: {
        strongest: [{ opening: 'Sicilian Defense', games: 10, winRate: 0.8, avgBlunders: 0.1 }],
        weakest: [{ opening: 'French Defense', games: 10, winRate: 0.2, avgBlunders: 0.6 }],
        mostPlayed: [{ opening: 'Sicilian Defense', games: 10, winRate: 0.8, avgBlunders: 0.1 }],
      },
      phases: {
        opening: { avgAccuracy: 85, avgBlunders: 0.2 },
        middlegame: { avgAccuracy: 88, avgBlunders: 0.25 },
        endgame: { avgAccuracy: 92, avgBlunders: 0.1 },
      },
      gamesPerWeek: 40 / (17 / 7),
      peakPerformancePeriod: { start: '2026-01-01', end: '2026-01-10', winRate: 0.9, gameCount: 20 },
      signals: {
        accuracyTrend: 'improving',
        blunderTrend: 'stable',
        winRateTrend: 'declining',
        accuracyDeltaLast100: 6.6,
        blunderDeltaLast100: 0,
        winRateDeltaLast100: -0.2,
      },
    }

    const out = formatProgressionSummaryForPrompt(summary)
    expect(out).toContain('=== PLAYER CAREER SUMMARY (AUTHORITATIVE) ===')
    expect(out).toContain('=== DEBUG: PROGRESSION SUMMARY PRESENT ===')
    expect(out).toContain('Total games analyzed: 100')
    expect(out).toContain('Win rate: 60.0%')
    expect(out).toContain('Average accuracy: 88.2%')
    expect(out).toContain('Average blunders per game: 0.25')
    expect(out).toContain('--- TOP OPENINGS ---')
    expect(out).toContain('Sicilian Defense')
  })

  it('formats ProgressionSummary with missing accuracy data', () => {
    const summary: ProgressionSummary = {
      id: 's2',
      computedAt: '2026-01-18T00:00:00.000Z',
      gameCountUsed: 1,
      totalGames: 1,
      period: { start: '2026-01-18', end: '2026-01-18', days: 0 },
      overall: {
        winRate: 0,
        drawRate: 0,
        lossRate: 0,
        avgBlunders: 0,
        gamesWithAccuracy: 0,
        gamesWithBlunderData: 0,
        unknownResults: 1,
      },
      trends: {
        accuracy: { direction: 'insufficient_data' },
        blunders: { direction: 'insufficient_data' },
        winRate: { direction: 'insufficient_data' },
      },
      openings: { strongest: [], weakest: [], mostPlayed: [] },
      gamesPerWeek: 0,
      signals: {
        accuracyTrend: 'insufficient_data',
        blunderTrend: 'insufficient_data',
        winRateTrend: 'insufficient_data',
      },
    }

    const out = formatProgressionSummaryForPrompt(summary)
    expect(out).toContain('Average accuracy: No data available')
    expect(out).toContain('Unknown/unfinished results: 1 games')
  })

  it('formats EngineSummary with authoritative markers and trend icons', () => {
    const summary: EngineSummary = {
      id: 'e1',
      computedAt: '2026-01-18T00:00:00.000Z',
      gameCountUsed: 10,
      totalGames: 10,
      gamesWithEngineAnalysis: 10,
      coveragePercent: 100,
      overall: {
        avgCentipawnLoss: 32.1,
        blunderRate: 0.2,
        mistakeRate: 0.4,
        inaccuracyRate: 0.9,
        avgEvalSwingMax: 180.5,
      },
      byPhase: {
        opening: { avgCpl: 25, blunderRate: 0.1, gamesInPhase: 10 },
        middlegame: { avgCpl: 35, blunderRate: 0.25, gamesInPhase: 10 },
        endgame: { avgCpl: 40, blunderRate: 0.3, gamesInPhase: 10 },
      },
      trends: {
        recent50: { avgCpl: 30, blunderRate: 0.1 },
        previous50: { avgCpl: 35, blunderRate: 0.2 },
        cplDelta: -5,
        blunderRateDelta: -0.1,
      },
      engineInfo: { engineName: 'stockfish', engineVersion: '16', analysisDepth: 15 },
    }

    const out = formatEngineSummaryForPrompt(summary)
    expect(out).toContain('=== ENGINE ANALYSIS SUMMARY (AUTHORITATIVE) ===')
    expect(out).toContain('=== DEBUG: ENGINE SUMMARY PRESENT ===')
    expect(out).toContain('CoveragePercent: 100.0%')
    expect(out).toContain('Average centipawn loss: 32.1')
    // CPL delta < 0 should render 📈
    expect(out).toContain('CPL trend: 📈')
  })
})

