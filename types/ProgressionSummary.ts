export interface TimeWindow {
  start: string // ISO date string
  end: string   // ISO date string
  label: string // Human readable label like "Last 7 days"
  gameCount: number
}

export interface TrendDirection {
  direction: 'improving' | 'declining' | 'stable' | 'insufficient_data'
  deltaLast100?: number // Change over last 100 games
  deltaLast50?: number  // Change over last 50 games
}

export interface OpeningStats {
  opening: string
  games: number
  winRate: number
  avgAccuracy?: number
  avgBlunders: number
}

export interface PhasePerformance {
  opening: {
    avgAccuracy?: number
    avgBlunders: number
  }
  middlegame: {
    avgAccuracy?: number
    avgBlunders: number
  }
  endgame: {
    avgAccuracy?: number
    avgBlunders: number
  }
}

export interface ProgressionSummary {
  // Metadata
  id: string
  computedAt: string // ISO timestamp
  gameCountUsed: number
  
  // Basic stats
  totalGames: number
  period: {
    start: string // First game date
    end: string   // Last game date
    days: number  // Total days spanned
  }
  
  // Overall performance
  overall: {
    winRate: number     // 0.0 - 1.0 (from decisive games only)
    drawRate: number    // 0.0 - 1.0 (from decisive games only)
    lossRate: number    // 0.0 - 1.0 (from decisive games only)
    avgAccuracy?: number // Only if accuracy data exists
    avgBlunders: number
    // Data coverage metrics
    gamesWithAccuracy: number
    gamesWithBlunderData: number
    unknownResults: number
  }
  
  // Trends (comparing recent vs historical)
  trends: {
    accuracy: TrendDirection
    blunders: TrendDirection
    winRate: TrendDirection
  }
  
  // Opening analysis
  openings: {
    strongest: OpeningStats[]  // Top 5 by win rate (min 3 games)
    weakest: OpeningStats[]    // Bottom 5 by win rate (min 3 games)
    mostPlayed: OpeningStats[] // Top 5 by frequency
  }
  
  // Phase performance (optional, if data exists)
  phases?: PhasePerformance
  
  // Time-based metrics
  gamesPerWeek: number
  peakPerformancePeriod?: {
    start: string
    end: string
    winRate: number
    gameCount: number
  }
  
  // Neutral signals (facts only, no interpretation)
  signals: {
    accuracyTrend: 'improving' | 'declining' | 'stable' | 'insufficient_data'
    blunderTrend: 'improving' | 'declining' | 'stable' | 'insufficient_data'
    winRateTrend: 'improving' | 'declining' | 'stable' | 'insufficient_data'
    accuracyDeltaLast100?: number
    blunderDeltaLast100?: number
    winRateDeltaLast100?: number
  }
}

export interface StoredProgressionSummary {
  id: string
  summary_data: ProgressionSummary
  computed_at: Date
  game_count_used: number
  created_at: Date
  updated_at: Date
}

// Time window presets
export const TIME_WINDOWS = {
  LAST_7_DAYS: 7,
  LAST_30_DAYS: 30,
  LAST_90_DAYS: 90,
  LAST_6_MONTHS: 180,
  LAST_YEAR: 365
} as const

export type TimeWindowPreset = keyof typeof TIME_WINDOWS