import { NextRequest, NextResponse } from 'next/server'
import { normalizeAgentTone } from '@/lib/agentTone'
import { callLlm } from '@/lib/llmHelper'
import { PATTERN_TAXONOMY_V1 } from '@/lib/blunderDna'
import { uciToSan } from '@/lib/chessNotation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function formatEval(evalCp: number): string {
  const pawns = Math.abs(evalCp) / 100
  const sign = evalCp >= 0 ? '+' : '-'
  return `${sign}${pawns.toFixed(1)}`
}

function fallbackCommentary(input: {
  userMove: string
  bestMove: string
  ok: boolean
  patternTag: string
  evalBefore: number
  evalAfter: number
}): string {
  const patternLabel = PATTERN_TAXONOMY_V1[input.patternTag as keyof typeof PATTERN_TAXONOMY_V1]?.label || input.patternTag
  const evalBeforeLabel = formatEval(input.evalBefore)
  const evalAfterLabel = formatEval(input.evalAfter)
  
  if (input.ok) {
    return `Correct! ${input.bestMove} is the best move. This ${patternLabel.toLowerCase()} pattern shows evaluation improving from ${evalBeforeLabel} to ${evalAfterLabel}.`
  } else {
    return `Not quite. The best move is ${input.bestMove}, which improves the position from ${evalBeforeLabel} to ${evalAfterLabel}. This is a ${patternLabel.toLowerCase()} pattern - look for ${input.patternTag === 'hanging_piece' ? 'undefended pieces' : input.patternTag === 'missed_threat' ? 'opponent threats' : 'tactical opportunities'}.`
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  
  const drillId = typeof body.drillId === 'string' ? body.drillId : null
  const fen = typeof body.fen === 'string' ? body.fen : ''
  const sideToMove = body.sideToMove === 'white' || body.sideToMove === 'black' ? (body.sideToMove as 'white' | 'black') : null
  const userMove = typeof body.userMove === 'string' ? body.userMove : ''
  const bestMove = typeof body.bestMove === 'string' ? body.bestMove : ''
  const pv = typeof body.pv === 'string' ? body.pv : ''
  const evalBefore = typeof body.evalBefore === 'number' ? body.evalBefore : 0
  const evalAfter = typeof body.evalAfter === 'number' ? body.evalAfter : 0
  const patternTag = typeof body.patternTag === 'string' ? body.patternTag : ''
  const myMove = typeof body.myMove === 'string' ? body.myMove : ''
  const ok = typeof body.ok === 'boolean' ? body.ok : false
  const tone = normalizeAgentTone(body.tone)
  
  if (!drillId || !fen || !sideToMove || !userMove || !bestMove) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  
  const patternLabel = PATTERN_TAXONOMY_V1[patternTag as keyof typeof PATTERN_TAXONOMY_V1]?.label || patternTag
  const patternDescription = PATTERN_TAXONOMY_V1[patternTag as keyof typeof PATTERN_TAXONOMY_V1]?.description || ''
  const evalBeforeLabel = formatEval(evalBefore)
  const evalAfterLabel = formatEval(evalAfter)
  
  // Convert UCI moves to algebraic notation for display
  const userMoveSan = uciToSan(userMove, fen)
  const bestMoveSan = uciToSan(bestMove, fen)
  
  const systemPrompt =
    'You are a chess coach reviewing a drill attempt. The user tried to find the best move in a position.\n' +
    `- The player to move is: ${sideToMove}.\n` +
    `- Your tone must be: ${tone}.\n` +
    '- Tone rules:\n' +
    '  - neutral: direct, calm, analytical.\n' +
    '  - empathic: supportive, encouraging, never patronizing.\n' +
    '  - jockey: playful hype + light banter (never rude).\n' +
    '  - sarcastic: dry witty humor (never mean-spirited).\n' +
    `- The user attempted move: ${userMoveSan}.\n` +
    `- This was ${ok ? 'CORRECT' : 'INCORRECT'}.\n` +
    `- The best move is: ${bestMoveSan}.\n` +
    `- Pattern type: ${patternLabel} (${patternDescription}).\n` +
    '- Stockfish evaluation is in centipawns from White POV (positive = White better).\n' +
    '- Your task:\n' +
    `  ${ok ? '1. Explain WHY this move is correct and what it accomplishes.' : '1. Explain WHY the attempted move is incorrect or suboptimal.'}\n` +
    `  ${ok ? '2. Highlight what makes this the best move in this position.' : '2. Explain what the best move does and why it is better.'}\n` +
    '  3. Reference the pattern type and what to look for in similar positions.\n' +
    '  4. Mention the evaluation change if significant.\n' +
    '  5. Provide a brief tactical or positional insight.\n' +
    '- Keep it concise: 2-4 sentences.\n' +
    '- Do NOT dump engine lines verbatim; interpret them in plain language.\n' +
    '- Focus on learning: help the user understand the position better.\n' +
    '- Always use algebraic notation (e.g., "c5", "Nf3", "O-O") when referring to moves, never UCI notation.\n'
  
  const userPrompt = JSON.stringify(
    {
      position: {
        fen,
        sideToMove,
      },
      attempt: {
        userMove: userMoveSan,
        bestMove: bestMoveSan,
        correct: ok,
      },
      evaluation: {
        before: evalBefore,
        after: evalAfter,
        beforeLabel: evalBeforeLabel,
        afterLabel: evalAfterLabel,
      },
      pattern: {
        tag: patternTag,
        label: patternLabel,
        description: patternDescription,
      },
      continuation: {
        principalVariation: pv,
        originalMove: myMove,
      },
    },
    null,
    2
  )
  
  const fallback = fallbackCommentary({ userMove: userMoveSan, bestMove: bestMoveSan, ok, patternTag, evalBefore, evalAfter })
  const result = await callLlm(userPrompt, systemPrompt, { temperature: 0.35 }, fallback)
  
  return NextResponse.json({
    commentary: result.content,
    source: result.source === 'ollama' || result.source === 'gateway' ? 'llm' : 'fallback'
  })
}
