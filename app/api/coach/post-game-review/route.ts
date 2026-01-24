import { NextRequest, NextResponse } from 'next/server'
import { normalizeAgentTone } from '@/lib/agentTone'
import { callLlm } from '@/lib/llmHelper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fallbackReview(input: {
  status?: string | null
  winner?: string | null
  myColor?: 'white' | 'black' | null
  evalLabel?: string | null
  bestMove?: string | null
}): string {
  const resultBits: string[] = []
  if (input.winner) resultBits.push(`Winner: ${input.winner}.`)
  if (input.status) resultBits.push(`End: ${input.status}.`)
  const evalBit = input.evalLabel ? `Final eval: ${input.evalLabel}.` : ''
  const bestBit = input.bestMove ? `Idea to remember: ${input.bestMove}.` : ''
  const pov = input.myColor ? `You were ${input.myColor}.` : ''
  return [pov, ...resultBits, evalBit, bestBit].filter(Boolean).join(' ').trim() || 'Game over.'
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))

  const fen = typeof body.fen === 'string' ? body.fen : ''
  const moves = typeof body.moves === 'string' ? body.moves : ''
  const myColor = body.myColor === 'white' || body.myColor === 'black' ? (body.myColor as 'white' | 'black') : null
  const tone = normalizeAgentTone(body.tone)
  const status = typeof body.status === 'string' ? body.status : null
  const winner = body.winner === 'white' || body.winner === 'black' ? (body.winner as 'white' | 'black') : null
  const evaluation = typeof body.evaluation === 'number' ? body.evaluation : null
  const mate = typeof body.mate === 'number' ? body.mate : null
  const depth = typeof body.depth === 'number' ? body.depth : null
  const bestLine = typeof body.bestLine === 'string' ? body.bestLine : null
  const bestMove = typeof body.bestMove === 'string' ? body.bestMove : null
  const evalLabel = typeof body.evalLabel === 'string' ? body.evalLabel : null
  const opponentName = typeof body.opponentName === 'string' ? body.opponentName : null

  const systemPrompt =
    'You are an onboard chess coach. Write a concise post-game review.\n' +
    `- The player you are coaching played as: ${myColor ?? 'unknown'}.\n` +
    `- Your tone must be: ${tone}.\n` +
    '- Tone rules:\n' +
    '  - neutral: direct, calm, analytical.\n' +
    '  - empathic: supportive, encouraging, never patronizing.\n' +
    '  - jockey: playful hype + light banter (never rude).\n' +
    '  - sarcastic: dry witty humor (never mean-spirited).\n' +
    '- You will receive the full move sequence. If you recognize the opening (e.g., "Ruy Lopez", "Sicilian Defense", "Queen\'s Gambit"), mention it in your review when relevant.\n' +
    '- Stockfish evaluation is from White POV (positive = White better).\n' +
    '- Keep it short and actionable.\n' +
    '- Format:\n' +
    '  1) Result (1 line)\n' +
    '  2) 2–4 bullet points: biggest turning point(s), key mistake(s), key lesson(s)\n' +
    '  3) One concrete next-step drill or focus\n' +
    '- Do NOT invent moves or lines that are not supported.\n'

  const userPrompt = JSON.stringify(
    {
      fen,
      moves,
      status,
      winner,
      opponentName,
      stockfish: { evaluation, mate, depth, bestMove, bestLine, evalLabel }
    },
    null,
    2
  )

  const fallback = fallbackReview({ status, winner, myColor, evalLabel, bestMove })
  const result = await callLlm(userPrompt, systemPrompt, { temperature: 0.35 }, fallback)

  return NextResponse.json({
    review: result.content,
    source: result.source === 'ollama' || result.source === 'gateway' ? 'llm' : 'fallback'
  })
}

