export async function fetchChessComArchives(username: string): Promise<string[]> {
  const res = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`)
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`Failed to fetch archives for ${username}: ${res.statusText}`)
  }
  const data = await res.json()
  return data.archives || []
}

export async function fetchGamesFromArchive(archiveUrl: string): Promise<any[]> {
  const res = await fetch(archiveUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch games from ${archiveUrl}: ${res.statusText}`)
  }
  const data = await res.json()
  return data.games || []
}

export async function fetchPlayerGames(username: string, mode: 'all' | 'recent' = 'all'): Promise<any[]> {
  const archives = await fetchChessComArchives(username)
  
  let archivesToFetch = archives
  if (mode === 'recent') {
    // Only last 2 months
    archivesToFetch = archives.slice(-2)
  }

  const allGames = []
  for (const url of archivesToFetch) {
    const games = await fetchGamesFromArchive(url)
    allGames.push(...games)
  }
  
  return allGames
}
