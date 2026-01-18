'use client'

import { useMemo, useState } from 'react'
import ChatTab from '@/components/ChatTab'
import GameInspector from '@/components/GameInspector'
import OpeningExplorer from '@/components/OpeningExplorer'
import MobileGameDrawer from '@/components/MobileGameDrawer'
import type { HomeTab } from '@/components/DesktopHome'

interface MobileHomeProps {
  activeTab: HomeTab
  setActiveTab: (tab: HomeTab) => void
  refreshKey: number
  importStatus: string
  engineStatus: string
  selectedGameId: string | null
  onGameSelect: (id: string) => void
}

export default function MobileHome({
  activeTab,
  setActiveTab,
  refreshKey,
  importStatus,
  engineStatus,
  selectedGameId,
  onGameSelect,
}: MobileHomeProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const headerStyle = useMemo<React.CSSProperties>(
    () => ({
      position: 'sticky',
      top: 0,
      zIndex: 20,
      paddingTop: 'env(safe-area-inset-top)',
      background: '#ffffff',
      borderBottom: '1px solid #e5e7eb',
    }),
    []
  )

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#f5f5f5',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={headerStyle}>
        <div
          style={{
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <button
            type="button"
            className="button"
            onClick={() => setDrawerOpen(true)}
            style={{ padding: '10px 12px' }}
          >
            Games
          </button>

          <div style={{ fontWeight: 900, color: '#111827' }}>Chess Coach</div>

          <div style={{ minWidth: '72px', display: 'flex', justifyContent: 'flex-end' }}>
            {importStatus || engineStatus ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {importStatus ? (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#059669',
                      background: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      padding: '4px 8px',
                      borderRadius: '999px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Importing…
                  </div>
                ) : null}
                {engineStatus ? (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#7c3aed',
                      background: '#f5f3ff',
                      border: '1px solid #ddd6fe',
                      padding: '4px 8px',
                      borderRadius: '999px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Analyzing…
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ padding: '10px 14px 12px 14px', display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            style={mobileTabStyle(activeTab === 'chat')}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('replay')}
            style={mobileTabStyle(activeTab === 'replay')}
          >
            Replay
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('openings')}
            style={mobileTabStyle(activeTab === 'openings')}
          >
            Openings
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: '12px 12px 18px 12px' }}>
        {activeTab === 'chat' ? (
          <div style={{ height: 'calc(100dvh - 132px)', minHeight: 0 }}>
            <ChatTab selectedGameId={selectedGameId} fill />
          </div>
        ) : (
          <div style={{ height: 'calc(100dvh - 132px)', overflowY: 'auto' }}>
            {activeTab === 'replay' && <GameInspector key={refreshKey} />}
            {activeTab === 'openings' && <OpeningExplorer />}
          </div>
        )}
      </div>

      <MobileGameDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onGameSelect={(id) => {
          onGameSelect(id)
          setDrawerOpen(false)
          setActiveTab('chat')
        }}
        selectedGameId={selectedGameId}
        refreshKey={refreshKey}
      />
    </div>
  )
}

function mobileTabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '10px 10px',
    borderRadius: '12px',
    border: `1px solid ${active ? '#1d4ed8' : '#e5e7eb'}`,
    background: active ? '#1d4ed8' : '#ffffff',
    color: active ? '#ffffff' : '#111827',
    fontWeight: 800,
    cursor: 'pointer',
  }
}

