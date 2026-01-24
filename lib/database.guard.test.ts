import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkHostedDbGuard, resetHostedDbGuard } from './database'
import { resetRuntimeCapabilities } from './runtimeCapabilities'

describe('hosted DB guard', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    resetHostedDbGuard()
    vi.unstubAllEnvs()
  })

  it('does not block outside development', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', 'postgres://neon.tech/db')
    
    expect(() => checkHostedDbGuard()).not.toThrow()
  })

  it('does not block development with local DB', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('LOCAL_DB', 'true')
    
    // Should not throw when using local DB
    expect(() => checkHostedDbGuard()).not.toThrow()
  })

  it('blocks development with hosted DB', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DATABASE_URL', 'postgres://neon.tech/db')
    
    // Should throw when trying to use hosted DB in local mode
    expect(() => checkHostedDbGuard()).toThrow('Hosted DB access blocked in development')
  })

  it('only checks once per process', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DATABASE_URL', 'postgres://neon.tech/db')
    
    // First call should throw
    expect(() => checkHostedDbGuard()).toThrow()
    
    // Second call should not throw again (already checked)
    expect(() => checkHostedDbGuard()).not.toThrow()
  })
})
