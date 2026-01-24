import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetRuntimeCapabilities, getRuntimeCapabilitiesSync, getRuntimeCapabilities } from './runtimeCapabilities'

describe('runtimeCapabilities', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    vi.unstubAllEnvs()
  })

  describe('detectLocalDb', () => {
    it('detects local DB from LOCAL_DB=true', () => {
      vi.stubEnv('LOCAL_DB', 'true')
      const caps = getRuntimeCapabilitiesSync()
      expect(caps.localDb).toBe(true)
      expect(caps.hostedDb).toBe(false)
    })

    it('detects local DB from localhost URL', () => {
      vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/db')
      const caps = getRuntimeCapabilitiesSync()
      expect(caps.localDb).toBe(true)
      expect(caps.hostedDb).toBe(false)
    })

    it('detects local DB from 127.0.0.1 URL', () => {
      vi.stubEnv('DATABASE_URL', 'postgres://user:pass@127.0.0.1:5432/db')
      const caps = getRuntimeCapabilitiesSync()
      expect(caps.localDb).toBe(true)
    })

    it('detects hosted DB from remote URL', () => {
      vi.stubEnv('DATABASE_URL', 'postgres://user:pass@neon.tech:5432/db')
      const caps = getRuntimeCapabilitiesSync()
      expect(caps.localDb).toBe(false)
      expect(caps.hostedDb).toBe(true)
    })

    it('defaults to hosted when no DB URL', () => {
      const caps = getRuntimeCapabilitiesSync()
      expect(caps.localDb).toBe(false)
      expect(caps.hostedDb).toBe(true)
    })
  })

  describe('detectBillingEnabled', () => {
    it('disables billing in development by default', () => {
      vi.stubEnv('NODE_ENV', 'development')
      const caps = getRuntimeCapabilitiesSync()
      expect(caps.billingEnabled).toBe(false)
    })

    it('enables billing in development when BILLING_ENABLED=true', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('BILLING_ENABLED', 'true')
      const caps = getRuntimeCapabilitiesSync()
      expect(caps.billingEnabled).toBe(true)
    })

    it('enables billing in production by default', () => {
      vi.stubEnv('NODE_ENV', 'production')
      const caps = getRuntimeCapabilitiesSync()
      expect(caps.billingEnabled).toBe(true)
    })

    it('disables billing in production when BILLING_ENABLED=false', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('BILLING_ENABLED', 'false')
      const caps = getRuntimeCapabilitiesSync()
      expect(caps.billingEnabled).toBe(false)
    })
  })

  describe('probeOllama', () => {
    it('returns false when Ollama is unavailable', async () => {
      // Mock fetch to simulate Ollama not available
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))
      
      const caps = await getRuntimeCapabilities()
      expect(caps.localLLM).toBe(false)
    })

    it('caches Ollama probe result', async () => {
      // Mock fetch to simulate Ollama available
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      })
      
      const caps1 = await getRuntimeCapabilities()
      const caps2 = await getRuntimeCapabilities()
      
      // Should only call fetch once
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(caps1.localLLM).toBe(caps2.localLLM)
    })
  })

  describe('caching', () => {
    it('caches capabilities per process', async () => {
      vi.stubEnv('DATABASE_URL', 'postgres://localhost/db')
      const caps1 = await getRuntimeCapabilities()
      const caps2 = await getRuntimeCapabilities()
      
      expect(caps1).toBe(caps2) // Same object reference
    })

    it('resets cache when resetRuntimeCapabilities is called', async () => {
      vi.stubEnv('DATABASE_URL', 'postgres://localhost/db')
      const caps1 = await getRuntimeCapabilities()
      
      resetRuntimeCapabilities()
      vi.stubEnv('DATABASE_URL', 'postgres://remote/db')
      const caps2 = await getRuntimeCapabilities()
      
      expect(caps1.localDb).toBe(true)
      expect(caps2.localDb).toBe(false)
    })
  })
})
