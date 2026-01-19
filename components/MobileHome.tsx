'use client'

import { useMemo, useState } from 'react'
import ChatTab from '@/components/ChatTab'
import GameInspector from '@/components/GameInspector'
import OpeningExplorer from '@/components/OpeningExplorer'
import MobileGameDrawer from '@/components/MobileGameDrawer'
import LichessLiveTab from '@/components/LichessLiveTab'
import BlunderDnaTab from '@/components/BlunderDnaTab'
import EngineCoverageWidget from '@/components/EngineCoverageWidget'
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

  return (
    <div className="min-h-[100dvh] bg-sage-900 flex flex-col text-sage-100">
      <div className="sticky top-0 z-20 pt-[env(safe-area-inset-top)] bg-sage-900/95 backdrop-blur-md border-b border-white/5 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn-primary py-2 px-3 text-sm font-bold"
            onClick={() => setDrawerOpen(true)}
          >
            Games
          </button>

          <div className="font-black text-terracotta text-lg tracking-tight">Chess Coach</div>

          <div className="min-w-[72px] flex justify-end">
            {(importStatus || engineStatus) && (
              <div className="flex flex-col items-end text-[10px] gap-1">
                {importStatus && <span className="text-emerald-400 font-medium animate-pulse">Importing</span>}
                {engineStatus && <span className="text-ochre font-medium animate-pulse">Analyzing</span>}
              </div>
            )}
          </div>
        </div>

        <div className="px-3 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          <MobileTabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} label="Chat" />
          <MobileTabButton active={activeTab === 'replay'} onClick={() => setActiveTab('replay')} label="Replay" />
          <MobileTabButton active={activeTab === 'openings'} onClick={() => setActiveTab('openings')} label="Openings" />
          <MobileTabButton active={activeTab === 'lichess'} onClick={() => setActiveTab('lichess')} label="Lichess" special="lichess" />
          <MobileTabButton active={activeTab === 'dna'} onClick={() => setActiveTab('dna')} label="DNA" special="dna" />
        </div>

        <div className="px-3 pb-3">
          <EngineCoverageWidget compact active={Boolean(importStatus || engineStatus)} />
        </div>
      </div>

      <div className="flex-1 min-h-0 p-3 pb-[calc(18px+env(safe-area-inset-bottom))]">
        {activeTab === 'chat' ? (
          <div className="h-full min-h-0 flex flex-col">
            <ChatTab selectedGameId={selectedGameId} fill currentPage={activeTab} />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            {activeTab === 'replay' && <GameInspector key={refreshKey} />}
            {activeTab === 'openings' && <OpeningExplorer />}
            {activeTab === 'lichess' && <LichessLiveTab />}
            {activeTab === 'dna' && <BlunderDnaTab />}
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

function MobileTabButton({
  active,
  onClick,
  label,
  special
}: {
  active: boolean
  onClick: () => void
  label: string
  special?: 'lichess' | 'dna'
}) {
  let baseClass = "flex-1 py-2 px-3 rounded-lg text-sm font-bold border transition-all whitespace-nowrap "

  if (active) {
    if (special === 'lichess') {
      baseClass += "bg-purple-600 text-white border-purple-500"
    } else if (special === 'dna') {
      baseClass += "bg-rose-600 text-white border-rose-500"
    } else {
      baseClass += "bg-terracotta text-sage-900 border-terracotta"
    }
  } else {
    baseClass += "bg-sage-800/50 text-sage-400 border-white/5"
  }

  return (
    <button type="button" onClick={onClick} className={baseClass}>
      {label}
    </button>
  )
}
