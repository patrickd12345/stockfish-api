import 'server-only'

import type { NextRequest } from 'next/server'
import type { CapabilityFacts } from '../capabilities'
import { getServerCapabilityFacts } from '../capabilities'
import type { FeatureKey } from '../featureRegistry'
import type { Tier } from '../tierPolicy'
import { getEntitlementForUser } from '../billing'
import { evaluateFeatureAccess, FeatureAccessError, getFeatureErrorMessage } from './core'

export { FeatureAccessError } from './core'

async function resolveTierFromRequest(request?: NextRequest): Promise<{ tier: Tier; userId: string | null }> {
  const userId = request?.cookies.get('lichess_user_id')?.value ?? null
  if (!userId) {
    return { tier: 'ANON', userId: null }
  }
  const entitlement = await getEntitlementForUser(userId)
  const tier: Tier = entitlement.plan === 'PRO' ? 'PRO' : 'FREE'
  return { tier, userId }
}

export async function requireFeature(
  feature: FeatureKey,
  {
    request,
    tier,
    capabilities,
  }: {
    request?: NextRequest
    tier?: Tier
    capabilities?: CapabilityFacts
  } = {}
): Promise<{ tier: Tier; userId: string | null }> {
  const resolvedCapabilities = capabilities ?? getServerCapabilityFacts()
  const resolvedTier = tier
    ? { tier, userId: null }
    : await resolveTierFromRequest(request)
  const access = evaluateFeatureAccess({
    feature,
    tier: resolvedTier.tier,
    capabilities: resolvedCapabilities,
  })
  if (!access.allowed) {
    const reason = access.reason ?? 'tier'
    throw new FeatureAccessError(feature, reason, getFeatureErrorMessage(feature, reason))
  }
  return { tier: resolvedTier.tier, userId: resolvedTier.userId }
}

export async function requireFeatureForUser(
  feature: FeatureKey,
  {
    userId,
    capabilities,
  }: {
    userId: string | null
    capabilities?: CapabilityFacts
  }
): Promise<{ tier: Tier; userId: string | null }> {
  if (!userId) {
    const access = evaluateFeatureAccess({
      feature,
      tier: 'ANON',
      capabilities: capabilities ?? getServerCapabilityFacts(),
    })
    if (!access.allowed) {
      const reason = access.reason ?? 'tier'
      throw new FeatureAccessError(feature, reason, getFeatureErrorMessage(feature, reason))
    }
    return { tier: 'ANON', userId: null }
  }

  const entitlement = await getEntitlementForUser(userId)
  const tier: Tier = entitlement.plan === 'PRO' ? 'PRO' : 'FREE'
  const access = evaluateFeatureAccess({
    feature,
    tier,
    capabilities: capabilities ?? getServerCapabilityFacts(),
  })
  if (!access.allowed) {
    const reason = access.reason ?? 'tier'
    throw new FeatureAccessError(feature, reason, getFeatureErrorMessage(feature, reason))
  }
  return { tier, userId }
}
