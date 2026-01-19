import { connectToDb, getSql } from '@/lib/database'
import type { BlunderDetail } from '@/lib/engineAnalysis'

let tableReady = false

async function ensureBlunderTable(): Promise<void> {
  if (tableReady) return
  await connectToDb()
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS analysis_blunders (
      id BIGSERIAL PRIMARY KEY,
      game_id UUID NOT NULL,
      engine_name TEXT NOT NULL,
      analysis_depth INT NOT NULL DEFAULT 15,
      move_number INT NOT NULL,
      ply INT NOT NULL,
      fen TEXT NOT NULL,
      played_move TEXT NOT NULL,
      best_move TEXT,
      eval_before INT NOT NULL,
      eval_after INT NOT NULL,
      best_eval INT,
      centipawn_loss INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_analysis_blunders_game_id ON analysis_blunders (game_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_analysis_blunders_created_at ON analysis_blunders (created_at DESC)`
  tableReady = true
}

export async function storeBlunderDetails(
  gameId: string,
  engineName: string,
  analysisDepth: number,
  blunders: BlunderDetail[]
): Promise<void> {
  await ensureBlunderTable()
  const sql = getSql()

  await sql`
    DELETE FROM analysis_blunders
    WHERE game_id = ${gameId}::uuid
      AND engine_name = ${engineName}
      AND analysis_depth = ${analysisDepth}
  `

  for (const blunder of blunders) {
    await sql`
      INSERT INTO analysis_blunders (
        game_id,
        engine_name,
        analysis_depth,
        move_number,
        ply,
        fen,
        played_move,
        best_move,
        eval_before,
        eval_after,
        best_eval,
        centipawn_loss
      ) VALUES (
        ${gameId}::uuid,
        ${engineName},
        ${analysisDepth},
        ${blunder.moveNumber},
        ${blunder.ply},
        ${blunder.fen},
        ${blunder.playedMove},
        ${blunder.bestMove},
        ${blunder.evalBefore},
        ${blunder.evalAfter},
        ${blunder.bestEval},
        ${blunder.centipawnLoss}
      )
    `
  }
}

export async function getRecentBlunders(limit = 3) {
  await ensureBlunderTable()
  const sql = getSql()
  const rows = (await sql`
    SELECT game_id, move_number, ply, fen, played_move, best_move, eval_before, eval_after, best_eval, centipawn_loss, created_at
    FROM analysis_blunders
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>

  return rows.map((row) => ({
    gameId: String(row.game_id),
    moveNumber: Number(row.move_number),
    ply: Number(row.ply),
    fen: String(row.fen),
    playedMove: String(row.played_move),
    bestMove: row.best_move ? String(row.best_move) : null,
    evalBefore: Number(row.eval_before),
    evalAfter: Number(row.eval_after),
    bestEval: row.best_eval !== null && row.best_eval !== undefined ? Number(row.best_eval) : null,
    centipawnLoss: Number(row.centipawn_loss),
    createdAt: row.created_at,
  }))
}
