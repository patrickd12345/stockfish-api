/**
 * LLM Helper: Prefers local Ollama, falls back to AI Gateway
 * 
 * DO NOT IMPORT OpenAI DIRECTLY.
 * All hosted LLM access must go through the Vercel AI Gateway.
 * 
 * This ensures that in local mode, only Ollama is used.
 * Falls back to AI Gateway only when local LLM is unavailable.
 */

import { generateLocalLlmResponse, type LocalLlmOptions } from './localLlm'
import { getAIGatewayClient, getAIGatewayConfig } from './openaiClient'

export interface LlmCallOptions extends LocalLlmOptions {
  model?: string // Model name (used for both Ollama and gateway)
}

export interface LlmCallResult {
  content: string
  source: 'ollama' | 'gateway' | 'fallback'
}

/**
 * Calls LLM with local-first strategy:
 * 1. Try local Ollama if available
 * 2. Fall back to AI Gateway if local LLM unavailable
 * 3. Return fallback content if both fail
 */
export async function callLlm(
  prompt: string,
  systemPrompt: string,
  options: LlmCallOptions = {},
  fallbackContent?: string
): Promise<LlmCallResult> {
  // Step 1: Try local LLM first
  const localResult = await generateLocalLlmResponse(prompt, systemPrompt, {
    model: options.model,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  })

  if (localResult) {
    return {
      content: localResult.content,
      source: 'ollama',
    }
  }

  // Step 2: Fall back to AI Gateway if local LLM unavailable
  const gatewayConfig = getAIGatewayConfig()
  if (gatewayConfig) {
    try {
      const gatewayClient = getAIGatewayClient()
      const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini'

      const completion = await gatewayClient.chat.completions.create({
        model,
        temperature: options.temperature ?? 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      })

      const content = completion.choices[0]?.message?.content?.trim()
      if (content) {
        return {
          content,
          source: 'gateway',
        }
      }
    } catch (error) {
      console.warn('[LLM Helper] AI Gateway fallback failed:', error)
    }
  }

  // Step 3: Return fallback content if both failed
  return {
    content: fallbackContent || 'LLM service unavailable.',
    source: 'fallback',
  }
}
