#!/usr/bin/env tsx

// Load environment variables
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { connectToDb, getSql } from '../lib/database'

async function sampleGames() {
  try {
    await connectToDb()
    const sql = getSql()
    
    console.log('🔍 Sampling games to check data quality...')
    
    // Get a few sample games
    const samples = await sql`
      SELECT id, white, black, result, my_accuracy, blunders 
      FROM games 
      ORDER BY created_at DESC 
      LIMIT 10
    `
    
    console.log('\n📊 Sample games:')
    samples.forEach((game, i) => {
      console.log(`${i + 1}. Game ${game.id}:`)
      console.log(`   White: ${game.white}`)
      console.log(`   Black: ${game.black}`)
      console.log(`   Result: ${game.result}`)
      console.log(`   Accuracy: ${game.my_accuracy}`)
      console.log(`   Blunders: ${game.blunders}`)
      console.log()
    })
    
    // Check data distribution
    const stats = await sql`
      SELECT 
        COUNT(*) as total_games,
        COUNT(my_accuracy) as games_with_accuracy,
        AVG(my_accuracy) as avg_accuracy,
        MIN(my_accuracy) as min_accuracy,
        MAX(my_accuracy) as max_accuracy,
        COUNT(blunders) as games_with_blunders,
        AVG(blunders) as avg_blunders,
        MIN(blunders) as min_blunders,
        MAX(blunders) as max_blunders
      FROM games
    `
    
    console.log('📈 Data distribution:')
    console.log(`   Total games: ${stats[0].total_games}`)
    console.log(`   Games with accuracy: ${stats[0].games_with_accuracy}`)
    console.log(`   Accuracy range: ${stats[0].min_accuracy} - ${stats[0].max_accuracy}`)
    console.log(`   Average accuracy: ${Number(stats[0].avg_accuracy).toFixed(2)}`)
    console.log(`   Games with blunders: ${stats[0].games_with_blunders}`)
    console.log(`   Blunder range: ${stats[0].min_blunders} - ${stats[0].max_blunders}`)
    console.log(`   Average blunders: ${Number(stats[0].avg_blunders).toFixed(2)}`)
    
  } catch (error) {
    console.error('❌ Error sampling games:', error)
  }
}

sampleGames()