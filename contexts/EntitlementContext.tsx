'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Entitlement } from '@/lib/billing'

const EntitlementContext = createContext<Entitlement | null>(null)

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/billing/subscription')
      .then((res) => res.json())
      .then((data: Entitlement) => {
        setEntitlement(data)
      })
      .catch(() => {
        // Default to FREE on error
        setEntitlement({
          plan: 'FREE',
          status: 'NONE',
          current_period_end: null,
          cancel_at_period_end: false,
        })
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  if (loading) {
    return null
  }

  return (
    <EntitlementContext.Provider value={entitlement}>
      {children}
    </EntitlementContext.Provider>
  )
}

export function useEntitlement(): Entitlement {
  const entitlement = useContext(EntitlementContext)
  
  // Default to FREE if not loaded
  return entitlement ?? {
    plan: 'FREE',
    status: 'NONE',
    current_period_end: null,
    cancel_at_period_end: false,
  }
}
