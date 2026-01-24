import type { FeatureKey } from './featureRegistry'

export type Tier = 'ANON' | 'FREE' | 'PRO'

export const tierAllowances: Record<Tier, FeatureKey[]> = {
  ANON: ['games_library', 'first_insights', 'engine_coverage', 'chesscom_import', 'coach_chat'],
  FREE: [
    'games_library',
    'first_insights',
    'engine_coverage',
    'chesscom_import',
    'coach_chat',
    'lichess_live',
  ],
  PRO: [
    'engine_analysis',
    'batch_analysis',
    'blunder_dna',
    'deep_analysis',
    'unlimited_analysis',
    'engine_coverage',
    'lichess_live',
    'games_library',
    'first_insights',
    'chesscom_import',
    'coach_chat',
  ],
}

export function isTierAllowed(tier: Tier, feature: FeatureKey): boolean {
  return tierAllowances[tier].includes(feature)
}

export function getAllowedTiersForFeature(feature: FeatureKey): Tier[] {
  return (Object.keys(tierAllowances) as Tier[]).filter((tier) =>
    tierAllowances[tier].includes(feature)
  )
}
