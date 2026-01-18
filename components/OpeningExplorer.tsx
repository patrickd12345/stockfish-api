'use client'

import { useEffect, useMemo, useState } from 'react'

interface OpeningStat {
  openingName: string
  games: number
  whiteWins: number
  blackWins: number
  draws: number
  whiteScore: number
}

export default function OpeningExplorer() {
  const [openings, setOpenings] = useState<OpeningStat[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

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

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return openings
    }
    const lowered = query.trim().toLowerCase()
    return openings.filter((opening) => opening.openingName.toLowerCase().includes(lowered))
  }, [openings, query])

  if (loading) {
    return <div className="card">Loading opening stats...</div>
  }

  if (openings.length === 0) {
    return <div className="card">No opening stats available yet.</div>
  }

  return (
    <div className="card">
      <h2 style={{ marginBottom: '20px' }}>Opening Explorer</h2>
      <div style={{ marginBottom: '16px' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by opening name"
          className="input"
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '8px 4px' }}>Opening</th>
              <th style={{ padding: '8px 4px' }}>Games</th>
              <th style={{ padding: '8px 4px' }}>White Wins</th>
              <th style={{ padding: '8px 4px' }}>Black Wins</th>
              <th style={{ padding: '8px 4px' }}>Draws</th>
              <th style={{ padding: '8px 4px' }}>White Score</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((opening) => (
              <tr key={opening.openingName} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 4px', fontWeight: 600 }}>{opening.openingName}</td>
                <td style={{ padding: '8px 4px' }}>{opening.games}</td>
                <td style={{ padding: '8px 4px' }}>{opening.whiteWins}</td>
                <td style={{ padding: '8px 4px' }}>{opening.blackWins}</td>
                <td style={{ padding: '8px 4px' }}>{opening.draws}</td>
                <td style={{ padding: '8px 4px' }}>
                  {(opening.whiteScore * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
