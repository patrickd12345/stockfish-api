#!/usr/bin/env tsx

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  let envRaw = fs.readFileSync(envPath, 'utf8')
  if (envRaw.charCodeAt(0) === 0xfeff) {
    envRaw = envRaw.slice(1)
  }
  const parsed = dotenv.parse(envRaw)
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
} else {
  dotenv.config({ path: envPath })
}

const { analyzeGameWithEngine } = require('../lib/engineAnalysis')
const {
  getGamesNeedingAnalysis,
  storeEngineAnalysis,
  markAnalysisFailed,
} = require('../lib/engineStorage')

const STOCKFISH_PATH = process.env.STOCKFISH_PATH || './stockfish'
const ANALYSIS_DEPTH = parseInt(process.env.ANALYSIS_DEPTH || '15', 10)
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '5', 10)
const POLL_INTERVAL_MS = parseInt(process.env.ANALYSIS_POLL_INTERVAL_MS || '300000', 10)

const playerNames = process.env.CHESS_PLAYER_NAMES?.split(',').map((n: string) => n.trim()).filter(Boolean) || [
  'patrickd1234567',
  'patrickd12345678',
  'anonymous19670705',
]

const hasDbConnection = !!(
  process.env.POSTGRES_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim()
)

if (!hasDbConnection) {
  console.error('Database connection string is required.')
  console.error('Set one of: POSTGRES_URL, DATABASE_URL, or POSTGRES_PRISMA_URL')
  process.exit(1)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function processOnce() {
  const games = await getGamesNeedingAnalysis(CHUNK_SIZE, 'stockfish', ANALYSIS_DEPTH)
  if (games.length === 0) {
    return 0
  }

  console.log(`Processing ${games.length} games...`)
  let succeeded = 0
  for (const game of games) {
    try {
      const result = await analyzeGameWithEngine(
        game.pgn_text,
        STOCKFISH_PATH,
        playerNames,
        ANALYSIS_DEPTH
      )
      await storeEngineAnalysis(game.id, result, 'stockfish')
      succeeded++
    } catch (error: any) {
      await markAnalysisFailed(
        game.id,
        error?.message || 'Unknown error',
        'stockfish',
        null,
        ANALYSIS_DEPTH
      )
    }
  }
  return succeeded
}

async function main() {
  console.log('Engine worker started.')
  console.log(`Polling every ${POLL_INTERVAL_MS}ms. Depth=${ANALYSIS_DEPTH}, Chunk=${CHUNK_SIZE}`)

  while (true) {
    try {
      const processed = await processOnce()
      if (processed === 0) {
        await sleep(POLL_INTERVAL_MS)
      }
    } catch (error) {
      console.error('Worker cycle failed:', error)
      await sleep(POLL_INTERVAL_MS)
    }
  }
}

main().catch((error) => {
  console.error('Worker failed:', error)
  process.exit(1)
})
