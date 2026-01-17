import OpenAI from 'openai'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { embedQuery } from '@/lib/embeddings'
import { getGameSummaries, searchGamesByEmbedding } from '@/lib/models'

const BOARD_SVG_MARKER = 'BOARD_SVG::'

export const SYSTEM_PROMPT = `You are a chess coach. You can help users analyze their games, answer chess questions, and provide coaching advice.
If the user asks to see a board position, you can describe it, but board rendering is handled separately.
You have access to game data in a database. When asked about games, provide helpful analysis and insights.`

export async function buildAgent(conn: any) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  return {
    async invoke({ input }: { input: string }) {
      // Get context from database
      let context = ''
      try {
        if (isDbConfigured()) {
          await connectToDb()
          const games = await getGameSummaries(10)
          if (games.length > 0) {
            context = `\n\nRecent games in database:\n${JSON.stringify(games, null, 2)}`
          }

          const queryEmbedding = await embedQuery(input)
          if (queryEmbedding) {
            const relevantGames = await searchGamesByEmbedding(queryEmbedding, 5)
            if (relevantGames.length > 0) {
              context += `\n\nRelevant games from semantic search:\n${JSON.stringify(relevantGames, null, 2)}`
            }
          }
        }
      } catch (e) {
        console.log('Database query failed:', e)
      }

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + context },
          { role: 'user', content: input },
        ],
        temperature: 0,
      })

      const content = response.choices[0]?.message?.content || 'No response'
      
      return {
        output: content,
        intermediate_steps: [],
      }
    },
  }
}
