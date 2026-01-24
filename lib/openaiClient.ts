/**
 * AI Gateway Client Configuration
 * 
 * DO NOT IMPORT OpenAI DIRECTLY.
 * All hosted LLM access must go through the Vercel AI Gateway.
 * 
 * This module provides a client configured to route through the gateway.
 * The OpenAI SDK is used as a client library pointing to the gateway endpoint.
 */

import OpenAI from 'openai'

export function getAIGatewayConfig(): { apiKey: string; baseURL: string } | null {
  const gatewayId = process.env.VERCEL_AI_GATEWAY_ID?.trim()
  const virtualKey = process.env.VERCEL_VIRTUAL_KEY?.replace(/[\n\r]/g, '').trim()

  // AI Gateway is required for hosted LLM access
  if (!gatewayId || !virtualKey) {
    return null
  }

  return {
    apiKey: virtualKey,
    baseURL: 'https://ai-gateway.vercel.sh/v1'
  }
}

/**
 * Gets an OpenAI SDK client configured to route through the AI Gateway.
 * The SDK is used as a client library - all requests go to the gateway, not OpenAI directly.
 */
export function getAIGatewayClient(): OpenAI {
  const cfg = getAIGatewayConfig()
  if (!cfg) {
    throw new Error(
      'Missing AI Gateway credentials. Set VERCEL_AI_GATEWAY_ID and VERCEL_VIRTUAL_KEY.'
    )
  }
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL })
}

// Legacy exports for backward compatibility (deprecated - use gateway functions)
/** @deprecated Use getAIGatewayConfig() instead */
export function getOpenAIConfig() {
  return getAIGatewayConfig()
}

/** @deprecated Use getAIGatewayClient() instead */
export function getOpenAIClient() {
  return getAIGatewayClient()
}

