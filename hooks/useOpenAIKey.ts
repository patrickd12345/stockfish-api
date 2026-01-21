'use client'

import { useEffect, useState } from 'react'

export function useOpenAIKey() {
  const [apiKey, setApiKey] = useState<string | null>(null)

  useEffect(() => {
    // Only access localStorage on client mount
    setApiKey(localStorage.getItem('openai_api_key'))

    // Listen for changes (e.g. from Settings page in same tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'openai_api_key') {
        setApiKey(e.newValue)
      }
    }
    window.addEventListener('storage', handleStorageChange)

    // Custom event dispatch for intra-tab updates
    const handleCustomUpdate = () => {
        setApiKey(localStorage.getItem('openai_api_key'))
    }
    // We can't easily listen to custom events across the app without a provider,
    // but the 'storage' event works for other tabs.
    // For the current tab, we rely on mounting/re-mounting or polling if needed.
    // However, usually settings changes happen on a different page.

    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  return apiKey
}
