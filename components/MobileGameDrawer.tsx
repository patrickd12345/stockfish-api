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
  moves_uci?: string
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

const buildFenHistoryFromUciMoves = (movesUci: string): string[] => {
  const trimmed = (movesUci || '').trim()
  if (!trimmed) return []
  const tokens = trimmed.split(/\s+/).filter(Boolean)
  const fens: string[] = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1']
  const tmp = new Chess()
  for (const token of tokens) {
    if (token.length < 4) break
    const from = token.slice(0, 2)
    const to = token.slice(2, 4)
    const promotion = token.length >= 5 ? token.slice(4, 5) : undefined
    try {
      const move = tmp.move({ from, to, promotion: promotion as any })
      if (!move) break
      fens.push(tmp.fen())
    } catch {
      break
    }
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
    try {
      let fens: string[] = []
      if (selected?.pgn_text) {
        fens = buildFenHistoryFromPgn(selected.pgn_text)
      } else if (typeof selected?.moves_uci === 'string' && selected.moves_uci.trim()) {
        fens = buildFenHistoryFromUciMoves(selected.moves_uci)
      }
      if (fens.length === 0) {
        setMoveHistory([])
        setCurrentMoveIdx(-1)
        setBoardFen('start')
        return
      }
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

  const overlayStyle = useMemo<React.CSSProperties>(
    () => ({
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.35)',
      zIndex: 1000,
      display: 'flex',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }),
    []
  )

  const panelStyle = useMemo<React.CSSProperties>(
    () => ({
      width: 'min(92vw, 420px)',
      height: '100%',
      background: '#111827',
      color: 'white',
      boxShadow: '4px 0 18px rgba(0,0,0,0.25)',
      display: 'flex',
      flexDirection: 'column',
    }),
    []
  )

  if (!open) {
    return null
  }

  return (
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-label="Games drawer">
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: '14px 14px 10px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: '16px' }}>Games</div>
          <button
            onClick={onClose}
            className="button"
            style={{
              padding: '8px 12px',
              background: '#374151',
              fontSize: '14px',
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <input
            type="text"
            placeholder="Search white, black, opening..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 10px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.18)',
              background: '#0b1220',
              color: 'white',
              outline: 'none',
            }}
          />

          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '10px' }}>
              Preview
            </div>
            <div style={{ background: '#0b1220', borderRadius: '12px', padding: '10px' }}>
              <ChessBoard fen={boardFen} size="240px" />
            </div>

            <div
              style={{
                marginTop: '10px',
                display: 'flex',
                justifyContent: 'center',
                gap: '6px',
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={() => navigateTo(0)}
                disabled={!hasPreview || currentMoveIdx === 0}
                style={navBtnStyle(!hasPreview || currentMoveIdx === 0)}
                title="Start"
              >
                «
              </button>
              <button
                onClick={() => navigateTo(Math.max(0, currentMoveIdx - 5))}
                disabled={!hasPreview || currentMoveIdx === 0}
                style={navBtnStyle(!hasPreview || currentMoveIdx === 0)}
                title="Back 5"
              >
                -5
              </button>
              <button
                onClick={() => navigateTo(currentMoveIdx - 1)}
                disabled={!hasPreview || currentMoveIdx === 0}
                style={navBtnStyle(!hasPreview || currentMoveIdx === 0)}
                title="Back"
              >
                ‹
              </button>
              <button
                onClick={() => navigateTo(currentMoveIdx + 1)}
                disabled={!hasPreview || currentMoveIdx === moveHistory.length - 1}
                style={navBtnStyle(!hasPreview || currentMoveIdx === moveHistory.length - 1)}
                title="Forward"
              >
                ›
              </button>
              <button
                onClick={() => navigateTo(Math.min(moveHistory.length - 1, currentMoveIdx + 5))}
                disabled={!hasPreview || currentMoveIdx === moveHistory.length - 1}
                style={navBtnStyle(!hasPreview || currentMoveIdx === moveHistory.length - 1)}
                title="Forward 5"
              >
                +5
              </button>
              <button
                onClick={() => navigateTo(moveHistory.length - 1)}
                disabled={!hasPreview || currentMoveIdx === moveHistory.length - 1}
                style={navBtnStyle(!hasPreview || currentMoveIdx === moveHistory.length - 1)}
                title="End"
              >
                »
              </button>
            </div>

            <div style={{ marginTop: '8px', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
              {hasPreview ? `Move ${Math.floor(currentMoveIdx / 2) + 1}` : 'Select a game to preview'}
            </div>
          </div>

          {/* Manual Stockfish queue controls removed: analysis runs automatically after startup import. */}
        </div>

        <div style={{ padding: '12px 14px', flex: 1, overflowY: 'auto' }}>
          {searching && <div style={{ fontSize: '12px', color: '#9ca3af' }}>Searching...</div>}
          {error && <div style={{ fontSize: '12px', color: '#fca5a5' }}>{error}</div>}
          {!searching && !error && games.length === 0 && (
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>No games found.</div>
          )}

          <div style={{ display: 'grid', gap: '10px' }}>
            {games.map((game) => {
              const isSelected = selectedGameId === game.id
              const status = getGameStatus(game)
              const origin =
                game?.id && String(game.id).startsWith('lichess:')
                  ? 'lichess'
                  : inferGameOriginFromPgn(game.pgn_text)

              let bgColor = '#0b1220'
              let borderColor = 'rgba(255,255,255,0.12)'
              let subTextColor = '#9ca3af'

              if (isSelected) {
                bgColor = '#1d4ed8'
                borderColor = '#60a5fa'
                subTextColor = '#dbeafe'
              } else if (status === 'win') {
                bgColor = '#065f46'
              } else if (status === 'loss') {
                bgColor = '#991b1b'
                subTextColor = '#fecaca'
              }

              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => onGameSelect(game.id)}
                  aria-current={isSelected ? 'true' : undefined}
                  aria-label={`Game: ${game.white} versus ${game.black}, Result: ${game.result}, Date: ${game.date}`}
                  style={{
                    textAlign: 'left',
                    padding: '12px',
                    borderRadius: '12px',
                    border: `1px solid ${borderColor}`,
                    background: bgColor,
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px' }} aria-hidden="true">
                      {game.white || 'White'} vs {game.black || 'Black'}
                    </div>
                    <div
                      aria-label={`Game origin: ${formatOriginLabel(origin)}`}
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '999px',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        background: 'rgba(0,0,0,0.22)',
                        border: '1px solid rgba(255,255,255,0.18)',
                        color: subTextColor,
                        flexShrink: 0,
                      }}
                    >
                      {formatOriginLabel(origin)}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: subTextColor, marginTop: '4px' }}>
                    {game.opening_name || 'Unknown Opening'}
                  </div>
                  <div style={{ fontSize: '12px', color: subTextColor, marginTop: '4px' }}>
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

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: '#374151',
    color: 'white',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    minWidth: '42px',
  }
}

