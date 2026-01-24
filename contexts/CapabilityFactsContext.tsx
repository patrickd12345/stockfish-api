'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CapabilityFacts } from '@/lib/capabilities'

const defaultFacts: CapabilityFacts = {
  serverExecution: false,
  outboundNetwork: typeof navigator !== 'undefined' ? navigator.onLine : true,
  database: false,
  persistence: false,
  secrets: false,
}

const CapabilityFactsContext = createContext<CapabilityFacts>(defaultFacts)

export function CapabilityFactsProvider({
  children,
  initialFacts,
}: {
  children: ReactNode
  initialFacts?: CapabilityFacts
}) {
  const [facts, setFacts] = useState<CapabilityFacts>(initialFacts ?? defaultFacts)

  useEffect(() => {
    if (initialFacts) return
    fetch('/api/system/capabilities')
      .then((res) => res.json())
      .then((data: CapabilityFacts) => {
        setFacts(data)
      })
      .catch(() => {
        setFacts((current) => ({
          ...current,
          outboundNetwork: typeof navigator !== 'undefined' ? navigator.onLine : current.outboundNetwork,
        }))
      })
  }, [initialFacts])

  const value = useMemo(() => facts, [facts])

  return <CapabilityFactsContext.Provider value={value}>{children}</CapabilityFactsContext.Provider>
}

export function useCapabilityFacts(): CapabilityFacts {
  return useContext(CapabilityFactsContext)
}
