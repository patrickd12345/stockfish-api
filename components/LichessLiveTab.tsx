'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from './ChessBoard'
import LiveCommentary from './LiveCommentary'
import { useLichessBoard } from '@/hooks/useLichessBoard'
import type { LichessAccount } from '@/lib/lichess/account'

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

function getMaterialPointDiffFromFen(fen: string): number {
  // Returns (whitePoints - blackPoints), using standard material values.
  // Example: if White is up a pawn, returns +1. If Black is up a rook, returns -5.
  const placement = (fen || '').split(' ')[0] || ''
  if (!placement.includes('/')) return 0

  const values: Record<string, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
  }

  let white = 0
  let black = 0

  for (const ch of placement) {
    if (ch === '/' || (ch >= '1' && ch <= '8')) continue
    const lower = ch.toLowerCase()
    const value = values[lower]
    if (typeof value !== 'number') continue
    if (ch === lower) black += value
    else white += value
  }

  return white - black
}

function getPerfKeyFromMinutes(minutes: number): string {
  if (minutes < 3) return 'bullet'
  if (minutes < 8) return 'blitz'
  if (minutes < 25) return 'rapid'
  return 'classical'
}

type TimeControlPreset = { label: string; t: number; i: number }
type TimeControlCategory = 'Bullet' | 'Blitz' | 'Rapid' | 'Classical'

