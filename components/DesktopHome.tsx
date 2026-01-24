'use client'

import Sidebar from '@/components/Sidebar'
import ChatTab from '@/components/ChatTab'
import GameInspector from '@/components/GameInspector'
import OpeningExplorer from '@/components/OpeningExplorer'
import LichessLiveTab from '@/components/LichessLiveTab'
import BlunderDnaTab from '@/components/BlunderDnaTab'
import TrainingTab from '@/components/TrainingTab'
import EngineCoverageWidget from '@/components/EngineCoverageWidget'
import ParametersTab from '@/components/ParametersTab'
import { useRouter } from 'next/navigation'

export type HomeTab = 'chat' | 'replay' | 'openings' | 'lichess' | 'dna' | 'training' | 'params'

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
  const router = useRouter()

  return (
    <div className="flex min-h-screen bg-sage-900 text-sage-100">
      <div className="w-80 flex-shrink-0 z-20">
        <Sidebar
          onGamesProcessed={onGamesProcessed}
          onGameSelect={onGameSelect}
          selectedGameId={selectedGameId}
          refreshKey={refreshKey}
        />
      </div>

      <main className="flex-1 p-6 overflow-x-hidden">
        <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap gap-2">
            <TabButton
              active={activeTab === 'chat'}
              onClick={() => setActiveTab('chat')}
              label="Dashboard & Chat"
            />
            <TabButton
              active={activeTab === 'replay'}
              onClick={() => setActiveTab('replay')}
              label="Game Inspector"
            />
            <TabButton
              active={activeTab === 'openings'}
              onClick={() => setActiveTab('openings')}
              label="Opening Explorer"
            />
            <TabButton
              active={activeTab === 'lichess'}
              onClick={() => setActiveTab('lichess')}
              label="Lichess Live"
              special="lichess"
            />
            <TabButton
              active={activeTab === 'dna'}
              onClick={() => setActiveTab('dna')}
              label="Blunder DNA"
              special="dna"
            />
            <TabButton
              active={activeTab === 'training'}
              onClick={() => setActiveTab('training')}
              label="Training"
              special="training"
            />
            <TabButton
              active={activeTab === 'params'}
              onClick={() => setActiveTab('params')}
              label="Parameters"
            />
          </div>

          <div className="flex items-center gap-4 flex-wrap justify-end">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/account')}
                className="px-3 py-2 rounded-lg font-bold border bg-sage-800/50 text-sage-200 border-white/5 hover:bg-sage-700/70 hover:text-sage-100 hover:border-white/10 transition-all"
              >
                Account
              </button>
              <button
                type="button"
                onClick={() => router.push('/pricing')}
                className="px-3 py-2 rounded-lg font-black border bg-terracotta text-sage-900 border-terracotta hover:brightness-110 transition-all"
              >
                Upgrade
              </button>
            </div>

            <EngineCoverageWidget compact active={Boolean(importStatus || engineStatus)} />

            {importStatus && (
              <div className="text-sm font-medium text-emerald-400 animate-pulse">{importStatus}</div>
            )}

            {engineStatus && (
              <div className="text-sm font-medium text-ochre animate-pulse">{engineStatus}</div>
            )}
          </div>
        </div>

        <div className="relative">
          {activeTab === 'chat' && <ChatTab selectedGameId={selectedGameId} currentPage={activeTab} />}
          {activeTab === 'replay' && <GameInspector key={refreshKey} />}
          {activeTab === 'openings' && <OpeningExplorer />}
          {activeTab === 'lichess' && <LichessLiveTab />}
          {activeTab === 'dna' && <BlunderDnaTab />}
          {activeTab === 'training' && <TrainingTab />}
          {activeTab === 'params' && <ParametersTab />}
        </div>
      </main>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  special
}: {
  active: boolean
  onClick: () => void
  label: string
  special?: 'lichess' | 'dna' | 'training'
}) {
  let baseClass = "px-4 py-2 rounded-lg font-medium transition-all duration-200 border"

  if (active) {
    if (special === 'lichess') {
      baseClass += " bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-900/50"
    } else if (special === 'dna') {
      baseClass += " bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-900/50"
    } else if (special === 'training') {
      baseClass += " bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/50"
    } else {
      baseClass += " bg-terracotta text-sage-900 border-terracotta shadow-lg shadow-terracotta/20"
    }
  } else {
    baseClass += " bg-sage-800/50 text-sage-300 border-white/5 hover:bg-sage-700/70 hover:text-sage-100 hover:border-white/10"
  }

  return (
    <button onClick={onClick} className={baseClass}>
      {label}
    </button>
  )
}
