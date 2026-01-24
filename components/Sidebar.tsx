'use client'

import { useState, useEffect, useCallback } from 'react'
import ChessBoard from './ChessBoard'
import { Chess } from 'chess.js'
import { useExecutionMode } from '@/contexts/ExecutionModeContext'

interface SidebarProps {
  onGamesProcessed: () => void
  onGameSelect: (id: string) => void
  selectedGameId: string | null
  refreshKey: number
}

type GameOrigin = 'lichess' | 'chess.com' | 'pgn' | 'unknown'

function inferGameOriginFromPgn(pgnText?: string): GameOrigin {
  if (!pgnText) return 'unknown'
  const pgn = pgnText.toLowerCase()

  // Common PGN site tags:
  // - [Site "https://lichess.org/<id>"]
  // - [Site "https://www.chess.com/game/live/<id>"]
  if (pgn.includes('lichess.org')) return 'lichess'
  if (pgn.includes('chess.com') || pgn.includes('www.chess.com')) return 'chess.com'

  // If it's a PGN but no known site.
  if (pgn.includes('[event') || pgn.includes('[site')) return 'pgn'
  return 'unknown'
}

function formatOriginLabel(origin: GameOrigin): string {
  if (origin === 'chess.com') return 'Chess.com'
  if (origin === 'lichess') return 'Lichess'
  if (origin === 'pgn') return 'PGN'
  return 'Unknown'
}

