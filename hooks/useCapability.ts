'use client'

import { useTier } from '@/contexts/EntitlementContext'
import { useCapabilityFacts } from '@/contexts/CapabilityFactsContext'
import { canUseFeature } from '@/lib/featureGate/core'
import type { FeatureKey } from '@/lib/featureRegistry'

/**
 * Hook to check if a feature is available for the current user.
 */
export function useCapability(featureKey: FeatureKey): boolean {
  const tier = useTier()
  const capabilities = useCapabilityFacts()
  return canUseFeature(featureKey, tier, capabilities)
}
