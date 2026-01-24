import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { analyzePgn, parsePgnWithoutEngine } from '@/lib/analysis'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { createGame } from '@/lib/models'
import { buildEmbeddingText, getEmbedding } from '@/lib/embeddings'
import { runBatchAnalysis } from '@/lib/batchAnalysis'
import { executeServerSideAnalysis } from '@/lib/engineGateway'
import { getEntitlementForUser } from '@/lib/billing'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const dbConfigured = isDbConfigured()
    if (dbConfigured) {
      await connectToDb()
    }

    const formData = await request.formData()
    const pgnValue = formData.get('pgn')
    const pgn =
      typeof pgnValue === 'string'
        ? pgnValue
        : pgnValue instanceof File
          ? await pgnValue.text()
          : ''
    // Use an absolute path so runtime CWD differences don't break Stockfish in dev/serverless.
    const defaultStockfishPath =
      process.platform === 'win32'
        ? path.join(process.cwd(), 'stockfish.exe')
        : path.join(process.cwd(), 'stockfish')
    const stockfishPath = (formData.get('stockfishPath') as string) || defaultStockfishPath
    const username = (formData.get('username') as string) || ''
    const analysisMode = process.env.ENGINE_ANALYSIS_MODE || 'offline'

    if (!pgn) {
      return NextResponse.json({ error: 'PGN text is required' }, { status: 400 })
    }

    const results =
      analysisMode === 'inline'
        ? await analyzePgn(pgn, stockfishPath, username)
        : await parsePgnWithoutEngine(pgn)

    if (!results || results.length === 0) {
      return NextResponse.json({ error: 'No games found in PGN' }, { status: 400 })
    }

    if (!dbConfigured) {
      return NextResponse.json({
        count: results.length,
        saved: false,
        message: 'Processed games, but database is not configured so results were not saved.',
      })
    }

    let count = 0
    const created: Array<{ id: string; pgnText: string }> = []
    for (const entry of results) {
      let embedding: number[] | null = null
      try {
        const embeddingText = buildEmbeddingText(entry.game)
        embedding = await getEmbedding(embeddingText)
      } catch (e) {
        console.warn('Embedding generation failed:', e)
      }
      const id = await createGame({
        ...entry.game,
        moves: entry.moves,
        embedding,
      })
      created.push({ id, pgnText: entry.game.pgn_text })
      count++
    }

    // Run engine analysis for a small subset immediately so blunders are real, not defaults.
    // Keep this bounded for serverless/dev responsiveness; the full backlog can be analyzed via /api/engine/analyze or scripts/run-engine-analysis.ts.
    // Only for Pro users - Free users can use client-side analysis.
    const lichessUserId = request.cookies.get('lichess_user_id')?.value
    let hasProAccess = false
    
    if (lichessUserId) {
      try {
        const entitlement = await getEntitlementForUser(lichessUserId)
        hasProAccess = entitlement.plan === 'PRO'
      } catch (e) {
        console.warn('Failed to check entitlement:', e)
      }
    }
    
    const analyzeNow = process.env.ENGINE_ANALYZE_AFTER_IMPORT !== 'false' && hasProAccess
    if (analyzeNow && created.length > 0 && lichessUserId) {
      const envPlayerNames =
        process.env.CHESS_PLAYER_NAMES?.split(',').map(s => s.trim()).filter(Boolean) ?? []
      const playerNames = Array.from(new Set([username, ...envPlayerNames].filter(Boolean)))
      const depth = Math.max(8, Math.min(25, Number(process.env.ANALYSIS_DEPTH ?? 15)))
      const maxToAnalyze = Math.min(5, created.length)

      for (let i = 0; i < maxToAnalyze; i++) {
        try {
          // Use gateway to enforce entitlement and budget
          const result = await executeServerSideAnalysis({
            userId: lichessUserId,
            type: 'game',
            gameId: created[i].id,
            playerNames,
            depth,
          })
          if (result.ok && result.result) {
            // Result is already stored by gateway
            console.log(`Analyzed game ${created[i].id}`)
          }
        } catch (e) {
          // Non-fatal: game is imported; engine analysis can be re-run later.
          console.warn('Immediate engine analysis failed:', e)
        }
      }
    }

    // Trigger batch analysis after successful import
    console.log('🔄 Triggering batch analysis after PGN import...')
    try {
      await runBatchAnalysis()
      console.log('✅ Batch analysis completed')
    } catch (batchError) {
      console.error('❌ Batch analysis failed:', batchError)
      // Don't fail the entire request if batch analysis fails
    }

    return NextResponse.json({ 
      count, 
      message: `Processed ${count} game(s) and updated progression analysis` 
    })
  } catch (error: any) {
    console.error('Error processing PGN:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process PGN' },
      { status: 500 }
    )
  }
}
