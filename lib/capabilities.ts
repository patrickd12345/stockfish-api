import type { Plan } from './billing'

/**
 * Feature keys that can be gated by plan tier.
 */
export type FeatureKey =
  | 'server_analysis'
  | 'batch_analysis'
  | 'blunder_dna'
  | 'deep_analysis'
  | 'unlimited_analysis'

/**
 * Feature metadata for UI display.
 */
export interface FeatureMetadata {
  label: string
  description: string
  upgradeCopy: string
}

/**
 * Feature registry: maps feature keys to metadata.
 */
export const featureRegistry: Record<FeatureKey, FeatureMetadata> = {
  server_analysis: {
    label: 'Server-Side Analysis',
    description: 'Run Stockfish analysis on the server',
    upgradeCopy: 'Server-side analysis requires Pro. Upgrade to enable.',
  },
  batch_analysis: {
    label: 'Batch Analysis',
    description: 'Analyze multiple games at once',
    upgradeCopy: 'Batch analysis requires Pro. Upgrade to enable.',
  },
  blunder_dna: {
    label: 'Blunder DNA',
    description: 'Pattern analysis of your blunders',
    upgradeCopy: 'Blunder DNA requires Pro. Upgrade to enable.',
  },
  deep_analysis: {
    label: 'Deep Analysis',
    description: 'Analysis depth beyond 15',
    upgradeCopy: 'Deep analysis (depth > 15) requires Pro. Upgrade to enable.',
  },
  unlimited_analysis: {
    label: 'Unlimited Analysis',
    description: 'No limits on analysis runs',
    upgradeCopy: 'Unlimited analysis requires Pro. Upgrade to enable.',
  },
}

/**
 * Capabilities object: maps feature keys to boolean access.
 */
export type Capabilities = Record<FeatureKey, boolean>

/**
 * Resolves capabilities based on user's plan.
 * Defaults to all features locked (safe for Free users).
 */
export function getCapabilities(plan: Plan): Capabilities {
  const isPro = plan === 'PRO'
  
  return {
    server_analysis: isPro,
    batch_analysis: isPro,
    blunder_dna: isPro,
    deep_analysis: isPro,
    unlimited_analysis: isPro,
  }
}
