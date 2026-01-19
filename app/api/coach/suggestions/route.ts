import { NextRequest, NextResponse } from 'next/server'
import { getOpenAIClient } from '@/lib/openaiClient'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { getGames } from '@/lib/models'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { page, gameState, lastMessage } = await request.json().catch(() => ({}))
    const openai = getOpenAIClient()
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

    // Fetch last 5 games for context
    let recentGamesContext = ''
    if (isDbConfigured()) {
      try {
        await connectToDb()
        const games = await getGames(5)
        if (games.length > 0) {
          const gameSummaries = games.map((game) => ({
            date: game.date,
            opening: game.opening_name,
            result: game.result,
            accuracy: game.my_accuracy,
            blunders: game.blunders,
            white: game.white,
            black: game.black,
          }))
          recentGamesContext = `\n\nRecent games context (last 5 games):\n${JSON.stringify(gameSummaries, null, 2)}`
        }
      } catch (dbError) {
        console.warn('Failed to fetch recent games for suggestions:', dbError)
        // Continue without game context if DB fetch fails
      }
    }

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You generate concise, curious questions a chess student should ask based on their recent games. ' +
            'If recent games are provided, base suggestions on patterns you notice (openings, results, accuracy, blunders). ' +
            'If no games are provided or patterns are unclear, generate general chess learning questions. ' +
            'Return ONLY a JSON array of 3 short strings.',
        },
        {
          role: 'user',
          content: JSON.stringify({ page, gameState, lastMessage }) + recentGamesContext,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim() || '[]'
    let suggestions: string[] = []
    
    // Strip markdown code blocks if present
    let cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    
    try {
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        suggestions = parsed.map((item) => String(item)).filter(Boolean).slice(0, 3)
      }
    } catch {
      // Fallback: extract suggestions from lines, filtering out JSON syntax
      const jsonSyntaxPattern = /^[\[\]{}",\s]*$|^```|^json$/i
      suggestions = cleaned
        .split('\n')
        .map((line) => line.replace(/^[\-\d\.\s]+/, '').trim())
        .filter((line) => {
          const trimmed = line.trim()
          return trimmed && 
                 !jsonSyntaxPattern.test(trimmed) && 
                 !trimmed.match(/^[\[\],"]+$/) &&
                 trimmed.length > 3 // Filter out very short fragments
        })
        .slice(0, 3)
    }
    
    // Final filter to remove any remaining JSON syntax artifacts
    suggestions = suggestions.filter((s) => {
      const trimmed = s.trim()
      return trimmed && 
             !trimmed.match(/^[\[\]{}",\s]+$/) &&
             !trimmed.match(/^```/) &&
             trimmed.length > 3
    })

    return NextResponse.json({ suggestions })
  } catch (error: any) {
    console.error('Coach suggestions failed:', error)
    return NextResponse.json(
      { error: error.message || 'Suggestions failed' },
      { status: 500 }
    )
  }
}
