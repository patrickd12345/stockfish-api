import { NextResponse } from 'next/server'
import { getOpenAIClient } from '@/lib/openaiClient'
import { getOpeningStats } from '@/lib/models'
import { getRecentBlunders } from '@/lib/blunderStorage'

export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Check for BYOK header
    const byokKey = request.headers.get('x-openai-key')

    const openai = getOpenAIClient(byokKey)
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

    const openings = await getOpeningStats(50)
    const eligible = openings.filter((o) => o.games >= 3)
    const sortedByWin = [...eligible].sort(
      (a, b) => b.wins / Math.max(1, b.games) - a.wins / Math.max(1, a.games)
    )
    const bestOpening = sortedByWin[0] ?? null
    const worstOpening = sortedByWin[sortedByWin.length - 1] ?? null

    const blunders = await getRecentBlunders(3)

    const payload = {
      bestOpening,
      worstOpening,
      blunders,
    }

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You are a chess coach. Write a short Coach Report with three labeled sections: Strength, Weakness, Fix. Keep it factual and concise.',
        },
        {
          role: 'user',
          content: `Use this data to generate the report:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    })

    const report = completion.choices[0]?.message?.content?.trim() || ''

    return NextResponse.json({ report, data: payload })
  } catch (error: any) {
    console.error('Coach repertoire analysis failed:', error)
    return NextResponse.json(
      { error: error.message || 'Coach analysis failed' },
      { status: 500 }
    )
  }
}
