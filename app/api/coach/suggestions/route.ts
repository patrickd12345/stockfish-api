import { NextRequest, NextResponse } from 'next/server'
import { getOpenAIClient } from '@/lib/openaiClient'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { page, gameState, lastMessage } = await request.json().catch(() => ({}))
    const openai = getOpenAIClient()
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You generate concise, curious questions a chess student should ask. Return ONLY a JSON array of 3 short strings.',
        },
        {
          role: 'user',
          content: JSON.stringify({ page, gameState, lastMessage }),
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim() || '[]'
    let suggestions: string[] = []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        suggestions = parsed.map((item) => String(item)).filter(Boolean).slice(0, 3)
      }
    } catch {
      suggestions = raw
        .split('\n')
        .map((line) => line.replace(/^[\-\d\.\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 3)
    }

    return NextResponse.json({ suggestions })
  } catch (error: any) {
    console.error('Coach suggestions failed:', error)
    return NextResponse.json(
      { error: error.message || 'Suggestions failed' },
      { status: 500 }
    )
  }
}
