'use client'

import { useState, useEffect, useCallback } from 'react'
import ChessBoard from './ChessBoard'
import { Chess } from 'chess.js'

interface SidebarProps {
  onGamesProcessed: () => void
  onGameSelect: (id: string) => void
  selectedGameId: string | null
  refreshKey: number
}

export default function Sidebar({ onGamesProcessed, onGameSelect, selectedGameId, refreshKey }: SidebarProps) {
  const [boardFen, setBoardFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  const [moveHistory, setMoveHistory] = useState<string[]>([])
  const [currentMoveIdx, setCurrentMoveIdx] = useState(-1)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [games, setGames] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null)

  const USER_USERNAMES = ['patrickd1234567', 'patrickd12345678', 'anonymous19670705']

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
      if (selectedGame && selectedGame.pgn_text) {
        loadGameHistory(selectedGame.pgn_text)
      }
    }
  }, [selectedGameId, games, loadGameHistory])

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

  const triggerEngineAnalysis = async () => {
    setAnalysisLoading(true)
    setAnalysisStatus(null)
    try {
      const res = await fetch('/api/engine/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'enqueue', limit: 10 }),
      })
      const data = await res.json()
      if (!res.ok || data?.error) {
        throw new Error(data?.error || 'Failed to enqueue engine analysis')
      }
      setAnalysisStatus(`Queued ${data.enqueued ?? 0} games for analysis.`)
    } catch (e: any) {
      setAnalysisStatus(e?.message || 'Failed to enqueue engine analysis')
    } finally {
      setAnalysisLoading(false)
    }
  }

  const extractTimeFromPgn = (pgnText: string | undefined): string | null => {
    if (!pgnText) return null
    
    // Try to extract time from PGN headers
    // Common formats: [UTCTime "19:42:48"], [StartTime "19:42:48"], [Time "19:42:48"]
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
      // Parse time string (format: "HH:MM:SS" or "HH:MM")
      const timeParts = timeStr.split(':')
      if (timeParts.length >= 2) {
        const hours = parseInt(timeParts[0], 10)
        const minutes = parseInt(timeParts[1], 10)
        
        // Parse date string (format: "2026.01.17")
        const dateParts = dateStr.split('.')
        if (dateParts.length === 3) {
          const year = parseInt(dateParts[0], 10)
          const month = parseInt(dateParts[1], 10) - 1 // Month is 0-indexed
          const day = parseInt(dateParts[2], 10)
          
          // Create a date object with the game date and UTC time
          const utcDate = new Date(Date.UTC(year, month, day, hours, minutes, 0))
          
          // Convert to EST
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
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: '280px',
        height: '100vh',
        background: '#1f2937',
        color: 'white',
        padding: '20px',
        overflowY: 'auto',
      }}
    >
      <div style={{ marginTop: '10px' }}>
        <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>Game Preview</h2>
        <div style={{ marginBottom: '15px', background: '#374151', padding: '10px', borderRadius: '8px' }}>
          <ChessBoard fen={boardFen} size="200px" />
        </div>
        
        {/* CD Player Controls */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '4px', 
          marginBottom: '15px',
          background: '#111827',
          padding: '8px',
          borderRadius: '8px'
        }}>
          <button
            onClick={() => navigateTo(0)}
            disabled={moveHistory.length === 0 || currentMoveIdx === 0}
            title="Go to Beginning"
            style={{ padding: '4px 8px', background: '#374151', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', opacity: currentMoveIdx === 0 ? 0.5 : 1 }}
          >
            «
          </button>
          <button
            onClick={() => navigateTo(Math.max(0, currentMoveIdx - 5))}
            disabled={moveHistory.length === 0 || currentMoveIdx === 0}
            title="Back 5"
            style={{ padding: '4px 8px', background: '#374151', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', opacity: currentMoveIdx === 0 ? 0.5 : 1 }}
          >
            -5
          </button>
          <button
            onClick={() => navigateTo(currentMoveIdx - 1)}
            disabled={moveHistory.length === 0 || currentMoveIdx === 0}
            title="Back"
            style={{ padding: '4px 8px', background: '#374151', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', opacity: currentMoveIdx === 0 ? 0.5 : 1 }}
          >
            ‹
          </button>
          <button
            onClick={() => navigateTo(currentMoveIdx + 1)}
            disabled={moveHistory.length === 0 || currentMoveIdx === moveHistory.length - 1}
            title="Forward"
            style={{ padding: '4px 8px', background: '#374151', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', opacity: currentMoveIdx === moveHistory.length - 1 ? 0.5 : 1 }}
          >
            ›
          </button>
          <button
            onClick={() => navigateTo(Math.min(moveHistory.length - 1, currentMoveIdx + 5))}
            disabled={moveHistory.length === 0 || currentMoveIdx === moveHistory.length - 1}
            title="Forward 5"
            style={{ padding: '4px 8px', background: '#374151', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', opacity: currentMoveIdx === moveHistory.length - 1 ? 0.5 : 1 }}
          >
            +5
          </button>
          <button
            onClick={() => navigateTo(moveHistory.length - 1)}
            disabled={moveHistory.length === 0 || currentMoveIdx === moveHistory.length - 1}
            title="End"
            style={{ padding: '4px 8px', background: '#374151', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', opacity: currentMoveIdx === moveHistory.length - 1 ? 0.5 : 1 }}
          >
            »
          </button>
        </div>

        <div style={{ fontSize: '12px', textAlign: 'center', color: '#9ca3af', marginBottom: '10px' }}>
          {moveHistory.length > 0 ? `Move ${Math.floor(currentMoveIdx / 2) + 1} (${currentMoveIdx}/${moveHistory.length - 1})` : 'Select a game to preview'}
        </div>
      </div>

      <div style={{ marginTop: '40px', borderTop: '1px solid #4b5563', paddingTop: '20px' }}>
        <h2 style={{ marginBottom: '20px', fontSize: '20px' }}>Search Games</h2>
        <input
          type="text"
          placeholder="Search white, black, opening..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            marginBottom: '15px',
            border: '1px solid #4b5563',
            borderRadius: '6px',
            background: '#374151',
            color: 'white',
          }}
        />
        
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {searching && <div style={{ fontSize: '12px', color: '#9ca3af' }}>Searching...</div>}
          {!searching && games.length === 0 && (
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>No games found.</div>
          )}
          {games.map((game) => {
            const status = getGameStatus(game)
            const isSelected = selectedGameId === game.id
            
            let bgColor = '#374151'
            let textColor = 'white'
            let subTextColor = '#9ca3af'

            if (isSelected) {
              bgColor = '#2563eb'
              textColor = 'white'
              subTextColor = '#dbeafe'
            } else if (status === 'win') {
              bgColor = '#047857' // Softer Emerald 700
              textColor = 'white'
              subTextColor = '#d1d5db'
            } else if (status === 'loss') {
              bgColor = '#b91c1c' // Softer Red 700
              textColor = 'white'
              subTextColor = '#fecaca'
            }

            return (
              <div
                key={game.id}
                onClick={() => onGameSelect(game.id)}
                style={{
                  padding: '10px',
                  marginBottom: '8px',
                  background: bgColor,
                  color: textColor,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  border: isSelected ? '1px solid #60a5fa' : '1px solid transparent',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ fontWeight: 'bold' }}>
                  {game.white} vs {game.black}
                </div>
                <div style={{ fontSize: '11px', color: subTextColor }}>
                  {game.opening_name || 'Unknown Opening'}
                </div>
                <div style={{ fontSize: '11px', color: subTextColor }}>
                  {formatDateWithEST(game.date, game.pgn_text)} • {game.result}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ marginTop: '30px', borderTop: '1px solid #4b5563', paddingTop: '20px' }}>
        <h2 style={{ marginBottom: '12px', fontSize: '18px' }}>Engine Analysis</h2>
        <button
          onClick={triggerEngineAnalysis}
          disabled={analysisLoading}
          style={{
            width: '100%',
            padding: '10px',
            background: analysisLoading ? '#374151' : '#2563eb',
            border: 'none',
            color: 'white',
            borderRadius: '6px',
            cursor: analysisLoading ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          {analysisLoading ? 'Queueing...' : 'Queue analysis jobs'}
        </button>
        {analysisStatus && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#9ca3af' }}>
            {analysisStatus}
          </div>
        )}
      </div>
    </div>
  )
}
