'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Entitlement } from '@/lib/billing'
import type { Tier } from '@/lib/tierPolicy'

type EntitlementState = {
  entitlement: Entitlement
  tier: Tier
  isAuthenticated: boolean
}

const defaultEntitlement: Entitlement = {
  plan: 'FREE',
  status: 'NONE',
  current_period_end: null,
  cancel_at_period_end: false,
}

const defaultState: EntitlementState = {
  entitlement: defaultEntitlement,
  tier: 'ANON',
  isAuthenticated: false,
}

const EntitlementContext = createContext<EntitlementState>(defaultState)

const RefreshContext = createContext<(() => void) | null>(null)

export function EntitlementProvider({
  children,
  initialState,
}: {
  children: ReactNode
  initialState?: EntitlementState
}) {
  const [state, setState] = useState<EntitlementState>(initialState ?? defaultState)
  const [loading, setLoading] = useState(!initialState)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const refreshEntitlement = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  useEffect(() => {
    if (initialState) {
      return
    }
    fetch('/api/billing/subscription')
      .then(async (res) => {
        if (res.status === 401) {
          setState({
            entitlement: defaultEntitlement,
            tier: 'ANON',
            isAuthenticated: false,
          })
          return
        }
        const data = (await res.json()) as Entitlement
        const tier: Tier = data.plan === 'PRO' ? 'PRO' : 'FREE'
        setState({
          entitlement: data,
          tier,
          isAuthenticated: true,
        })
      })
      .catch((err) => {
        setState({
          entitlement: defaultEntitlement,
          tier: 'ANON',
          isAuthenticated: false,
        })
      })
      .finally(() => {
        setLoading(false)
      })
  }, [initialState, refreshTrigger])

  const value = useMemo(() => state, [state])

  if (loading) {
    return null
  }

  return (
    <EntitlementContext.Provider value={value}>
      <RefreshContext.Provider value={refreshEntitlement}>
        {children}
      </RefreshContext.Provider>
    </EntitlementContext.Provider>
  )
}

export function useEntitlement(): Entitlement {
  const state = useContext(EntitlementContext)
  return state.entitlement
}

export function useTier(): Tier {
  const state = useContext(EntitlementContext)
  return state.tier
}

export function useIsAuthenticated(): boolean {
  const state = useContext(EntitlementContext)
  return state.isAuthenticated
}

export function useRefreshEntitlement(): () => void {
  const refresh = useContext(RefreshContext)
  if (!refresh) {
    return () => {
      console.warn('useRefreshEntitlement called outside EntitlementProvider')
    }
  }
  return refresh
}
