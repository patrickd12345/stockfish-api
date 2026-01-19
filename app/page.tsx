'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import DesktopHome, { type HomeTab } from '@/components/DesktopHome'
import MobileHome from '@/components/MobileHome'

export default function Home() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#6b7280' }}>Loading application...</div>}>
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const [activeTab, setActiveTab] = useState<HomeTab>('chat')
  const [refreshKey, setRefreshKey] = useState(0)
  const [importStatus, setImportStatus] = useState<string>('')
  const [engineStatus, setEngineStatus] = useState<string>('')
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState<boolean | null>(null)
  const searchParams = useSearchParams()

  // Allow tests to disable heavy startup side-effects (external network + batch jobs).
  const disableAutoImport = process.env.NEXT_PUBLIC_DISABLE_AUTO_IMPORT === 'true'
  const forceAutoImport = searchParams.get('autoImport') === 'true'
  
  // Use a ref to prevent double-firing in React 18 strict mode
  const hasStartedImport = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const tabParam = searchParams.get('tab') as HomeTab | null
    if (tabParam === 'chat' || tabParam === 'replay' || tabParam === 'openings' || tabParam === 'lichess' || tabParam === 'dna') {
      setActiveTab(tabParam)
    }
  }, [searchParams])

  useEffect(() => {
    if (disableAutoImport && !forceAutoImport) {
      return
    }

    const autoImport = async () => {
      if (hasStartedImport.current) return
      hasStartedImport.current = true

      const ACCOUNTS = [
        { username: 'patrickd1234567', mode: 'all' },
        { username: 'patrickd12345678', mode: 'all' },
        { username: 'anonymous19670705', mode: 'recent' }
      ]

      for (const acc of ACCOUNTS) {
        // Versioned keys so improvements to import logic can re-run safely.
        const storageKey = `imported_v2_${acc.username}_${acc.mode}`
        const cursorKey = `import_cursor_v2_${acc.username}_${acc.mode}`
        // For 'all', only run once ever. For 'recent', maybe run every time or check date.
        // User asked: "On the first load, also retrive all from my previous usernames"
        // And "upon loadind the app can you automatically load the new games from chess.com... anonymous..."
        
        if (acc.mode === 'all' && localStorage.getItem(storageKey)) {
          console.log(`Skipping ${acc.username} (already imported)`)
          continue
        }

        try {
          if (acc.mode === 'all') {
            let cursor = Number(localStorage.getItem(cursorKey) ?? '0')
            if (!Number.isFinite(cursor) || cursor < 0) cursor = 0

            let safety = 0
            while (safety < 500) {
              safety += 1
              setImportStatus(`Importing ${acc.username}… (${cursor})`)

              const res = await fetch('/api/import/chesscom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  username: acc.username,
                  mode: 'all',
                  cursor,
                  maxArchives: 6,
                  runBatch: true,
                }),
              })
              const data = await res.json()
              console.log(`Import chunk result for ${acc.username}:`, data)

              const archivesTotal = typeof data.archivesTotal === 'number' ? data.archivesTotal : null
              const archivesProcessed = typeof data.archivesProcessed === 'number' ? data.archivesProcessed : null
              if (archivesTotal !== null && archivesProcessed !== null) {
                setImportStatus(`Importing ${acc.username}… archives ${archivesProcessed}/${archivesTotal}`)
              }

              if (!res.ok) {
                throw new Error(data?.error || 'Import failed')
              }

              if (data?.done === true) {
                localStorage.removeItem(cursorKey)
                localStorage.setItem(storageKey, 'true')
                break
              }

              const nextCursor = Number(data?.nextCursor)
              if (!Number.isFinite(nextCursor) || nextCursor <= cursor) {
                // Avoid infinite loops if the server response is malformed.
                throw new Error('Import stalled (invalid nextCursor)')
              }

              cursor = nextCursor
              localStorage.setItem(cursorKey, String(cursor))

              // Yield a bit to keep UI responsive and avoid hammering the API.
              await new Promise((r) => setTimeout(r, 250))
            }
          } else {
            setImportStatus(`Importing recent games for ${acc.username}...`)
            const res = await fetch('/api/import/chesscom', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: acc.username, mode: 'recent', runBatch: true }),
            })
            const data = await res.json()
            console.log(`Import result for ${acc.username}:`, data)
          }
        } catch (e) {
          console.error(`Failed to import ${acc.username}:`, e)
        }
      }
      setImportStatus('')
      // Refresh games list
      setRefreshKey(prev => prev + 1)

      // Kick off a small Stockfish analysis batch so newly imported games get real engine stats
      // (blunders/mistakes/inaccuracies/CPL/etc). This runs in small chunks to stay responsive.
      try {
        setEngineStatus('Queueing Stockfish analysis…')
        const res = await fetch('/api/engine/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 5, mode: 'enqueue' }),
        })
        const data = await res.json()
        if (res.ok) {
          const queued = data.enqueued ?? 0
          setEngineStatus(`Stockfish analysis queued: ${queued} game${queued === 1 ? '' : 's'}`)
        } else {
          setEngineStatus('')
          console.warn('Engine analyze failed:', data)
        }
      } catch (e) {
        setEngineStatus('')
        console.warn('Engine analyze request failed:', e)
      } finally {
        // Clear after a short delay to avoid permanent banner noise.
        setTimeout(() => setEngineStatus(''), 5000)
      }
    }

    autoImport()
  }, [disableAutoImport, forceAutoImport])

  const handleGamesProcessed = () => {
    setRefreshKey(prev => prev + 1)
  }

  if (isMobile === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#6b7280' }}>
        Loading…
      </div>
    )
  }

  if (isMobile) {
    return (
      <MobileHome
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        refreshKey={refreshKey}
        importStatus={importStatus}
        engineStatus={engineStatus}
        selectedGameId={selectedGameId}
        onGameSelect={(id) => {
          setSelectedGameId(id)
          setActiveTab('chat')
        }}
      />
    )
  }

  return (
    <DesktopHome
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      refreshKey={refreshKey}
      importStatus={importStatus}
      engineStatus={engineStatus}
      selectedGameId={selectedGameId}
      onGamesProcessed={handleGamesProcessed}
      onGameSelect={(id) => {
        setSelectedGameId(id)
        setActiveTab('chat')
      }}
    />
  )
}
