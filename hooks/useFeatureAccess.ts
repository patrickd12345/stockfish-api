'use client'

import { useMemo } from 'react'
import { useTier } from '@/contexts/EntitlementContext'
import { useCapabilityFacts } from '@/contexts/CapabilityFactsContext'
import { evaluateFeatureAccess } from '@/lib/featureGate/core'
import type { FeatureKey } from '@/lib/featureRegistry'

export function useFeatureAccess(feature: FeatureKey) {
  const tier = useTier()
  const capabilities = useCapabilityFacts()

  return useMemo(() => {
    return evaluateFeatureAccess({ feature, tier, capabilities })
  }, [capabilities, feature, tier])
}
