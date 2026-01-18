#!/usr/bin/env tsx

/**
 * FULL SUMMARY REBUILD SCRIPT
 *
 * Usage:
 *   npx tsx scripts/rebuild-all-summaries.ts
 */

// Load environment variables BEFORE importing any modules
import * as dotenv from 'dotenv'
import * as path from 'path'

const envPath = path.join(__dirname, '..', '.env.local')
const result = dotenv.config({ path: envPath })

if (result.error) {
  console.error('❌ Failed to load .env.local:', result.error.message)
  process.exit(1)
}

const hasDbConnection = !!(
  process.env.POSTGRES_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim()
)

if (!hasDbConnection) {
  console.error('❌ Database connection string is required')
  console.error('   Please set one of: POSTGRES_URL, DATABASE_URL, or POSTGRES_PRISMA_URL')
  process.exit(1)
}

import { runBatchAnalysis } from '../lib/batchAnalysis'
import { runEngineSummaryAnalysis } from '../lib/engineSummaryAnalysis'

async function main() {
  console.log('🚀 Starting full summary rebuild...')

  try {
    console.log('\n1️⃣  Running Progression Analysis (Win Rates / Trends)...')
    await runBatchAnalysis()

    console.log('\n2️⃣  Running Engine Analysis Summary (CPL / Blunders)...')
    await runEngineSummaryAnalysis()

    console.log('\n✅ All summaries rebuilt successfully!')
  } catch (error) {
    console.error('❌ Summary rebuild failed:', error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
