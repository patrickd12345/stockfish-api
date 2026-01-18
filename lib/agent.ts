import { getOpenAIClient, getOpenAIConfig } from '@/lib/openaiClient'
import { connectToDb } from '@/lib/database'
import { getGameSummaries, getGamePgn, searchGamesByEmbedding } from '@/lib/models'
import { getEmbedding } from '@/lib/embeddings'
import { loadProgressionSummary } from '@/lib/progressionStorage'
import { loadEngineSummary } from '@/lib/engineSummaryStorage'
import { parseTimeExpression, formatTimeWindowForPrompt, filterGamesInWindow } from '@/lib/timeWindows'
import { formatProgressionSummaryForPrompt, formatEngineSummaryForPrompt } from '@/lib/promptFormatters'

const DEBUG_ENGINE_MARKER = '=== DEBUG: ENGINE SUMMARY PRESENT ==='
const DEBUG_PROGRESSION_MARKER = '=== DEBUG: PROGRESSION SUMMARY PRESENT ==='
const FINAL_SYSTEM_PROMPT_MARKER = '=== DEBUG: FINAL SYSTEM PROMPT ==='
const CONTEXT_CHAR_LIMIT = Math.max(2000, Number(process.env.AGENT_CONTEXT_CHAR_LIMIT ?? 12000))
const RECENT_GAMES_CHAR_LIMIT = Math.max(1000, Number(process.env.AGENT_RECENT_GAMES_CHAR_LIMIT ?? 4000))
const RELEVANT_GAMES_CHAR_LIMIT = Math.max(1000, Number(process.env.AGENT_RELEVANT_GAMES_CHAR_LIMIT ?? 4000))

export const SYSTEM_PROMPT = `You are a chess coach. You can help users analyze their games, answer chess questions, and provide coaching advice.
If the user asks to see a board position, you can describe it, but board rendering is handled separately.
You have access to game data in a database. When asked about games, provide helpful analysis and insights.

IMPORTANT: If a "PLAYER CAREER SUMMARY (AUTHORITATIVE)" section appears below, it contains precomputed statistics from batch analysis of ALL games.
You MUST use those exact numbers when answering questions about total games, progression, or career-wide statistics.
You MUST NOT say "I do not have access" if that section is present.

IMPORTANT: If an "ENGINE ANALYSIS SUMMARY (AUTHORITATIVE)" section appears below, it contains precomputed engine-derived metrics from Stockfish analysis.
You MUST use those exact numbers when answering questions about centipawn loss, blunders, mistakes, inaccuracies, or engine trends.
You MUST NOT say "I don't have engine data" or "I do not have access" if that section is present.
If coveragePercent is 0, explicitly state that engine analysis data is unavailable.

When a time window is provided (e.g., "last week", "last 7 days"), you will receive:
- A TIME WINDOW section with the date range and game count
- A list of ALL games in that period with their results, dates, opponents, openings, accuracy, and blunders

CRITICAL: You MUST count and analyze ALL games in the list, not just a sample. The list contains every single game in the time period.

You should:
- Count ALL games in the list (the total number will be shown in the TIME WINDOW section)
- Calculate win/loss/draw statistics from ALL games
- Calculate win rate percentage from ALL games
- Sum total blunders from ALL games
- Identify trends, patterns, or notable games
- Provide insights based on ALL the data provided

If the user asks "how many games did I play", you MUST use the exact count from the TIME WINDOW section, not estimate or sample.

When answering a time-window question, you MUST restate the exact date range you used in your first sentence.
If the time window was based on a fuzzy phrase (e.g., "around christmas"), you MUST clearly state the assumption you made about what dates that refers to.

Do not ask for more data - work with what is provided. If the game count seems low, check if the date range is correct or if games might be missing from the database.`

