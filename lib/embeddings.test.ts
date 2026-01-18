const { embeddingsCreate, openAiOptions, OpenAIStub } = vi.hoisted(() => {
  const embeddingsCreate = vi.fn()
  const openAiOptions: unknown[] = []

  // Must be constructible (called via `new OpenAI(...)`).
  function OpenAIStub(this: any, opts: unknown) {
    openAiOptions.push(opts)
    this.embeddings = { create: embeddingsCreate }
  }

  return { embeddingsCreate, openAiOptions, OpenAIStub }
})

vi.mock('openai', () => ({ default: OpenAIStub }))

import { buildEmbeddingText, getEmbedding, toVectorString } from '@/lib/embeddings'

describe('lib/embeddings', () => {
  const originalEnv = { ...process.env }
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterAll(() => {
    logSpy.mockRestore()
  })

  it('buildEmbeddingText includes header fields and trims PGN body', () => {
    const longPgn = 'x'.repeat(7000)
    const out = buildEmbeddingText({
      white: 'Alice',
      black: 'Bob',
      date: '2026-01-18',
      result: '1-0',
      opening_name: 'Ruy Lopez',
      pgn_text: longPgn,
    })

    expect(out).toContain('White: Alice')
    expect(out).toContain('Black: Bob')
    expect(out).toContain('Opening: Ruy Lopez')
    // Ensures body was truncated (default max is 6000 chars)
    expect(out.length).toBeLessThan(longPgn.length)
  })

  it('toVectorString formats pgvector literal array', () => {
    expect(toVectorString([1, 2, 3])).toBe('[1,2,3]')
  })

  it('getEmbedding returns null when gateway env vars are missing', async () => {
    delete process.env.VERCEL_AI_GATEWAY_ID
    delete process.env.VERCEL_VIRTUAL_KEY

    const result = await getEmbedding('hello')
    expect(result).toBeNull()
    expect(openAiOptions).toHaveLength(0)
  })

  it('getEmbedding calls OpenAI embeddings.create and returns embedding array', async () => {
    process.env.VERCEL_AI_GATEWAY_ID = 'gw'
    process.env.VERCEL_VIRTUAL_KEY = 'vk'
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'

    embeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    })

    const result = await getEmbedding('hello world')
    expect(result).toEqual([0.1, 0.2, 0.3])
    expect(openAiOptions[0]).toEqual({
      apiKey: 'vk',
      baseURL: 'https://ai-gateway.vercel.sh/v1',
    })
    expect(embeddingsCreate).toHaveBeenCalledWith(
      {
        model: 'text-embedding-3-small',
        input: ['hello world'],
      },
      { timeout: 20000 }
    )
  })

  it('retries transient connection errors with backoff', async () => {
    vi.useFakeTimers()
    process.env.VERCEL_AI_GATEWAY_ID = 'gw'
    process.env.VERCEL_VIRTUAL_KEY = 'vk'

    const err = Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' })
    embeddingsCreate
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ data: [{ embedding: [1, 2] }] })

    const promise = getEmbedding('retry')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual([1, 2])
    expect(embeddingsCreate).toHaveBeenCalledTimes(2)
  })
})

