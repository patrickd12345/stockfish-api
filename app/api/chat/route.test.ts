import { POST } from '@/app/api/chat/route'

const invoke = vi.fn()

vi.mock('@/lib/agent', () => ({
  buildAgent: vi.fn(async () => ({
    invoke,
  })),
}))

describe('app/api/chat', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('returns 400 when message is missing', async () => {
    const res = await POST({
      json: async () => ({ gameId: 'g1' }),
    } as any)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Message is required' })
  })

  it('returns content and boardSvg when present', async () => {
    invoke.mockResolvedValueOnce(
      'Hello\nBOARD_SVG::<svg><rect/></svg>\nMore text'
    )

    const res = await POST({
      json: async () => ({ message: 'hi', gameId: 'g1' }),
    } as any)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.boardSvg).toBe('<svg><rect/></svg>')
    expect(body.content).toBe('Hello\n\nMore text')
  })

  it('maps connection errors to friendly message', async () => {
    const { buildAgent } = await import('@/lib/agent')
    vi.mocked(buildAgent).mockRejectedValueOnce(
      Object.assign(new Error('boom'), { code: 'ECONNRESET' })
    )

    const res = await POST({
      json: async () => ({ message: 'hi' }),
    } as any)

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'Connection error. Please check your network connection and try again.',
    })
  })
})

