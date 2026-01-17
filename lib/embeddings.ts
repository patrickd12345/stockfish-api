import OpenAI from 'openai'

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
const DEFAULT_EMBEDDING_DIMENSIONS = 1536

function getOpenAiClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

export function toVectorString(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

export function buildGameEmbeddingText(game: {
  date?: string
  white?: string
  black?: string
  result?: string
  opening_name?: string
  my_accuracy?: number
  blunders: number
  pgn_text: string
}): string {
  const header = [
    `Date: ${game.date ?? 'unknown'}`,
    `White: ${game.white ?? 'unknown'}`,
    `Black: ${game.black ?? 'unknown'}`,
    `Result: ${game.result ?? 'unknown'}`,
    `Opening: ${game.opening_name ?? 'unknown'}`,
    `Accuracy: ${game.my_accuracy ?? 'unknown'}`,
    `Blunders: ${game.blunders}`,
  ].join('\n')

  const trimmedPgn = game.pgn_text.length > 4000 ? `${game.pgn_text.slice(0, 4000)}...` : game.pgn_text

  return `${header}\nPGN:\n${trimmedPgn}`
}

export async function embedText(text: string): Promise<number[] | null> {
  const client = getOpenAiClient()
  if (!client) {
    return null
  }

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })

  const embedding = response.data[0]?.embedding
  if (!embedding) {
    return null
  }

  if (embedding.length !== DEFAULT_EMBEDDING_DIMENSIONS) {
    console.warn(
      `Embedding dimensions (${embedding.length}) do not match expected ${DEFAULT_EMBEDDING_DIMENSIONS}. ` +
        'Update schema.sql if you are using a different embedding model.'
    )
  }

  return embedding
}

export async function embedGame(game: {
  date?: string
  white?: string
  black?: string
  result?: string
  opening_name?: string
  my_accuracy?: number
  blunders: number
  pgn_text: string
}): Promise<number[] | null> {
  const content = buildGameEmbeddingText(game)
  return embedText(content)
}

export async function embedQuery(query: string): Promise<number[] | null> {
  const content = `Chess question or request: ${query}`
  return embedText(content)
}
