'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ResponsiveContainer, Treemap } from 'recharts'

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

type RepertoireNode = {
  name: string
  size?: number
  winRate?: number
  children?: RepertoireNode[]
}

const getOpeningFamily = (name: string) => {
  const trimmed = name.trim()
  if (!trimmed) return 'Unknown'
  const separators = [':', '-', '—', '/', '|']
  for (const separator of separators) {
    if (trimmed.includes(separator)) {
      return trimmed.split(separator)[0].trim()
    }
  }
  const words = trimmed.split(/\s+/)
  return words.slice(0, Math.min(2, words.length)).join(' ')
}

const getOpeningVariation = (name: string, family: string) => {
  const trimmed = name.trim()
  if (!trimmed) return 'Unknown'
  if (trimmed.startsWith(family)) {
    const rest = trimmed.slice(family.length).replace(/^[\s:\-—/|]+/, '')
    return rest.trim() || family
  }
  return trimmed
}

const winRateColor = (winRate: number | undefined) => {
  if (winRate === undefined) return '#e5e7eb'
  const clamped = Math.max(0, Math.min(1, winRate))
  const red = Math.round(239 - 80 * clamped)
  const green = Math.round(68 + 120 * clamped)
  return `rgb(${red}, ${green}, 111)`
}

const RepertoireNodeContent = (props: any) => {
  const { x, y, width, height, depth, name, winRate } = props
  const fill = winRateColor(winRate)
  const fontSize = depth === 1 ? 12 : 10

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: '#ffffff' }} />
      {width > 60 && height > 16 && (
        <text x={x + 6} y={y + 16} fontSize={fontSize} fill="#111827">
          {name}
        </text>
      )}
    </g>
  )
}

const FAMILIES = [
  'Queens Pawn Opening', 'Kings Pawn Opening', 'French Defense', 'Sicilian Defense', 
  'Caro-Kann Defense', 'Ruy Lopez', 'Italian Game', 'Scandinavian Defense', 
  'Philidor Defense', 'Pirc Defense', 'Alekhines Defense', 'Nimzowitsch Defense', 
  'Scotch Game', 'Vienna Game', 'Bishops Opening', 'English Opening', 'Reti Opening', 
  'Kings Gambit', 'Indian Game', 'Benoni Defense', 'Dutch Defense', 'Slav Defense', 
  'Grunfeld Defense', 'Kings Indian Defense', 'Nimzo-Indian Defense', 
  'Queens Indian Defense', 'Catalan Opening', 'London System', 'Torre Attack', 
  'Trompowsky Attack', 'Grobs Attack', 'Birds Opening', 'Larsens Opening', 
  'Sokolsky Opening', 'Polish Opening', "Van't Kruijs Opening", 'Center Game', 
  'Englund Gambit'
]

const getFamily = (name: string): string => {
  for (const family of FAMILIES) {
    if (name.toLowerCase().startsWith(family.toLowerCase())) return family
  }
  if (name.includes(':')) return name.split(':')[0].trim()
  return name
}

export default function OpeningExplorer() {
  const [openings, setOpenings] = useState<OpeningStat[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [sortKey, setSortKey] = useState<keyof OpeningStat>('games')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showPercent, setShowPercent] = useState(false)
  const [groupByFamily, setGroupByFamily] = useState(false)
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

  const processedOpenings = useMemo(() => {
    if (!groupByFamily) return openings

    const groups = new Map<string, OpeningStat>()
    
    for (const op of openings) {
      const family = getFamily(op.openingName)
      const existing = groups.get(family)
      if (existing) {
        existing.games += op.games
        existing.wins += op.wins
        existing.losses += op.losses
        existing.draws += op.draws
      } else {
        groups.set(family, { ...op, openingName: family })
      }
    }
    
    return Array.from(groups.values())
  }, [openings, groupByFamily])

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
      return processedOpenings
    }
    const lowered = query.trim().toLowerCase()
    return processedOpenings.filter((opening) => opening.openingName.toLowerCase().includes(lowered))
  }, [processedOpenings, query])
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

  const repertoireData = useMemo<RepertoireNode[]>(() => {
    const families = new Map<string, RepertoireNode>()
    for (const opening of openings) {
      const family = getOpeningFamily(opening.openingName)
      const variation = getOpeningVariation(opening.openingName, family)
      const winRate = opening.games > 0 ? opening.wins / opening.games : 0
      if (!families.has(family)) {
        families.set(family, { name: family, children: [] })
      }
      families.get(family)?.children?.push({
        name: variation,
        size: opening.games,
        winRate,
      })
    }
    return Array.from(families.values()).filter((node) => (node.children?.length ?? 0) > 0)
  }, [openings])

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
        <button
          type="button"
          className={groupByFamily ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setGroupByFamily((prev) => !prev)}
        >
          {groupByFamily ? 'Ungroup' : 'Group by Family'}
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

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '8px' }}>Repertoire Tree</h3>
        <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '10px' }}>
          Size = games played, color = win rate.
        </div>
        {repertoireData.length === 0 ? (
          <div style={{ color: '#6b7280' }}>No opening data available for the repertoire tree.</div>
        ) : (
          <div style={{ width: '100%', height: 320, border: '1px solid #e5e7eb', borderRadius: '10px' }}>
            <ResponsiveContainer>
              <Treemap
                data={repertoireData}
                dataKey="size"
                stroke="#ffffff"
                content={<RepertoireNodeContent />}
                isAnimationActive={false}
              />
            </ResponsiveContainer>
          </div>
        )}
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
                <td style={{ padding: '8px 4px' }}>
                  <Link
                    href={`/?tab=replay&opening=${encodeURIComponent(opening.openingName + (groupByFamily ? '%' : ''))}&outcome=all`}
                    style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                  >
                    {opening.games}
                  </Link>
                </td>
                <td style={{ padding: '8px 4px' }}>
                  <Link
                    href={`/?tab=replay&opening=${encodeURIComponent(opening.openingName + (groupByFamily ? '%' : ''))}&outcome=win`}
                    style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                  >
                    {formatValue(opening.wins, opening.games)}
                  </Link>
                </td>
                <td style={{ padding: '8px 4px' }}>
                  <Link
                    href={`/?tab=replay&opening=${encodeURIComponent(opening.openingName + (groupByFamily ? '%' : ''))}&outcome=loss`}
                    style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                  >
                    {formatValue(opening.losses, opening.games)}
                  </Link>
                </td>
                <td style={{ padding: '8px 4px' }}>
                  <Link
                    href={`/?tab=replay&opening=${encodeURIComponent(opening.openingName + (groupByFamily ? '%' : ''))}&outcome=draw`}
                    style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                  >
                    {formatValue(opening.draws, opening.games)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
