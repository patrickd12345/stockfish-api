import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkHostedDbGuard, resetHostedDbGuard } from './database'
import { resetRuntimeCapabilities } from './runtimeCapabilities'

describe('hosted DB guard', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    resetHostedDbGuard()
    vi.unstubAllEnvs()
  })

  it('does not block server execution mode', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://neon.tech/db')
    
    // Should not throw for server mode
    expect(() => checkHostedDbGuard('server')).not.toThrow()
  })

  it('does not block local execution with local DB', () => {
    vi.stubEnv('LOCAL_DB', 'true')
    
    // Should not throw when using local DB
    expect(() => checkHostedDbGuard('local')).not.toThrow()
  })

  it('blocks local execution with hosted DB', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://neon.tech/db')
    
    // Should throw when trying to use hosted DB in local mode
    expect(() => checkHostedDbGuard('local')).toThrow('Hosted DB access blocked in local execution mode')
  })

  it('only checks once per process', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://neon.tech/db')
    
    // First call should throw
    expect(() => checkHostedDbGuard('local')).toThrow()
    
    // Second call should not throw again (already checked)
    expect(() => checkHostedDbGuard('local')).not.toThrow()
  })
})
