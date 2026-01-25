import { describe, it, expect, vi, beforeEach } from 'vitest'

import { requireLichessLiveAccess, LichessAccessError } from './featureAccess'

const requireFeatureForUser = vi.fn()
const getAuthContext = vi.fn()

vi.mock('@/lib/featureGate/server', () => ({
  FeatureAccessError: class FeatureAccessError extends Error {},
  requireFeatureForUser: (...args: any[]) => requireFeatureForUser(...args),
}))

vi.mock('@/lib/auth', () => ({
  getAuthContext: (...args: any[]) => getAuthContext(...args),
}))

function mockRequest(cookies: Record<string, string>): any {
  return {
    cookies: {
      get: (name: string) => (cookies[name] ? { value: cookies[name] } : undefined),
    },
  }
}

describe('requireLichessLiveAccess', () => {
  beforeEach(() => {
    requireFeatureForUser.mockReset()
    getAuthContext.mockReset()
  })

  it('rejects when not authenticated', async () => {
    getAuthContext.mockReturnValue(null)
    await expect(requireLichessLiveAccess(mockRequest({}))).rejects.toBeInstanceOf(LichessAccessError)
  })

  it('rejects when Lichess not connected', async () => {
    getAuthContext.mockReturnValue({ userId: 'app-user' })
    await expect(requireLichessLiveAccess(mockRequest({}))).rejects.toMatchObject({ status: 403 })
  })

  it('gates using authenticated app user id', async () => {
    getAuthContext.mockReturnValue({ userId: 'app-user' })
    requireFeatureForUser.mockResolvedValue({ tier: 'PRO', userId: 'app-user' })

    await expect(requireLichessLiveAccess(mockRequest({ lichess_user_id: 'lichess-user' }))).resolves.toBe(
      'lichess-user'
    )
    expect(requireFeatureForUser).toHaveBeenCalledWith('lichess_live', { userId: 'app-user' })
  })
})

