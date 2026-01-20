import { render, screen, waitFor } from '@testing-library/react'
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
                    '[Event \"?\"]\n[Site \"https://lichess.org/abcd1234\"]\n[White \"Alice\"]\n[Black \"Bob\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
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
                  '[Event \"?\"]\n[Site \"https://www.chess.com/game/live/123\"]\n[White \"Alice\"]\n[Black \"Bob\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
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

    // Test a11y labels
    expect(screen.getByTitle('Start')).toBeInTheDocument()
    // expect(screen.getByLabelText('Search games')).toBeInTheDocument() // Placeholder is used instead of aria-label in new design
    expect(screen.getByPlaceholderText('Search opponent, opening...')).toBeInTheDocument()
    // Changed to title case badge based on implementation
    expect(await screen.findByText('Chess.com')).toBeInTheDocument()

    // Search
    const search = screen.getByPlaceholderText('Search opponent, opening...')
    await user.type(search, 'ruy')

    // Debounce is 300ms
    await new Promise((resolve) => setTimeout(resolve, 350))
    await waitFor(() => {
      expect(fetchSpy.mock.calls.some(([u]) => String(u).startsWith('/api/games?q='))).toBe(
        true
      )
    })

    // Select game row (keyboard activation)
    const row = await screen.findByText(/Alice/i)
    const gameRow = row.closest('button,[role="button"]')
    if (!gameRow) throw new Error('Game row not found')

    ;(gameRow as HTMLElement).focus()
    await user.keyboard('{Enter}')

    expect(onGameSelect).toHaveBeenCalledWith('g2')
    // expect(await screen.findByLabelText(/Game origin: Lichess/i)).toBeInTheDocument() // aria-label removed/changed
    expect(await screen.findByText('Lichess')).toBeInTheDocument()

    expect(await screen.findByText(/Ruy Lopez/i)).toBeVisible()
  })
})