export async function buildAgent(conn: any) {
  const cfg = getOpenAIConfig()
  if (!cfg) {
    throw new Error('Missing OpenAI credentials. Set (VERCEL_AI_GATEWAY_ID + VERCEL_VIRTUAL_KEY) or OPENAI_API_KEY.')
  }

  console.log('Building agent with:', {
    hasApiKey: !!cfg.apiKey,
    apiKeyLength: cfg.apiKey.length,
    baseURL: cfg.baseURL ?? '(direct)',
    model: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
  })

  const openai = getOpenAIClient()

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

        // Handle time window requests - provide data, let agent do the analysis
        if (timeWindow) {
          // timeWindow can be either:
          // 1. A time expression like "last week" -> parse it
          // 2. A date range string like "2026-01-11 to 2026-01-18" -> extract dates
          let window = parseTimeExpression(timeWindow)
          
          if (!window && timeWindow.includes(' to ')) {
            // Parse date range string format: "YYYY-MM-DD to YYYY-MM-DD"
            const parts = timeWindow.split(' to ')
            if (parts.length === 2) {
              const start = parts[0].trim()
              const end = parts[1].trim()
              window = {
                start,
                end,
                label: `Custom period (${start} to ${end})`,
                gameCount: 0
              }
            }
          }
          
          if (window) {
            console.log(`🔍 Time window detected: ${window.start} to ${window.end}`)
            
            // Use database-level date filtering for efficiency and accuracy
            const { getGameSummariesByDateRange } = await import('@/lib/models')
            console.log(`🔍 Calling getGameSummariesByDateRange(${window.start}, ${window.end})`)
            const gamesInWindow = await getGameSummariesByDateRange(window.start, window.end, 5000)
            window.gameCount = gamesInWindow.length
            
            console.log(`📊 Found ${gamesInWindow.length} games in time window`)
            console.log(`📋 Sample game dates:`, gamesInWindow.slice(0, 5).map(g => g.date))
            console.log(`📋 Last game dates:`, gamesInWindow.slice(-5).map(g => g.date))
            
            // CRITICAL CHECK: Verify we have the expected number of games
            if (gamesInWindow.length < 50) {
              console.error(`⚠️  WARNING: Only ${gamesInWindow.length} games found for last week. Expected ~105 (15/day * 7 days)`)
              console.error(`   This might indicate a date filtering issue.`)
            }
            
            // Provide the time window and games data - let the agent calculate stats
            context += `\n\n${formatTimeWindowForPrompt(window)}`
            
            if (gamesInWindow.length > 0) {
              // Calculate summary stats upfront
              const wins = gamesInWindow.filter(g => g.result === '1-0').length
              const losses = gamesInWindow.filter(g => g.result === '0-1').length
              const draws = gamesInWindow.filter(g => g.result === '1/2-1/2').length

              // IMPORTANT: games.blunders may be a sentinel (-1) when engine analysis hasn't been run yet.
              // Never treat missing engine data as "0 blunders".
              const blundersWithData = gamesInWindow.filter(g => typeof g.blunders === 'number' && g.blunders >= 0)
              const totalBlunders = blundersWithData.reduce((sum, g) => sum + g.blunders, 0)
              const gamesWithBlunderData = blundersWithData.length
              
              // Use a very compact format - CSV-like for efficiency
              const gamesCompact = gamesInWindow.map((g, i) => 
                `${i + 1}. ${g.date || 'N/A'} | ${g.white || 'N/A'} vs ${g.black || 'N/A'} | ${g.result || 'N/A'} | ${typeof g.blunders === 'number' && g.blunders >= 0 ? `${g.blunders} blunders` : 'blunders: pending analysis'} | ${g.my_accuracy ? g.my_accuracy.toFixed(1) + '%' : 'N/A'}`
              ).join('\n')
              
              context += `\n\n╔══════════════════════════════════════════════════════════════╗
║  TIME WINDOW ANALYSIS: ${window.label || 'Custom Period'}          ║
╠══════════════════════════════════════════════════════════════╣
║  DATE RANGE: ${window.start} to ${window.end}                ║
║  TOTAL GAMES: ${gamesInWindow.length}                         ║
║                                                               ║
║  ⚠️  CRITICAL: You MUST use the exact count above: ${gamesInWindow.length} games ║
║  ⚠️  Do NOT estimate, sample, or summarize - count ALL games ║
╠══════════════════════════════════════════════════════════════╣
║  PRE-CALCULATED STATISTICS (for verification):              ║
║  - Wins: ${wins}                                             ║
║  - Losses: ${losses}                                         ║
║  - Draws: ${draws}                                           ║
║  - Total Blunders (engine-derived, games with data: ${gamesWithBlunderData}/${gamesInWindow.length}): ${totalBlunders} ║
║  - Win Rate: ${gamesInWindow.length > 0 ? ((wins / gamesInWindow.length) * 100).toFixed(1) : 0}%                    ║
╠══════════════════════════════════════════════════════════════╣
║  ALL ${gamesInWindow.length} GAMES IN THIS PERIOD:                    ║
╚══════════════════════════════════════════════════════════════╝

${gamesCompact}

╔══════════════════════════════════════════════════════════════╗
║  REMINDER: You received ${gamesInWindow.length} games. Count them all! ║
╚══════════════════════════════════════════════════════════════╝`
              
              // Critical: Verify all games are included
              console.log(`📦 Sending ${gamesInWindow.length} games to agent`)
              console.log(`📏 Context length: ${context.length} characters`)
              console.log(`📏 Games compact format length: ${gamesCompact.length} characters`)
              console.log(`📋 First 3 games:`, gamesInWindow.slice(0, 3).map(g => `${g.white} vs ${g.black}`))
              console.log(`📋 Last 3 games:`, gamesInWindow.slice(-3).map(g => `${g.white} vs ${g.black}`))
              console.log(`📊 Pre-calculated stats: ${wins}W/${losses}L/${draws}D, ${totalBlunders} blunders`)
              console.log(`✅ Verified: All ${gamesInWindow.length} games included in context`)
            } else {
              context += `\n\nNo games found in this time period (${window.start} to ${window.end}).`
              context += `\nThis could mean:\n- No games were played in this period\n- Games might have different date formats\n- Check if games exist in the database with different date ranges`
            }
          }
        }

        // Add recent games for additional context (but not for progression analysis)
        if (!timeWindow) {
          const recentGames = await getGameSummaries(5) // Fewer games since we have progression summary
          if (recentGames.length > 0) {
            const recentSection = formatGamesForContext(recentGames, RECENT_GAMES_CHAR_LIMIT)
            context = appendContext(context, `\n\nRecent games:\n${recentSection.text}`, RECENT_GAMES_CHAR_LIMIT)
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
                const relevantSection = formatGamesForContext(simplified, RELEVANT_GAMES_CHAR_LIMIT)
                context = appendContext(
                  context,
                  `\n\nMost relevant games from the database:\n${relevantSection.text}`,
                  RELEVANT_GAMES_CHAR_LIMIT
                )
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

function appendContext(base: string, section: string, sectionLimit: number): string {
  const available = Math.max(0, CONTEXT_CHAR_LIMIT - base.length)
  const maxSectionLength = Math.min(sectionLimit, available)
  if (maxSectionLength <= 0) return base
  if (section.length <= maxSectionLength) {
    return base + section
  }
  const suffix = '\n[Context truncated to fit token budget]'
  const trimmedLength = Math.max(0, maxSectionLength - suffix.length)
  return base + section.slice(0, trimmedLength).trimEnd() + suffix
}

function formatGamesForContext(
  games: Array<Record<string, any>>,
  maxChars: number
): { text: string; truncated: boolean } {
  const lines: string[] = []
  let truncated = false

  for (const game of games) {
    const lineParts = [
      game.date || 'N/A',
      `${game.white || 'N/A'} vs ${game.black || 'N/A'}`,
      `Result: ${game.result || 'N/A'}`,
      game.opening_name ? `Opening: ${game.opening_name}` : null,
      typeof game.my_accuracy === 'number' ? `Accuracy: ${game.my_accuracy.toFixed(1)}%` : null,
      typeof game.blunders === 'number' ? `Blunders: ${game.blunders}` : null,
      game.pgn_excerpt ? `PGN: ${truncate(String(game.pgn_excerpt), 400)}` : null,
    ].filter(Boolean)

    const line = `- ${lineParts.join(' | ')}`
    if (lines.join('\n').length + line.length + 1 > maxChars) {
      truncated = true
      break
    }
    lines.push(line)
  }

  if (lines.length === 0 && games.length > 0) {
    return { text: '- [Context truncated: insufficient space for even one game]', truncated: true }
  }

  const text = truncated ? `${lines.join('\n')}\n- [Context truncated: more games omitted]` : lines.join('\n')
  return { text, truncated }
}
