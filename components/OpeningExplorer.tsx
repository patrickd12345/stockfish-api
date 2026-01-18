'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

interface OpeningStat {
  openingName: string
  games: number
  wins: number
  losses: number
  draws: number
}

const COLUMN_LABELS: Record<keyof OpeningStat, string> = {
  openingName: 'Opening',
  games: 'Games',
  wins: 'Wins',
  losses: 'Losses',
  draws: 'Draws',
}

export default function OpeningExplorer() {
  const [openings, setOpenings] = useState<OpeningStat[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [sortKey, setSortKey] = useState<keyof OpeningStat>('games')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showPercent, setShowPercent] = useState(false)
  const sortRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const fetchOpenings = async () => {
      try {
        const res = await fetch('/api/openings')
        const data = await res.json()
        setOpenings(Array.isArray(data.openings) ? data.openings : [])
      } catch (error) {
        console.error('Failed to fetch opening stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchOpenings()
  }, [])

  useEffect(() => {
    if (!isSortOpen) return

    const handleClickAway = (event: MouseEvent) => {
      if (!sortRef.current) return
      if (sortRef.current.contains(event.target as Node)) return
      setIsSortOpen(false)
    }

    document.addEventListener('mousedown', handleClickAway)
    return () => {
      document.removeEventListener('mousedown', handleClickAway)
    }
  }, [isSortOpen])

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return openings
    }
    const lowered = query.trim().toLowerCase()
    return openings.filter((opening) => opening.openingName.toLowerCase().includes(lowered))
  }, [openings, query])
  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      const aValue = a[sortKey]
      const bValue = b[sortKey]
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const result = aValue.localeCompare(bValue)
        return sortDir === 'asc' ? result : -result
      }
      const aNumber =
        showPercent && sortKey !== 'games' ? Number(aValue) / Math.max(1, a.games) : Number(aValue)
      const bNumber =
        showPercent && sortKey !== 'games' ? Number(bValue) / Math.max(1, b.games) : Number(bValue)
      const result = aNumber - bNumber
      return sortDir === 'asc' ? result : -result
    })
    return list
  }, [filtered, sortDir, sortKey, showPercent])

  const formatValue = (value: number, total: number) => {
    if (!showPercent) {
      return value.toString()
    }
    const percent = total > 0 ? (value / total) * 100 : 0
    return `${percent.toFixed(1)}%`
  }

  if (loading) {
    return <div className="card">Loading opening stats...</div>
  }

  if (openings.length === 0) {
    return <div className="card">No opening stats available yet.</div>
  }

  return (
    <div className="card">
      <h2 style={{ marginBottom: '20px' }}>Opening Explorer</h2>
      <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by opening name"
          className="input"
        />
        <button
          type="button"
          className={showPercent ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setShowPercent((prev) => !prev)}
        >
          {showPercent ? 'Show counts' : 'Show %'}
        </button>
        <div style={{ position: 'relative' }} ref={sortRef}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsSortOpen((prev) => !prev)}
          >
            Sort
          </button>
          {isSortOpen && (
            <div
              style={{
                position: 'absolute',
                top: '110%',
                right: 0,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '12px',
                minWidth: '220px',
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.12)',
                zIndex: 10,
              }}
            >
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Column
              </label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as keyof OpeningStat)}
                className="input"
                style={{ width: '100%', marginBottom: '10px' }}
              >
                <option value="openingName">Opening</option>
                <option value="games">Games</option>
                <option value="wins">Wins</option>
                <option value="losses">Losses</option>
                <option value="draws">Draws</option>
              </select>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Direction
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={sortDir === 'asc' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setSortDir('asc')}
                  style={{ flex: 1 }}
                >
                  Asc
                </button>
                <button
                  type="button"
                  className={sortDir === 'desc' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setSortDir('desc')}
                  style={{ flex: 1 }}
                >
                  Desc
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
              {(Object.keys(COLUMN_LABELS) as Array<keyof OpeningStat>).map((key) => (
                <th key={key} style={{ padding: '8px 4px' }}>
                  {COLUMN_LABELS[key]}
                  <span
                    style={{
                      marginLeft: '6px',
                      fontSize: '12px',
                      color: '#6b7280',
                      visibility: sortKey === key ? 'visible' : 'hidden',
                    }}
                  >
                    {sortDir === 'asc' ? '▲' : '▼'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((opening) => (
              <tr key={opening.openingName} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 4px', fontWeight: 600 }}>{opening.openingName}</td>
                <td style={{ padding: '8px 4px' }}>{opening.games}</td>
                <td style={{ padding: '8px 4px' }}>{formatValue(opening.wins, opening.games)}</td>
                <td style={{ padding: '8px 4px' }}>{formatValue(opening.losses, opening.games)}</td>
                <td style={{ padding: '8px 4px' }}>{formatValue(opening.draws, opening.games)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
