#!/usr/bin/env tsx

/**
 * Check which database tables exist and verify migrations
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { connectToDb, getSql } from '../lib/database'

async function checkMigrations() {
  try {
    await connectToDb()
    const sql = getSql()
    
    console.log('🔍 Checking database migrations...')
    console.log('='.repeat(60))
    
    // Check for required tables
    const requiredTables = [
      'games',
      'progression_summaries',
      'engine_analysis',
      'engine_summaries'
    ]
    
    for (const tableName of requiredTables) {
      const result = (await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        )
      `) as Array<{ exists: boolean }>
      
      const exists = result[0]?.exists || false
      const status = exists ? '✅' : '❌'
      console.log(`${status} ${tableName}`)
      
      if (exists) {
        // Get row count - use dynamic SQL for table name
        let count = 0
        try {
          if (tableName === 'games') {
            const countResult = (await sql`SELECT COUNT(*) as count FROM games`) as Array<{ count: number }>
            count = Number(countResult[0]?.count || 0)
          } else if (tableName === 'progression_summaries') {
            const countResult = (await sql`SELECT COUNT(*) as count FROM progression_summaries`) as Array<{ count: number }>
            count = Number(countResult[0]?.count || 0)
          } else if (tableName === 'engine_analysis') {
            const countResult = (await sql`SELECT COUNT(*) as count FROM engine_analysis`) as Array<{ count: number }>
            count = Number(countResult[0]?.count || 0)
          } else if (tableName === 'engine_summaries') {
            const countResult = (await sql`SELECT COUNT(*) as count FROM engine_summaries`) as Array<{ count: number }>
            count = Number(countResult[0]?.count || 0)
          }
        } catch (e) {
          // Ignore count errors
        }
        console.log(`   └─ ${count.toLocaleString()} rows`)
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('📋 Migration Status Summary:')
    
    // Check each table individually
    const gamesCheck = (await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'games'
      )
    `) as Array<{ exists: boolean }>
    
    const progressionCheck = (await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'progression_summaries'
      )
    `) as Array<{ exists: boolean }>
    
    const engineAnalysisCheck = (await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'engine_analysis'
      )
    `) as Array<{ exists: boolean }>
    
    const engineSummariesCheck = (await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'engine_summaries'
      )
    `) as Array<{ exists: boolean }>
    
    const allTables = [
      { name: 'games', exists: gamesCheck[0]?.exists || false },
      { name: 'progression_summaries', exists: progressionCheck[0]?.exists || false },
      { name: 'engine_analysis', exists: engineAnalysisCheck[0]?.exists || false },
      { name: 'engine_summaries', exists: engineSummariesCheck[0]?.exists || false }
    ]
    
    const missingTables = allTables.filter(t => !t.exists)
    
    if (missingTables.length === 0) {
      console.log('✅ All required tables exist!')
    } else {
      console.log('❌ Missing tables:')
      missingTables.forEach(t => {
        console.log(`   - ${t.name}`)
      })
      console.log('\n💡 Run migrations:')
      if (!engineAnalysisCheck[0]?.exists || !engineSummariesCheck[0]?.exists) {
        console.log('   npx tsx scripts/migrate-engine-analysis.ts')
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking migrations:', error)
    process.exit(1)
  }
}

checkMigrations()
