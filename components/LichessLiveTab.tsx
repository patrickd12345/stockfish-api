'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from './ChessBoard'
import LiveCommentary from './LiveCommentary'
import { useLichessBoard } from '@/hooks/useLichessBoard'

interface LichessSession {
  status: 'idle' | 'connected' | 'waiting' | 'playing' | 'finished' | 'error'
  activeGameId?: string | null
}

function formatStatus(status: any): string {
  if (!status) return 'UNKNOWN'
  if (typeof status === 'string') {
    try {
      const parsed = JSON.parse(status)
      return (parsed.name || parsed.ID || status).toUpperCase()
    } catch {
      return status.toUpperCase()
    }
  }
  if (typeof status === 'object') {
    return (status.name || status.ID || JSON.stringify(status)).toUpperCase()
  }
  return String(status).toUpperCase()
}

function getPerfName(ms: number): string {
  const mins = ms / 60000
  if (mins < 3) return 'BULLET'
  if (mins < 8) return 'BLITZ'
  if (mins < 25) return 'RAPID'
  return 'CLASSICAL'
}

function formatClockTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function uciMovesToMovePairs(uciMoves: string): Array<{ moveNumber: number; white?: string; black?: string }> {
  const trimmed = (uciMoves || '').trim()
  if (!trimmed) return []

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  const chess = new Chess()
  const sans: string[] = []

  for (const token of tokens) {
    if (token.length < 4) {
      sans.push(token)
      continue
    }

    const from = token.slice(0, 2)
    const to = token.slice(2, 4)
    const promotion = token.length >= 5 ? token.slice(4, 5) : undefined

    try {
      const move = chess.move({ from, to, promotion: promotion as any })
      if (move?.san) {
        sans.push(move.san)
      } else {
        sans.push(token)
      }
    } catch {
      sans.push(token)
    }
  }

  const pairs: Array<{ moveNumber: number; white?: string; black?: string }> = []
  for (let i = 0; i < sans.length; i += 2) {
    pairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: sans[i],
      black: sans[i + 1]
    })
  }
  return pairs
}

