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
    return <div className="card">Loading games...</div>
  }

  if (games.length === 0) {
    return <div className="card">No games processed yet.</div>
  }

  const moves = fullHistory

  return (
    <div className="card">
      <h2 style={{ marginBottom: '20px' }}>Game Inspector</h2>

      <div style={{ marginBottom: '20px' }}>
        <label className="label">Select Game</label>
        <select
          value={selectedGameId || ''}
          onChange={(e) => setSelectedGameId(e.target.value)}
          className="input"
        >
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {formatGameLabel(game)}
            </option>
          ))}
        </select>
        {openingFilter && outcomeFilter && (
          <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Filter: {openingFilter} · {outcomeFilter} ({filteredCount ?? games.length} games)
            </div>
            <button
              onClick={() => router.replace('/?tab=replay')}
              className="button"
              style={{ padding: '6px 10px' }}
            >
              Clear filter
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedGameId(games[games.length - 1]?.id ?? null)}
            disabled={
              !selectedGameId ||
              games.length === 0 ||
              games[games.length - 1]?.id === selectedGameId
            }
            className="button"
            title="Go to Beginning"
          >
            Start
          </button>
          <button
            onClick={() => jumpGames(5)}
            disabled={
              !selectedGameId ||
              games.length === 0 ||
              games[games.length - 1]?.id === selectedGameId
            }
            className="button"
            title="Back 5"
          >
            -5
          </button>
          <button
            onClick={() => navigateGame('older')}
            disabled={
              !selectedGameId ||
              games.length === 0 ||
              games[games.length - 1]?.id === selectedGameId
            }
            className="button"
            title="Back"
          >
            Prev
          </button>
          <button
            onClick={() => navigateGame('newer')}
            disabled={!selectedGameId || games.length === 0 || games[0]?.id === selectedGameId}
            className="button"
            title="Forward"
          >
            Next
          </button>
          <button
            onClick={() => jumpGames(-5)}
            disabled={!selectedGameId || games.length === 0 || games[0]?.id === selectedGameId}
            className="button"
            title="Forward 5"
          >
            +5
          </button>
          <button
            onClick={() => setSelectedGameId(games[0]?.id ?? null)}
            disabled={!selectedGameId || games.length === 0 || games[0]?.id === selectedGameId}
            className="button"
            title="End"
          >
            End
          </button>
        </div>
      </div>

      {board && (
        <>
          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
            <ChessBoard fen={board.fen()} />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Analysis</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={isLiveAnalysisEnabled}
                  onChange={(e) => setIsLiveAnalysisEnabled(e.target.checked)}
                />
                Enable Live Stockfish (WASM)
              </label>
            </div>

            {isLiveAnalysisEnabled && (
              <div style={{
                marginBottom: '20px',
                padding: '12px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600, color: '#1e3a8a' }}>
                    Evaluation: {engineState.mate
                      ? `Mate in ${Math.abs(engineState.mate)}`
                      : engineState.evaluation !== null
                        ? (engineState.evaluation / 100).toFixed(2)
                        : '...'}
                  </span>
                  <span style={{ color: '#1e40af', fontSize: '12px' }}>
                     Depth: {engineState.depth} {engineState.isSearching ? '(searching...)' : ''}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#1e3a8a', fontFamily: 'monospace' }}>
                  Best: {engineState.bestLine || engineState.bestMove || '...'}
                </div>
              </div>
            )}

            <h3 style={{ marginBottom: '10px' }}>Stockfish Summary</h3>
            {analysisLoading ? (
              <div style={{ color: '#6b7280' }}>Loading engine summary...</div>
            ) : engineStats ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                <div style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <div style={{ color: '#6b7280', fontSize: '12px' }}>Avg CPL</div>
                  <div style={{ fontWeight: 600 }}>
                    {engineStats.avgCentipawnLoss === null ? '--' : engineStats.avgCentipawnLoss.toFixed(1)}
                  </div>
                </div>
                <div style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <div style={{ color: '#6b7280', fontSize: '12px' }}>Blunders</div>
                  <div style={{ fontWeight: 600 }}>
                    {engineStats.blunders === null ? '--' : engineStats.blunders}
                  </div>
                </div>
                <div style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <div style={{ color: '#6b7280', fontSize: '12px' }}>Mistakes</div>
                  <div style={{ fontWeight: 600 }}>
                    {engineStats.mistakes === null ? '--' : engineStats.mistakes}
                  </div>
                </div>
                <div style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <div style={{ color: '#6b7280', fontSize: '12px' }}>Inaccuracies</div>
                  <div style={{ fontWeight: 600 }}>
                    {engineStats.inaccuracies === null ? '--' : engineStats.inaccuracies}
                  </div>
                </div>
                <div style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <div style={{ color: '#6b7280', fontSize: '12px' }}>Max eval swing</div>
                  <div style={{ fontWeight: 600 }}>
                    {engineStats.evalSwingMax === null ? '--' : engineStats.evalSwingMax.toFixed(0)}
                  </div>
                </div>
                <div style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <div style={{ color: '#6b7280', fontSize: '12px' }}>Moves</div>
                  <div style={{ fontWeight: 600 }}>
                    {engineStats.gameLength === null ? '--' : engineStats.gameLength}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: '#6b7280' }}>
                No engine summary available yet. Trigger analysis via the Stockfish pipeline.
              </div>
            )}
            {analysisMeta && (analysisMeta.engineVersion || analysisMeta.analysisDepth) && (
              <div style={{ marginTop: '8px', color: '#6b7280', fontSize: '12px' }}>
                Engine {analysisMeta.engineVersion || 'Stockfish'} | Depth {analysisMeta.analysisDepth ?? 'n/a'}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ marginBottom: '10px' }}>Evaluation Trend</h3>
            {analysisLoading ? (
              <div style={{ color: '#6b7280' }}>Loading engine evaluation...</div>
            ) : (
              renderEvalGraph(evalSeriesFilled, moveIndex)
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
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
              style={{ width: '100%' }}
            />
            <div style={{ textAlign: 'center', marginTop: '10px', color: '#6b7280' }}>
              Move {moveIndex} of {moves.length}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => navigateMove('prev')}
              disabled={moveIndex === 0}
              className="button"
            >
              Previous
            </button>
            <button
              onClick={() => navigateMove('next')}
              disabled={moveIndex >= moves.length}
              className="button"
            >
              Next
            </button>
          </div>

          <div style={{ marginTop: '30px' }}>
            <h3 style={{ marginBottom: '10px' }}>Best Line vs Played Move</h3>
            {pvSnapshots.length === 0 ? (
              <div style={{ color: '#6b7280' }}>
                No principal variations available yet. Run engine analysis to populate.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {pvSnapshots.map((snapshot, index) => {
                  const playedMove = moves[snapshot.ply] || null
                  return (
                    <div
                      key={`${snapshot.ply}-${index}`}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '12px',
                        background: '#f9fafb',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
                        Move {snapshot.moveNumber}
                      </div>
                      <div style={{ color: '#374151', marginBottom: '4px' }}>
                        Played: {playedMove || 'n/a'}
                      </div>
                      <div style={{ color: '#1f2937' }}>
                        Best line: {Array.isArray(snapshot.principalVariation)
                          ? snapshot.principalVariation.join(' ')
                          : 'n/a'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function renderEvalGraph(values: Array<number | null>, activeIndex: number) {
  const hasAny = values.some((value) => typeof value === 'number')
  if (!hasAny) {
    return <div style={{ color: '#6b7280' }}>No evaluation data available.</div>
  }

  const sanitized = values.map((value) => (typeof value === 'number' ? value : 0))
  if (sanitized.length === 0) {
    return <div style={{ color: '#6b7280' }}>No evaluation data available.</div>
  }

  const maxAbs = Math.max(200, ...sanitized.map((value) => Math.abs(value)))
  const width = 640
  const height = 140
  const padding = 16
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
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
    >
      <line
        x1={padding}
        y1={padding + innerHeight / 2}
        x2={padding + innerWidth}
        y2={padding + innerHeight / 2}
        stroke="#d1d5db"
        strokeDasharray="4 4"
      />
      <path d={pathData} fill="none" stroke="#2563eb" strokeWidth="2" />
      <line
        x1={activeX}
        y1={padding}
        x2={activeX}
        y2={padding + innerHeight}
        stroke="#f97316"
        strokeWidth="2"
      />
    </svg>
  )
}
