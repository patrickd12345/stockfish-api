'use client'

import { useEntitlement } from '@/contexts/EntitlementContext'
import { getCapabilities, type FeatureKey } from '@/lib/capabilities'

/**
 * Hook to check if a feature is available for the current user.
 */
export function useCapability(featureKey: FeatureKey): boolean {
  const entitlement = useEntitlement()
  const capabilities = getCapabilities(entitlement.plan)
  return capabilities[featureKey]
}

/**
 * Hook to get all capabilities for the current user.
 */
export function useCapabilities() {
  const entitlement = useEntitlement()
  return getCapabilities(entitlement.plan)
}
