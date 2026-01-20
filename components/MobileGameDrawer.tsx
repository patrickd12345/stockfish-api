'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from '@/components/ChessBoard'

type GameRow = {
  id: string
  white?: string
  black?: string
  opening_name?: string
  date?: string
  result?: string
  pgn_text?: string
}

type GameOrigin = 'lichess' | 'chess.com' | 'pgn' | 'unknown'

function inferGameOriginFromPgn(pgnText?: string): GameOrigin {
  if (!pgnText) return 'unknown'
  const pgn = pgnText.toLowerCase()
  if (pgn.includes('lichess.org')) return 'lichess'
  if (pgn.includes('chess.com') || pgn.includes('www.chess.com')) return 'chess.com'
  if (pgn.includes('[event') || pgn.includes('[site')) return 'pgn'
  return 'unknown'
}

function formatOriginLabel(origin: GameOrigin): string {
  if (origin === 'chess.com') return 'Chess.com'
  if (origin === 'lichess') return 'Lichess'
  if (origin === 'pgn') return 'PGN'
  return 'Unknown'
}

interface MobileGameDrawerProps {
  open: boolean
  onClose: () => void
  onGameSelect: (id: string) => void
  selectedGameId: string | null
  refreshKey: number
}

const USER_USERNAMES = ['patrickd1234567', 'patrickd12345678', 'anonymous19670705']

const getGameStatus = (game: GameRow): 'win' | 'loss' | 'draw' | 'unknown' => {
  const white = game.white?.toLowerCase()
  const black = game.black?.toLowerCase()
  const isUserWhite = USER_USERNAMES.some((u) => white?.includes(u.toLowerCase()))
  const isUserBlack = USER_USERNAMES.some((u) => black?.includes(u.toLowerCase()))

  if (!isUserWhite && !isUserBlack) return 'unknown'

  const result = game.result?.replace(/\s/g, '')
  if (result === '1-0') return isUserWhite ? 'win' : 'loss'
  if (result === '0-1') return isUserBlack ? 'win' : 'loss'
  if (result === '1/2-1/2') return 'draw'
  return 'unknown'
}

const buildFenHistoryFromPgn = (pgn: string): string[] => {
  const chess = new Chess()
  chess.loadPgn(pgn)
  const history = chess.history({ verbose: true })
  const fens: string[] = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1']

  const tmp = new Chess()
  for (const move of history) {
    tmp.move(move)
    fens.push(tmp.fen())
  }

  return fens
}

