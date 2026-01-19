'use client'

import { useState } from 'react'
import ChessBoard from './ChessBoard'
import LiveCommentary from './LiveCommentary'
import { useLichessBoard } from '@/hooks/useLichessBoard'

export default function LichessLiveTab() {
  const { state: liveGameState, error, refreshState } = useLichessBoard(2000)
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleConnect = () => {
    window.location.href = '/api/lichess/oauth/start'
  }

  const handleStartSession = async () => {
    setLoading(true)
    setActionError(null)
    try {
      const res = await fetch('/api/lichess/board/session/start', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start session')
      await refreshState()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to start session')
    } finally {
      setLoading(false)
    }
  }

  const handleStopSession = async () => {
    setLoading(true)
    setActionError(null)
    try {
      const res = await fetch('/api/lichess/board/session/stop', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to stop session')
      await refreshState()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to stop session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Lichess Live Mode</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleConnect} className="button" style={{ background: '#4b5563' }}>
            Reconnect Lichess
          </button>
          {!liveGameState || liveGameState.status === 'idle' ? (
            <button onClick={handleStartSession} disabled={loading} className="button" style={{ background: '#059669' }}>
              {loading ? 'Starting...' : 'Start Live Session'}
            </button>
          ) : (
            <button onClick={handleStopSession} disabled={loading} className="button" style={{ background: '#dc2626' }}>
              {loading ? 'Stopping...' : 'Stop Live Session'}
            </button>
          )}
        </div>
      </div>

      {(error || actionError || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('error'))) && (
        <div style={{ padding: '10px', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}>
          {error || actionError || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('error'))}
        </div>
      )}

      {!liveGameState || liveGameState.status === 'idle' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>📡</div>
          <h3>Live Session Inactive</h3>
          <p style={{ maxWidth: '400px' }}>
            Connect your Lichess account and start a session to get real-time AI commentary while you play on Lichess.
          </p>
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative', background: '#1f1306', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div
            style={{
              position: 'absolute',
              top: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '8px 16px',
              borderRadius: '999px',
              background: 'rgba(254, 243, 199, 0.95)',
              color: '#92400e',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: '11px',
              zIndex: 10,
            }}
          >
            Live Game · {liveGameState.status.toUpperCase()}
          </div>
          
          <div style={{ width: '100%', maxWidth: '500px' }}>
            <ChessBoard fen={liveGameState.fen} theme="wood" size="100%" />
          </div>
          
          <LiveCommentary fen={liveGameState.fen} moves={liveGameState.moves} />

          <div style={{ position: 'absolute', bottom: '20px', left: '20px', right: '20px', display: 'flex', justifyContent: 'space-between', color: 'white', fontFamily: 'monospace', fontSize: '24px' }}>
             <div style={{ background: 'rgba(0,0,0,0.5)', padding: '5px 10px', borderRadius: '4px' }}>
                W: {formatTime(liveGameState.wtime)}
             </div>
             <div style={{ background: 'rgba(0,0,0,0.5)', padding: '5px 10px', borderRadius: '4px' }}>
                B: {formatTime(liveGameState.btime)}
             </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
