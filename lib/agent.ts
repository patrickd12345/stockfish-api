import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { connectToDb, isDbConfigured } from '@/lib/database'
import {
  SummaryPayload,
  getLatestEngineSummary,
  getLatestProgressionSummary,
} from '@/lib/models'

const DEBUG_ENGINE_MARKER = '=== DEBUG: ENGINE SUMMARY PRESENT ==='
const DEBUG_PROGRESSION_MARKER = '=== DEBUG: PROGRESSION SUMMARY PRESENT ==='
const FINAL_SYSTEM_PROMPT_MARKER = '=== DEBUG: FINAL SYSTEM PROMPT ==='

export const SYSTEM_PROMPT = `You are a chess coach.
You MUST answer only using the injected summaries.
Do not perform chat-time computation or use unstated data.
Be explicitly honest about missing facts: if a requested detail is not in the summaries, say so.
If EngineSummary is present, you are forbidden from saying you do not have engine data.`

export async function buildAgent(conn: any) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  return {
    async invoke({ input }: { input: string }) {
      let engineSummary: SummaryPayload | null = null
      let progressionSummary: SummaryPayload | null = null

      if (isDbConfigured()) {
        await connectToDb()
        engineSummary = await getLatestEngineSummary()
        progressionSummary = await getLatestProgressionSummary()
      }

      const systemPrompt = buildSystemPrompt({
        engineSummary,
        progressionSummary,
      })
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ]

      assertPromptIntegrity(messages, systemPrompt, {
        engineSummary,
        progressionSummary,
      })

      console.log(`${FINAL_SYSTEM_PROMPT_MARKER}\n${systemPrompt}`)

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        temperature: 0,
      })

      const content = response.choices[0]?.message?.content || 'No response'

      assertNoEngineDenial(engineSummary, content)
      
      return {
        output: content,
        intermediate_steps: [],
      }
    },
  }
}

function buildSystemPrompt({
  engineSummary,
  progressionSummary,
}: {
  engineSummary: SummaryPayload | null
  progressionSummary: SummaryPayload | null
}): string {
  const parts = [SYSTEM_PROMPT]

  if (progressionSummary) {
    parts.push(
      DEBUG_PROGRESSION_MARKER,
      `ProgressionSummary (fact-only):\n${progressionSummary.summaryText}`
    )
  }

  if (engineSummary) {
    parts.push(
      DEBUG_ENGINE_MARKER,
      `EngineSummary (fact-only):\n${engineSummary.summaryText}`
    )
  }

  return parts.join('\n\n')
}

function assertPromptIntegrity(
  messages: ChatCompletionMessageParam[],
  systemPrompt: string,
  summaries: {
    engineSummary: SummaryPayload | null
    progressionSummary: SummaryPayload | null
  }
): void {
  const systemMessages = messages.filter((message) => message.role === 'system')
  if (systemMessages.length !== 1) {
    throw new Error(
      `Expected exactly one system message, found ${systemMessages.length}`
    )
  }

  if (summaries.progressionSummary) {
    if (!summaries.progressionSummary.summaryText.trim()) {
      throw new Error('ProgressionSummary present but empty')
    }
    if (!systemPrompt.includes(DEBUG_PROGRESSION_MARKER)) {
      throw new Error('ProgressionSummary present but debug marker missing')
    }
    if (!systemPrompt.includes(summaries.progressionSummary.summaryText)) {
      throw new Error('ProgressionSummary present but not injected into prompt')
    }
  }

  if (summaries.engineSummary) {
    if (!summaries.engineSummary.summaryText.trim()) {
      throw new Error('EngineSummary present but empty')
    }
    if (!systemPrompt.includes(DEBUG_ENGINE_MARKER)) {
      throw new Error('EngineSummary present but debug marker missing')
    }
    if (!systemPrompt.includes(summaries.engineSummary.summaryText)) {
      throw new Error('EngineSummary present but not injected into prompt')
    }
  }
}

function assertNoEngineDenial(
  engineSummary: SummaryPayload | null,
  content: string
): void {
  if (!engineSummary || engineSummary.coveragePercent <= 0) {
    return
  }
  const normalized = content.toLowerCase()
  const denialPatterns = [
    'i do not have engine data',
    'i do not have engine analysis data',
    'no engine analysis data available',
    "i don't have engine data",
    "i don't have engine analysis data",
    "i don't have access to engine data",
  ]
  if (denialPatterns.some((pattern) => normalized.includes(pattern))) {
    throw new Error(
      'EngineSummary coverage > 0 but response denies engine data access'
    )
  }
}
