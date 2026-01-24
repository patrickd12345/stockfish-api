'use client'

import { useRouter } from 'next/navigation'
import { useFeatureAccess } from '@/hooks/useFeatureAccess'
import { featureRegistry, type FeatureKey } from '@/lib/featureRegistry'
import { getFeatureErrorMessage } from '@/lib/featureGate/core'

interface FeatureGateProps {
  feature: FeatureKey
  children: React.ReactNode
  lockedFallback?: React.ReactNode
}

/**
 * Component that gates features by capability + tier.
 * Shows locked UI with upgrade CTA when tier disallows.
 */
export default function FeatureGate({ feature, children, lockedFallback }: FeatureGateProps) {
  const access = useFeatureAccess(feature)
  const router = useRouter()
  const metadata = featureRegistry[feature]

  if (access.allowed) {
    return <>{children}</>
  }

  if (lockedFallback) {
    return <>{lockedFallback}</>
  }

  if (access.reason === 'capability') {
    return (
      <div className="relative">
        <div className="opacity-50 pointer-events-none select-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-sage-900/80 backdrop-blur-sm rounded-lg border border-sage-500/40">
          <div className="text-center p-4 max-w-sm">
            <div className="text-sm text-sage-300 mb-2">
              {getFeatureErrorMessage(feature, 'capability')}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="opacity-50 pointer-events-none select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-sage-900/80 backdrop-blur-sm rounded-lg border border-terracotta/30">
        <div className="text-center p-4 max-w-sm">
          <div className="text-sm text-sage-300 mb-2">{metadata.upgradeCopy}</div>
          <button
            type="button"
            onClick={() => router.push('/pricing')}
            className="btn-primary text-sm px-4 py-2"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  )
}
