#!/usr/bin/env tsx

/**
 * ONE-TIME ENGINE SUMMARY BACKFILL SCRIPT
 * 
 * This script computes the initial EngineSummary from all engine_analysis rows.
 * 
 * Usage:
 *   npm run rebuild:engine-summary
 *   or
 *   npx tsx scripts/rebuild-engine-summary.ts
 * 
 * This script:
 * - Reads all engine_analysis rows
 * - Computes aggregate, career-level engine metrics
 * - Tracks coverage explicitly
 * - Stores ONE authoritative EngineSummary
 * - Does NOT run automatically on app startup
 * - Does NOT run during /api/chat
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

// Verify required environment variables
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

import { runEngineSummaryAnalysis } from '../lib/engineSummaryAnalysis'
import { getEngineSummaryMetadata } from '../lib/engineSummaryStorage'

async function main() {
  console.log('🚀 Starting engine summary backfill...')
  console.log('='.repeat(60))
  
  try {
    // Check current state
    console.log('📋 Checking current engine summary status...')
    const metadata = await getEngineSummaryMetadata()
    
    if (!metadata) {
      console.log('❌ Unable to check engine summary status')
      process.exit(1)
    }
    
    console.log(`📊 Current engine analysis count: ${metadata.currentAnalysisCount}`)
    
    if (metadata.exists) {
      console.log(`⚠️  Engine summary already exists:`)
      console.log(`   - Analyses used: ${metadata.gameCountUsed}`)
      console.log(`   - Computed at: ${metadata.computedAt}`)
      console.log(`   - Up to date: ${metadata.currentAnalysisCount === metadata.gameCountUsed ? 'Yes' : 'No'}`)
      
      // Ask for confirmation if summary exists
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      })
      
      const answer = await new Promise<string>((resolve) => {
        readline.question('\n🤔 Engine summary already exists. Rebuild anyway? (y/N): ', resolve)
      })
      
      readline.close()
      
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('✋ Backfill cancelled by user')
        process.exit(0)
      }
    }
    
    if (metadata.currentAnalysisCount === 0) {
      console.log('⚠️  No engine analyses found. Run engine analysis first: npm run engine:analyze')
      process.exit(0)
    }
    
    console.log('\n🔄 Running engine summary analysis...')
    console.log('='.repeat(60))
    
    // Run the summary analysis
    const startTime = Date.now()
    const summary = await runEngineSummaryAnalysis()
    const duration = Date.now() - startTime
    
    console.log('='.repeat(60))
    console.log('✅ Engine summary completed successfully!')
    console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)} seconds`)
    console.log('\n📈 Summary:')
    console.log(`   - Total games: ${summary.totalGames.toLocaleString()}`)
    console.log(`   - Games with engine analysis: ${summary.gamesWithEngineAnalysis.toLocaleString()}`)
    console.log(`   - Coverage: ${summary.coveragePercent.toFixed(1)}%`)
    
    if (summary.overall.avgCentipawnLoss !== null) {
      console.log(`   - Average CPL: ${summary.overall.avgCentipawnLoss.toFixed(1)}`)
    }
    console.log(`   - Blunder rate: ${summary.overall.blunderRate.toFixed(2)} per game`)
    console.log(`   - Mistake rate: ${summary.overall.mistakeRate.toFixed(2)} per game`)
    console.log(`   - Inaccuracy rate: ${summary.overall.inaccuracyRate.toFixed(2)} per game`)
    
    if (summary.trends.cplDelta !== null) {
      const trend = summary.trends.cplDelta > 0 ? '📈' : summary.trends.cplDelta < 0 ? '📉' : '➡️'
      console.log(`\n📊 CPL trend (last 50 vs previous 50): ${trend} ${summary.trends.cplDelta > 0 ? '+' : ''}${summary.trends.cplDelta.toFixed(1)}`)
    }
    
    console.log('\n🎉 The engine summary is now available to the chat agent!')
    console.log('   Future engine analyses will require re-running this script to update the summary.')
    
  } catch (error) {
    console.error('❌ Engine summary backfill failed:', error)
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Backfill interrupted by user')
  process.exit(130)
})

process.on('SIGTERM', () => {
  console.log('\n\n⏹️  Backfill terminated')
  process.exit(143)
})

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  })
}
