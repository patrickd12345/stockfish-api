import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Sidebar from '@/components/Sidebar'

describe('components/Sidebar', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads games and supports search + selection', async () => {
    const user = userEvent.setup()

    const fetchSpy = vi.fn(async (url: string) => {
        if (url.startsWith('/api/games?q=')) {
          return {
            ok: true,
            json: async () => ({
              games: [
                {
                  id: 'g2',
                  white: 'Alice',
                  black: 'Bob',
                  opening_name: 'Ruy Lopez',
                  date: '2026.01.17',
                  result: '1-0',
                  pgn_text:
                    '[Event \"?\"]\n[White \"Alice\"]\n[Black \"Bob\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
                },
              ],
            }),
          } as any
        }
        // Initial load
        return {
          ok: true,
          json: async () => ({
            games: [
              {
                id: 'g1',
                white: 'Alice',
                black: 'Bob',
                opening_name: 'Ruy Lopez',
                date: '2026.01.17',
                result: '1-0',
                pgn_text:
                  '[Event \"?\"]\n[White \"Alice\"]\n[Black \"Bob\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
              },
            ],
          }),
        } as any
      })
    vi.stubGlobal('fetch', fetchSpy)

    const onGameSelect = vi.fn()

    render(
      <Sidebar
        onGamesProcessed={() => {}}
        onGameSelect={onGameSelect}
        selectedGameId={null}
        refreshKey={0}
      />
    )

    // Initial load request
    expect(fetchSpy).toHaveBeenCalled()

    // Search
    const search = screen.getByPlaceholderText('Search white, black, opening...')
    await user.type(search, 'ruy')

    // Debounce is 300ms
    await new Promise((resolve) => setTimeout(resolve, 350))
    await vi.waitFor(() => {
      expect(fetchSpy.mock.calls.some(([u]) => String(u).startsWith('/api/games?q='))).toBe(
        true
      )
    })

    // Click game row
    const row = await screen.findByText(/Alice vs Bob/i)
    await user.click(row)
    expect(onGameSelect).toHaveBeenCalledWith('g2')

    expect(await screen.findByText(/Ruy Lopez/i)).toBeVisible()
  })
})

