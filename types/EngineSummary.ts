/**
 * Engine Summary - Authoritative batch analysis of engine-derived metrics
 * This is a FACT-ONLY artifact - no narration, no interpretation
 */

export interface EngineSummary {
  // Metadata
  id: string
  computedAt: string // ISO timestamp
  gameCountUsed: number
  
  // Coverage
  totalGames: number
  gamesWithEngineAnalysis: number
  coveragePercent: number
  
  // Phase 1 metrics (aggregate)
  overall: {
    avgCentipawnLoss: number | null
    blunderRate: number // blunders per game
    mistakeRate: number // mistakes per game
    inaccuracyRate: number // inaccuracies per game
    avgEvalSwingMax: number | null
  }
  
  // Phase-specific metrics
  byPhase: {
    opening: {
      avgCpl: number | null
      blunderRate: number
      gamesInPhase: number
    }
    middlegame: {
      avgCpl: number | null
      blunderRate: number
      gamesInPhase: number
    }
    endgame: {
      avgCpl: number | null
      blunderRate: number
      gamesInPhase: number
    }
  }
  
  // Trends over time (rolling windows)
  trends: {
    recent50: {
      avgCpl: number | null
      blunderRate: number
    }
    previous50: {
      avgCpl: number | null
      blunderRate: number
    }
    cplDelta: number | null // recent - previous
    blunderRateDelta: number // recent - previous
  }
  
  // Engine metadata
  engineInfo: {
    engineName: string
    engineVersion: string | null
    analysisDepth: number
  }
}

export interface StoredEngineSummary {
  id: string
  summary_data: EngineSummary
  computed_at: Date
  game_count_used: number
  created_at: Date
  updated_at: Date
}
