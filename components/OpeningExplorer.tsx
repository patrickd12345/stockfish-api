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
  if (winRate === undefined) return '#44403c' // sage-700
  const clamped = Math.max(0, Math.min(1, winRate))
  // Interpolate between red (loss) and green (win)
  // Win (1.0) -> Emerald 500 (#10b981) -> rgb(16, 185, 129)
  // Loss (0.0) -> Rose 600 (#e11d48) -> rgb(225, 29, 72)

  const r = Math.round(225 + (16 - 225) * clamped)
  const g = Math.round(29 + (185 - 29) * clamped)
  const b = Math.round(72 + (129 - 72) * clamped)

  return `rgb(${r}, ${g}, ${b})`
}

const RepertoireNodeContent = (props: any) => {
  const { x, y, width, height, depth, name, winRate } = props
  const fill = winRateColor(winRate)
  const fontSize = depth === 1 ? 12 : 10

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: '#1c1917', strokeWidth: 1 }} />
      {width > 60 && height > 16 && (
        <text x={x + 6} y={y + 16} fontSize={fontSize} fill="#ffffff" fontWeight="bold">
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
    return <div className="glass-panel p-8 text-center text-sage-400 animate-pulse">Loading opening stats...</div>
  }

  if (openings.length === 0) {
    return <div className="glass-panel p-8 text-center text-sage-400">No opening stats available yet.</div>
  }

  return (
    <div className="glass-panel p-6">
      <h2 className="text-xl font-bold text-terracotta tracking-tight mb-5">Opening Explorer</h2>
      <div className="flex flex-wrap gap-3 items-center mb-6 bg-sage-900/40 p-3 rounded-xl border border-white/5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by opening name"
          className="flex-1 bg-sage-800 text-sage-200 border border-sage-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-terracotta/50"
        />
        <button
          type="button"
          className={showPercent ? 'btn-primary py-2 px-4 text-sm' : 'btn-secondary py-2 px-4 text-sm'}
          onClick={() => setShowPercent((prev) => !prev)}
        >
          {showPercent ? 'Show counts' : 'Show %'}
        </button>
        <button
          type="button"
          className={groupByFamily ? 'btn-primary py-2 px-4 text-sm' : 'btn-secondary py-2 px-4 text-sm'}
          onClick={() => setGroupByFamily((prev) => !prev)}
        >
          {groupByFamily ? 'Ungroup' : 'Group by Family'}
        </button>
        <div className="relative" ref={sortRef}>
          <button
            type="button"
            className="btn-secondary py-2 px-4 text-sm"
            onClick={() => setIsSortOpen((prev) => !prev)}
          >
            Sort
          </button>
          {isSortOpen && (
            <div className="absolute top-full right-0 mt-2 bg-sage-800 border border-white/10 rounded-xl p-3 min-w-[220px] shadow-xl z-10">
              <label className="block text-xs font-semibold text-sage-400 mb-2">
                Column
              </label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as keyof OpeningStat)}
                className="w-full bg-sage-900 text-sage-200 border border-sage-700 rounded p-2 mb-3 text-sm"
              >
                <option value="openingName">Opening</option>
                <option value="games">Games</option>
                <option value="wins">Wins</option>
                <option value="losses">Losses</option>
                <option value="draws">Draws</option>
              </select>
              <label className="block text-xs font-semibold text-sage-400 mb-2">
                Direction
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 py-1 text-sm rounded ${sortDir === 'asc' ? 'bg-terracotta text-sage-900 font-bold' : 'bg-sage-700 text-sage-300'}`}
                  onClick={() => setSortDir('asc')}
                >
                  Asc
                </button>
                <button
                  type="button"
                  className={`flex-1 py-1 text-sm rounded ${sortDir === 'desc' ? 'bg-terracotta text-sage-900 font-bold' : 'bg-sage-700 text-sage-300'}`}
                  onClick={() => setSortDir('desc')}
                >
                  Desc
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-sage-300 uppercase tracking-wider mb-2">Repertoire Tree</h3>
        <div className="text-xs text-sage-500 mb-3">
          Size = games played, color = win rate (Green = High Win Rate, Red = Low Win Rate).
        </div>
        {repertoireData.length === 0 ? (
          <div className="text-sage-500 italic">No opening data available for the repertoire tree.</div>
        ) : (
          <div className="w-full h-80 border border-white/5 rounded-xl overflow-hidden bg-sage-900/30">
            <ResponsiveContainer>
              <Treemap
                data={repertoireData}
                dataKey="size"
                stroke="#1c1917"
                content={<RepertoireNodeContent />}
                isAnimationActive={false}
              />
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-sage-800 text-left border-b border-white/5">
              {(Object.keys(COLUMN_LABELS) as Array<keyof OpeningStat>).map((key) => (
                <th key={key} className="p-3 text-xs font-bold text-sage-300 uppercase tracking-wider">
                  <div className="flex items-center gap-1 cursor-pointer hover:text-white" onClick={() => { setSortKey(key); setSortDir(prev => prev === 'asc' ? 'desc' : 'asc') }}>
                    {COLUMN_LABELS[key]}
                    <span className={`text-[10px] ${sortKey === key ? 'opacity-100 text-terracotta' : 'opacity-20'}`}>
                      {sortDir === 'asc' ? '▲' : '▼'}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-sage-900/20">
            {sorted.map((opening, idx) => (
              <tr key={opening.openingName} className={`border-b border-white/5 hover:bg-sage-800/40 transition-colors ${idx % 2 === 0 ? 'bg-sage-900/10' : ''}`}>
                <td className="p-3 font-semibold text-sm text-sage-200">{opening.openingName}</td>
                <td className="p-3">
                  <Link
                    href={`/?tab=replay&opening=${encodeURIComponent(opening.openingName + (groupByFamily ? '%' : ''))}&outcome=all`}
                    className="text-terracotta hover:text-terracotta-light font-mono text-sm font-bold"
                  >
                    {opening.games}
                  </Link>
                </td>
                <td className="p-3">
                  <Link
                    href={`/?tab=replay&opening=${encodeURIComponent(opening.openingName + (groupByFamily ? '%' : ''))}&outcome=win`}
                    className="text-emerald-400 hover:text-emerald-300 font-mono text-sm"
                  >
                    {formatValue(opening.wins, opening.games)}
                  </Link>
                </td>
                <td className="p-3">
                  <Link
                    href={`/?tab=replay&opening=${encodeURIComponent(opening.openingName + (groupByFamily ? '%' : ''))}&outcome=loss`}
                    className="text-rose-400 hover:text-rose-300 font-mono text-sm"
                  >
                    {formatValue(opening.losses, opening.games)}
                  </Link>
                </td>
                <td className="p-3">
                  <Link
                    href={`/?tab=replay&opening=${encodeURIComponent(opening.openingName + (groupByFamily ? '%' : ''))}&outcome=draw`}
                    className="text-sage-400 hover:text-sage-300 font-mono text-sm"
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
