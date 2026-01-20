import { NextRequest, NextResponse } from 'next/server'
import { getOpenAIConfig, getOpenAIClient } from '@/lib/openaiClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fallbackCommentary(input: {
  lastMove?: string | null
  evalLabel?: string | null
  bestMove?: string | null
}): string {
  const parts: string[] = []
  if (input.lastMove) parts.push(`After ${input.lastMove},`)
  if (input.evalLabel) parts.push(`eval is ${input.evalLabel}.`)
  if (input.bestMove) parts.push(`Best move idea: ${input.bestMove}.`)
  return parts.join(' ').trim() || 'Waiting for the next move…'
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))

  const fen = typeof body.fen === 'string' ? body.fen : ''
  const moves = typeof body.moves === 'string' ? body.moves : ''
  const myColor = body.myColor === 'white' || body.myColor === 'black' ? (body.myColor as 'white' | 'black') : null
  const lastMove = typeof body.lastMove === 'string' ? body.lastMove : null
  const evaluation = typeof body.evaluation === 'number' ? body.evaluation : null
  const mate = typeof body.mate === 'number' ? body.mate : null
  const depth = typeof body.depth === 'number' ? body.depth : null
  const bestLine = typeof body.bestLine === 'string' ? body.bestLine : null
  const bestMove = typeof body.bestMove === 'string' ? body.bestMove : null
  const evalLabel = typeof body.evalLabel === 'string' ? body.evalLabel : null

  // Always return usable output, even if no LLM configured.
  if (!getOpenAIConfig()) {
    return NextResponse.json({
      commentary: fallbackCommentary({ lastMove, evalLabel, bestMove }),
      source: 'fallback'
    })
  }

  try {
    const openai = getOpenAIClient()
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.35,
      messages: [
        {
          role: 'system',
          content:
            'You are an onboard chess coach. Write helpful, human-friendly live feedback.\n' +
            `- The player you are coaching is playing as: ${myColor ?? 'unknown'}.\n` +
            '- Use that POV: when you say "you", you mean that player; recommend moves for that side.\n' +
            '- Stockfish evaluation is in centipawns from White POV (positive = White better).\n' +
            '- Use ALL preceding moves and the current Stockfish output.\n' +
            '- Keep it concise: 1–3 short sentences.\n' +
            '- Focus on plans/tactics and the most important mistake or opportunity.\n' +
            '- Do NOT dump engine lines verbatim; interpret them.\n' +
            "- If uncertain, say what to look for next rather than hallucinating.\n"
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              fen,
              moves,
              myColor,
              lastMove,
              stockfish: { evaluation, mate, depth, bestMove, bestLine, evalLabel }
            },
            null,
            2
          )
        }
      ]
    })

    const commentary = completion.choices[0]?.message?.content?.trim()
    if (!commentary) {
      return NextResponse.json({
        commentary: fallbackCommentary({ lastMove, evalLabel, bestMove }),
        source: 'fallback'
      })
    }

    return NextResponse.json({ commentary, source: 'llm' })
  } catch (error: any) {
    console.error('[Live Commentary] LLM failed:', error)
    return NextResponse.json({
      commentary: fallbackCommentary({ lastMove, evalLabel, bestMove }),
      source: 'fallback'
    })
  }
}

