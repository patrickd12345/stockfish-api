import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getEntitlementForUser } from './billing'
import { resetRuntimeCapabilities } from './runtimeCapabilities'

// Mock database
vi.mock('./database', () => ({
  getSql: () => ({
    async query(strings: TemplateStringsArray, ...values: any[]) {
      // Return empty result (no entitlement in DB)
      return []
    },
  }),
}))

describe('dev entitlement override', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    vi.unstubAllEnvs()
  })

  it('does not override in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEV_ENTITLEMENT', 'PRO')
    vi.stubEnv('LOCAL_DB', 'true')
    
    const entitlement = await getEntitlementForUser('test-user', 'local')
    expect(entitlement.plan).toBe('FREE') // Should not override in production
  })

  it('does not override without DEV_ENTITLEMENT=PRO', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('LOCAL_DB', 'true')
    // DEV_ENTITLEMENT not set
    
    const entitlement = await getEntitlementForUser('test-user', 'local')
    expect(entitlement.plan).toBe('FREE') // Should not override without explicit opt-in
  })

  it('does not override for server execution mode', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_ENTITLEMENT', 'PRO')
    vi.stubEnv('LOCAL_DB', 'true')
    
    const entitlement = await getEntitlementForUser('test-user', 'server')
    expect(entitlement.plan).toBe('FREE') // Should not override for server mode
  })

  it('does not override without local DB', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_ENTITLEMENT', 'PRO')
    // LOCAL_DB not set, DATABASE_URL points to remote
    
    const entitlement = await getEntitlementForUser('test-user', 'local')
    expect(entitlement.plan).toBe('FREE') // Should not override without local DB
  })

  it('overrides to PRO when all conditions met', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_ENTITLEMENT', 'PRO')
    vi.stubEnv('LOCAL_DB', 'true')
    
    const entitlement = await getEntitlementForUser('test-user', 'local')
    expect(entitlement.plan).toBe('PRO')
    expect(entitlement.status).toBe('ACTIVE')
  })
})
