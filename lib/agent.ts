import OpenAI from 'openai'
import { connectToDb } from '@/lib/database'
import { getGameSummaries, getGamePgn, searchGamesByEmbedding } from '@/lib/models'
import { getEmbedding } from '@/lib/embeddings'
import { loadProgressionSummary } from '@/lib/progressionStorage'
import { loadEngineSummary } from '@/lib/engineSummaryStorage'
import { parseTimeExpression, formatTimeWindowForPrompt, filterGamesInWindow } from '@/lib/timeWindows'
import { formatProgressionSummaryForPrompt, formatEngineSummaryForPrompt } from '@/lib/promptFormatters'

const BOARD_SVG_MARKER = 'BOARD_SVG::'

export const SYSTEM_PROMPT = `You are a chess coach. You can help users analyze their games, answer chess questions, and provide coaching advice.
If the user asks to see a board position, you can describe it, but board rendering is handled separately.
You have access to game data in a database. When asked about games, provide helpful analysis and insights.

IMPORTANT: If a "PLAYER CAREER SUMMARY (AUTHORITATIVE)" section appears below, it contains precomputed statistics from batch analysis of ALL games.
You MUST use those exact numbers when answering questions about total games, progression, or career-wide statistics.
You MUST NOT say "I do not have access" if that section is present.

IMPORTANT: If an "ENGINE ANALYSIS SUMMARY (AUTHORITATIVE)" section appears below, it contains precomputed engine-derived metrics from Stockfish analysis.
You MUST use those exact numbers when answering questions about centipawn loss, blunders, mistakes, inaccuracies, or engine trends.
You MUST NOT say "I don't have engine data" or "I do not have access" if that section is present.
If coveragePercent is 0, explicitly state that engine analysis data is unavailable.`