export default function LichessLiveTab() {
  // Use a faster poll interval (500ms) to reduce "cappiness" during gameplay
  const { state: liveGameState, displayClock, error, refreshState } = useLichessBoard(500)
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [session, setSession] = useState<LichessSession | null>(null)
  const [seeking, setSeeking] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [isResigning, setIsResigning] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isChallenging, setIsChallenging] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const [optimisticChatMessages, setOptimisticChatMessages] = useState<
    Array<{ id: string; username: string; text: string; room: string; receivedAt: string }>
  >([])

  // Time control selection
  const [seekTime, setSeekTime] = useState(3)
  const [seekIncrement, setSeekIncrement] = useState(2)

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch('/api/lichess/board/session')
        if (res.ok) {
          const data = await res.json()
          setSession(data)
        }
      } catch (err) {
        console.error('Failed to fetch session:', err)
      }
    }
    fetchSession()
    const interval = setInterval(fetchSession, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [liveGameState?.chatMessages])

  useEffect(() => {
    // Reconcile optimistic messages once the server echoes them back.
    if (!liveGameState?.chatMessages || liveGameState.chatMessages.length === 0) return
    const myId = (liveGameState.lichessUserId || '').toLowerCase()
    setOptimisticChatMessages((pending) =>
      pending.filter((p) => {
        const match = liveGameState.chatMessages?.some(
          (m) =>
            (m.username || '').toLowerCase() === myId &&
            m.text === p.text &&
            (m.room || 'player') === (p.room || 'player')
        )
        return !match
      })
    )
  }, [liveGameState?.chatMessages, liveGameState?.lichessUserId])

  const handleConnect = () => {
    window.location.href = '/api/lichess/oauth/start'
  }

  const handleStartSession = async () => {
    setLoading(true)
    setActionError(null)
    try {
      const res = await fetch('/api/lichess/board/session/start', { method: 'POST' })
      let data: any = {}
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
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
      let data: any = {}
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
      if (!res.ok) throw new Error(data.error || 'Failed to stop session')
      await refreshState()
      setSession(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to stop session')
    } finally {
      setLoading(false)
    }
  }

  const handleSeekMatch = async () => {
    setSeeking(true)
    setActionError(null)
    try {
      const res = await fetch('/api/lichess/board/seek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time: seekTime,
          increment: seekIncrement,
          rated: false,
          variant: 'standard',
          color: 'random'
        })
      })
      let data: any = {}
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
      if (!res.ok) throw new Error(data.error || 'Failed to seek match')
      // Keep "seeking" state until a game actually starts (or an error occurs).
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to seek match')
      setSeeking(false)
    } finally {
      refreshState()
    }
  }

  const handleResign = async () => {
    if (!liveGameState?.gameId || !window.confirm('Are you sure you want to resign?')) return
    setIsResigning(true)
    try {
      const res = await fetch(`/api/lichess/board/${liveGameState.gameId}/resign`, { method: 'POST' })
      let data: any = {}
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resign')
      }
      await refreshState()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to resign')
    } finally {
      setIsResigning(false)
    }
  }

  const handleRematch = async () => {
    if (!liveGameState?.opponentName) return
    setIsChallenging(true)
    try {
      const res = await fetch(`/api/lichess/board/challenge/${liveGameState.opponentName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time: seekTime, increment: seekIncrement })
      })
      let data: any = {}
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to challenge opponent')
      }
      setSeeking(true)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to challenge opponent')
    } finally {
      setIsChallenging(false)
    }
  }

  const handlePracticeBot = async (botUsername: string) => {
    setSeeking(true)
    setActionError(null)
    
    // Safety timeout to prevent "stuck" seeking state if the bot doesn't start the game
    const timeoutId = setTimeout(() => {
      setSeeking((s) => {
        if (s) {
          setActionError('Bot challenge timed out (no start event received).')
          return false
        }
        return s
      })
    }, 10000)

    try {
      const res = await fetch(`/api/lichess/board/challenge/${botUsername}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          time: seekTime, 
          increment: seekIncrement,
          rated: false 
        })
      })
      let data: any = {}
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
      if (!res.ok) {
        clearTimeout(timeoutId)
        throw new Error(data.error || `Failed to challenge ${botUsername}`)
      }
      // Success means challenge sent. Waiting for stream/hook to update state.
    } catch (err) {
      clearTimeout(timeoutId)
      setActionError(err instanceof Error ? err.message : `Failed to challenge ${botUsername}`)
      setSeeking(false)
    }
  }

  const handleOfferDraw = async () => {
    if (!liveGameState?.gameId) return
    setIsDrawing(true)
    try {
      const res = await fetch(`/api/lichess/board/${liveGameState.gameId}/draw`, {
        method: 'POST',
        body: JSON.stringify({ accept: true })
      })
      let data: any = {}
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to offer/accept draw')
      }
      await refreshState()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to offer/accept draw')
    } finally {
      setIsDrawing(false)
    }
  }

  const handleSendChat = async () => {
    if (!liveGameState?.gameId || !chatInput.trim()) return
    const text = chatInput.trim()
    setChatInput('')
    const optimisticId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const myUsername = liveGameState.lichessUserId || 'me'
    setOptimisticChatMessages((prev) => [
      ...prev,
      { id: optimisticId, username: myUsername, text, room: 'player', receivedAt: new Date().toISOString() }
    ])
    try {
      const res = await fetch(`/api/lichess/board/${liveGameState.gameId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, room: 'player' })
      })
      let data: any = {}
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send chat')
      }
    } catch (err) {
      setOptimisticChatMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      setActionError(err instanceof Error ? err.message : 'Failed to send chat')
    }
  }

  const handleMove = async (from: string, to: string) => {
    if (!liveGameState?.gameId) return
    const chess = new Chess(liveGameState.fen)
    try {
      const move = chess.move({ from, to, promotion: 'q' })
      if (!move) return false
      const uci = move.promotion ? `${from}${to}${move.promotion}` : `${from}${to}`
      try {
        const res = await fetch(`/api/lichess/board/move/${liveGameState.gameId}/${uci}`, { method: 'POST' })
        let data: any = {}
        try {
          data = await res.json()
        } catch {
          data = { error: await res.text() }
        }
        if (!res.ok) {
          setActionError(data.error || 'Failed to make move')
          await refreshState()
          return false
        } else {
          setTimeout(() => refreshState(), 250) // Refresh quickly after move
          return true
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to submit move')
        await refreshState()
        return false
      }
    } catch (err) {
      return false
    }
  }

  const isGameActive = !!(liveGameState?.status === 'started' || liveGameState?.status === 'playing')

  useEffect(() => {
    if (isGameActive) {
      setSeeking(false)
    }
  }, [isGameActive])

  // Helper values for rendering
  const turnColor = liveGameState?.fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const myColor = liveGameState?.myColor ?? 'white'
  
  // Logic: "Me" at bottom. 
  // If myColor is White, Opponent is Black. 
  //   Opponent Time = btime. My Time = wtime.
  //   Turn is Opponent's if turnColor === 'black'
  // If myColor is Black, Opponent is White.
  //   Opponent Time = wtime. My Time = btime.
  //   Turn is Opponent's if turnColor === 'white'
  
  const opponentTime = myColor === 'white' 
    ? (displayClock?.btime ?? liveGameState?.btime ?? 0) 
    : (displayClock?.wtime ?? liveGameState?.wtime ?? 0)
    
  const myTime = myColor === 'white' 
    ? (displayClock?.wtime ?? liveGameState?.wtime ?? 0) 
    : (displayClock?.btime ?? liveGameState?.btime ?? 0)

  const isOpponentTurn = turnColor !== myColor
  const isMyTurn = turnColor === myColor

  const movePairs = useMemo(() => uciMovesToMovePairs(liveGameState?.moves || ''), [liveGameState?.moves])

  return (
    <div className="card" style={{ minHeight: '700px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Lichess Live Mode</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleConnect} className="button" style={{ background: '#4b5563' }}>
            Reconnect Lichess
          </button>
          {!session || session.status === 'idle' ? (
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
        <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', fontSize: '14px', border: '1px solid #fecaca' }}>
          {error || actionError || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('error'))}
        </div>
      )}

      {!session || session.status === 'idle' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', borderRadius: '12px', border: '2px dashed #e5e7eb', padding: '40px' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>📡</div>
          <h3 style={{ marginBottom: '12px' }}>Live Session Inactive</h3>
          <p style={{ maxWidth: '400px', color: '#6b7280', textAlign: 'center', lineHeight: 1.5 }}>
            Connect your Lichess account and start a session to play and get real-time AI commentary.
          </p>
        </div>
      ) : !liveGameState || !isGameActive ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', borderRadius: '12px', padding: '40px' }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>♟️</div>
          <h3 style={{ marginBottom: '8px' }}>Ready to Play</h3>
          
          {liveGameState && !isGameActive && (
            <div style={{ marginBottom: '20px', padding: '8px 16px', background: '#fef3c7', color: '#92400e', borderRadius: '8px', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>Last Game: {formatStatus(liveGameState.status)} vs {liveGameState.opponentName || 'Unknown'}</span>
              <button 
                onClick={() => {
                  refreshState()
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '16px', color: '#92400e' }}
              >
                ✕
              </button>
            </div>
          )}
          
          <div style={{ marginBottom: '32px', display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', maxWidth: '500px' }}>
            {[
              { label: '1+0', t: 1, i: 0 },
              { label: '2+1', t: 2, i: 1 },
              { label: '3+0', t: 3, i: 0 },
              { label: '3+2', t: 3, i: 2 },
              { label: '5+0', t: 5, i: 0 },
              { label: '5+3', t: 5, i: 3 },
              { label: '10+0', t: 10, i: 0 },
              { label: '10+5', t: 10, i: 5 },
            ].map((tc) => (
              <button
                key={tc.label}
                onClick={() => { setSeekTime(tc.t); setSeekIncrement(tc.i); }}
                className="button"
                style={{
                  background: seekTime === tc.t && seekIncrement === tc.i ? '#2563eb' : 'white',
                  color: seekTime === tc.t && seekIncrement === tc.i ? 'white' : '#374151',
                  padding: '10px 20px',
                  fontSize: '14px',
                  border: seekTime === tc.t && seekIncrement === tc.i ? '1px solid #2563eb' : '1px solid #d1d5db',
                  fontWeight: 600,
                  minWidth: '80px'
                }}
              >
                {tc.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '500px' }}>
            <button 
              onClick={handleSeekMatch} 
              disabled={seeking || loading} 
              className="button" 
              style={{ background: '#2563eb', padding: '16px 32px', fontSize: '16px', fontWeight: 700, borderRadius: '12px', flex: 1 }}
            >
              {seeking ? 'Seeking...' : 'Seek Human'}
            </button>
            <button 
              onClick={() => handlePracticeBot('maia1')} 
              disabled={seeking || loading} 
              className="button" 
              style={{ background: '#4b5563', padding: '16px 32px', fontSize: '16px', fontWeight: 700, borderRadius: '12px', flex: 1 }}
            >
              Practice Bot
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
          {/* Main Board Area */}
          <div style={{ position: 'relative', background: '#1f1306', borderRadius: '12px', padding: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px' }}>

            <div style={{ width: '100%', maxWidth: '500px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: '#fbbf24' }}>
                Live Game
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#e5e5e5', opacity: 0.85 }}>
                {getPerfName(liveGameState.initialTimeMs || 0)} {Math.floor((liveGameState.initialTimeMs || 0) / 60000)}+{Math.floor((liveGameState.initialIncrementMs || 0) / 1000)}
              </div>
            </div>
            
            {/* Top Bar: Opponent Info & Clock */}
            <div style={{ width: '100%', maxWidth: '500px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', color: '#e5e5e5' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#404040', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                  {liveGameState.myColor === 'black' ? '😎' : '👤'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                    {liveGameState.opponentName || 'Opponent'} 
                    <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: '6px' }}>({liveGameState.opponentRating || '?'})</span>
                  </div>
                  {/* Status Badge integrated here */}
                  {!isGameActive && (
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', marginTop: '2px' }}>
                      {formatStatus(liveGameState.status)}
                    </div>
                  )}
                </div>
              </div>

              {/* Opponent Clock */}
              <div style={{ 
                background: '#262626', padding: '6px 14px', borderRadius: '6px', color: '#a3a3a3', fontFamily: 'monospace', fontSize: '24px',
                borderBottom: isGameActive && isOpponentTurn ? '3px solid #ef4444' : '3px solid transparent',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                opacity: isGameActive ? 1 : 0.7
              }}>
                {formatClockTime(opponentTime)}
              </div>
            </div>

            {/* Chess Board */}
            <div style={{ width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
              <ChessBoard 
                fen={liveGameState.fen} 
                theme="wood" 
                size="100%" 
                isDraggable={isGameActive}
                orientation={myColor}
                onMove={handleMove}
              />
            </div>

            {/* Bottom Bar: My Clock */}
            <div style={{ width: '100%', maxWidth: '500px', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start' }}>
              <div style={{ 
                background: '#000', padding: '10px 24px', borderRadius: '8px', color: 'white', fontFamily: 'monospace', fontSize: '36px', fontWeight: 700,
                borderBottom: isGameActive && isMyTurn ? '4px solid #22c55e' : '4px solid transparent',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                textShadow: '0 0 10px rgba(255,255,255,0.2)'
              }}>
                {formatClockTime(myTime)}
              </div>
            </div>
          </div>

          {/* Sidebar Area: Actions, Chat, Commentary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Actions */}
            <div className="card" style={{ padding: '15px', background: '#f3f4f6' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#4b5563' }}>GAME ACTIONS</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {isGameActive ? (
                  <>
                    <button onClick={handleResign} disabled={isResigning} className="button" style={{ background: '#dc2626', width: '100%' }}>
                      {isResigning ? 'Resigning...' : 'Resign'}
                    </button>
                    <button onClick={handleOfferDraw} disabled={isDrawing} className="button" style={{ background: '#4b5563', width: '100%' }}>
                      {isDrawing ? 'Offering...' : 'Offer Draw'}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={handleSeekMatch} disabled={seeking} className="button" style={{ background: '#059669', width: '100%' }}>
                      {seeking ? 'Seeking...' : 'New Match'}
                    </button>
                    {liveGameState.opponentName && (
                      <button onClick={handleRematch} disabled={isChallenging || seeking} className="button" style={{ background: '#2563eb', width: '100%' }}>
                        {isChallenging ? 'Challenging...' : 'Rematch Opponent'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Moves */}
            <div className="card" style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px', height: '180px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#4b5563' }}>MOVES</h4>
              <div
                style={{
                  flex: 1,
                  background: '#f9fafb',
                  borderRadius: '4px',
                  padding: '8px',
                  fontSize: '12px',
                  overflowY: 'auto'
                }}
              >
                {movePairs.length === 0 ? (
                  <div style={{ color: '#9ca3af', textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
                    No moves yet
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr', gap: '6px 10px' }}>
                    {movePairs.map((pair) => (
                      <div key={pair.moveNumber} style={{ display: 'contents' }}>
                        <div style={{ color: '#6b7280', fontWeight: 700 }}>{pair.moveNumber}.</div>
                        <div style={{ color: '#111827', fontWeight: 600 }}>{pair.white || ''}</div>
                        <div style={{ color: '#111827', fontWeight: 600 }}>{pair.black || ''}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Chat */}
            <div className="card" style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px', height: '200px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#4b5563' }}>GAME CHAT</h4>
              <div ref={chatScrollRef} style={{ flex: 1, background: '#f9fafb', borderRadius: '4px', padding: '8px', fontSize: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {((liveGameState.chatMessages && liveGameState.chatMessages.length > 0) || optimisticChatMessages.length > 0) ? (
                  [...(liveGameState.chatMessages || []), ...optimisticChatMessages].map((msg: any, i) => {
                    // Check if message is from me or opponent based on username
                    // If liveGameState.lichessUserId matches msg.username, it's me
                    const isMe =
                      (msg.username || '').toLowerCase() === (liveGameState.lichessUserId || '').toLowerCase()
                    
                    return (
                      <div key={i} style={{ 
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        background: isMe ? '#dbeafe' : '#e5e7eb',
                        color: isMe ? '#1e40af' : '#374151',
                        padding: '4px 8px', 
                        borderRadius: '4px', 
                        maxWidth: '85%',
                        wordBreak: 'break-word'
                      }}>
                        <span style={{ fontWeight: 700, marginRight: '4px', fontSize: '11px', opacity: 0.8 }}>
                          {msg.username}:
                        </span>
                        {msg.text}
                      </div>
                    )
                  })
                ) : (
                  <div style={{ color: '#9ca3af', textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
                    No messages yet
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '5px' }}>
                <input
                  type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="Send message..."
                  style={{ flex: 1, padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px' }}
                />
                <button onClick={handleSendChat} disabled={!chatInput.trim()} className="button" style={{ padding: '6px 12px', fontSize: '13px' }}>
                  Send
                </button>
              </div>
            </div>

            {/* Commentary */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <LiveCommentary fen={liveGameState.fen} moves={liveGameState.moves} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
