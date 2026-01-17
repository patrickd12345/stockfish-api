import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_USERS = ['Patrickd1234567', 'Anonymous19670705', 'Patrickd12345678']
const OUTPUT_DIR = path.resolve('downloads/chesscom')

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

async function fetchArchives(username) {
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`
  const data = await fetchJson(url)
  return data.archives || []
}

async function fetchArchiveGames(archiveUrl) {
  const data = await fetchJson(archiveUrl)
  return data.games || []
}

function normalizePgn(pgn) {
  if (!pgn) return ''
  return pgn.trim() + '\n\n'
}

async function downloadUserGames(username) {
  console.log(`\n==> Downloading games for ${username}`)
  const archives = await fetchArchives(username)
  if (archives.length === 0) {
    console.log(`No archives found for ${username}`)
    return { username, games: [], pgn: '' }
  }

  const allGames = []
  for (const archiveUrl of archives) {
    console.log(`Fetching archive: ${archiveUrl}`)
    const games = await fetchArchiveGames(archiveUrl)
    allGames.push(...games)
  }

  const pgnText = allGames.map((game) => normalizePgn(game.pgn)).join('')
  return { username, games: allGames, pgn: pgnText }
}

async function main() {
  const inputUsers = process.argv.slice(2)
  const users = inputUsers.length > 0 ? inputUsers : DEFAULT_USERS

  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  for (const username of users) {
    try {
      const { games, pgn } = await downloadUserGames(username)
      const pgnPath = path.join(OUTPUT_DIR, `${username}.pgn`)
      const jsonPath = path.join(OUTPUT_DIR, `${username}.json`)

      await fs.writeFile(pgnPath, pgn, 'utf8')
      await fs.writeFile(jsonPath, JSON.stringify(games, null, 2), 'utf8')

      console.log(`Saved ${games.length} games for ${username}`)
      console.log(`- PGN: ${pgnPath}`)
      console.log(`- JSON: ${jsonPath}`)
    } catch (error) {
      console.error(`Failed to download games for ${username}:`, error)
    }
  }
}

await main()
