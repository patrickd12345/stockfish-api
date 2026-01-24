import { NextResponse } from 'next/server'
import { getOpeningStats } from '@/lib/models'
import { getRecentBlunders } from '@/lib/blunderStorage'
import { callLlm } from '@/lib/llmHelper'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
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

    const systemPrompt =
      'You are a chess coach. Write a short Coach Report with three labeled sections: Strength, Weakness, Fix. Keep it factual and concise.'

    const userPrompt = `Use this data to generate the report:\n${JSON.stringify(payload, null, 2)}`
    const result = await callLlm(userPrompt, systemPrompt, { temperature: 0.3 }, 'Coach report unavailable.')

    const report = result.content.trim()

    return NextResponse.json({ report, data: payload })
  } catch (error: any) {
    console.error('Coach repertoire analysis failed:', error)
    return NextResponse.json(
      { error: error.message || 'Coach analysis failed' },
      { status: 500 }
    )
  }
}