export async function buildAgent(conn: any) {
  const gatewayId = process.env.VERCEL_AI_GATEWAY_ID?.trim()
  const apiKey = process.env.VERCEL_VIRTUAL_KEY?.replace(/[\n\r]/g, '').trim()

  if (!gatewayId || !apiKey) {
    throw new Error('VERCEL_AI_GATEWAY_ID and VERCEL_VIRTUAL_KEY must be set')
  }

  const baseURL = 'https://ai-gateway.vercel.sh/v1'

  console.log('Building agent with:', {
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey.length,
    hasGatewayId: !!gatewayId,
    baseURL,
    model: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
  })

  const openai = new OpenAI({
    apiKey,
    baseURL,
  })

  return {
    async invoke({ input, gameId, timeWindow }: { 
      input: string; 
      gameId?: string | null;
      timeWindow?: string | null;
    }) {
      // CRITICAL: Load precomputed summaries UNCONDITIONALLY
      // This MUST happen on EVERY request, regardless of query type or user intent
      let progressionSummary = null
      let engineSummary = null
      let context = ''
      
      try {
        await connectToDb()
        
        // ALWAYS load stored summaries (unconditional)
        progressionSummary = await loadProgressionSummary()
        engineSummary = await loadEngineSummary()
        
        // Build context based on summary existence
        // Start with progression summary
        if (progressionSummary && progressionSummary.totalGames > 0) {
          // Summary exists with data - inject authoritative summary
          context = `\n\n${formatProgressionSummaryForPrompt(progressionSummary)}`
          
          // Defensive assertion: log if summary exists but context is empty
          if (!context || context.trim().length === 0) {
            console.error('❌ CRITICAL: ProgressionSummary exists but context is empty!')
            throw new Error('Failed to format progression summary for prompt')
          }
        } else {
          // No summary or empty summary - explicit "no data" path
          context = `\n\n=== PLAYER CAREER SUMMARY ===
No progression analysis has been computed yet.
The agent must not claim awareness of overall progression.
If asked about total games, progression, or trends, the agent must explicitly state that no batch analysis has been run.
To generate progression analysis, run: npm run rebuild:progression
================================`
        }
        
        // Append engine summary if it exists
        if (engineSummary) {
          if (engineSummary.coveragePercent > 0) {
            // Engine summary exists with data - inject authoritative summary
            const engineContext = `\n\n${formatEngineSummaryForPrompt(engineSummary)}`
            context += engineContext
            
            // Defensive assertion: log if summary exists but context is empty
            if (!engineContext || engineContext.trim().length === 0) {
              console.error('❌ CRITICAL: EngineSummary exists but context is empty!')
              throw new Error('Failed to format engine summary for prompt')
            }
          } else {
            // Engine summary exists but has no coverage - explicit "no data" path
            context += `\n\n=== ENGINE ANALYSIS SUMMARY ===
Engine summary exists but coverage is 0%.
No games have been analyzed with the engine yet.
The agent must explicitly state that engine analysis data is unavailable.
To generate engine analysis, run: npm run engine:analyze
Then rebuild summary: npm run rebuild:engine-summary
================================`
          }
        } else {
          // No engine summary - explicit "no data" path
          context += `\n\n=== ENGINE ANALYSIS SUMMARY ===
No engine analysis summary has been computed yet.
The agent must explicitly state that engine analysis data is unavailable.
To generate engine analysis, run: npm run engine:analyze
Then rebuild summary: npm run rebuild:engine-summary
================================`
        }

        // Handle time window requests
        if (timeWindow && progressionSummary) {
          const window = parseTimeExpression(timeWindow)
          if (window) {
            // Get games in the time window (for counting only, not full analysis)
            const recentGames = await getGameSummaries(1000) // Get more games to filter
            // Convert the game summaries to the expected format for filtering
            const gamesForFiltering = recentGames.map(game => ({
              date: game.date,
              created_at: game.createdAt
            }))
            const gamesInWindow = filterGamesInWindow(gamesForFiltering, window)
            window.gameCount = gamesInWindow.length
            
            context += `\n\n${formatTimeWindowForPrompt(window)}`
            
            if (gamesInWindow.length > 0) {
              // Show summary of games in window (not full analysis)
              const windowSummary = gamesInWindow.slice(0, 5) // Just top 5 for context
              context += `\nRecent games in this window:\n${JSON.stringify(windowSummary, null, 2)}`
            }
          }
        }

        // Add recent games for additional context (but not for progression analysis)
        if (!timeWindow) {
          const recentGames = await getGameSummaries(5) // Fewer games since we have progression summary
          if (recentGames.length > 0) {
            context += `\n\nRecent games:\n${JSON.stringify(recentGames, null, 2)}`
          }
        }

        if (input) {
          try {
            const embedding = await getEmbedding(input)
            if (embedding && embedding.length > 0) {
              const games = await searchGamesByEmbedding(embedding, 5)
              if (games.length > 0) {
                const simplified = games.map(game => ({
                  id: game.id,
                  date: game.date,
                  white: game.white,
                  black: game.black,
                  result: game.result,
                  opening_name: game.opening_name,
                  my_accuracy: game.my_accuracy,
                  blunders: game.blunders,
                  pgn_excerpt: truncate(game.pgn_text, 2000),
                }))
                context += `\n\nMost relevant games from the database:\n${JSON.stringify(simplified, null, 2)}`
              }
            }
          } catch (embedError) {
            console.log('Embedding search failed, falling back to recent games:', embedError)
          }
        }

        if (gameId) {
          const pgn = await getGamePgn(gameId)
          if (pgn) {
            context += `\n\nSelected game for analysis (PGN):\n${pgn}`
          }
        }
      } catch (e) {
        console.error('❌ Database query failed during context assembly:', e)
        // If we have summaries but failed to build context, this is critical
        if (progressionSummary && progressionSummary.totalGames > 0) {
          console.error('❌ CRITICAL: ProgressionSummary exists but context assembly failed!')
          // Still try to inject basic summary even on error
          try {
            context = `\n\n=== PLAYER CAREER SUMMARY (AUTHORITATIVE) ===
Total games analyzed: ${progressionSummary.totalGames}
Period: ${progressionSummary.period.start} → ${progressionSummary.period.end}
Overall win rate: ${(progressionSummary.overall.winRate * 100).toFixed(1)}%
=============================================`
          } catch (fallbackError) {
            console.error('❌ Even fallback context assembly failed:', fallbackError)
          }
        } else {
          // No summary, use explicit no-data message
          context = `\n\n=== PLAYER CAREER SUMMARY ===
No progression analysis has been computed yet.
The agent must not claim awareness of overall progression.
================================`
        }
        
        // Add engine summary fallback if it exists
        if (engineSummary && engineSummary.coveragePercent > 0) {
          try {
            context += `\n\n=== ENGINE ANALYSIS SUMMARY (AUTHORITATIVE) ===
Coverage: ${engineSummary.coveragePercent.toFixed(1)}%
Games analyzed: ${engineSummary.gamesWithEngineAnalysis.toLocaleString()}
Average CPL: ${engineSummary.overall.avgCentipawnLoss?.toFixed(1) || 'N/A'}
Blunder rate: ${engineSummary.overall.blunderRate.toFixed(2)} per game
=============================================`
          } catch (fallbackError) {
            console.error('❌ Engine summary fallback failed:', fallbackError)
          }
        } else {
          context += `\n\n=== ENGINE ANALYSIS SUMMARY ===
No engine analysis summary available.
The agent must explicitly state that engine analysis data is unavailable.
================================`
        }
      }
      
      // Defensive check: ensure context was built
      if (!context || context.trim().length === 0) {
        console.error('❌ CRITICAL: Context is empty after assembly!')
        context = `\n\n=== PLAYER CAREER SUMMARY ===
No progression analysis has been computed yet.
The agent must not claim awareness of overall progression.
================================`
      }

      // CRITICAL: Build final system message with progression summary
      // There MUST be exactly ONE system message, and it MUST include progression data
      const finalSystemContent = SYSTEM_PROMPT + context
      
      // HARD DEBUG PROOF: Log final system prompt to verify summaries are present
      if (progressionSummary && progressionSummary.totalGames > 0) {
        const hasProgressionData = finalSystemContent.includes('PLAYER CAREER SUMMARY') && 
                                   finalSystemContent.includes(`Total games analyzed: ${progressionSummary.totalGames.toLocaleString()}`)
        
        if (!hasProgressionData) {
          console.error('❌ CRITICAL: ProgressionSummary exists but NOT in final system prompt!')
          console.error('Summary totalGames:', progressionSummary.totalGames)
          console.error('Expected formatted:', `Total games analyzed: ${progressionSummary.totalGames.toLocaleString()}`)
          console.error('Context length:', context.length)
          console.error('Context preview:', context.substring(0, 200))
          throw new Error('ProgressionSummary not present in final system prompt - wiring failure!')
        }
        
        // Debug log to prove progression summary is in prompt
        console.log('✅ DEBUG: ProgressionSummary confirmed in system prompt')
        console.log(`   Total games: ${progressionSummary.totalGames}`)
        console.log(`   Period: ${progressionSummary.period.start} → ${progressionSummary.period.end}`)
      } else {
        console.log('⚠️  DEBUG: No ProgressionSummary available (totalGames:', progressionSummary?.totalGames || 0, ')')
      }
      
      // HARD DEBUG PROOF: Verify engine summary is present
      if (engineSummary && engineSummary.coveragePercent > 0) {
        const hasEngineData = finalSystemContent.includes('ENGINE ANALYSIS SUMMARY') && 
                              finalSystemContent.includes(`CoveragePercent: ${engineSummary.coveragePercent.toFixed(1)}%`)
        
        if (!hasEngineData) {
          console.error('❌ CRITICAL: EngineSummary exists but NOT in final system prompt!')
          console.error('Summary coveragePercent:', engineSummary.coveragePercent)
          console.error('Summary gamesWithEngineAnalysis:', engineSummary.gamesWithEngineAnalysis)
          console.error('Expected formatted:', `CoveragePercent: ${engineSummary.coveragePercent.toFixed(1)}%`)
          throw new Error('EngineSummary not present in final system prompt - wiring failure!')
        }
        
        // Debug log to prove engine summary is in prompt
        console.log('✅ DEBUG: EngineSummary confirmed in system prompt')
        console.log(`   Coverage: ${engineSummary.coveragePercent.toFixed(1)}%`)
        console.log(`   Games with analysis: ${engineSummary.gamesWithEngineAnalysis.toLocaleString()}`)
        console.log(`   Contains "DEBUG: ENGINE SUMMARY PRESENT": ${finalSystemContent.includes('DEBUG: ENGINE SUMMARY PRESENT')}`)
      } else {
        console.log('⚠️  DEBUG: No EngineSummary available (coveragePercent:', engineSummary?.coveragePercent || 0, '%)')
      }
      
      // Log system prompt length
      console.log(`   System prompt length: ${finalSystemContent.length} chars`)
      console.log(`   Contains "Total games analyzed": ${finalSystemContent.includes('Total games analyzed')}`)
      console.log(`   Contains "ENGINE ANALYSIS SUMMARY": ${finalSystemContent.includes('ENGINE ANALYSIS SUMMARY')}`)
      
      // Retry logic for connection issues
      const maxRetries = 3
      let lastError: any = null
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // CRITICAL: Use finalSystemContent which MUST include progression summary
          const messages = [
            { role: 'system' as const, content: finalSystemContent },
            { role: 'user' as const, content: input },
          ]
          
          // Final verification: ensure summaries are in the messages array
          const systemMsg = messages.find(m => m.role === 'system')
          
          if (progressionSummary && progressionSummary.totalGames > 0) {
            if (!systemMsg || !systemMsg.content.includes(`Total games analyzed: ${progressionSummary.totalGames.toLocaleString()}`)) {
              console.error('❌ CRITICAL: ProgressionSummary missing from messages array!')
              console.error('System message exists:', !!systemMsg)
              console.error('System message length:', systemMsg?.content.length || 0)
              console.error('Expected formatted:', `Total games analyzed: ${progressionSummary.totalGames.toLocaleString()}`)
              throw new Error('ProgressionSummary not in messages array - critical wiring failure!')
            }
          }
          
          if (engineSummary && engineSummary.coveragePercent > 0) {
            if (!systemMsg || !systemMsg.content.includes(`CoveragePercent: ${engineSummary.coveragePercent.toFixed(1)}%`)) {
              console.error('❌ CRITICAL: EngineSummary missing from messages array!')
              console.error('System message exists:', !!systemMsg)
              console.error('System message length:', systemMsg?.content.length || 0)
              console.error('Expected formatted:', `CoveragePercent: ${engineSummary.coveragePercent.toFixed(1)}%`)
              throw new Error('EngineSummary not in messages array - critical wiring failure!')
            }
          }
          
          const response = await openai.chat.completions.create(
            {
              model: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim(),
              messages,
              temperature: 0,
            },
            {
              timeout: 30000, // 30 second timeout
            }
          )

          const content = response.choices[0]?.message?.content || 'No response'
          
          return {
            output: content,
            intermediate_steps: [],
          }
        } catch (error: any) {
          lastError = error
          
          // Check if it's a connection error that might be retryable
          const isRetryable = 
            error.code === 'ECONNRESET' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNREFUSED' ||
            error.type === 'system' ||
            (error.message && error.message.includes('Connection error'))
          
          if (isRetryable && attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000) // Exponential backoff, max 5s
            console.log(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms due to:`, error.message || error.code)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
          
          // Not retryable or last attempt
          throw error
        }
      }
      
      // Should never reach here, but just in case
      throw lastError || new Error('Failed to get response after retries')
    },
  }
}

function truncate(value: string, maxLength: number): string {
  if (!value) return value
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}
