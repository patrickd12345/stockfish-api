'use client'

import { useMemo } from 'react'

export function formatEvalLabel(evaluationCp: number | null, mate: number | null): string {
  if (typeof mate === 'number') {
    if (mate === 0) return 'Mate'
    return mate > 0 ? `M${mate}` : `M${Math.abs(mate)}`
  }
  if (typeof evaluationCp === 'number') {
    const pawns = (evaluationCp / 100).toFixed(2)
    return evaluationCp > 0 ? `+${pawns}` : pawns
  }
  return '0.00'
}

function evalToPercent(evaluationCp: number | null, mate: number | null): number {
  if (typeof mate === 'number') {
    // Strongly bias toward the mating side.
    return mate > 0 ? 95 : 5
  }
  const cp = typeof evaluationCp === 'number' ? evaluationCp : 0
  // Smooth saturation. 400cp ~ very visible; hard clamp for safety.
  const x = Math.max(-2000, Math.min(2000, cp))
  const t = Math.tanh(x / 400) // [-1..1]
  const percent = 50 + t * 45
  return Math.max(5, Math.min(95, percent))
}

export default function EvalGauge({
  evaluationCp,
  mate,
  height = 14,
  showLabel = true
}: {
  evaluationCp: number | null
  mate: number | null
  height?: number
  showLabel?: boolean
}) {
  const percent = useMemo(() => evalToPercent(evaluationCp, mate), [evaluationCp, mate])
  const label = useMemo(() => formatEvalLabel(evaluationCp, mate), [evaluationCp, mate])

  const favored = typeof mate === 'number'
    ? (mate > 0 ? 'White' : 'Black')
    : (evaluationCp ?? 0) >= 0
      ? 'White'
      : 'Black'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {showLabel ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#cbd5f5' }}>
          <div style={{ fontWeight: 700 }}>{favored} ahead</div>
          <div style={{ fontFamily: 'monospace', opacity: 0.95 }}>{label}</div>
        </div>
      ) : null}

      <div
        aria-label="Evaluation gauge"
        style={{
          height,
          width: '100%',
          borderRadius: 999,
          overflow: 'hidden',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          background: 'rgba(148, 163, 184, 0.12)',
          position: 'relative'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${percent}%`,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.98), rgba(226,232,240,0.92))'
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            height: '100%',
            width: `${100 - percent}%`,
            background: 'linear-gradient(90deg, rgba(17,24,39,0.92), rgba(2,6,23,0.98))'
          }}
        />
        {/* Center tick */}
        <div
          style={{
            position: 'absolute',
            top: -2,
            left: '50%',
            width: 2,
            height: height + 4,
            background: 'rgba(148, 163, 184, 0.55)'
          }}
        />
      </div>
    </div>
  )
}

