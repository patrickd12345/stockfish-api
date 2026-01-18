import { NextRequest, NextResponse } from 'next/server'
import { analyzePgn } from '@/lib/analysis'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { createGame } from '@/lib/models'
import { buildEmbeddingText, getEmbedding } from '@/lib/embeddings'
import { runBatchAnalysis } from '@/lib/batchAnalysis'

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
    const stockfishPath = (formData.get('stockfishPath') as string) || './stockfish'
    const username = (formData.get('username') as string) || ''

    if (!pgn) {
      return NextResponse.json({ error: 'PGN text is required' }, { status: 400 })
    }

    const results = await analyzePgn(pgn, stockfishPath, username)

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
    for (const entry of results) {
      let embedding: number[] | null = null
      try {
        const embeddingText = buildEmbeddingText(entry.game)
        embedding = await getEmbedding(embeddingText)
      } catch (e) {
        console.warn('Embedding generation failed:', e)
      }
      await createGame({
        ...entry.game,
        moves: entry.moves,
        embedding,
      })
      count++
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
