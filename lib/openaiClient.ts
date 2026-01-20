import OpenAI from 'openai'

export function getOpenAIConfig(): { apiKey: string; baseURL?: string } | null {
  const provider = (process.env.OPENAI_PROVIDER || '').trim().toLowerCase()
  const gatewayId = process.env.VERCEL_AI_GATEWAY_ID?.trim()
  const virtualKey = process.env.VERCEL_VIRTUAL_KEY?.replace(/[\n\r]/g, '').trim()

  const directKey = process.env.OPENAI_API_KEY?.replace(/[\n\r]/g, '').trim()

  // Explicit selection (useful when both gateway + direct are present).
  if (provider === 'direct') {
    if (!directKey) return null
    return { apiKey: directKey }
  }
  if (provider === 'gateway') {
    if (!gatewayId || !virtualKey) return null
    return { apiKey: virtualKey, baseURL: 'https://ai-gateway.vercel.sh/v1' }
  }

  // Default behavior: prefer gateway when configured; otherwise fallback to direct.
  if (gatewayId && virtualKey) {
    return { apiKey: virtualKey, baseURL: 'https://ai-gateway.vercel.sh/v1' }
  }
  if (directKey) {
    return { apiKey: directKey }
  }

  return null
}

export function getOpenAIClient(): OpenAI {
  const cfg = getOpenAIConfig()
  if (!cfg) {
    throw new Error(
      'Missing OpenAI credentials. Set (VERCEL_AI_GATEWAY_ID + VERCEL_VIRTUAL_KEY) or OPENAI_API_KEY.'
    )
  }
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL })
}

