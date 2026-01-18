let capturedMessages: Array<{ role: string; content: string }> | null = null

vi.mock('@/lib/openaiClient', () => ({
  getOpenAIConfig: vi.fn(() => ({ apiKey: 'test-key' })),
  getOpenAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(async (payload: { messages: Array<{ role: string; content: string }> }) => {
          capturedMessages = payload.messages
          return { choices: [{ message: { content: 'ok' } }] }
        }),
      },
    },
  })),
}))

vi.mock('@/lib/database', () => ({
  connectToDb: vi.fn(async () => {}),
}))

vi.mock('@/lib/models', () => ({
  getGameSummaries: vi.fn(async () => {
    return Array.from({ length: 120 }, (_, idx) => ({
      id: `g-${idx}`,
      date: '2026-01-01',
      white: 'Alpha',
      black: 'Beta',
      result: '1-0',
      opening_name: 'Test Opening',
      my_accuracy: 50,
      blunders: 0,
      pgn_text: 'PGN',
    }))
  }),
  getGamePgn: vi.fn(async () => null),
  searchGamesByEmbedding: vi.fn(async () => []),
}))

vi.mock('@/lib/embeddings', () => ({
  getEmbedding: vi.fn(async () => []),
}))

vi.mock('@/lib/progressionStorage', () => ({
  loadProgressionSummary: vi.fn(async () => null),
}))

vi.mock('@/lib/engineSummaryStorage', () => ({
  loadEngineSummary: vi.fn(async () => null),
}))

describe('lib/agent prompt logic', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    capturedMessages = null
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('injects authoritative guardrails and truncates oversized history', async () => {
    process.env.AGENT_CONTEXT_CHAR_LIMIT = '300'
    process.env.AGENT_RECENT_GAMES_CHAR_LIMIT = '200'
    process.env.AGENT_RELEVANT_GAMES_CHAR_LIMIT = '200'

    const { buildAgent } = await import('@/lib/agent')
    const agent = await buildAgent({})

    await agent.invoke({ input: 'hello' })

    const systemMessage = capturedMessages?.find((msg) => msg.role === 'system')
    expect(systemMessage).toBeTruthy()
    expect(systemMessage?.content).toContain('AUTHORITATIVE')
    expect(systemMessage?.content).toContain('Context truncated')
  })
})
