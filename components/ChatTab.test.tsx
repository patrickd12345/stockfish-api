import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ChatTab from '@/components/ChatTab'

describe('components/ChatTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('posts message with selectedGameId as gameId', async () => {
    const user = userEvent.setup()

    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/chat') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ content: 'hello back' }),
        } as any)
      }

      if (url === '/api/coach/suggestions') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ suggestions: [] }),
        } as any)
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as any)
    })
    vi.stubGlobal('fetch', fetchSpy)

    render(<ChatTab selectedGameId="game-123" />)

    await user.type(screen.getByPlaceholderText('Ask your coach'), 'hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    const chatCall = fetchSpy.mock.calls.find(([calledUrl]) => calledUrl === '/api/chat')
    expect(chatCall).toBeTruthy()
    const [url, init] = chatCall as any
    expect(url).toBe('/api/chat')
    const initAny = init as any
    expect(initAny.method).toBe('POST')
    expect(JSON.parse(initAny.body)).toEqual({ message: 'hi', gameId: 'game-123' })

    expect(await screen.findByText('hello back')).toBeVisible()
  })

  it('renders context chip when selectedGameId is provided', () => {
    render(<ChatTab selectedGameId="abcdef123456" />)
    expect(screen.getByText(/Context: Game abcdef12/i)).toBeVisible()
  })
})

