'use client'

import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Chess } from 'chess.js'
import ChessBoard from './ChessBoard'
import { useStockfish } from '@/hooks/useStockfish'

export default function GameInspector() {
  const [games, setGames] = useState<any[]>([])
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [pgn, setPgn] = useState<string>('')
  const [moveIndex, setMoveIndex] = useState(0)
  const [board, setBoard] = useState<Chess | null>(null)
  const [loading, setLoading] = useState(true)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [fullHistory, setFullHistory] = useState<string[]>([])

  // Live Analysis State
  const [isLiveAnalysisEnabled, setIsLiveAnalysisEnabled] = useState(false)
  const { state: engineState, startAnalysis, stopAnalysis } = useStockfish({ depth: 22 })
  const [movesData, setMovesData] = useState<any[]>([])
  const [pvSnapshots, setPvSnapshots] = useState<any[]>([])
  const [analysisMeta, setAnalysisMeta] = useState<{
    engineVersion: string | null
    analysisDepth: number | null
  } | null>(null)
  const [filteredCount, setFilteredCount] = useState<number | null>(null)
  const [engineStats, setEngineStats] = useState<{
    avgCentipawnLoss: number | null
    blunders: number | null
    mistakes: number | null
    inaccuracies: number | null
    evalSwingMax: number | null
    openingCpl: number | null
    middlegameCpl: number | null
    endgameCpl: number | null
    gameLength: number | null
  } | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const openingFilter = searchParams.get('opening')
  const outcomeFilter = searchParams.get('outcome')
  const requestedGameId = searchParams.get('gameId')
  const requestedPlyRaw = searchParams.get('ply')
  const requestedPly = requestedPlyRaw !== null ? Number(requestedPlyRaw) : null
  const appliedGameIdRef = useRef<string | null>(null)
  const appliedPlyRef = useRef<string | null>(null)
  const evalSeries = useMemo(
    () =>
      movesData.map((move) =>
        typeof move.engine_eval === 'number' ? move.engine_eval : null
      ),
    [movesData]
  )
  const evalSeriesFilled = useMemo(() => {
    let lastValue: number | null = null
    return evalSeries.map((value) => {
      if (typeof value === 'number') {
        lastValue = value
        return value
      }
      return lastValue
    })
  }, [evalSeries])

  const fetchGames = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (openingFilter && outcomeFilter) {
        params.set('opening', openingFilter)
        params.set('outcome', outcomeFilter)
      }
      const url = params.toString() ? `/api/games?${params.toString()}` : '/api/games'
      const response = await fetch(url)
      const data = await response.json()
      setGames(data.games || [])
      setFilteredCount(typeof data.totalCount === 'number' ? data.totalCount : null)
      if (Array.isArray(data.games) && data.games.length > 0) {
        const list = data.games as Array<{ id: string }>
        const canUseRequested =
          typeof requestedGameId === 'string' &&
          requestedGameId.length > 0 &&
          list.some((g) => g.id === requestedGameId)

        if (canUseRequested && appliedGameIdRef.current !== requestedGameId) {
          appliedGameIdRef.current = requestedGameId
          setSelectedGameId(requestedGameId)
        } else if (!selectedGameId) {
          setSelectedGameId(list[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch games:', error)
    } finally {
      setLoading(false)
    }
  }, [openingFilter, outcomeFilter, requestedGameId, selectedGameId])

  useEffect(() => {
    fetchGames()
  }, [fetchGames])

  useEffect(() => {
    if (selectedGameId) {
      fetchGameAnalysis(selectedGameId)
    }
  }, [selectedGameId])

  useEffect(() => {
    if (pgn) {
      const game = new Chess()
      try {
        game.loadPgn(pgn)
        // Start at initial position and replay moves as moveIndex changes.
        setBoard(new Chess())
        setMoveIndex(0)
        setFullHistory(game.history())
      } catch (e) {
        console.error('Failed to load PGN:', e)
      }
    } else {
      setBoard(null)
      setMoveIndex(0)
      setFullHistory([])
    }
  }, [pgn])

  useEffect(() => {
    if (!selectedGameId) return
    if (!requestedGameId) return
    if (selectedGameId !== requestedGameId) return
    if (!Number.isFinite(requestedPly as number)) return
    if (!board) return

    const ply = Math.max(0, Math.min(fullHistory.length, Math.trunc(requestedPly as number)))
    const key = `${selectedGameId}:${ply}`
    if (appliedPlyRef.current === key) return
    appliedPlyRef.current = key

    const newBoard = new Chess()
    for (let i = 0; i < ply; i++) {
      newBoard.move(fullHistory[i])
    }
    setBoard(newBoard)
    setMoveIndex(ply)
  }, [board, fullHistory, requestedGameId, requestedPly, selectedGameId])

  // Sync Live Engine
  useEffect(() => {
    if (!isLiveAnalysisEnabled) {
      stopAnalysis()
      return
    }
    if (board) {
      startAnalysis(board.fen(), board.turn())
    }
  }, [board, isLiveAnalysisEnabled, startAnalysis, stopAnalysis])

  const fetchGameAnalysis = async (gameId: string) => {
    setAnalysisLoading(true)
    try {
      const response = await fetch(`/api/games/${gameId}/analysis`)
      const data = await response.json()
      setPgn(data.pgn || '')
      setMovesData(Array.isArray(data.moves) ? data.moves : [])
      setPvSnapshots(Array.isArray(data.pvSnapshots) ? data.pvSnapshots : [])
      setAnalysisMeta({
        engineVersion: data.engineVersion || null,
        analysisDepth: data.analysisDepth ?? null,
      })
      setEngineStats({
        avgCentipawnLoss: data.avgCentipawnLoss ?? null,
        blunders: data.blunders ?? null,
        mistakes: data.mistakes ?? null,
        inaccuracies: data.inaccuracies ?? null,
        evalSwingMax: data.evalSwingMax ?? null,
        openingCpl: data.openingCpl ?? null,
        middlegameCpl: data.middlegameCpl ?? null,
        endgameCpl: data.endgameCpl ?? null,
        gameLength: data.gameLength ?? null,
      })
    } catch (error) {
      console.error('Failed to fetch game analysis:', error)
    }
    setAnalysisLoading(false)
  }

  const navigateMove = useCallback((direction: 'prev' | 'next') => {
    if (!board) return

    const moves = fullHistory
    const newIndex = direction === 'next' ? moveIndex + 1 : moveIndex - 1

    if (newIndex < 0 || newIndex > moves.length) return

    const newBoard = new Chess()
    for (let i = 0; i < newIndex; i++) {
      newBoard.move(moves[i])
    }
    setBoard(newBoard)
    setMoveIndex(newIndex)
  }, [board, fullHistory, moveIndex])

  const navigateGame = useCallback((direction: 'older' | 'newer') => {
    if (!selectedGameId || games.length === 0) return
    const currentIndex = games.findIndex((g) => g.id === selectedGameId)
    if (currentIndex === -1) return
    const nextIndex = direction === 'older' ? currentIndex + 1 : currentIndex - 1
    if (nextIndex < 0 || nextIndex >= games.length) return
    setSelectedGameId(games[nextIndex].id)
  }, [selectedGameId, games])

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        navigateMove('prev')
      } else if (e.key === 'ArrowRight') {
        navigateMove('next')
      } else if (e.key === 'ArrowUp') {
        navigateGame('newer')
      } else if (e.key === 'ArrowDown') {
        navigateGame('older')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigateMove, navigateGame])

  const jumpGames = (delta: number) => {
    if (!selectedGameId || games.length === 0) return
    const currentIndex = games.findIndex((g) => g.id === selectedGameId)
    if (currentIndex === -1) return
    const nextIndex = Math.min(games.length - 1, Math.max(0, currentIndex + delta))
    setSelectedGameId(games[nextIndex].id)
  }

  const formatGameLabel = (game: any) => {
    const white = game.white || 'White'
    const black = game.black || 'Black'
    const date = game.date || 'Unknown date'
    const result = game.result || '*'
    return `${white} vs ${black} (${date}) ${result}`
  }

  if (loading) {
    return <div className="glass-panel p-8 text-center text-sage-400 animate-pulse">Loading games...</div>
  }

  if (games.length === 0) {
    return <div className="glass-panel p-8 text-center text-sage-400">No games processed yet.</div>
  }

  const moves = fullHistory

  return (
    <div className="glass-panel p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-terracotta tracking-tight">Game Inspector</h2>

        {openingFilter && outcomeFilter && (
            <div className="flex items-center gap-2 bg-sage-800/50 px-3 py-1 rounded-full border border-white/5">
            <div className="text-xs text-sage-400">
                Filter: {openingFilter} · {outcomeFilter} ({filteredCount ?? games.length} games)
            </div>
            <button
                onClick={() => router.replace('/?tab=replay')}
                className="text-terracotta hover:text-white transition-colors"
                aria-label="Clear filter"
            >
                ✕
            </button>
            </div>
        )}
      </div>

      <div className="mb-6 bg-sage-900/40 p-4 rounded-xl border border-white/5">
        <label className="block text-xs font-semibold text-sage-400 uppercase tracking-wider mb-2">Select Game</label>
        <select
          value={selectedGameId || ''}
          onChange={(e) => setSelectedGameId(e.target.value)}
          className="w-full bg-sage-800 text-sage-200 border border-sage-700 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-terracotta/50 mb-3"
        >
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {formatGameLabel(game)}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-2 justify-center">
            <InspectorButton onClick={() => setSelectedGameId(games[games.length - 1]?.id ?? null)} disabled={!selectedGameId || games.length === 0 || games[games.length - 1]?.id === selectedGameId} label="Start" />
            <InspectorButton onClick={() => jumpGames(5)} disabled={!selectedGameId || games.length === 0 || games[games.length - 1]?.id === selectedGameId} label="-5" />
            <InspectorButton onClick={() => navigateGame('older')} disabled={!selectedGameId || games.length === 0 || games[games.length - 1]?.id === selectedGameId} label="Prev" />
            <InspectorButton onClick={() => navigateGame('newer')} disabled={!selectedGameId || games.length === 0 || games[0]?.id === selectedGameId} label="Next" />
            <InspectorButton onClick={() => jumpGames(-5)} disabled={!selectedGameId || games.length === 0 || games[0]?.id === selectedGameId} label="+5" />
            <InspectorButton onClick={() => setSelectedGameId(games[0]?.id ?? null)} disabled={!selectedGameId || games.length === 0 || games[0]?.id === selectedGameId} label="End" />
        </div>
      </div>

      {board && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col items-center">
            <div className="bg-sage-800 p-3 rounded-lg shadow-xl border border-white/5 mb-4">
                <ChessBoard fen={board.fen()} />
            </div>

            <div className="w-full">
                <input
                type="range"
                min="0"
                max={moves.length}
                value={moveIndex}
                onChange={(e) => {
                    const idx = Number(e.target.value)
                    const newBoard = new Chess()
                    for (let i = 0; i < idx; i++) {
                    newBoard.move(moves[i])
                    }
                    setBoard(newBoard)
                    setMoveIndex(idx)
                }}
                className="w-full h-2 bg-sage-700 rounded-lg appearance-none cursor-pointer accent-terracotta"
                />
                <div className="text-center mt-2 text-xs text-sage-400 font-mono">
                Move {Math.floor(moveIndex/2) + 1} / {Math.ceil(moves.length/2)}
                </div>
            </div>

            <div className="flex gap-2 justify-center mt-4 w-full">
                <button
                onClick={() => navigateMove('prev')}
                disabled={moveIndex === 0}
                className="btn-secondary flex-1"
                >
                Previous
                </button>
                <button
                onClick={() => navigateMove('next')}
                disabled={moveIndex >= moves.length}
                className="btn-secondary flex-1"
                >
                Next
                </button>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-sage-900/30 rounded-xl p-4 border border-white/5">
                <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-sage-200">Analysis</h3>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-sage-300 hover:text-white transition-colors">
                    <input
                    type="checkbox"
                    checked={isLiveAnalysisEnabled}
                    onChange={(e) => setIsLiveAnalysisEnabled(e.target.checked)}
                    className="accent-terracotta"
                    />
                    Live Stockfish (WASM)
                </label>
                </div>

                {isLiveAnalysisEnabled && (
                <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg flex justify-between items-center">
                    <span className="font-bold text-blue-200 text-lg">
                        {engineState.mate
                        ? `Mate in ${Math.abs(engineState.mate)}`
                        : engineState.evaluation !== null
                            ? (engineState.evaluation / 100).toFixed(2)
                            : '...'}
                    </span>
                    <div className="text-right">
                        <div className="text-xs text-blue-300">Depth {engineState.depth}</div>
                        <div className="text-xs text-blue-300/70 font-mono truncate max-w-[200px]">
                            {engineState.bestLine || engineState.bestMove || '...'}
                        </div>
                    </div>
                </div>
                )}

                <h3 className="text-xs font-semibold text-sage-400 uppercase tracking-wider mb-2">Stockfish Summary</h3>
                {analysisLoading ? (
                <div className="text-sage-500 text-sm animate-pulse">Loading engine summary...</div>
                ) : engineStats ? (
                <div className="grid grid-cols-3 gap-2 mb-2">
                    <StatBox label="Avg CPL" value={engineStats.avgCentipawnLoss === null ? '--' : engineStats.avgCentipawnLoss.toFixed(1)} />
                    <StatBox label="Blunders" value={engineStats.blunders} />
                    <StatBox label="Mistakes" value={engineStats.mistakes} />
                    <StatBox label="Inaccuracies" value={engineStats.inaccuracies} />
                    <StatBox label="Max Swing" value={engineStats.evalSwingMax === null ? '--' : engineStats.evalSwingMax.toFixed(0)} />
                    <StatBox label="Moves" value={engineStats.gameLength} />
                </div>
                ) : (
                <div className="text-sage-500 text-sm italic mb-2">
                    No summary available.
                </div>
                )}
            </div>

            <div className="bg-sage-900/30 rounded-xl p-4 border border-white/5">
                <h3 className="text-xs font-semibold text-sage-400 uppercase tracking-wider mb-3">Evaluation Trend</h3>
                {analysisLoading ? (
                <div className="text-sage-500 text-sm animate-pulse">Loading engine evaluation...</div>
                ) : (
                <div className="h-32 w-full bg-sage-800/50 rounded-lg overflow-hidden border border-white/5">
                    {renderEvalGraph(evalSeriesFilled, moveIndex)}
                </div>
                )}
            </div>

            <div>
                <h3 className="text-xs font-semibold text-sage-400 uppercase tracking-wider mb-3">Best Line vs Played</h3>
                {pvSnapshots.length === 0 ? (
                <div className="text-sage-500 text-sm italic">
                    No principal variations available.
                </div>
                ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-hide">
                    {pvSnapshots.map((snapshot, index) => {
                    const playedMove = moves[snapshot.ply] || null
                    return (
                        <div
                        key={`${snapshot.ply}-${index}`}
                        className="bg-sage-800/40 border border-white/5 rounded-lg p-3 text-sm hover:bg-sage-800/60 transition-colors"
                        >
                        <div className="flex justify-between mb-1">
                            <span className="font-bold text-terracotta">Move {snapshot.moveNumber}</span>
                            <span className="text-sage-300">Played: <span className="text-white font-mono">{playedMove || 'n/a'}</span></span>
                        </div>
                        <div className="text-sage-400 text-xs truncate font-mono">
                            Best: {Array.isArray(snapshot.principalVariation)
                            ? snapshot.principalVariation.join(' ')
                            : 'n/a'}
                        </div>
                        </div>
                    )
                    })}
                </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InspectorButton({ onClick, disabled, label }: { onClick: () => void, disabled: boolean, label: string }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="px-3 py-1 bg-sage-700 text-sage-200 rounded text-xs font-medium hover:bg-sage-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-white/5"
        >
            {label}
        </button>
    )
}

function StatBox({ label, value }: { label: string, value: string | number | null }) {
    return (
        <div className="bg-sage-800/50 p-2 rounded border border-white/5 text-center">
            <div className="text-[10px] text-sage-400 uppercase tracking-wide">{label}</div>
            <div className="font-bold text-lg text-sage-100">{value ?? '--'}</div>
        </div>
    )
}

function renderEvalGraph(values: Array<number | null>, activeIndex: number) {
  const hasAny = values.some((value) => typeof value === 'number')
  if (!hasAny) {
    return <div className="h-full flex items-center justify-center text-sage-500 text-xs">No data</div>
  }

  const sanitized = values.map((value) => (typeof value === 'number' ? value : 0))
  if (sanitized.length === 0) {
    return <div className="h-full flex items-center justify-center text-sage-500 text-xs">No data</div>
  }

  const maxAbs = Math.max(200, ...sanitized.map((value) => Math.abs(value)))
  const width = 640
  const height = 128 // 32 * 4 (h-32)
  const padding = 8
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2

  const points = sanitized.map((value, index) => {
    const x = padding + (innerWidth * index) / Math.max(1, sanitized.length - 1)
    const normalized = Math.max(-maxAbs, Math.min(maxAbs, value)) / maxAbs
    const y = padding + innerHeight / 2 - normalized * (innerHeight / 2)
    return `${x},${y}`
  })

  const pathData = points.length > 1 ? `M${points[0]} L${points.slice(1).join(' ')}` : ''
  const activeX =
    sanitized.length > 1
      ? padding + (innerWidth * activeIndex) / Math.max(1, sanitized.length - 1)
      : padding

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="bg-transparent"
    >
      <defs>
        <linearGradient id="evalGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d9a574" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#d9a574" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <line
        x1={padding}
        y1={padding + innerHeight / 2}
        x2={padding + innerWidth}
        y2={padding + innerHeight / 2}
        stroke="#4b5563"
        strokeDasharray="4 4"
        strokeWidth="1"
      />
      <path d={pathData} fill="none" stroke="#d9a574" strokeWidth="2" />
      <line
        x1={activeX}
        y1={padding}
        x2={activeX}
        y2={padding + innerHeight}
        stroke="#ccb085"
        strokeWidth="2"
      />
    </svg>
  )
}
