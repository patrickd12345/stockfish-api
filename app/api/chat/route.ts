import { NextRequest, NextResponse } from 'next/server'
import { buildAgent } from '@/lib/agent'

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const agent = await buildAgent(null)
    const response = await agent.invoke({ input: message })

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
    return NextResponse.json(
      { error: error.message || 'Failed to get response from coach' },
      { status: 500 }
    )
  }
}

function extractBoardSvg(content: string): string | undefined {
  const match = content.match(/BOARD_SVG::([\s\S]*?<\/svg>)/)
  return match ? match[1] : undefined
}
