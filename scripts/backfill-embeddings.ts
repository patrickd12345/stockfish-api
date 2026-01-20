#!/usr/bin/env tsx

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { connectToDb, getSql } from '@/lib/database'
import { buildEmbeddingText, getEmbedding, toVectorString } from '@/lib/embeddings'

type Args = {
  limit: number
  maxBatches: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (key: string) => {
    const idx = argv.indexOf(key)
    if (idx === -1) return null
    return argv[idx + 1] ?? null
  }
  const limit = Number(get('--limit') ?? '200')
  const maxBatches = Number(get('--maxBatches') ?? '50')
  return {
    limit: Number.isFinite(limit) ? Math.max(1, Math.min(1000, Math.trunc(limit))) : 200,
    maxBatches: Number.isFinite(maxBatches) ? Math.max(1, Math.min(10000, Math.trunc(maxBatches))) : 50,
  }
}

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

async function countMissingEmbeddings(sql: any): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM games
    WHERE embedding IS NULL
  `) as Array<{ count: number }>
  return Number(rows[0]?.count ?? 0)
}

async function main() {
  loadEnvLocal()
  const { limit, maxBatches } = parseArgs()

  await connectToDb()
  const sql = getSql()

  console.log(`🔎 Backfill embeddings starting. batchLimit=${limit}, maxBatches=${maxBatches}`)

  let totalUpdated = 0
  for (let batch = 1; batch <= maxBatches; batch++) {
    const remaining = await countMissingEmbeddings(sql)
    if (remaining <= 0) {
      console.log(`✅ All games have embeddings. Total updated=${totalUpdated}`)
      return
    }

    console.log(`\n📦 Batch ${batch}/${maxBatches} (remaining=${remaining})`)

    const rows = (await sql`
      SELECT id, white, black, date, result, opening_name, pgn_text
      FROM games
      WHERE embedding IS NULL
        AND pgn_text IS NOT NULL
        AND pgn_text <> ''
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as Array<{
      id: string
      white: string | null
      black: string | null
      date: string | null
      result: string | null
      opening_name: string | null
      pgn_text: string
    }>

    if (rows.length === 0) {
      console.log(`⚠️  No eligible rows found (remaining=${remaining}).`)
      return
    }

    let updated = 0
    let skipped = 0

    for (const g of rows) {
      try {
        const text = buildEmbeddingText({
          white: g.white ?? undefined,
          black: g.black ?? undefined,
          date: g.date ?? undefined,
          result: g.result ?? undefined,
          opening_name: g.opening_name ?? undefined,
          pgn_text: g.pgn_text,
        })
        const embedding = await getEmbedding(text)
        if (!embedding || embedding.length === 0) {
          skipped++
          continue
        }
        const embeddingStr = toVectorString(embedding)
        await sql`
          UPDATE games
          SET embedding = (${embeddingStr}::text::vector)
          WHERE id = ${g.id}::uuid
        `
        updated++
        totalUpdated++
      } catch (e: any) {
        const msg = String(e?.message ?? e)
        console.warn(`❌ Failed embedding for game ${g.id}:`, msg)
        // If we're rate-limited, stop immediately (this avoids hammering the gateway).
        if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
          console.warn('⏸️  Rate-limited. Stop now and retry later once credits/rate limit clears.')
          return
        }
        skipped++
      }
    }

    console.log(`✅ Batch done. updated=${updated}, skipped=${skipped}, totalUpdated=${totalUpdated}`)
    if (updated === 0) {
      console.log('⚠️  No progress in this batch; stopping.')
      return
    }
  }

  console.log(`🛑 Reached maxBatches. Total updated=${totalUpdated}`)
}

main().catch((e) => {
  console.error('Backfill failed:', e)
  process.exit(1)
})

