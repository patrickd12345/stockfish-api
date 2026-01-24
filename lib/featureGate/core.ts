import type { CapabilityFacts, CapabilityKey } from '../capabilities'
import { featureRegistry, type FeatureKey } from '../featureRegistry'
import { getAllowedTiersForFeature, isTierAllowed, type Tier } from '../tierPolicy'

export type FeatureAccessReason = 'capability' | 'tier'

export type FeatureAccessResult = {
  allowed: boolean
  reason?: FeatureAccessReason
  missingCapabilities?: CapabilityKey[]
  allowedTiers?: Tier[]
}

export class FeatureAccessError extends Error {
  public readonly reason: FeatureAccessReason
  public readonly feature: FeatureKey

  constructor(feature: FeatureKey, reason: FeatureAccessReason, message: string) {
    super(message)
    this.name = 'FeatureAccessError'
    this.reason = reason
    this.feature = feature
  }
}

export function getFeatureErrorMessage(feature: FeatureKey, reason: FeatureAccessReason): string {
  const label = featureRegistry[feature]?.label ?? feature
  if (reason === 'capability') {
    return `Feature ${label} is not supported in this environment.`
  }
  return `Upgrade required to use Feature ${label}.`
}

export function evaluateFeatureAccess({
  feature,
  tier,
  capabilities,
}: {
  feature: FeatureKey
  tier: Tier
  capabilities: CapabilityFacts
}): FeatureAccessResult {
  const requirements = featureRegistry[feature]?.requiredCapabilities ?? []
  const missing = requirements.filter((cap) => !capabilities[cap])
  if (missing.length > 0) {
    return {
      allowed: false,
      reason: 'capability',
      missingCapabilities: missing,
      allowedTiers: getAllowedTiersForFeature(feature),
    }
  }
  if (!isTierAllowed(tier, feature)) {
    return {
      allowed: false,
      reason: 'tier',
      allowedTiers: getAllowedTiersForFeature(feature),
    }
  }
  return { allowed: true }
}

export function canUseFeature(feature: FeatureKey, tier: Tier, capabilities: CapabilityFacts): boolean {
  return evaluateFeatureAccess({ feature, tier, capabilities }).allowed
}
