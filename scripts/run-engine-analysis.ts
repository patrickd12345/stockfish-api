#!/usr/bin/env tsx

/**
 * OFFLINE STOCKFISH ENGINE ANALYSIS PIPELINE
 * 
 * This script runs deterministic, offline Stockfish analysis on games
 * that haven't been analyzed yet. It is:
 * - Offline only (no HTTP routes, no API triggers)
 * - Batch-oriented and resumable
 * - Safe for 10k+ games
 * - Idempotent (safe to re-run)
 * 
 * Usage:
 *   npm run engine:analyze
 *   or
 *   npx tsx scripts/run-engine-analysis.ts
 * 
 * Environment variables:
 *   STOCKFISH_PATH - Path to Stockfish binary (default: ./stockfish)
 *   ANALYSIS_DEPTH - Analysis depth (default: 15)
 *   CHUNK_SIZE - Games per batch (default: 10)
 *   CHESS_PLAYER_NAMES - Comma-separated player names (from .env.local)
 */

// Load environment variables BEFORE importing any modules
import * as dotenv from 'dotenv'
import * as path from 'path'

const envPath = path.join(__dirname, '..', '.env.local')
dotenv.config({ path: envPath })

// Verify database connection
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

import { analyzeGameWithEngine } from '../lib/engineAnalysis'
import { 
  getGamesNeedingAnalysis, 
  storeEngineAnalysis, 
  markAnalysisFailed,
  getAnalysisCoverage 
} from '../lib/engineStorage'

const STOCKFISH_PATH = process.env.STOCKFISH_PATH || './stockfish'
const ANALYSIS_DEPTH = parseInt(process.env.ANALYSIS_DEPTH || '15', 10)
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '10', 10)

// Get player names from environment
const playerNames = process.env.CHESS_PLAYER_NAMES?.split(',').map(n => n.trim()) || [
  'patrickd1234567',
  'patrickd12345678',
  'anonymous19670705'
]

async function main() {
  console.log('🚀 Starting offline Stockfish engine analysis pipeline...')
  console.log('='.repeat(60))
  console.log(`📊 Configuration:`)
  console.log(`   Stockfish path: ${STOCKFISH_PATH}`)
  console.log(`   Analysis depth: ${ANALYSIS_DEPTH}`)
  console.log(`   Chunk size: ${CHUNK_SIZE}`)
  console.log(`   Player names: ${playerNames.join(', ')}`)
  console.log('='.repeat(60))
  
  try {
    // Check current coverage
    console.log('\n📋 Checking analysis coverage...')
    const coverage = await getAnalysisCoverage('stockfish', ANALYSIS_DEPTH)
    console.log(`   Total games: ${coverage.totalGames.toLocaleString()}`)
    console.log(`   Already analyzed: ${coverage.analyzedGames.toLocaleString()}`)
    console.log(`   Failed: ${coverage.failedGames.toLocaleString()}`)
    console.log(`   Pending: ${coverage.pendingGames.toLocaleString()}`)
    
    if (coverage.pendingGames === 0) {
      console.log('\n✅ All games have been analyzed!')
      return
    }
    
    console.log(`\n🔄 Processing ${coverage.pendingGames.toLocaleString()} pending games...`)
    console.log('='.repeat(60))
    
    let processed = 0
    let succeeded = 0
    let failed = 0
    const startTime = Date.now()
    
    // Process in chunks
    while (true) {
      const games = await getGamesNeedingAnalysis(CHUNK_SIZE, 'stockfish', ANALYSIS_DEPTH)
      
      if (games.length === 0) {
        console.log('\n✅ No more games to analyze!')
        break
      }
      
      console.log(`\n📦 Processing chunk: ${games.length} games (${processed + 1}-${processed + games.length} of ${coverage.pendingGames})`)
      
      for (const game of games) {
        try {
          console.log(`   🔍 Analyzing game ${game.id}...`)
          
          const result = await analyzeGameWithEngine(
            game.pgn_text,
            STOCKFISH_PATH,
            playerNames,
            ANALYSIS_DEPTH
          )
          
          await storeEngineAnalysis(game.id, result, 'stockfish')
          
          console.log(`   ✅ Game ${game.id}: CPL=${result.avgCentipawnLoss?.toFixed(1) || 'N/A'}, Blunders=${result.blunders}, Mistakes=${result.mistakes}`)
          succeeded++
        } catch (error: any) {
          console.error(`   ❌ Game ${game.id} failed: ${error.message}`)
          
          await markAnalysisFailed(
            game.id,
            error.message || 'Unknown error',
            'stockfish',
            null,
            ANALYSIS_DEPTH
          )
          
          failed++
        }
        
        processed++
      }
      
      // Progress update
      const elapsed = (Date.now() - startTime) / 1000
      const rate = processed / elapsed
      const remaining = coverage.pendingGames - processed
      const eta = remaining / rate
      
      console.log(`\n📊 Progress: ${processed}/${coverage.pendingGames} (${((processed / coverage.pendingGames) * 100).toFixed(1)}%)`)
      console.log(`   ✅ Succeeded: ${succeeded}`)
      console.log(`   ❌ Failed: ${failed}`)
      console.log(`   ⏱️  Rate: ${rate.toFixed(1)} games/sec`)
      console.log(`   ⏳ ETA: ${(eta / 60).toFixed(1)} minutes`)
    }
    
    const duration = (Date.now() - startTime) / 1000
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ Engine analysis pipeline completed!')
    console.log(`⏱️  Duration: ${(duration / 60).toFixed(1)} minutes`)
    console.log(`📊 Results:`)
    console.log(`   ✅ Succeeded: ${succeeded.toLocaleString()}`)
    console.log(`   ❌ Failed: ${failed.toLocaleString()}`)
    console.log(`   📈 Success rate: ${((succeeded / processed) * 100).toFixed(1)}%`)
    
    // Final coverage check
    const finalCoverage = await getAnalysisCoverage('stockfish', ANALYSIS_DEPTH)
    console.log(`\n📋 Final coverage:`)
    console.log(`   Analyzed: ${finalCoverage.analyzedGames.toLocaleString()}/${finalCoverage.totalGames.toLocaleString()} (${((finalCoverage.analyzedGames / finalCoverage.totalGames) * 100).toFixed(1)}%)`)
    
  } catch (error) {
    console.error('❌ Engine analysis pipeline failed:', error)
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Analysis interrupted by user')
  process.exit(130)
})

process.on('SIGTERM', () => {
  console.log('\n\n⏹️  Analysis terminated')
  process.exit(143)
})

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  })
}
