'use client'

import { useState } from 'react'
import ChessBoard from './ChessBoard'

interface SidebarProps {
  onGamesProcessed: () => void
}

export default function Sidebar({ onGamesProcessed }: SidebarProps) {
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [demoFen, setDemoFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleProcess = async () => {
    if (!file) {
      setMessage({ type: 'error', text: 'Please upload a PGN file before processing.' })
      return
    }

    setProcessing(true)
    setMessage(null)

    try {
      const text = await file.text()
      const formData = new FormData()
      formData.append('pgn', text)
      // Defaults
      formData.append('stockfishPath', './stockfish')
      formData.append('username', 'anonymous19670705')

      const response = await fetch('/api/process-pgn', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process PGN')
      }

      setMessage({ type: 'success', text: `Processed ${data.count} game(s).` })
      onGamesProcessed()
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to analyze games' })
    } finally {
      setProcessing(false)
    }
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
      <h2 style={{ marginBottom: '20px', fontSize: '20px' }}>Import Games</h2>

      <div style={{ marginBottom: '20px' }}>
        <label className="label" style={{ color: '#d1d5db' }}>
          Upload PGN File
        </label>
        <input
          type="file"
          accept=".pgn"
          onChange={handleFileChange}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #4b5563',
            borderRadius: '6px',
            background: '#374151',
            color: 'white',
          }}
        />
      </div>

      <button
        onClick={handleProcess}
        disabled={processing}
        className="button"
        style={{ width: '100%' }}
      >
        {processing ? 'Processing...' : 'Upload & Process'}
      </button>

      {message && (
        <div
          style={{
            marginTop: '20px',
            padding: '10px',
            borderRadius: '6px',
            background: message.type === 'success' ? '#10b981' : '#ef4444',
            color: 'white',
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ marginTop: '40px', borderTop: '1px solid #4b5563', paddingTop: '20px' }}>
        <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>Demo Board</h2>
        <div style={{ marginBottom: '15px', background: '#374151', padding: '10px', borderRadius: '8px' }}>
          <ChessBoard fen={demoFen} />
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button
            onClick={() => setDemoFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')}
            style={{
              padding: '6px',
              fontSize: '12px',
              background: '#4b5563',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Start Pos
          </button>
          <button
            onClick={() => setDemoFen('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3')}
            style={{
              padding: '6px',
              fontSize: '12px',
              background: '#4b5563',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Ruy Lopez
          </button>
        </div>

        <div style={{ marginTop: '15px' }}>
          <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '5px' }}>
            Custom FEN
          </label>
          <input
            type="text"
            value={demoFen}
            onChange={(e) => setDemoFen(e.target.value)}
            style={{
              width: '100%',
              padding: '6px',
              fontSize: '11px',
              background: '#374151',
              color: 'white',
              border: '1px solid #4b5563',
              borderRadius: '4px'
            }}
          />
        </div>
      </div>
    </div>
  )
}
