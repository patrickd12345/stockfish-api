const fakeSql = vi.fn(async () => []) as unknown as (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>

vi.mock('@neondatabase/serverless', () => {
  return {
    neon: vi.fn(() => fakeSql),
    neonConfig: {},
  }
})

describe('lib/database', () => {
  const originalEnv = { ...process.env }
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterAll(() => {
    warnSpy.mockRestore()
  })

  it('isDbConfigured is false when no connection env vars are set', async () => {
    process.env.POSTGRES_URL = ''
    delete process.env.POSTGRES_URL
    delete process.env.DATABASE_URL
    delete process.env.POSTGRES_PRISMA_URL

    const db = await import('@/lib/database')
    expect(db.isDbConfigured()).toBe(false)
    expect(() => db.getSql()).toThrow(/No database connection string found/i)
  })

  it('prefers POSTGRES_URL over DATABASE_URL and POSTGRES_PRISMA_URL', async () => {
    process.env.POSTGRES_URL = '  postgres://from-postgres-url  '
    process.env.DATABASE_URL = 'postgres://from-database-url'
    process.env.POSTGRES_PRISMA_URL = 'postgres://from-prisma'

    const { getSql } = await import('@/lib/database')
    getSql()

    const { neon } = await import('@neondatabase/serverless')
    expect(vi.mocked(neon)).toHaveBeenCalledWith('postgres://from-postgres-url')
  })

  it('falls back to DATABASE_URL when POSTGRES_URL is unset', async () => {
    delete process.env.POSTGRES_URL
    process.env.DATABASE_URL = ' postgres://from-database-url '

    const { getSql } = await import('@/lib/database')
    getSql()

    const { neon } = await import('@neondatabase/serverless')
    expect(vi.mocked(neon)).toHaveBeenCalledWith('postgres://from-database-url')
  })

  it('falls back to POSTGRES_PRISMA_URL when others are unset', async () => {
    delete process.env.POSTGRES_URL
    delete process.env.DATABASE_URL
    process.env.POSTGRES_PRISMA_URL = ' postgres://from-prisma-url '

    const { getSql } = await import('@/lib/database')
    getSql()

    const { neon } = await import('@neondatabase/serverless')
    expect(vi.mocked(neon)).toHaveBeenCalledWith('postgres://from-prisma-url')
  })

  it('caches the neon sql instance', async () => {
    process.env.POSTGRES_URL = 'postgres://cached'

    const { getSql } = await import('@/lib/database')
    const a = getSql()
    const b = getSql()
    expect(a).toBe(b)

    const { neon } = await import('@neondatabase/serverless')
    expect(vi.mocked(neon)).toHaveBeenCalledTimes(1)
  })
})