function getTimeControlCategory(minutes: number): TimeControlCategory {
  if (minutes < 3) return 'Bullet'
  if (minutes < 8) return 'Blitz'
  if (minutes < 25) return 'Rapid'
  return 'Classical'
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

function getLastPlyUciMoves(uciMoves: string, plyCount: number): string[] {
  const tokens = (uciMoves || '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  return tokens.slice(Math.max(0, tokens.length - plyCount))
}

function uciMovesToFenAtPly(uciMoves: string, ply: number): { fen: string; appliedMoves: string } {
  const tokens = (uciMoves || '').trim().split(/\s+/).filter(Boolean)
  const clamped = Math.max(0, Math.min(tokens.length, ply))
  const chess = new Chess()

  const applied: string[] = []
  for (let i = 0; i < clamped; i++) {
    const token = tokens[i]
    if (token.length < 4) break
    const from = token.slice(0, 2)
    const to = token.slice(2, 4)
    const promotion = token.length >= 5 ? token.slice(4, 5) : undefined
    try {
      const move = chess.move({ from, to, promotion: promotion as any })
      if (!move) break
      applied.push(token)
    } catch {
      break
    }
  }

  return { fen: chess.fen(), appliedMoves: applied.join(' ') }
}

export default function LichessLiveTab() {
  const { state: liveGameState, displayClock, error, refreshState } = useLichessBoard(500)
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [session, setSession] = useState<LichessSession | null>(null)
  const [myAccount, setMyAccount] = useState<LichessAccount | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [seeking, setSeeking] = useState(false)
  const seekAbortRef = useRef<AbortController | null>(null)
  const [pendingOpenChallengeId, setPendingOpenChallengeId] = useState<string | null>(null)
  const [returningToLobby, setReturningToLobby] = useState(false)
  const [dismissedGameId, setDismissedGameId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [isResigning, setIsResigning] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isChallenging, setIsChallenging] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const [optimisticChatMessages, setOptimisticChatMessages] = useState<
    Array<{ id: string; username: string; text: string; room: string; receivedAt: string }>
  >([])
  const [viewPly, setViewPly] = useState<number | null>(null)

  const [seekTime, setSeekTime] = useState(3)
  const [seekIncrement, setSeekIncrement] = useState(2)
  const [seekAny, setSeekAny] = useState(false)
  const [seekRated, setSeekRated] = useState(false)

  const [ratingDiffLower, setRatingDiffLower] = useState<number | null>(null)
  const [ratingDiffUpper, setRatingDiffUpper] = useState<number | null>(null)
  const [ratingPreset, setRatingPreset] = useState<'any' | '0' | '100' | '200' | '300' | '500' | 'custom'>('any')

  const DISMISSED_GAME_STORAGE_KEY = 'lichess_dismissed_game_id_v1'

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_GAME_STORAGE_KEY)
      setDismissedGameId(stored || null)
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If a new live game starts, clear any previous dismissal.
  useEffect(() => {
    if (!liveGameState?.gameId) return
    if (liveGameState.status !== 'started' && liveGameState.status !== 'playing') return
    try {
      localStorage.removeItem(DISMISSED_GAME_STORAGE_KEY)
    } catch {
      // ignore
    }
    setDismissedGameId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveGameState?.gameId, liveGameState?.status])

  // If a live game starts, clear any pending open challenge tracking.
  useEffect(() => {
    if (!liveGameState?.gameId) return
    if (liveGameState.status !== 'started' && liveGameState.status !== 'playing') return
    setPendingOpenChallengeId(null)
  }, [liveGameState?.gameId, liveGameState?.status])

  const displayGame = useMemo(() => {
    if (!liveGameState) return null

    // While we're actively seeking/challenging, don't "fall back" to showing the last finished game.
    // This avoids the UX where the board loads, then resets a few seconds later when a real match begins.
    if (seeking && liveGameState.status !== 'started' && liveGameState.status !== 'playing') return null

    if (dismissedGameId && liveGameState.gameId === dismissedGameId) return null
    return liveGameState
  }, [dismissedGameId, liveGameState, seeking])

  const groupedTimeControls = useMemo(() => {
    const presets: TimeControlPreset[] = [
      { label: '1+0', t: 1, i: 0 },
      { label: '2+1', t: 2, i: 1 },
      { label: '3+0', t: 3, i: 0 },
      { label: '3+2', t: 3, i: 2 },
      { label: '5+0', t: 5, i: 0 },
      { label: '5+3', t: 5, i: 3 },
      { label: '10+0', t: 10, i: 0 },
      { label: '10+5', t: 10, i: 5 },
    ]

    const groups: Record<TimeControlCategory, TimeControlPreset[]> = {
      Bullet: [],
      Blitz: [],
      Rapid: [],
      Classical: [],
    }

    for (const preset of presets) {
      groups[getTimeControlCategory(preset.t)].push(preset)
    }

    return [
      { category: 'Bullet' as const, presets: groups.Bullet },
      { category: 'Blitz' as const, presets: groups.Blitz },
      { category: 'Rapid' as const, presets: groups.Rapid },
      { category: 'Classical' as const, presets: groups.Classical },
    ].filter((group) => group.presets.length > 0)
  }, [])

  const applyRatingPreset = useCallback(
    (preset: 'any' | '0' | '100' | '200' | '300' | '500' | 'custom') => {
      setRatingPreset(preset)
      if (preset === 'custom') return
      if (preset === 'any') {
        setRatingDiffLower(null)
        setRatingDiffUpper(null)
        return
      }
      const value = Number(preset)
      setRatingDiffLower(value)
      setRatingDiffUpper(value)
    },
    []
  )

  const ratingPayload = useMemo(() => {
    const isAny = ratingDiffLower === null && ratingDiffUpper === null
    if (isAny) return {}
    // Lichess can reject ultra-narrow ranges; treat 0/0 as "no filter".
    if (ratingDiffLower === 0 && ratingDiffUpper === 0) return {}
    return { ratingDiffLower, ratingDiffUpper }
  }, [ratingDiffLower, ratingDiffUpper])

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
    const fetchAccount = async () => {
      try {
        const res = await fetch('/api/lichess/account')
        if (!res.ok) return
        const data = await res.json()
        setMyAccount(data)
      } catch {
        // Ignore; UI falls back to cookie id / '?'
      }
    }

    fetchAccount()
  }, [])

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [liveGameState?.chatMessages])

  useEffect(() => {
    setViewPly(null)
  }, [liveGameState?.gameId, liveGameState?.status])

  useEffect(() => {
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

  const handleDisconnect = async () => {
    if (disconnecting) return
    setDisconnecting(true)
    setActionError(null)
    try {
      // Best-effort stop first (avoids leaving stream handlers running).
      try {
        await fetch('/api/lichess/board/session/stop', { method: 'POST' })
      } catch {
        // ignore
      }
      // Ensure we don't "resume" a stale active game after reconnect.
      try {
        await fetch('/api/lichess/board/session/clear-active', { method: 'POST' })
      } catch {
        // ignore
      }

      const res = await fetch('/api/lichess/oauth/revoke', { method: 'POST' })
      let data: any = {}
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect')

      // Cookie is cleared server-side; update UI state immediately.
      setSession(null)
      setMyAccount(null)
      await refreshState()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  const handleSeekMatch = async () => {
    // Toggle behavior: while seeking, allow cancel (abort request => closes seek connection).
    if (seeking) {
      try {
        if (pendingOpenChallengeId) {
          await fetch(`/api/lichess/challenge/${encodeURIComponent(pendingOpenChallengeId)}/cancel`, {
            method: 'POST',
          }).catch(() => null)
          setPendingOpenChallengeId(null)
        } else {
          seekAbortRef.current?.abort()
          seekAbortRef.current = null
        }
      } finally {
        setSeeking(false)
        setActionError(null)
        refreshState()
      }
      return
    }

    setSeeking(true)
    setActionError(null)

    const controller = new AbortController()
    seekAbortRef.current = controller
    try {
      const res = await fetch('/api/lichess/board/seek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          any: seekAny,
          ...(seekAny ? {} : { time: seekTime, increment: seekIncrement }),
          rated: seekRated,
          variant: 'standard',
          color: 'random',
          ...ratingPayload,
        })
      })
      let data: any = {}
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
      if (!res.ok) throw new Error(data.error || 'Failed to seek match')
      if (typeof data?.mode === 'string' && data.mode === 'open_challenge' && typeof data?.challengeId === 'string') {
        setPendingOpenChallengeId(data.challengeId)
      } else {
        setPendingOpenChallengeId(null)
      }
    } catch (err) {
      // Aborting cancels the pending seek; don't surface as an error.
      if (err instanceof DOMException && err.name === 'AbortError') {
        setSeeking(false)
        setActionError(null)
        return
      }
      setActionError(err instanceof Error ? err.message : 'Failed to seek match')
      setSeeking(false)
    } finally {
      if (seekAbortRef.current === controller) {
        seekAbortRef.current = null
      }
      refreshState()
    }
  }

  const handleReturnToLobby = async () => {
    if (returningToLobby) return
    setReturningToLobby(true)
    setActionError(null)
    try {
      // Hide the current finished game immediately (and persist across reload).
      const currentGameId = liveGameState?.gameId ?? null
      if (currentGameId) {
        try {
          localStorage.setItem(DISMISSED_GAME_STORAGE_KEY, currentGameId)
        } catch {
          // ignore
        }
        setDismissedGameId(currentGameId)
      }

      const res = await fetch('/api/lichess/board/session/clear-active', { method: 'POST' })
      let data: any = {}
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
      if (!res.ok) throw new Error(data.error || 'Failed to return to lobby')

      setViewPly(null)
      await refreshState()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to return to lobby')
      await refreshState()
    } finally {
      setReturningToLobby(false)
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
        body: JSON.stringify({ time: seekTime, increment: seekIncrement, rated: seekRated })
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
          // Bots are always casual; Elo never changes vs bots.
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
          setTimeout(() => refreshState(), 250)
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

  const isGameActive = !!(displayGame?.status === 'started' || displayGame?.status === 'playing')
  const isPostGame = !!displayGame && !isGameActive

  useEffect(() => {
    if (isGameActive) {
      setSeeking(false)
    }
  }, [isGameActive])

  const turnColor = displayGame?.fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const myColor = displayGame?.myColor ?? 'white'
  
  const opponentTime = myColor === 'white' 
    ? (displayClock?.btime ?? displayGame?.btime ?? 0) 
    : (displayClock?.wtime ?? displayGame?.wtime ?? 0)
    
  const myTime = myColor === 'white' 
    ? (displayClock?.wtime ?? displayGame?.wtime ?? 0) 
    : (displayClock?.btime ?? displayGame?.btime ?? 0)

  const isOpponentTurn = turnColor !== myColor
  const isMyTurn = turnColor === myColor

  const liveMoveTokens = useMemo(
    () => (displayGame?.moves || '').trim().split(/\s+/).filter(Boolean),
    [displayGame?.moves]
  )
  const fullPly = liveMoveTokens.length
  const isReviewMode = viewPly !== null && viewPly >= 0 && viewPly < fullPly

  const view = useMemo(() => {
    if (!displayGame) return { fen: 'start', moves: '' }
    if (!isReviewMode) return { fen: displayGame.fen, moves: displayGame.moves }
    const { fen, appliedMoves } = uciMovesToFenAtPly(displayGame.moves, viewPly ?? 0)
    return { fen, moves: appliedMoves }
  }, [displayGame, isReviewMode, viewPly])

  const materialLeader = useMemo(() => {
    const diff = getMaterialPointDiffFromFen(view.fen)
    if (diff === 0) return { leader: null as 'white' | 'black' | null, points: 0 }
    return { leader: diff > 0 ? ('white' as const) : ('black' as const), points: Math.abs(diff) }
  }, [view.fen])

  const opponentColor = myColor === 'white' ? 'black' : 'white'
  const myMaterialBadge = materialLeader.leader === myColor ? materialLeader.points : 0
  const opponentMaterialBadge = materialLeader.leader === opponentColor ? materialLeader.points : 0

  const movePairs = useMemo(() => uciMovesToMovePairs(displayGame?.moves || ''), [displayGame?.moves])
  const lastMoveHighlights = useMemo(() => {
    const lastOne = getLastPlyUciMoves(view.moves || '', 1)
    const uci = lastOne[0]
    if (!uci) return undefined

    const highlights: Record<string, React.CSSProperties> = {}
    if (uci.length < 4) return undefined
    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    const style: React.CSSProperties = {
      backgroundColor: 'rgba(34, 197, 94, 0.30)',
      boxShadow: 'inset 0 0 0 4px rgba(22, 163, 74, 0.75)'
    }
    highlights[from] = style
    highlights[to] = style

    return highlights
  }, [view.moves])

  const handleBack = () => {
    if (!liveGameState) return
    const next = (viewPly ?? fullPly) - 1
    setViewPly(Math.max(0, next))
  }

  const handleForward = () => {
    if (viewPly === null) return
    const next = viewPly + 1
    if (next >= fullPly) {
      setViewPly(null)
      return
    }
    setViewPly(next)
  }

  const handleGoLive = () => setViewPly(null)

  return (
    <div className="glass-panel p-6 min-h-[700px] flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-terracotta tracking-tight">Lichess Live Mode</h2>
        <div className="flex gap-3">
          {(!session || session.status === 'error') && (
            <button onClick={handleConnect} className="btn-secondary">
              Reconnect Lichess
            </button>
          )}
          {session && session.status !== 'idle' && (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting || loading}
              className="btn-secondary bg-rose-900/30 text-rose-200 border-rose-800/50 hover:bg-rose-900/50 disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          )}
          {!session || session.status === 'idle' ? (
            <button onClick={handleStartSession} disabled={loading} className="btn-primary bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500">
              {loading ? 'Starting...' : 'Start Live Session'}
            </button>
          ) : (
            <button onClick={handleStopSession} disabled={loading} className="btn-primary bg-rose-600 hover:bg-rose-500 text-white border-rose-500">
              {loading ? 'Stopping...' : 'Stop Live Session'}
            </button>
          )}
        </div>
      </div>

      {(error || actionError || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('error'))) && (
        <div className="bg-rose-900/50 border border-rose-700 text-rose-200 px-4 py-2 rounded-lg text-sm">
          {error || actionError || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('error'))}
        </div>
      )}

      {!session || session.status === 'idle' ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-sage-900/30 rounded-xl border border-dashed border-sage-700 p-10">
          <div className="text-6xl mb-4 grayscale opacity-50">📡</div>
          <h3 className="text-lg font-bold text-sage-300 mb-2">Live Session Inactive</h3>
          <p className="max-w-md text-sage-400 text-center">
            Connect your Lichess account and start a session to play and get real-time AI commentary.
          </p>
        </div>
      ) : !displayGame ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-sage-900/30 rounded-xl p-10 border border-white/5">
          <div className="text-6xl mb-6">♟️</div>
          <h3 className="text-lg font-bold text-sage-200 mb-2">Ready to Play</h3>
          
          <div className="mb-8 w-full max-w-lg flex flex-col gap-4">
            <div className="w-full flex flex-col items-center gap-2">
              <div className="text-[11px] font-black tracking-widest uppercase text-sage-400 text-center">
                Time control
              </div>
              <button
                type="button"
                onClick={() => setSeekAny(true)}
                className={`px-4 py-2 rounded-lg font-semibold text-sm border transition-all ${
                  seekAny
                    ? 'bg-terracotta text-sage-900 border-terracotta'
                    : 'bg-sage-800 text-sage-300 border-sage-700 hover:bg-sage-700'
                }`}
              >
                Any (first available)
              </button>
              <div className="text-[12px] text-sage-500 text-center">
                Picks a very common time control to maximize match speed.
              </div>
            </div>

            {groupedTimeControls.map((group) => (
              <div key={group.category} className="w-full">
                <div className="mb-2 text-[11px] font-black tracking-widest uppercase text-sage-400 text-center">
                  {group.category}
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {group.presets.map((tc) => (
                    <button
                      key={tc.label}
                      onClick={() => {
                        setSeekAny(false)
                        setSeekTime(tc.t)
                        setSeekIncrement(tc.i)
                      }}
                      disabled={seekAny}
                      className={`px-4 py-2 rounded-lg font-semibold text-sm border transition-all ${
                        !seekAny && seekTime === tc.t && seekIncrement === tc.i
                          ? 'bg-terracotta text-sage-900 border-terracotta'
                          : 'bg-sage-800 text-sage-300 border-sage-700 hover:bg-sage-700'
                      } ${seekAny ? 'opacity-40 cursor-not-allowed hover:bg-sage-800' : ''}`}
                    >
                      {tc.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="w-full pt-2 border-t border-white/5">
              <div className="mb-2 text-[11px] font-black tracking-widest uppercase text-sage-400 text-center">
                Rating difference
              </div>

              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  { key: 'any', label: '∞' },
                  { key: '0', label: '0' },
                  { key: '100', label: '±100' },
                  { key: '200', label: '±200' },
                  { key: '300', label: '±300' },
                  { key: '500', label: '±500' },
                  { key: 'custom', label: 'Custom' },
                ].map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyRatingPreset(p.key as any)}
                    className={`px-3 py-1.5 rounded-lg font-semibold text-xs border transition-all ${
                      ratingPreset === p.key
                        ? 'bg-terracotta text-sage-900 border-terracotta'
                        : 'bg-sage-800 text-sage-300 border-sage-700 hover:bg-sage-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {ratingPreset === 'custom' ? (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-sage-950/30 border border-white/5 rounded-xl p-3">
                    <div className="text-xs font-bold text-sage-300 mb-2">Lower (below)</div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        value={ratingDiffLower ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.trim()
                          setRatingDiffLower(v === '' ? null : Math.max(0, Number(v)))
                        }}
                        placeholder="∞"
                        className="w-full bg-sage-900/50 border border-sage-700/50 text-sage-100 text-sm rounded-lg px-3 py-2 placeholder-sage-600 focus:outline-none focus:border-terracotta/50 transition-colors"
                      />
                      <button
                        type="button"
                        className="btn-secondary px-3"
                        onClick={() => setRatingDiffLower(0)}
                        title="0"
                      >
                        0
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-3"
                        onClick={() => setRatingDiffLower(null)}
                        title="∞"
                      >
                        ∞
                      </button>
                    </div>
                  </div>

                  <div className="bg-sage-950/30 border border-white/5 rounded-xl p-3">
                    <div className="text-xs font-bold text-sage-300 mb-2">Upper (above)</div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        value={ratingDiffUpper ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.trim()
                          setRatingDiffUpper(v === '' ? null : Math.max(0, Number(v)))
                        }}
                        placeholder="∞"
                        className="w-full bg-sage-900/50 border border-sage-700/50 text-sage-100 text-sm rounded-lg px-3 py-2 placeholder-sage-600 focus:outline-none focus:border-terracotta/50 transition-colors"
                      />
                      <button
                        type="button"
                        className="btn-secondary px-3"
                        onClick={() => setRatingDiffUpper(0)}
                        title="0"
                      >
                        0
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-3"
                        onClick={() => setRatingDiffUpper(null)}
                        title="∞"
                      >
                        ∞
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-2 text-[12px] text-sage-500 text-center">
                Filters opponents by rating range relative to the selected time control rating.
              </div>
            </div>

            <div className="w-full pt-2 border-t border-white/5">
              <div className="mb-2 text-[11px] font-black tracking-widest uppercase text-sage-400 text-center">
                Rated
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setSeekRated(false)}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm border transition-all ${
                    !seekRated
                      ? 'bg-terracotta text-sage-900 border-terracotta'
                      : 'bg-sage-800 text-sage-300 border-sage-700 hover:bg-sage-700'
                  }`}
                >
                  Casual
                </button>
                <button
                  type="button"
                  onClick={() => setSeekRated(true)}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm border transition-all ${
                    seekRated
                      ? 'bg-terracotta text-sage-900 border-terracotta'
                      : 'bg-sage-800 text-sage-300 border-sage-700 hover:bg-sage-700'
                  }`}
                >
                  Rated
                </button>
              </div>
              <div className="mt-2 text-[12px] text-sage-500 text-center">
                Elo only changes on rated games.
              </div>
            </div>
          </div>

          <div className="flex gap-3 w-full max-w-lg">
            <button 
              onClick={handleSeekMatch} 
                disabled={loading} 
                className={`flex-1 py-4 text-lg font-bold rounded-xl transition-colors disabled:opacity-50 ${
                  seeking
                    ? 'bg-rose-500/20 text-rose-200 border border-rose-500/30 hover:bg-rose-500/25'
                    : 'bg-terracotta text-sage-900 hover:bg-terracotta-light'
                }`}
            >
                {seeking ? 'Cancel Seeking' : 'Seek Human'}
            </button>
            <button 
              onClick={() => handlePracticeBot('maia1')} 
              disabled={seeking || loading} 
              className="flex-1 py-4 text-lg font-bold rounded-xl bg-sage-700 text-sage-200 hover:bg-sage-600 transition-colors disabled:opacity-50"
            >
              Practice Bot
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="relative bg-[#1f1306] rounded-xl p-8 flex flex-col items-center justify-center gap-4 shadow-2xl border border-orange-900/30">
            {isPostGame ? (
              <div className="w-full max-w-[500px] bg-amber-900/30 border border-amber-700/50 text-amber-200 px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-between gap-3">
                <div className="min-w-0 truncate">
                  Game over: {formatStatus(displayGame!.status)} vs {displayGame!.opponentName || 'Opponent'}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      try {
                        await fetch('/api/lichess/board/session/clear-active', { method: 'POST' })
                      } finally {
                        refreshState()
                      }
                    }}
                    className="text-amber-300 hover:text-white"
                  >
                    Back to lobby
                  </button>
                  <button onClick={() => refreshState()} className="text-amber-300 hover:text-white">
                    Refresh
                  </button>
                </div>
              </div>
            ) : null}
            <div className="w-full max-w-[500px] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="text-xs font-black text-amber-400 uppercase tracking-widest">
                  Live Game
                </div>
                {isReviewMode && (
                  <div className="text-[10px] font-bold text-blue-300 bg-blue-900/30 px-2 py-0.5 rounded">
                    Review {viewPly}/{fullPly}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="text-xs font-bold text-sage-300 mr-2">
                  {(() => {
                    const baseMs =
                      typeof displayGame!.initialTimeMs === 'number' && displayGame!.initialTimeMs > 0
                        ? displayGame!.initialTimeMs
                        : Math.max(displayGame!.wtime ?? 0, displayGame!.btime ?? 0)
                    const incMs =
                      typeof displayGame!.initialIncrementMs === 'number' && displayGame!.initialIncrementMs >= 0
                        ? displayGame!.initialIncrementMs
                        : Math.max(displayGame!.winc ?? 0, displayGame!.binc ?? 0)

                    const minutes = Math.floor(baseMs / 60000)
                    const incrementSeconds = Math.floor(incMs / 1000)
                    return `${getPerfName(baseMs)} ${minutes}+${incrementSeconds}`
                  })()}
                </div>
                <button onClick={handleBack} disabled={fullPly === 0 || (viewPly ?? fullPly) <= 0} className="p-1.5 bg-sage-800 text-sage-300 rounded hover:bg-sage-700 disabled:opacity-30">
                  ◀
                </button>
                <button onClick={handleForward} disabled={viewPly === null} className="p-1.5 bg-sage-800 text-sage-300 rounded hover:bg-sage-700 disabled:opacity-30">
                  ▶
                </button>
                {isReviewMode && (
                  <button onClick={handleGoLive} className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-500">
                    Live
                  </button>
                )}
              </div>
            </div>
            
            <div className="w-full max-w-[500px] flex justify-between items-end text-sage-200">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-lg bg-sage-800 flex items-center justify-center text-2xl shadow-inner border border-white/5">
                  {displayGame!.myColor === 'black' ? '😎' : '👤'}
                </div>
                <div>
                  <div className="font-bold text-sm">
                    {displayGame!.opponentName || 'Opponent'}
                    {opponentMaterialBadge > 0 ? (
                      <span className="ml-2 text-emerald-300 font-black">{`(+${opponentMaterialBadge})`}</span>
                    ) : null}{' '}
                    <span className="font-normal text-sage-400 ml-1">({displayGame!.opponentRating || '?'})</span>
                  </div>
                  {!isGameActive && (
                    <div className="text-[10px] font-bold text-amber-400 mt-0.5">
                      {formatStatus(displayGame!.status)}
                    </div>
                  )}
                </div>
              </div>

              <div className={`bg-[#262626] px-4 py-1.5 rounded-md font-mono text-2xl shadow-inner border border-white/5 transition-opacity ${isGameActive && isOpponentTurn ? 'border-b-4 border-b-rose-500 opacity-100' : 'border-b-4 border-b-transparent opacity-70'}`}>
                {formatClockTime(opponentTime)}
              </div>
            </div>

            <div className="w-full max-w-[500px] shadow-2xl rounded-lg overflow-hidden border border-[#5d4037]">
              <ChessBoard 
                fen={view.fen} 
                theme="wood" 
                size="100%" 
                isDraggable={isGameActive && !isReviewMode}
                orientation={myColor}
                onMove={handleMove}
                highlightSquares={lastMoveHighlights}
              />
            </div>

            <div className="w-full max-w-[500px] flex justify-between items-start gap-4">
              <div className="flex items-center gap-3 text-sage-200 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-sage-800 flex items-center justify-center text-2xl shadow-inner border border-white/5 shrink-0">
                  {myColor === 'black' ? '😎' : '👤'}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">
                    {myAccount?.username || displayGame!.lichessUserId || 'Me'}
                    {myMaterialBadge > 0 ? (
                      <span className="ml-2 text-emerald-300 font-black">{`(+${myMaterialBadge})`}</span>
                    ) : null}
                    <span className="font-normal text-sage-400 ml-1">
                      {(() => {
                        const baseMs =
                          typeof displayGame!.initialTimeMs === 'number' && displayGame!.initialTimeMs > 0
                            ? displayGame!.initialTimeMs
                            : Math.max(displayGame!.wtime ?? 0, displayGame!.btime ?? 0)
                        const minutes = Math.floor(baseMs / 60000)
                        const key = getPerfKeyFromMinutes(minutes)
                        const rating = (myAccount?.perfs as any)?.[key]?.rating
                        return typeof rating === 'number' ? `(${rating})` : '(?)'
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              <div className={`bg-black px-6 py-2 rounded-lg text-white font-mono text-4xl font-bold shadow-lg transition-all ${isGameActive && isMyTurn ? 'border-b-4 border-b-emerald-500 scale-105' : 'border-b-4 border-b-transparent opacity-90'}`}>
                {formatClockTime(myTime)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 h-full min-h-0">
            <div className="bg-sage-900/40 rounded-xl p-4 border border-white/5">
              <h4 className="text-xs font-bold text-sage-400 mb-3 uppercase tracking-wider">Game Actions</h4>
              <div className="flex flex-col gap-2">
                {isGameActive ? (
                  <>
                    <button onClick={handleResign} disabled={isResigning} className="btn-secondary bg-rose-900/30 text-rose-200 border-rose-800/50 hover:bg-rose-900/50 w-full">
                      {isResigning ? 'Resigning...' : 'Resign'}
                    </button>
                    <button onClick={handleOfferDraw} disabled={isDrawing} className="btn-secondary w-full">
                      {isDrawing ? 'Offering...' : 'Offer Draw'}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={handleReturnToLobby} disabled={returningToLobby} className="btn-primary w-full">
                      {returningToLobby ? 'Returning…' : 'Return to lobby'}
                    </button>
                    {displayGame!.opponentName && (
                      <button onClick={handleRematch} disabled={isChallenging || seeking} className="btn-secondary w-full bg-blue-900/30 text-blue-200 border-blue-800/50">
                        {isChallenging ? 'Challenging...' : 'Rematch Opponent'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="bg-sage-900/40 rounded-xl p-4 border border-white/5 flex flex-col h-48">
              <h4 className="text-xs font-bold text-sage-400 mb-2 uppercase tracking-wider">Moves</h4>
              <div className="flex-1 bg-sage-950/30 rounded-lg p-2 overflow-y-auto border border-white/5 text-xs">
                {movePairs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sage-600 italic">
                    No moves yet
                  </div>
                ) : (
                  <div className="grid grid-cols-[30px_1fr_1fr] gap-y-1">
                    {movePairs.map((pair) => (
                      <div key={pair.moveNumber} className="contents hover:bg-white/5">
                        <div className="text-sage-500 font-mono text-right pr-2">{pair.moveNumber}.</div>
                        <div className="text-sage-200 font-medium pl-1">{pair.white || ''}</div>
                        <div className="text-sage-200 font-medium pl-1">{pair.black || ''}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-sage-900/40 rounded-xl p-4 border border-white/5 flex flex-col h-56">
              <h4 className="text-xs font-bold text-sage-400 mb-2 uppercase tracking-wider">Chat</h4>
              <div ref={chatScrollRef} className="flex-1 bg-sage-950/30 rounded-lg p-2 overflow-y-auto border border-white/5 mb-2 flex flex-col gap-2">
                {((displayGame!.chatMessages && displayGame!.chatMessages.length > 0) || optimisticChatMessages.length > 0) ? (
                  [...(displayGame!.chatMessages || []), ...optimisticChatMessages].map((msg: any, i) => {
                    const isMe = (msg.username || '').toLowerCase() === (displayGame!.lichessUserId || '').toLowerCase()
                    return (
                      <div key={i} className={`max-w-[90%] px-2 py-1.5 rounded-lg text-xs ${isMe ? 'self-end bg-terracotta/20 text-terracotta-light border border-terracotta/30' : 'self-start bg-sage-800 text-sage-300 border border-sage-700'}`}>
                        <span className="font-bold mr-1 opacity-70">{msg.username}:</span>
                        {msg.text}
                      </div>
                    )
                  })
                ) : (
                  <div className="h-full flex items-center justify-center text-sage-600 italic text-xs">
                    No messages yet
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="Send..."
                  className="flex-1 bg-sage-800 border border-sage-700 rounded px-2 py-1 text-xs text-sage-200 focus:outline-none focus:border-terracotta/50"
                />
                <button onClick={handleSendChat} disabled={!chatInput.trim()} className="px-3 py-1 bg-sage-700 text-sage-200 text-xs rounded hover:bg-sage-600 disabled:opacity-50">
                  Send
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-sage-900/40 rounded-xl p-4 border border-white/5 overflow-hidden flex flex-col">
              <h4 className="text-xs font-bold text-sage-400 mb-2 uppercase tracking-wider shrink-0">
                Coach
              </h4>
              <div className="flex-1 overflow-y-auto">
                <div className="text-sage-500 text-sm">
                  {isPostGame ? 'Post-game recap is shown in the overlay on the board.' : 'The coach overlay will update after each move.'}
                </div>
                {/* Keep the coach flyover visible; in post-game we enlarge it. */}
                <LiveCommentary
                  fen={view.fen}
                  moves={view.moves}
                  myColor={myColor}
                  variant={isPostGame ? 'postGame' : 'live'}
                  status={isPostGame ? String(displayGame!.status ?? '') : null}
                  winner={displayGame!.winner ?? null}
                  opponentName={displayGame!.opponentName ?? null}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
