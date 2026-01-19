#!/usr/bin/env tsx

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { Chess } from 'chess.js'
import { connectToDb, getSql } from '../lib/database'

async function main() {
  await connectToDb()
  const sql = getSql()

  const user = process.argv[2] ?? 'anonymous19670705'
  const rows = (await sql`
    SELECT lichess_game_id, pgn
    FROM public.lichess_recent_games
    WHERE lichess_user_id = ${user}
    ORDER BY fetched_at DESC
    LIMIT 1
  `) as Array<{ lichess_game_id: string; pgn: string }>

  const row = rows[0]
  if (!row?.pgn) {
    console.log('No PGN found')
    return
  }

  const chess = new Chess()
  chess.loadPgn(row.pgn)
  const hist = chess.history({ verbose: true }) as any[]

  const replay = new Chess()
  for (let i = 0; i < hist.length; i++) {
    const mv = hist[i]
    try {
      replay.move(mv)
    } catch (e: any) {
      console.log('Replay failed at ply', i, 'move', mv, 'error', e?.message)
      return
    }
  }
  console.log('Replay OK for', row.lichess_game_id, 'plies', hist.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

