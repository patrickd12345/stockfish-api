'use client'

import { useRouter } from 'next/navigation'
import { useCapability } from '@/hooks/useCapability'
import { featureRegistry, type FeatureKey } from '@/lib/capabilities'

interface FeatureGateProps {
  feature: FeatureKey
  children: React.ReactNode
  lockedFallback?: React.ReactNode
}

/**
 * Component that gates Pro-only features.
 * Shows locked UI with upgrade CTA if user is Free.
 */
export default function FeatureGate({ feature, children, lockedFallback }: FeatureGateProps) {
  const hasAccess = useCapability(feature)
  const router = useRouter()
  const metadata = featureRegistry[feature]

  if (hasAccess) {
    return <>{children}</>
  }

  if (lockedFallback) {
    return <>{lockedFallback}</>
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
