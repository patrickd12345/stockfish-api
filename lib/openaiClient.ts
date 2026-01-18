import OpenAI from 'openai'

export function getOpenAIConfig(): { apiKey: string; baseURL?: string } | null {
  const gatewayId = process.env.VERCEL_AI_GATEWAY_ID?.trim()
  const virtualKey = process.env.VERCEL_VIRTUAL_KEY?.replace(/[\n\r]/g, '').trim()

  if (gatewayId && virtualKey) {
    return { apiKey: virtualKey, baseURL: 'https://ai-gateway.vercel.sh/v1' }
  }

  const directKey = process.env.OPENAI_API_KEY?.replace(/[\n\r]/g, '').trim()
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

