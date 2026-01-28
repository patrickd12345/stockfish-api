#!/usr/bin/env tsx

/**
 * Benchmark: Measure searchGames performance.
 *
 * Usage:
 *   npx tsx scripts/benchmark-search.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { connectToDb } from '../lib/database'
import { searchGames } from '../lib/models'

async function benchmark() {
  console.log('📊 Running search benchmark...')

  try {
    await connectToDb()

    // We can't really control the state of the DB here (no seed data guarantee),
    // so we just measure the current state.

    const queries = ['Carlsen', 'Opening', '2023', 'Checkmate']
    const iterations = 5

    for (const query of queries) {
      console.log(`\n🔍 Benchmarking query: "${query}"`)
      let totalTime = 0

      for (let i = 0; i < iterations; i++) {
        const start = performance.now()
        await searchGames(query, 50)
        const end = performance.now()
        const duration = end - start
        totalTime += duration
        // console.log(`   Iteration ${i + 1}: ${duration.toFixed(2)}ms`)
      }

      const avg = totalTime / iterations
      console.log(`   Average time (${iterations} runs): ${avg.toFixed(2)}ms`)
    }

  } catch (error) {
    console.error('❌ Benchmark failed:', error)
    process.exit(1)
  }
}

benchmark()
