#!/usr/bin/env tsx

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { connectToDb } from '../lib/database'
import { getOpponentRatingBandPerformance } from '../lib/models'

async function main() {
  await connectToDb()
  const res = await getOpponentRatingBandPerformance(200, 50)
  if ('note' in res && res.note) {
    console.log(res.note)
    process.exit(0)
  }

  console.log(`Overall: ${(res.overallWinRate * 100).toFixed(1)}% (n=${res.overallGames})`)
  console.log(res.bands.slice(0, 15))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

