import OpenAI from 'openai'

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_EMBED_CHARS = 6000

export function buildEmbeddingText(input: {
  white?: string
  black?: string
  date?: string
  result?: string
  opening_name?: string
  pgn_text: string
}): string {
  const header = [
    input.white ? `White: ${input.white}` : '',
    input.black ? `Black: ${input.black}` : '',
    input.date ? `Date: ${input.date}` : '',
    input.result ? `Result: ${input.result}` : '',
    input.opening_name ? `Opening: ${input.opening_name}` : '',
  ].filter(Boolean).join(' | ')

  const pgn = input.pgn_text.length > MAX_EMBED_CHARS
    ? input.pgn_text.slice(0, MAX_EMBED_CHARS)
    : input.pgn_text

  return header ? `${header}\n${pgn}` : pgn
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  const gatewayId = process.env.VERCEL_AI_GATEWAY_ID?.trim()
  const apiKey = process.env.VERCEL_VIRTUAL_KEY?.trim()

  if (!gatewayId || !apiKey) return null

  const baseURL = 'https://ai-gateway.vercel.sh/v1'

  const openai = new OpenAI({ apiKey, baseURL })
  const model = (process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL).trim()
  
  const maxRetries = 3
  let lastError: any = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model,
        input: text,
      }, {
        timeout: 20000,
      })
      const embedding = response.data?.[0]?.embedding
      return Array.isArray(embedding) ? embedding : null
    } catch (error: any) {
      lastError = error
      const isRetryable = 
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNREFUSED' ||
        error.type === 'system' ||
        (error.message && error.message.includes('Connection error'))
      
      if (isRetryable && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        console.log(`Retry embedding attempt ${attempt}/${maxRetries} after ${delay}ms due to:`, error.message || error.code)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
  return null
}

export function toVectorString(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
