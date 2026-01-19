#!/usr/bin/env tsx

/**
 * Print Stockfish engine analysis progress (coverage).
 *
 * Usage:
 *   pnpm engine:progress
 *   or
 *   npx tsx scripts/engine-coverage.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables BEFORE importing app modules.
const envPath = path.join(__dirname, '..', '.env.local')
dotenv.config({ path: envPath })

const hasDbConnection = !!(
  process.env.POSTGRES_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim()
)

if (!hasDbConnection) {
  console.error('❌ No database connection string found.')
  console.error('   Define one of: POSTGRES_URL, DATABASE_URL, POSTGRES_PRISMA_URL in .env.local')
  process.exit(1)
}

async function main() {
  const { getAnalysisCoverage } = await import('../lib/engineStorage')

  const depth = Math.max(8, Math.min(25, Number(process.env.ANALYSIS_DEPTH ?? 15)))
  const coverage = await getAnalysisCoverage('stockfish', depth)

  const done = coverage.analyzedGames + coverage.failedGames
  const pct = coverage.totalGames > 0 ? (done / coverage.totalGames) * 100 : 0

  console.log('📋 Stockfish analysis coverage')
  console.log(`   Depth: ${depth}`)
  console.log(`   Total: ${coverage.totalGames.toLocaleString()}`)
  console.log(`   Analyzed: ${coverage.analyzedGames.toLocaleString()}`)
  console.log(`   Failed: ${coverage.failedGames.toLocaleString()}`)
  console.log(`   Pending: ${coverage.pendingGames.toLocaleString()}`)
  console.log(`   Progress: ${pct.toFixed(2)}%`)
}

main().catch((e) => {
  console.error('❌ Failed to read coverage:', e)
  process.exit(1)
})

