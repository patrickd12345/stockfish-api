'use client'

import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from '@/components/ChessBoard'

export default function SharedPgnInspector(props: { pgn: string; initialPly?: number }) {
  const [fens, setFens] = useState<string[]>([])
  const [sans, setSans] = useState<string[]>([])
  const [moveIndex, setMoveIndex] = useState(0)

  useEffect(() => {
    const chess = new Chess()
    try {
      chess.loadPgn(props.pgn)
      const history = chess.history() // SAN list length = plies
      const fenList: string[] = []
      const temp = new Chess()
      fenList.push(temp.fen())
      for (const mv of history) {
        temp.move(mv)
        fenList.push(temp.fen())
      }
      setSans(history)
      setFens(fenList)

      const initial = typeof props.initialPly === 'number' ? props.initialPly : 0
      const clamped = Math.max(0, Math.min(initial, Math.max(0, fenList.length - 1)))
      setMoveIndex(clamped)
    } catch {
      setSans([])
      setFens([])
      setMoveIndex(0)
    }
  }, [props.pgn, props.initialPly])

  const fen = fens[moveIndex] ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  const moveLabel = useMemo(() => {
    if (moveIndex <= 0) return 'Start'
    const lastPly = moveIndex - 1
    const san = sans[lastPly]
    return `After ply ${moveIndex} · last: ${san || ''}`
  }, [moveIndex, sans])

  if (fens.length === 0) {
    return <div className="card">Could not load PGN.</div>
  }

  return (
    <div className="card" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 520px) 1fr', gap: '16px', alignItems: 'start' }}>
      <div>
        <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' }}>
          <div style={{ fontWeight: 900, color: '#111827' }}>{moveLabel}</div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            Move {moveIndex} / {fens.length - 1}
          </div>
        </div>
        <ChessBoard fen={fen} theme="wood" size="min(72vw, 520px)" />
        <div style={{ marginTop: '12px' }}>
          <input
            type="range"
            min={0}
            max={Math.max(0, fens.length - 1)}
            value={moveIndex}
            onChange={(e) => setMoveIndex(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ marginTop: '10px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button className="button" onClick={() => setMoveIndex(0)} disabled={moveIndex === 0} style={{ background: '#374151' }}>
              Start
            </button>
            <button className="button" onClick={() => setMoveIndex((i) => Math.max(0, i - 1))} disabled={moveIndex === 0} style={{ background: '#374151' }}>
              Prev
            </button>
            <button
              className="button"
              onClick={() => setMoveIndex((i) => Math.min(fens.length - 1, i + 1))}
              disabled={moveIndex >= fens.length - 1}
              style={{ background: '#374151' }}
            >
              Next
            </button>
            <button
              className="button"
              onClick={() => setMoveIndex(fens.length - 1)}
              disabled={moveIndex >= fens.length - 1}
              style={{ background: '#374151' }}
            >
              End
            </button>
          </div>
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 900, color: '#111827' }}>Move list</div>
        <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
          {sans.map((san, idx) => {
            const moveIdx = idx + 1
            const isActive = moveIndex === moveIdx
            const label = `${idx + 1}. ${san}`
            return (
              <button
                key={`${idx}-${san}`}
                type="button"
                onClick={() => setMoveIndex(moveIdx)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: `1px solid ${isActive ? '#60a5fa' : '#e5e7eb'}`,
                  background: isActive ? '#eff6ff' : '#ffffff',
                  cursor: 'pointer',
                  fontWeight: isActive ? 900 : 600,
                  color: '#111827'
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