export default function MobileGameDrawer({
  open,
  onClose,
  onGameSelect,
  selectedGameId,
  refreshKey,
}: MobileGameDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [games, setGames] = useState<GameRow[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [moveHistory, setMoveHistory] = useState<string[]>([])
  const [currentMoveIdx, setCurrentMoveIdx] = useState(-1)
  const [boardFen, setBoardFen] = useState('start')

  const fetchGames = useCallback(async (query = '') => {
    setSearching(true)
    setError(null)
    try {
      const url = query ? `/api/games?q=${encodeURIComponent(query)}` : '/api/games'
      const res = await fetch(url)
      const data = await res.json()
      setGames(Array.isArray(data.games) ? data.games : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch games')
    } finally {
      setSearching(false)
    }
  }, [])


  // Fetch only when opened (keeps mobile landing fast and DB-free).
  useEffect(() => {
    if (!open) {
      return
    }
    fetchGames('')
  }, [open, refreshKey, fetchGames])

  useEffect(() => {
    if (!open) {
      return
    }
    const timer = setTimeout(() => {
      fetchGames(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [open, searchQuery, fetchGames])

  useEffect(() => {
    if (!open) {
      return
    }
    if (!selectedGameId) {
      setMoveHistory([])
      setCurrentMoveIdx(-1)
      setBoardFen('start')
      return
    }
    const selected = games.find((g) => g.id === selectedGameId)
    if (!selected?.pgn_text) {
      setMoveHistory([])
      setCurrentMoveIdx(-1)
      setBoardFen('start')
      return
    }
    try {
      const fens = buildFenHistoryFromPgn(selected.pgn_text)
      setMoveHistory(fens)
      setCurrentMoveIdx(fens.length - 1)
      setBoardFen(fens[fens.length - 1])
    } catch {
      setMoveHistory([])
      setCurrentMoveIdx(-1)
      setBoardFen('start')
    }
  }, [open, selectedGameId, games])

  const navigateTo = (idx: number) => {
    if (idx >= 0 && idx < moveHistory.length) {
      setCurrentMoveIdx(idx)
      setBoardFen(moveHistory[idx])
    }
  }

  const hasPreview = moveHistory.length > 0 && currentMoveIdx >= 0

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-sage-950/80 backdrop-blur-sm z-[1000] flex justify-start items-stretch pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" onClick={onClose} role="dialog" aria-label="Games drawer">
      <div
        className="w-[min(92vw,420px)] h-full bg-sage-900 text-sage-100 shadow-2xl flex flex-col border-r border-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/5 flex items-center justify-between gap-3">
          <div className="font-bold text-lg text-terracotta tracking-tight">Games</div>
          <button
            onClick={onClose}
            className="btn-secondary py-2 px-3 text-sm"
          >
            Close
          </button>
        </div>

        <div className="p-4 border-b border-white/5 bg-sage-800/20">
          <input
            type="text"
            placeholder="Search white, black, opening..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-sage-900 border border-sage-700/50 rounded-lg px-3 py-2.5 text-sage-100 placeholder-sage-500 focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/20 transition-all"
          />

          <div className="mt-4">
            <div className="text-xs font-bold text-sage-400 uppercase tracking-widest mb-2 opacity-80">
              Preview
            </div>
            <div className="bg-sage-800 rounded-xl p-3 shadow-inner border border-white/5 flex justify-center">
              <ChessBoard fen={boardFen} size="240px" />
            </div>

            <div className="mt-3 flex justify-center gap-1.5 flex-wrap">
              <NavButton onClick={() => navigateTo(0)} disabled={!hasPreview || currentMoveIdx === 0} label="«" title="Start" />
              <NavButton onClick={() => navigateTo(Math.max(0, currentMoveIdx - 5))} disabled={!hasPreview || currentMoveIdx === 0} label="-5" title="Back 5" />
              <NavButton onClick={() => navigateTo(currentMoveIdx - 1)} disabled={!hasPreview || currentMoveIdx === 0} label="‹" title="Back" />
              <NavButton onClick={() => navigateTo(currentMoveIdx + 1)} disabled={!hasPreview || currentMoveIdx === moveHistory.length - 1} label="›" title="Forward" />
              <NavButton onClick={() => navigateTo(Math.min(moveHistory.length - 1, currentMoveIdx + 5))} disabled={!hasPreview || currentMoveIdx === moveHistory.length - 1} label="+5" title="Forward 5" />
              <NavButton onClick={() => navigateTo(moveHistory.length - 1)} disabled={!hasPreview || currentMoveIdx === moveHistory.length - 1} label="»" title="End" />
            </div>

            <div className="mt-2 text-xs text-sage-500 text-center font-mono">
              {hasPreview ? `Move ${Math.floor(currentMoveIdx / 2) + 1}` : 'Select a game to preview'}
            </div>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto scrollbar-hide bg-sage-900/50">
          {searching && <div className="text-sm text-sage-400 text-center py-4">Searching...</div>}
          {error && <div className="text-sm text-rose-400 text-center py-4">{error}</div>}
          {!searching && !error && games.length === 0 && (
            <div className="text-sm text-sage-500 text-center py-4 italic">No games found.</div>
          )}

          <div className="flex flex-col gap-3">
            {games.map((game) => {
              const isSelected = selectedGameId === game.id
              const status = getGameStatus(game)
              const origin = inferGameOriginFromPgn(game.pgn_text)

              let cardClass = "w-full text-left p-3 rounded-xl border transition-all duration-200 relative group active:scale-[0.98] "

              if (isSelected) {
                cardClass += "bg-terracotta text-sage-900 border-terracotta shadow-lg shadow-terracotta/20"
              } else if (status === 'win') {
                cardClass += "bg-emerald-900/20 text-emerald-100 border-emerald-800/30 active:bg-emerald-900/30"
              } else if (status === 'loss') {
                cardClass += "bg-rose-900/20 text-rose-100 border-rose-800/30 active:bg-rose-900/30"
              } else {
                cardClass += "bg-sage-800/40 text-sage-300 border-white/5 active:bg-sage-800/60"
              }

              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => onGameSelect(game.id)}
                  className={cardClass}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="font-bold text-sm truncate">
                      {game.white || 'White'} <span className="text-xs opacity-70 font-normal">vs</span> {game.black || 'Black'}
                    </div>
                    <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${isSelected ? 'border-sage-900/20 bg-sage-900/10 text-sage-900' : 'border-white/10 bg-black/20 text-sage-400'}`}>
                      {formatOriginLabel(origin)}
                    </div>
                  </div>
                  <div className={`text-xs truncate mb-1 ${isSelected ? 'text-sage-900/80' : 'text-sage-400'}`}>
                    {game.opening_name || 'Unknown Opening'}
                  </div>
                  <div className={`text-[10px] ${isSelected ? 'text-sage-900/70' : 'text-sage-500'}`}>
                    {(game.date || 'Unknown date') + ' • ' + (game.result || '*')}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function NavButton({ onClick, disabled, label, title }: { onClick: () => void, disabled: boolean, label: string, title: string }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className="w-10 h-10 flex items-center justify-center bg-sage-800 text-sage-300 rounded-lg hover:bg-sage-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium border border-white/5 active:scale-95"
        >
            {label}
        </button>
    )
}
