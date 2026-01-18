'use client'

import { useState, useEffect, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import ChatTab from '@/components/ChatTab'
import GameInspector from '@/components/GameInspector'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'chat' | 'replay'>('chat')
  const [refreshKey, setRefreshKey] = useState(0)
  const [importStatus, setImportStatus] = useState<string>('')
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  
  // Use a ref to prevent double-firing in React 18 strict mode
  const hasStartedImport = useRef(false)

  useEffect(() => {
    const autoImport = async () => {
      if (hasStartedImport.current) return
      hasStartedImport.current = true

      const ACCOUNTS = [
        { username: 'patrickd1234567', mode: 'all' },
        { username: 'patrickd12345678', mode: 'all' },
        { username: 'anonymous19670705', mode: 'recent' }
      ]

      for (const acc of ACCOUNTS) {
        const storageKey = `imported_${acc.username}_${acc.mode}`
        // For 'all', only run once ever. For 'recent', maybe run every time or check date.
        // User asked: "On the first load, also retrive all from my previous usernames"
        // And "upon loadind the app can you automatically load the new games from chess.com... anonymous..."
        
        if (acc.mode === 'all' && localStorage.getItem(storageKey)) {
          console.log(`Skipping ${acc.username} (already imported)`)
          continue
        }

        try {
          setImportStatus(`Importing games for ${acc.username}...`)
          const res = await fetch('/api/import/chesscom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: acc.username, mode: acc.mode })
          })
          const data = await res.json()
          console.log(`Import result for ${acc.username}:`, data)
          
          if (acc.mode === 'all') {
            localStorage.setItem(storageKey, 'true')
          }
        } catch (e) {
          console.error(`Failed to import ${acc.username}:`, e)
        }
      }
      setImportStatus('')
      // Refresh games list
      setRefreshKey(prev => prev + 1)
    }

    autoImport()
  }, [])

  const handleGamesProcessed = () => {
    setRefreshKey(prev => prev + 1)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar 
        onGamesProcessed={handleGamesProcessed} 
        onGameSelect={(id) => {
          setSelectedGameId(id)
          setActiveTab('chat')
        }}
        selectedGameId={selectedGameId}
        refreshKey={refreshKey}
      />
      <main style={{ flex: 1, padding: '20px', marginLeft: '300px' }}>
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <button
              onClick={() => setActiveTab('chat')}
              style={{
                padding: '10px 20px',
                marginRight: '10px',
                background: activeTab === 'chat' ? '#2563eb' : '#e5e7eb',
                color: activeTab === 'chat' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Dashboard & Chat
            </button>
            <button
              onClick={() => setActiveTab('replay')}
              style={{
                padding: '10px 20px',
                background: activeTab === 'replay' ? '#2563eb' : '#e5e7eb',
                color: activeTab === 'replay' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Game Inspector (Replay)
            </button>
          </div>
          {importStatus && (
            <div style={{ color: '#059669', fontSize: '14px' }}>
              {importStatus}
            </div>
          )}
        </div>

        {activeTab === 'chat' && <ChatTab selectedGameId={selectedGameId} />}
        {activeTab === 'replay' && <GameInspector key={refreshKey} />}
      </main>
    </div>
  )
}
