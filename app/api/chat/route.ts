import { NextRequest, NextResponse } from 'next/server'
import { buildAgent } from '@/lib/agent'
import { resolveTimeWindowFromMessage } from '@/lib/timeWindowResolver'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { message, gameId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Resolve time window from full message. This is:
    // - Rule-based for common expressions
    // - LLM-assisted for fuzzy phrases ("around christmas")
    const resolution = await resolveTimeWindowFromMessage(message)
    const timeWindowStr = resolution ? `${resolution.window.start} to ${resolution.window.end}` : null

    const agent = await buildAgent(null)
    const response = await agent.invoke({ 
      input: message, 
      gameId,
      timeWindow: timeWindowStr
    })

    // Extract board SVG if present
    const content = typeof response === 'string' 
      ? response 
      : (response.output || JSON.stringify(response))
    const boardSvg = extractBoardSvg(content)
    const textContent = content.replace(/BOARD_SVG::[\s\S]*?<\/svg>/g, '').trim()

    return NextResponse.json({
      content: textContent,
      boardSvg,
    })
  } catch (error: any) {
    console.error('Error in chat:', error)
    console.error('Error stack:', error.stack)
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to get response from coach'
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection error. Please check your network connection and try again.'
    } else if (error.message) {
      // Don't expose internal error details to the client
      errorMessage = error.message.includes('Unexpected token') 
        ? 'Invalid response format. Please try again.'
        : error.message
    }
    
    // Always return valid JSON, even on error
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

function extractBoardSvg(content: string): string | undefined {
  const match = content.match(/BOARD_SVG::([\s\S]*?<\/svg>)/)
  return match ? match[1] : undefined
}