function LocalSidebar({ onGameSelect, selectedGameId }: { onGameSelect: (id: string) => void; selectedGameId: string | null }) {
  const [boardFen, setBoardFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  const [moveHistory, setMoveHistory] = useState<string[]>([])
  const [currentMoveIdx, setCurrentMoveIdx] = useState(-1)

  const navigateTo = (idx: number) => {
    if (idx >= 0 && idx < moveHistory.length) {
      setCurrentMoveIdx(idx)
      setBoardFen(moveHistory[idx])
    }
  }

  return (
    <div className="fixed left-0 top-0 h-full w-80 bg-sage-900/95 backdrop-blur-xl border-r border-white/5 flex flex-col z-30 shadow-2xl">
      <div className="p-4 bg-sage-900/50 border-b border-white/5">
        <h2 className="text-sm font-semibold text-sage-300 uppercase tracking-wider mb-3">Game Preview</h2>
        <div className="mb-3 bg-sage-800 rounded-lg p-2 shadow-inner border border-white/5">
          <ChessBoard fen={boardFen} size="200px" />
        </div>
        
        {/* CD Player Controls */}
        <div className="flex justify-center gap-1 bg-sage-950/50 p-2 rounded-lg border border-white/5">
          <ControlButton onClick={() => navigateTo(0)} disabled={moveHistory.length === 0 || currentMoveIdx === 0} label="«" title="Start" />
          <ControlButton onClick={() => navigateTo(Math.max(0, currentMoveIdx - 5))} disabled={moveHistory.length === 0 || currentMoveIdx === 0} label="-5" title="Back 5" />
          <ControlButton onClick={() => navigateTo(currentMoveIdx - 1)} disabled={moveHistory.length === 0 || currentMoveIdx === 0} label="‹" title="Back" />
          <ControlButton onClick={() => navigateTo(currentMoveIdx + 1)} disabled={moveHistory.length === 0 || currentMoveIdx === moveHistory.length - 1} label="›" title="Forward" />
          <ControlButton onClick={() => navigateTo(Math.min(moveHistory.length - 1, currentMoveIdx + 5))} disabled={moveHistory.length === 0 || currentMoveIdx === moveHistory.length - 1} label="+5" title="Forward 5" />
          <ControlButton onClick={() => navigateTo(moveHistory.length - 1)} disabled={moveHistory.length === 0 || currentMoveIdx === moveHistory.length - 1} label="»" title="End" />
        </div>

        <div className="mt-2 text-xs text-center text-sage-500 font-mono">
          {moveHistory.length > 0 ? `Move ${Math.floor(currentMoveIdx / 2) + 1} (${currentMoveIdx}/${moveHistory.length - 1})` : 'Select a game'}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-sage-900/30">
        <div className="p-4 pb-2">
          <h2 className="text-sm font-semibold text-sage-300 uppercase tracking-wider mb-2">History</h2>
          <div className="text-xs text-sage-500 text-center py-4">
            Game history requires server mode
          </div>
        </div>
      </div>
    </div>
  )
}

function ServerSidebar({ onGamesProcessed, onGameSelect, selectedGameId, refreshKey }: SidebarProps) {
  const [boardFen, setBoardFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  const [moveHistory, setMoveHistory] = useState<string[]>([])
  const [currentMoveIdx, setCurrentMoveIdx] = useState(-1)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [games, setGames] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  const USER_USERNAMES = ['patrickd1234567', 'patrickd12345678', 'anonymous19670705']

  const buildFenHistoryFromUciMoves = useCallback((movesUci: string): string[] => {
    const trimmed = (movesUci || '').trim()
    if (!trimmed) return []

    const tokens = trimmed.split(/\s+/).filter(Boolean)
    const fens: string[] = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1']
    const tmpChess = new Chess()

    for (const token of tokens) {
      if (token.length < 4) break
      const from = token.slice(0, 2)
      const to = token.slice(2, 4)
      const promotion = token.length >= 5 ? token.slice(4, 5) : undefined
      try {
        const move = tmpChess.move({ from, to, promotion: promotion as any })
        if (!move) break
        fens.push(tmpChess.fen())
      } catch {
        break
      }
    }

    return fens
  }, [])

  const loadGameHistory = useCallback((pgn: string) => {
    const chess = new Chess()
    try {
      chess.loadPgn(pgn)
      const history = chess.history({ verbose: true })
      const fens = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1']
      
      const tempChess = new Chess()
      for (const move of history) {
        tempChess.move(move)
        fens.push(tempChess.fen())
      }
      
      setMoveHistory(fens)
      setCurrentMoveIdx(fens.length - 1)
      setBoardFen(fens[fens.length - 1])
    } catch (e) {
      console.error('Failed to load PGN for history:', e)
    }
  }, [])

  useEffect(() => {
    if (selectedGameId) {
      const selectedGame = games.find(g => g.id === selectedGameId)
      if (selectedGame?.pgn_text) {
        loadGameHistory(selectedGame.pgn_text)
        return
      }
      if (selectedGame && typeof selectedGame.moves_uci === 'string' && selectedGame.moves_uci.trim()) {
        const fens = buildFenHistoryFromUciMoves(selectedGame.moves_uci)
        if (fens.length > 0) {
          setMoveHistory(fens)
          setCurrentMoveIdx(fens.length - 1)
          setBoardFen(fens[fens.length - 1])
        } else {
          setMoveHistory([])
          setCurrentMoveIdx(-1)
          setBoardFen('start')
        }
        return
      }
      if (selectedGame) {
        fetch(`/api/games/${selectedGameId}/pgn`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => { if (data?.pgn) loadGameHistory(data.pgn) })
          .catch(() => {})
      }
    }
  }, [selectedGameId, games, loadGameHistory, buildFenHistoryFromUciMoves])

  const navigateTo = (idx: number) => {
    if (idx >= 0 && idx < moveHistory.length) {
      setCurrentMoveIdx(idx)
      setBoardFen(moveHistory[idx])
    }
  }

  const getGameStatus = (game: any): 'win' | 'loss' | 'draw' | 'unknown' => {
    const white = game.white?.toLowerCase()
    const black = game.black?.toLowerCase()
    const isUserWhite = USER_USERNAMES.some(u => white?.includes(u.toLowerCase()))
    const isUserBlack = USER_USERNAMES.some(u => black?.includes(u.toLowerCase()))
    
    if (!isUserWhite && !isUserBlack) return 'unknown'
    
    const result = game.result?.replace(/\s/g, '')
    
    if (result === '1-0') {
      return isUserWhite ? 'win' : 'loss'
    } else if (result === '0-1') {
      return isUserBlack ? 'win' : 'loss'
    } else if (result === '1/2-1/2') {
      return 'draw'
    }
    
    return 'unknown'
  }

  useEffect(() => {
    fetchGames()
  }, [refreshKey])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchGames(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchGames = async (query = '') => {
    setSearching(true)
    try {
      const url = query ? `/api/games?q=${encodeURIComponent(query)}` : '/api/games'
      const res = await fetch(url)
      const data = await res.json()
      setGames(data.games || [])
    } catch (e) {
      console.error('Failed to fetch games:', e)
    } finally {
      setSearching(false)
    }
  }


  const extractTimeFromPgn = (pgnText: string | undefined): string | null => {
    if (!pgnText) return null
    const timeMatch = pgnText.match(/\[(?:UTC|Start)?Time\s+"([^"]+)"\]/i)
    if (timeMatch && timeMatch[1]) {
      return timeMatch[1]
    }
    return null
  }

  const formatDateWithEST = (dateStr: string | undefined, pgnText: string | undefined): string => {
    if (!dateStr) return 'Unknown date'
    const timeStr = extractTimeFromPgn(pgnText)
    if (timeStr) {
      const timeParts = timeStr.split(':')
      if (timeParts.length >= 2) {
        const hours = parseInt(timeParts[0], 10)
        const minutes = parseInt(timeParts[1], 10)
        const dateParts = dateStr.split('.')
        if (dateParts.length === 3) {
          const year = parseInt(dateParts[0], 10)
          const month = parseInt(dateParts[1], 10) - 1
          const day = parseInt(dateParts[2], 10)
          const utcDate = new Date(Date.UTC(year, month, day, hours, minutes, 0))
          const estTime = utcDate.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })
          return `${dateStr} ${estTime} EST`
        }
      }
    }
    return dateStr
  }

  return (
    <div className="fixed left-0 top-0 h-full w-80 bg-sage-900/95 backdrop-blur-xl border-r border-white/5 flex flex-col z-30 shadow-2xl">
      <div className="p-4 bg-sage-900/50 border-b border-white/5">
        <h2 className="text-sm font-semibold text-sage-300 uppercase tracking-wider mb-3">Game Preview</h2>
        <div className="mb-3 bg-sage-800 rounded-lg p-2 shadow-inner border border-white/5">
          <ChessBoard fen={boardFen} size="200px" />
        </div>
        
        {/* CD Player Controls */}
        <div className="flex justify-center gap-1 bg-sage-950/50 p-2 rounded-lg border border-white/5">
          <ControlButton onClick={() => navigateTo(0)} disabled={moveHistory.length === 0 || currentMoveIdx === 0} label="«" title="Start" />
          <ControlButton onClick={() => navigateTo(Math.max(0, currentMoveIdx - 5))} disabled={moveHistory.length === 0 || currentMoveIdx === 0} label="-5" title="Back 5" />
          <ControlButton onClick={() => navigateTo(currentMoveIdx - 1)} disabled={moveHistory.length === 0 || currentMoveIdx === 0} label="‹" title="Back" />
          <ControlButton onClick={() => navigateTo(currentMoveIdx + 1)} disabled={moveHistory.length === 0 || currentMoveIdx === moveHistory.length - 1} label="›" title="Forward" />
          <ControlButton onClick={() => navigateTo(Math.min(moveHistory.length - 1, currentMoveIdx + 5))} disabled={moveHistory.length === 0 || currentMoveIdx === moveHistory.length - 1} label="+5" title="Forward 5" />
          <ControlButton onClick={() => navigateTo(moveHistory.length - 1)} disabled={moveHistory.length === 0 || currentMoveIdx === moveHistory.length - 1} label="»" title="End" />
        </div>

        <div className="mt-2 text-xs text-center text-sage-500 font-mono">
          {moveHistory.length > 0 ? `Move ${Math.floor(currentMoveIdx / 2) + 1} (${currentMoveIdx}/${moveHistory.length - 1})` : 'Select a game'}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-sage-900/30">
        <div className="p-4 pb-2">
            <h2 className="text-sm font-semibold text-sage-300 uppercase tracking-wider mb-2">History</h2>
            <input
            type="text"
            placeholder="Search opponent, opening..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-sage-800/50 border border-sage-700/50 text-sage-200 text-sm rounded-md px-3 py-2 placeholder-sage-600 focus:outline-none focus:border-terracotta/50 transition-colors"
            />
        </div>
        
        <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-hide">
          {searching && <div className="text-xs text-sage-500 text-center py-4">Searching...</div>}
          {!searching && games.length === 0 && (
            <div className="text-xs text-sage-500 text-center py-4">No games found.</div>
          )}
          {games.map((game) => {
            const status = getGameStatus(game)
            const isSelected = selectedGameId === game.id
            const origin =
              game?.id && String(game.id).startsWith('lichess:')
                ? 'lichess'
                : inferGameOriginFromPgn(game.pgn_text)
            
            let cardClass = "mb-2 p-3 rounded-lg cursor-pointer border transition-all duration-200 relative group overflow-hidden "

            if (isSelected) {
              cardClass += "bg-terracotta text-sage-900 border-terracotta shadow-md shadow-terracotta/10"
            } else if (status === 'win') {
              cardClass += "bg-emerald-900/20 text-emerald-100 border-emerald-800/30 hover:bg-emerald-900/30"
            } else if (status === 'loss') {
              cardClass += "bg-rose-900/20 text-rose-100 border-rose-800/30 hover:bg-rose-900/30"
            } else {
              cardClass += "bg-sage-800/40 text-sage-300 border-white/5 hover:bg-sage-800/60"
            }

            return (
              <button
                key={game.id}
                type="button"
                onClick={() => onGameSelect(game.id)}
                aria-pressed={isSelected}
                aria-current={isSelected ? 'true' : undefined}
                aria-label={`Game: ${game.white} versus ${game.black}, Result: ${game.result}, Date: ${game.date}`}
                className={cardClass + " w-full text-left"}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="font-semibold text-sm truncate" aria-hidden="true">
                    {game.white || 'White'} <span className="text-xs opacity-70">vs</span> {game.black || 'Black'}
                  </div>
                  <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${isSelected ? 'border-sage-900/20 bg-sage-900/10 text-sage-900' : 'border-white/10 bg-black/20 text-sage-400'}`}>
                    {formatOriginLabel(origin)}
                  </div>
                </div>
                <div className={`text-xs truncate ${isSelected ? 'text-sage-800' : 'text-sage-400'}`}>
                  {game.opening_name || 'Unknown Opening'}
                </div>
                <div className={`text-[10px] mt-1 ${isSelected ? 'text-sage-800/70' : 'text-sage-500'}`}>
                  {formatDateWithEST(game.date, game.pgn_text)} • {game.result}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Sidebar(props: SidebarProps) {
  const executionMode = useExecutionMode()
  
  // Early return BEFORE any effects
  if (executionMode === 'local') {
    return <LocalSidebar onGameSelect={props.onGameSelect} selectedGameId={props.selectedGameId} />
  }
  
  return <ServerSidebar {...props} />
}

function ControlButton({ onClick, disabled, label, title }: { onClick: () => void, disabled: boolean, label: string, title: string }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className="w-8 h-8 flex items-center justify-center bg-sage-800 text-sage-300 rounded hover:bg-sage-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
            {label}
        </button>
    )
}
