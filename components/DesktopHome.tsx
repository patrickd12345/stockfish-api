'use client'

import Sidebar from '@/components/Sidebar'
import ChatTab from '@/components/ChatTab'
import GameInspector from '@/components/GameInspector'
import OpeningExplorer from '@/components/OpeningExplorer'
import LichessLiveTab from '@/components/LichessLiveTab'

export type HomeTab = 'chat' | 'replay' | 'openings' | 'lichess'

interface DesktopHomeProps {
  activeTab: HomeTab
  setActiveTab: (tab: HomeTab) => void
  refreshKey: number
  importStatus: string
  engineStatus: string
  selectedGameId: string | null
  onGamesProcessed: () => void
  onGameSelect: (id: string) => void
}

export default function DesktopHome({
  activeTab,
  setActiveTab,
  refreshKey,
  importStatus,
  engineStatus,
  selectedGameId,
  onGamesProcessed,
  onGameSelect,
}: DesktopHomeProps) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        onGamesProcessed={onGamesProcessed}
        onGameSelect={onGameSelect}
        selectedGameId={selectedGameId}
        refreshKey={refreshKey}
      />

      <main style={{ flex: 1, padding: '20px', marginLeft: '300px' }}>
        <div
          style={{
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <button
              onClick={() => setActiveTab('chat')}
              style={tabStyle(activeTab === 'chat')}
            >
              Dashboard & Chat
            </button>
            <button
              onClick={() => setActiveTab('replay')}
              style={tabStyle(activeTab === 'replay')}
            >
              Game Inspector (Replay)
            </button>
            <button
              onClick={() => setActiveTab('openings')}
              style={{ ...tabStyle(activeTab === 'openings'), marginLeft: '10px' }}
            >
              Opening Explorer
            </button>
            <button
              onClick={() => setActiveTab('lichess')}
              style={{ ...tabStyle(activeTab === 'lichess'), marginLeft: '10px', background: activeTab === 'lichess' ? '#8b5cf6' : '#e5e7eb' }}
            >
              Lichess Live
            </button>
          </div>

          {importStatus && (
            <div style={{ color: '#059669', fontSize: '14px' }}>{importStatus}</div>
          )}

          {engineStatus && (
            <div style={{ color: '#7c3aed', fontSize: '14px' }}>{engineStatus}</div>
          )}
        </div>

        {activeTab === 'chat' && <ChatTab selectedGameId={selectedGameId} currentPage={activeTab} />}
        {activeTab === 'replay' && <GameInspector key={refreshKey} />}
        {activeTab === 'openings' && <OpeningExplorer />}
        {activeTab === 'lichess' && <LichessLiveTab />}
      </main>
    </div>
  )
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '10px 20px',
    marginRight: '10px',
    background: active ? '#2563eb' : '#e5e7eb',
    color: active ? 'white' : '#374151',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  }
}

