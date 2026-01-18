#!/usr/bin/env tsx

// Load environment variables
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { loadProgressionSummary } from '../lib/progressionStorage'

async function checkProgression() {
  try {
    console.log('🔍 Loading current progression summary...')
    const summary = await loadProgressionSummary()
    
    if (!summary) {
      console.log('❌ No progression summary found')
      return
    }
    
    console.log('📊 Current progression summary:')
    console.log(`   Total games: ${summary.totalGames}`)
    console.log(`   Computed at: ${summary.computedAt}`)
    console.log(`   Win rate: ${(summary.overall.winRate * 100).toFixed(1)}%`)
    console.log(`   Draw rate: ${(summary.overall.drawRate * 100).toFixed(1)}%`)
    console.log(`   Loss rate: ${(summary.overall.lossRate * 100).toFixed(1)}%`)
    
    if (summary.overall.avgAccuracy !== undefined) {
      console.log(`   Average accuracy: ${summary.overall.avgAccuracy.toFixed(1)}%`)
      console.log(`   Games with accuracy: ${summary.overall.gamesWithAccuracy}`)
    } else {
      console.log(`   Average accuracy: No data`)
    }
    
    console.log(`   Average blunders: ${summary.overall.avgBlunders.toFixed(2)}`)
    console.log(`   Games with blunder data: ${summary.overall.gamesWithBlunderData}`)
    console.log(`   Unknown results: ${summary.overall.unknownResults}`)
    
  } catch (error) {
    console.error('❌ Error checking progression:', error)
  }
}

checkProgression()