'use client'

import { useCallback, useEffect, useState } from 'react'
import { AGENT_TONE_STORAGE_KEY, normalizeAgentTone, type AgentTone } from '@/lib/agentTone'

export function useAgentTone() {
  const [tone, setToneState] = useState<AgentTone>('neutral')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AGENT_TONE_STORAGE_KEY)
      setToneState(normalizeAgentTone(raw))
    } catch {
      setToneState('neutral')
    } finally {
      setHydrated(true)
    }
  }, [])

  const setTone = useCallback((next: AgentTone) => {
    setToneState(next)
    try {
      localStorage.setItem(AGENT_TONE_STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }, [])

  return { tone, setTone, hydrated }
}

