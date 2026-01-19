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

    // Test a11y labels
    expect(screen.getByLabelText('Go to Beginning')).toBeInTheDocument()
    expect(screen.getByLabelText('Search games')).toBeInTheDocument()

    // Search
    const search = screen.getByLabelText('Search games')
    await user.type(search, 'ruy')

    // Debounce is 300ms
    await new Promise((resolve) => setTimeout(resolve, 350))
    await waitFor(() => {
      expect(fetchSpy.mock.calls.some(([u]) => String(u).startsWith('/api/games?q='))).toBe(
        true
      )
    })

    // Click game row (using keyboard now)
    const row = await screen.findByText(/Alice vs Bob/i)
    // Find the parent button (since we added role="button" to the row)
    // Actually the text is inside the div with role="button"

    // We can focus it. It should have tabIndex 0
    // user.tab() is a bit tricky, but we can try to find the element and focus it or click it.

    // Check if it is focusable?
    // The element containing "Alice vs Bob" is a child of the row.
    // The row itself has the click handler.

    // Let's verify we can trigger it with Enter key
    const gameRow = row.closest('[role="button"]')
    if (!gameRow) throw new Error('Game row not found')

    ;(gameRow as HTMLElement).focus()
    await user.keyboard('{Enter}')

    expect(onGameSelect).toHaveBeenCalledWith('g2')

    expect(await screen.findByText(/Ruy Lopez/i)).toBeVisible()
  })
})
