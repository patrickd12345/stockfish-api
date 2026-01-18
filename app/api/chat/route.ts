import { NextRequest, NextResponse } from 'next/server'
import { buildAgent } from '@/lib/agent'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { message, gameId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const agent = await buildAgent(null)
    const response = await agent.invoke({ input: message, gameId })

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
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to get response from coach'
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection error. Please check your network connection and try again.'
    } else if (error.message) {
      errorMessage = error.message
    }
    
    return NextResponse.json(
      { 
        error: errorMessage
      },
      { status: 500 }
    )
  }
}

function extractBoardSvg(content: string): string | undefined {
  const match = content.match(/BOARD_SVG::([\s\S]*?<\/svg>)/)
  return match ? match[1] : undefined
}
