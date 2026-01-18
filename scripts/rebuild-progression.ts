#!/usr/bin/env tsx

/**
 * ONE-TIME BACKFILL SCRIPT
 * 
 * This script computes the initial ProgressionSummary from all existing games.
 * 
 * Usage:
 *   npm run rebuild:progression
 *   or
 *   npx tsx scripts/rebuild-progression.ts
 * 
 * This script:
 * - Reuses the existing batchAnalysis pipeline (no duplicate logic)
 * - Creates the first authoritative ProgressionSummary
 * - Should be run ONCE after implementing the batch analysis system
 * - Does NOT run automatically on app startup
 * - Does NOT run during /api/chat
 */

// Load environment variables BEFORE importing any modules that use them
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local from project root
const envPath = path.join(__dirname, '..', '.env.local')
const result = dotenv.config({ path: envPath })

if (result.error) {
  console.error('❌ Failed to load .env.local:', result.error.message)
  process.exit(1)
}

// Verify required environment variables
// Check for any of the supported database connection string env vars
const hasDbConnection = !!(
  process.env.POSTGRES_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim()
)

if (!hasDbConnection) {
  console.error('❌ Database connection string is required')
  console.error('   Please set one of the following in your .env.local file:')
  console.error('   - POSTGRES_URL')
  console.error('   - DATABASE_URL')
  console.error('   - POSTGRES_PRISMA_URL')
  console.error('   Current env keys:', Object.keys(process.env).filter(k => 
    k.includes('POSTGRES') || k.includes('DATABASE')
  ))
  process.exit(1)
}

import { runBatchAnalysis } from '../lib/batchAnalysis'
import { getProgressionSummaryMetadata } from '../lib/progressionStorage'

async function main() {
  console.log('🚀 Starting one-time progression backfill...')
  console.log('=' .repeat(60))
  
  try {
    // Check current state
    console.log('📋 Checking current progression summary status...')
    const metadata = await getProgressionSummaryMetadata()
    
    if (!metadata) {
      console.log('❌ Unable to check progression summary status')
      process.exit(1)
    }
    
    console.log(`📊 Current game count: ${metadata.currentGameCount}`)
    
    if (metadata.exists) {
      console.log(`⚠️  Progression summary already exists:`)
      console.log(`   - Games analyzed: ${metadata.gameCountUsed}`)
      console.log(`   - Computed at: ${metadata.computedAt}`)
      console.log(`   - Up to date: ${!metadata.currentGameCount || metadata.currentGameCount === metadata.gameCountUsed ? 'Yes' : 'No'}`)
      
      // Ask for confirmation if summary exists
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      })
      
      const answer = await new Promise<string>((resolve) => {
        readline.question('\n🤔 Progression summary already exists. Rebuild anyway? (y/N): ', resolve)
      })
      
      readline.close()
      
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('✋ Backfill cancelled by user')
        process.exit(0)
      }
    }
    
    if (metadata.currentGameCount === 0) {
      console.log('⚠️  No games found in database. Nothing to backfill.')
      process.exit(0)
    }
    
    console.log('\n🔄 Running batch analysis pipeline...')
    console.log('=' .repeat(60))
    
    // Run the batch analysis (reuses existing pipeline)
    const startTime = Date.now()
    const summary = await runBatchAnalysis()
    const duration = Date.now() - startTime
    
    console.log('=' .repeat(60))
    console.log('✅ Backfill completed successfully!')
    console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)} seconds`)
    console.log('\n📈 Summary:')
    console.log(`   - Total games analyzed: ${summary.totalGames.toLocaleString()}`)
    console.log(`   - Period: ${summary.period.start} → ${summary.period.end}`)
    console.log(`   - Win rate: ${(summary.overall.winRate * 100).toFixed(1)}%`)
    if (summary.overall.avgAccuracy) {
      console.log(`   - Average accuracy: ${summary.overall.avgAccuracy.toFixed(1)}%`)
    }
    console.log(`   - Average blunders: ${summary.overall.avgBlunders.toFixed(2)} per game`)
    console.log(`   - Computed at: ${summary.computedAt}`)
    
    if (summary.openings.strongest.length > 0) {
      console.log(`\n🏆 Strongest opening: ${summary.openings.strongest[0].opening} (${(summary.openings.strongest[0].winRate * 100).toFixed(1)}% win rate)`)
    }
    
    if (summary.signals.accuracyTrend !== 'insufficient_data') {
      console.log(`\n📊 Accuracy trend: ${summary.signals.accuracyTrend}`)
    }
    
    console.log('\n🎉 The progression analysis is now available to the chat agent!')
    console.log('   Future game imports will automatically update the analysis.')
    
  } catch (error) {
    console.error('❌ Backfill failed:', error)
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