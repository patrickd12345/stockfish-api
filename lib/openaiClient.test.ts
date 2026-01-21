import { describe, it, expect, vi, afterEach } from 'vitest'
import { getOpenAIConfig, getOpenAIClient } from '@/lib/openaiClient'

// Mock process.env
const originalEnv = process.env

describe('BYOK Logic in openaiClient', () => {
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('should use the provided override key when present', () => {
    // Setup env with a fallback
    process.env.OPENAI_API_KEY = 'env-key'

    const config = getOpenAIConfig('user-provided-key')
    expect(config).toEqual({ apiKey: 'user-provided-key' })
  })

  it('should fallback to environment variables when override is null/undefined', () => {
    process.env.OPENAI_API_KEY = 'env-key'

    const config = getOpenAIConfig(null)
    expect(config).toEqual({ apiKey: 'env-key' })

    const configUndefined = getOpenAIConfig(undefined)
    expect(configUndefined).toEqual({ apiKey: 'env-key' })
  })

  it('should return null if no override and no env vars', () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.VERCEL_AI_GATEWAY_ID
    delete process.env.VERCEL_VIRTUAL_KEY

    const config = getOpenAIConfig(null)
    expect(config).toBeNull()
  })

  it('should prioritize override over Gateway config', () => {
    process.env.VERCEL_AI_GATEWAY_ID = 'gateway-id'
    process.env.VERCEL_VIRTUAL_KEY = 'virtual-key'
    process.env.OPENAI_PROVIDER = 'gateway'

    const config = getOpenAIConfig('override-key')
    expect(config).toEqual({ apiKey: 'override-key' })
  })
})
