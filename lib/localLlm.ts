/**
 * Local LLM Integration (Ollama)
 * 
 * Provides a capability-aware interface for LLM features.
 * When local LLM (Ollama) is available, uses it instead of hosted services.
 * Gracefully degrades when Ollama is unavailable.
 */

import { getRuntimeCapabilities } from './runtimeCapabilities'

export interface LocalLlmOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface LocalLlmResponse {
  content: string
  source: 'ollama' | 'disabled'
}

/**
 * Checks if local LLM is available
 */
export async function isLocalLlmAvailable(): Promise<boolean> {
  const capabilities = await getRuntimeCapabilities()
  return capabilities.localLLM
}

/**
 * Calls Ollama API for chat completion
 */
async function callOllama(
  prompt: string,
  systemPrompt: string,
  options: LocalLlmOptions = {}
): Promise<string> {
  const model = options.model || 'llama3.2' // Default Ollama model
  const temperature = options.temperature ?? 0.7
  const maxTokens = options.maxTokens ?? 2048

  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      options: {
        temperature,
        num_predict: maxTokens,
      },
      stream: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.message?.content || ''
}

/**
 * Generates LLM response using local Ollama if available
 * Returns null if local LLM is unavailable (caller should handle gracefully)
 */
export async function generateLocalLlmResponse(
  prompt: string,
  systemPrompt: string,
  options: LocalLlmOptions = {}
): Promise<LocalLlmResponse | null> {
  const available = await isLocalLlmAvailable()
  
  if (!available) {
    return null // Gracefully indicate LLM is unavailable
  }

  try {
    const content = await callOllama(prompt, systemPrompt, options)
    return {
      content,
      source: 'ollama',
    }
  } catch (error) {
    console.warn('Local LLM (Ollama) call failed:', error)
    return null // Gracefully degrade on error
  }
}

/**
 * Generates a simple completion (no system prompt)
 */
export async function generateLocalCompletion(
  prompt: string,
  options: LocalLlmOptions = {}
): Promise<string | null> {
  const result = await generateLocalLlmResponse(prompt, 'You are a helpful assistant.', options)
  return result?.content || null
}
