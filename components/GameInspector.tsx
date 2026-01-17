'use client'

import { useState, useEffect } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from './ChessBoard'

export default function GameInspector() {
  const [games, setGames] = useState<any[]>([])
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [pgn, setPgn] = useState<string>('')
  const [moveIndex, setMoveIndex] = useState(0)
  const [board, setBoard] = useState<Chess | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchGames()
  }, [])

  useEffect(() => {
    if (selectedGameId) {
      fetchGamePgn(selectedGameId)
    }
  }, [selectedGameId])

  useEffect(() => {
    if (pgn) {
      const game = new Chess()
      try {
        game.loadPgn(pgn)
        setBoard(game)
        setMoveIndex(0)
      } catch (e) {
        console.error('Failed to load PGN:', e)
      }
    }
  }, [pgn])

  const fetchGames = async () => {
    try {
      const response = await fetch('/api/games')
      const data = await response.json()
      setGames(data.games || [])
      if (data.games && data.games.length > 0) {
        setSelectedGameId(data.games[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch games:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchGamePgn = async (gameId: string) => {
    try {
      const response = await fetch(`/api/games/${gameId}/pgn`)
      const data = await response.json()
      setPgn(data.pgn || '')
    } catch (error) {
      console.error('Failed to fetch PGN:', error)
    }
  }

  const navigateMove = (direction: 'prev' | 'next') => {
    if (!board) return

    const moves = board.history()
    const newIndex = direction === 'next' ? moveIndex + 1 : moveIndex - 1

    if (newIndex < 0 || newIndex > moves.length) return

    const newBoard = new Chess()
    for (let i = 0; i < newIndex; i++) {
      newBoard.move(moves[i])
    }
    setBoard(newBoard)
    setMoveIndex(newIndex)
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

  const moves = board ? board.history() : []

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
      </div>

      {board && (
        <>
          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
            <ChessBoard fen={board.fen()} />
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
        </>
      )}
    </div>
  )
}
