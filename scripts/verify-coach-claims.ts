#!/usr/bin/env tsx

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    let envRaw = fs.readFileSync(envPath, 'utf8')
    if (envRaw.charCodeAt(0) === 0xfeff) envRaw = envRaw.slice(1)
    const parsed = dotenv.parse(envRaw)
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value
    }
  } else {
    dotenv.config({ path: envPath })
  }
}

type GameRow = {
  id: string
  date: string | null
  white: string | null
  black: string | null
  result: string | null
  created_at: Date
  pgn_text: string
}

function ymdFromDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function main() {
  loadEnvLocal()

  const { connectToDb, getSql, isDbConfigured, getDbDebugInfo } = await import('../lib/database')
  const { Chess } = await import('chess.js')

  if (!isDbConfigured()) {
    console.error('DB not configured. Set POSTGRES_URL (or DATABASE_URL/POSTGRES_PRISMA_URL) in .env.local')
    process.exit(1)
  }

  await connectToDb()
  const sql = getSql()
  const dbInfo = getDbDebugInfo()
  console.log(`DB: configured=${dbInfo.configured} source=${dbInfo.source} fp=${dbInfo.fingerprint}`)

  const opponents = ['7amza_halabi', 'Vedran-K', 'X-winner']
  const expectedDate = '2026-01-20'

  for (const opp of opponents) {
    console.log(`\n=== Opponent: ${opp} ===`)
    const rows = (await sql`
      SELECT id, date, white, black, result, created_at, pgn_text
      FROM games
      WHERE (white ILIKE ${'%' + opp + '%'} OR black ILIKE ${'%' + opp + '%'})
      ORDER BY created_at DESC
      LIMIT 20
    `) as unknown as GameRow[]

    if (!rows.length) {
      console.log('No games found in `games` table.')
      continue
    }

    const enriched = rows.map((r) => {
      let ply = null as number | null
      try {
        const c = new Chess()
        c.loadPgn(r.pgn_text ?? '')
        ply = c.history().length
      } catch {
        // ignore parse failures
      }
      return {
        id: String(r.id),
        date: r.date ? String(r.date) : null,
        createdYmd: ymdFromDate(new Date(r.created_at)),
        white: r.white ? String(r.white) : null,
        black: r.black ? String(r.black) : null,
        result: r.result ? String(r.result) : null,
        ply,
      }
    })

    const exactDateMatches = enriched.filter((r) => {
      const dateNorm = r.date ? String(r.date).replace(/\./g, '-').slice(0, 10) : null
      return dateNorm === expectedDate || r.createdYmd === expectedDate
    })

    const printRows = (label: string, list: typeof enriched) => {
      console.log(`${label}: ${list.length}`)
      for (const g of list.slice(0, 5)) {
        console.log(
          `- id=${g.id} date=${g.date ?? '-'} created=${g.createdYmd} result=${g.result ?? '-'} ` +
            `white=${g.white ?? '-'} black=${g.black ?? '-'} ply=${g.ply ?? '-'}`
        )
      }
    }

    printRows('Recent matches (top 5)', enriched)
    printRows(`Matches on ${expectedDate} (top 5)`, exactDateMatches)
  }
}

main().catch((e) => {
  console.error('verify-coach-claims failed:', e)
  process.exit(1)
})

