import type { CapabilityKey } from './capabilities'

export type FeatureKey =
  | 'engine_analysis'
  | 'batch_analysis'
  | 'blunder_dna'
  | 'deep_analysis'
  | 'unlimited_analysis'
  | 'engine_coverage'
  | 'lichess_live'
  | 'games_library'
  | 'first_insights'
  | 'chesscom_import'
  | 'coach_chat'

export interface FeatureMetadata {
  label: string
  description: string
  upgradeCopy: string
  requiredCapabilities: CapabilityKey[]
}

export const featureRegistry: Record<FeatureKey, FeatureMetadata> = {
  engine_analysis: {
    label: 'Engine Analysis',
    description: 'Run Stockfish analysis on the server',
    upgradeCopy: 'Engine analysis requires an upgrade. Upgrade to enable.',
    requiredCapabilities: ['serverExecution', 'database', 'persistence'],
  },
  batch_analysis: {
    label: 'Batch Analysis',
    description: 'Analyze multiple games at once',
    upgradeCopy: 'Batch analysis requires an upgrade. Upgrade to enable.',
    requiredCapabilities: ['serverExecution', 'database', 'persistence'],
  },
  blunder_dna: {
    label: 'Blunder DNA',
    description: 'Pattern analysis of your blunders',
    upgradeCopy: 'Blunder DNA requires an upgrade. Upgrade to enable.',
    requiredCapabilities: ['serverExecution', 'database', 'persistence'],
  },
  deep_analysis: {
    label: 'Deep Analysis',
    description: 'Analysis depth beyond the default',
    upgradeCopy: 'Deep analysis requires an upgrade. Upgrade to enable.',
    requiredCapabilities: ['serverExecution', 'database', 'persistence'],
  },
  unlimited_analysis: {
    label: 'Unlimited Analysis',
    description: 'No limits on analysis runs',
    upgradeCopy: 'Unlimited analysis requires an upgrade. Upgrade to enable.',
    requiredCapabilities: ['serverExecution', 'database', 'persistence'],
  },
  engine_coverage: {
    label: 'Engine Coverage',
    description: 'Server analysis coverage and queue diagnostics',
    upgradeCopy: 'Engine coverage requires an upgrade. Upgrade to enable.',
    requiredCapabilities: ['serverExecution', 'database'],
  },
  lichess_live: {
    label: 'Lichess Live',
    description: 'Live Lichess board sessions and play',
    upgradeCopy: 'Lichess Live requires an upgrade. Upgrade to enable.',
    requiredCapabilities: ['serverExecution', 'outboundNetwork', 'database', 'persistence', 'secrets'],
  },
  games_library: {
    label: 'Game Library',
    description: 'Browse and search imported games',
    upgradeCopy: 'Game library access requires an upgrade. Upgrade to enable.',
    requiredCapabilities: ['serverExecution', 'database'],
  },
  first_insights: {
    label: 'First Insights',
    description: 'Summary insights from stored analysis',
    upgradeCopy: 'First Insights requires an upgrade. Upgrade to enable.',
    requiredCapabilities: ['serverExecution', 'database'],
  },
  chesscom_import: {
    label: 'Chess.com Import',
    description: 'Import games from Chess.com',
    upgradeCopy: 'Chess.com import requires an upgrade. Upgrade to enable.',
    requiredCapabilities: ['serverExecution', 'outboundNetwork', 'database', 'persistence'],
  },
  coach_chat: {
    label: 'Coach Chat',
    description: 'AI coaching chat',
    upgradeCopy: 'Coach chat requires an upgrade. Upgrade to enable.',
    requiredCapabilities: ['serverExecution', 'outboundNetwork', 'secrets'],
  },
}
