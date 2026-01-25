import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured, connectToDb, getSql } from '@/lib/database'
import { FeatureAccessError, requireFeatureForUser } from '@/lib/featureGate/server'
import { Chess } from 'chess.js'
import { StockfishEngine, resolveStockfishPath } from '@/lib/stockfish'
import type { PatternTag } from '@/lib/blunderDna'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/blunder-dna/create-drill
 * 
 * Creates a drill from a post-game review.
 * 
 * This endpoint allows users to convert AI coach suggestions from post-game reviews
 * into practice drills that are integrated into the Blunder DNA training system.
 * 
 * The drill is created from the final position (or critical position) of the game,
 * with pattern tag inferred from the review text and difficulty calculated from
 * evaluation swing.
 * 
 * @see docs/POST_GAME_REVIEW_DRILLS.md for full documentation
 */
export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    await requireFeatureForUser('blunder_dna', { userId: lichessUserId })

    const body = await request.json().catch(() => ({}))
    const {
      lichessGameId,
      fen,
      moves,
      myColor,
      review,
      evaluation,
      bestMove,
      bestLine,
      depth
    } = body

    if (!lichessGameId || !fen || !moves) {
      return NextResponse.json(
        { error: 'Missing required fields: lichessGameId, fen, moves' },
        { status: 400 }
      )
    }

    await connectToDb()
    const sql = getSql()

    // Parse moves to find critical position
    const chess = new Chess()
    try {
      chess.loadPgn(moves)
    } catch {
      return NextResponse.json({ error: 'Invalid PGN moves' }, { status: 400 })
    }

    const history = chess.history({ verbose: true })
    if (history.length === 0) {
      return NextResponse.json({ error: 'No moves in game' }, { status: 400 })
    }

    // Find the critical position - look for the biggest eval swing
    // or use the position mentioned in the review
    let criticalPly = history.length - 1 // Default to last move
    let criticalFen = fen
    let criticalMove = history[history.length - 1]?.san || ''

    // Try to find a position with significant evaluation change
    // For now, we'll use the final position and analyze it
    const enginePath = resolveStockfishPath('stockfish.exe')
    const engine = new StockfishEngine(enginePath)
    const engineAny = engine as any

    try {
      await engine.start()
      try {
        engineAny.send('setoption name Threads value 1')
        engineAny.send('setoption name Hash value 64')
      } catch {
        // ignore
      }

      // Analyze the critical position
      const analysisDepth = depth || 15
      const wait = engineAny.waitFor((line: string) => line.startsWith('bestmove'), 30000)
      engineAny.send(`position fen ${criticalFen}`)
      engineAny.send(`go depth ${analysisDepth}`)
      const lines = await wait

      const bestMoveLine = lines.find((l: string) => l.startsWith('bestmove'))
      const analyzedBestMove = bestMoveLine?.match(/bestmove\s+(\S+)/)?.[1] || bestMove || ''
      const pvLine = [...lines].reverse().find((l: string) => l.includes(' pv '))
      const pv = pvLine?.match(/\spv\s+(.+)/)?.[1]?.split(/\s+/) || bestLine?.split(' ') || []

      // Parse evaluation
      const scoreLine = lines.find((l: string) => l.includes('score') && l.includes('depth'))
      let evalBefore = evaluation || 0
      if (scoreLine) {
        const cpMatch = scoreLine.match(/cp\s+(-?\d+)/)
        const mateMatch = scoreLine.match(/mate\s+(-?\d+)/)
        if (mateMatch) {
          evalBefore = parseInt(mateMatch[1]) * 10000 // Convert mate to centipawns
        } else if (cpMatch) {
          evalBefore = parseInt(cpMatch[1])
        }
      }

      // Determine pattern tag from review text or use generic
      let patternTag: PatternTag = 'missed_threat'
      const reviewLower = (review || '').toLowerCase()
      if (reviewLower.includes('hanging') || reviewLower.includes('en prise') || reviewLower.includes('capture')) {
        patternTag = 'hanging_piece'
      } else if (reviewLower.includes('threat') || reviewLower.includes('tactic')) {
        patternTag = 'missed_threat'
      } else if (reviewLower.includes('win') || reviewLower.includes('winning')) {
        patternTag = 'missed_win'
      } else if (reviewLower.includes('king') || reviewLower.includes('safety') || reviewLower.includes('check')) {
        patternTag = 'unsafe_king'
      } else if (reviewLower.includes('time') || reviewLower.includes('clock')) {
        patternTag = 'time_trouble_collapse'
      } else if (reviewLower.includes('bad') && reviewLower.includes('capture')) {
        patternTag = 'bad_capture'
      }

      // Determine side to move from FEN
      const fenParts = criticalFen.split(' ')
      const sideToMove = fenParts[1] === 'b' ? 'black' : 'white'
      
      // Get the move that was played at this position
      const myMove = criticalMove || analyzedBestMove || ''

      // Calculate eval after (simplified - would need to play the move)
      const evalAfter = evalBefore // Placeholder - would need actual analysis

      // Determine difficulty based on eval swing
      const difficulty = Math.min(5, Math.max(1, Math.floor(Math.abs(evalBefore) / 200)))

      const now = new Date()

      // Insert drill
      const rows = (await sql`
        INSERT INTO public.blunder_dna_drills (
          lichess_user_id, lichess_game_id, ply, fen, side_to_move, my_move, best_move, pv,
          eval_before, eval_after, pattern_tag, difficulty, created_at, updated_at
        ) VALUES (
          ${lichessUserId}, ${lichessGameId}, ${criticalPly}, ${criticalFen}, ${sideToMove}, ${myMove}, ${analyzedBestMove}, ${pv.join(' ')},
          ${Math.round(evalBefore)}, ${Math.round(evalAfter)}, ${patternTag}, ${difficulty}, ${now}, ${now}
        )
        ON CONFLICT (lichess_user_id, lichess_game_id, ply, pattern_tag)
        DO UPDATE SET
          fen = EXCLUDED.fen,
          side_to_move = EXCLUDED.side_to_move,
          my_move = EXCLUDED.my_move,
          best_move = EXCLUDED.best_move,
          pv = EXCLUDED.pv,
          eval_before = EXCLUDED.eval_before,
          eval_after = EXCLUDED.eval_after,
          difficulty = EXCLUDED.difficulty,
          updated_at = now()
        RETURNING drill_id, lichess_game_id, ply, fen, side_to_move, my_move, best_move, pv, eval_before, eval_after, pattern_tag, difficulty, created_at
      `) as Array<any>

      const row = rows[0]

      // Ensure mastery row exists
      await sql`
        INSERT INTO public.blunder_dna_mastery (drill_id, lichess_user_id, due_date)
        VALUES (${row.drill_id}, ${lichessUserId}, ${now.toISOString().slice(0, 10)}::date)
        ON CONFLICT (drill_id)
        DO NOTHING
      `

      await engine.stop()

      return NextResponse.json({
        success: true,
        drill: {
          drillId: row.drill_id,
          lichessGameId: row.lichess_game_id,
          ply: row.ply,
          fen: row.fen,
          patternTag: row.pattern_tag,
          difficulty: row.difficulty
        }
      })
    } catch (engineError: any) {
      await engine.stop().catch(() => null)
      throw engineError
    }
  } catch (error: any) {
    if (error instanceof FeatureAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[Create Drill] Failed:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create drill' },
      { status: 500 }
    )
  }
}
