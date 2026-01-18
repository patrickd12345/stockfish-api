export async function fetchChessComArchives(username: string): Promise<string[]> {
  const res = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`, {
    cache: 'no-store',
  })
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`Failed to fetch archives for ${username}: ${res.statusText}`)
  }
  const data = await res.json()
  return data.archives || []
}

export async function fetchGamesFromArchive(archiveUrl: string): Promise<any[]> {
  const res = await fetch(archiveUrl, {
    cache: 'no-store',
  })
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`Failed to fetch games from ${archiveUrl}: ${res.statusText}`)
  }
  const data = await res.json()
  return data.games || []
}

function parseArchiveYearMonth(url: string): { year: number; month: number } | null {
  // Expected: https://api.chess.com/pub/player/<user>/games/YYYY/MM
  const m = url.match(/\/games\/(\d{4})\/(\d{2})\/?$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  if (month < 1 || month > 12) return null
  return { year, month }
}

function getCurrentMonthArchiveUrl(username: string, now = new Date()): string {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `https://api.chess.com/pub/player/${username}/games/${year}/${month}`
}

export async function fetchPlayerGames(username: string, mode: 'all' | 'recent' = 'all'): Promise<any[]> {
  const archives = await fetchChessComArchives(username)
  
  let archivesToFetch = archives
  if (mode === 'recent') {
    // Chess.com does not guarantee archive order; sort by (year, month) and take the newest.
    const sorted = [...archives].sort((a, b) => {
      const am = parseArchiveYearMonth(a)
      const bm = parseArchiveYearMonth(b)
      if (!am && !bm) return a.localeCompare(b)
      if (!am) return -1
      if (!bm) return 1
      return am.year !== bm.year ? am.year - bm.year : am.month - bm.month
    })

    // Pull a few months to be resilient (current month may be partially published).
    const recentFromArchives = sorted.slice(-3)

    // Also force-include the current month URL (matches the user-reported endpoint).
    const currentMonthUrl = getCurrentMonthArchiveUrl(username)
    const merged = Array.from(new Set([...recentFromArchives, currentMonthUrl]))
    archivesToFetch = merged
  }

  const allGames = []
  for (const url of archivesToFetch) {
    const games = await fetchGamesFromArchive(url)
    allGames.push(...games)
  }
  
  return allGames
}
