import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getEntitlementForUser } from './billing'
import { resetRuntimeCapabilities } from './runtimeCapabilities'

// Mock database
vi.mock('./database', () => ({
  getSql: () => {
    const sql = async () => [] as any[]
    return sql
  },
}))

describe('dev entitlement override', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    vi.unstubAllEnvs()
  })

  it('does not override in production without allowlist', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEV_ENTITLEMENT', 'PRO')
    vi.stubEnv('LOCAL_DB', 'true')
    
    const entitlement = await getEntitlementForUser('test-user')
    expect(entitlement.plan).toBe('FREE')
  })

  it('overrides to PRO for allowlisted user in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEV_ENTITLEMENT_USER_IDS', 'dev-user, lichess-123 ')

    const entitlement = await getEntitlementForUser('dev-user')
    expect(entitlement.plan).toBe('PRO')
    expect(entitlement.status).toBe('ACTIVE')
  })

  it('does not override without DEV_ENTITLEMENT=PRO', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('LOCAL_DB', 'true')
    // DEV_ENTITLEMENT not set
    
    const entitlement = await getEntitlementForUser('test-user')
    expect(entitlement.plan).toBe('FREE') // Should not override without explicit opt-in
  })

  it('does not override without local DB', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_ENTITLEMENT', 'PRO')
    // LOCAL_DB not set, DATABASE_URL points to remote
    
    const entitlement = await getEntitlementForUser('test-user')
    expect(entitlement.plan).toBe('FREE') // Should not override without local DB
  })

  it('overrides to PRO when all conditions met', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_ENTITLEMENT', 'PRO')
    vi.stubEnv('LOCAL_DB', 'true')
    
    const entitlement = await getEntitlementForUser('test-user')
    expect(entitlement.plan).toBe('PRO')
    expect(entitlement.status).toBe('ACTIVE')
  })
})
