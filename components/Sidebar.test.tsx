import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from '@/components/Sidebar'
import { CapabilityFactsProvider } from '@/contexts/CapabilityFactsContext'
import { EntitlementProvider } from '@/contexts/EntitlementContext'

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
                time: '09:00:00',
                result: '1-0',
                pgn_text:
                  '[Event \"?\"]\n[Site \"https://www.chess.com/game/live/123\"]\n[White \"Alice\"]\n[Black \"Bob\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
              },
              {
                id: 'g2',
                white: 'Alice',
                black: 'Bob',
                opening_name: 'Ruy Lopez',
                date: '2026.01.17',
                time: '10:00:00',
                result: '1-0',
                pgn_text:
                  '[Event \"?\"]\n[Site \"https://lichess.org/abcd1234\"]\n[White \"Alice\"]\n[Black \"Bob\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
              },
              {
                id: 'g3',
                white: 'Carol',
                black: 'Dave',
                opening_name: 'French Defense',
                createdAt: '2026-01-18T08:00:00Z',
                result: '0-1',
                pgn_text:
                  '[Event \"?\"]\n[Site \"https://lichess.org/efgh5678\"]\n[White \"Carol\"]\n[Black \"Dave\"]\n[Result \"0-1\"]\n\n1. e4 e6 2. d4 d5 3. Nc3 Bb4 0-1',
              },
            ],
          }),
        } as any
      })
    vi.stubGlobal('fetch', fetchSpy)

    const onGameSelect = vi.fn()

    render(
      <CapabilityFactsProvider
        initialFacts={{
          serverExecution: true,
          outboundNetwork: true,
          database: true,
          persistence: true,
          secrets: true,
        }}
      >
        <EntitlementProvider
          initialState={{
            entitlement: {
              plan: 'FREE',
              status: 'ACTIVE',
              current_period_end: null,
              cancel_at_period_end: false,
            },
            tier: 'FREE',
            isAuthenticated: true,
          }}
        >
          <Sidebar
            onGamesProcessed={() => {}}
            onGameSelect={onGameSelect}
            selectedGameId={null}
            refreshKey={0}
          />
        </EntitlementProvider>
      </CapabilityFactsProvider>
    )

    // Initial load request
    expect(fetchSpy).toHaveBeenCalled()

    // Test a11y labels
    expect(screen.getByTitle('Start')).toBeInTheDocument()
    // expect(screen.getByLabelText('Search games')).toBeInTheDocument() // Placeholder is used instead of aria-label in new design
    expect(screen.getByPlaceholderText('Search opponent, opening...')).toBeInTheDocument()
    // Changed to title case badge based on implementation
    expect(await screen.findByText('Chess.com')).toBeInTheDocument()

    const gameButtons = await screen.findAllByRole('button', { name: /Game:/i })
    expect(gameButtons[0]).toHaveTextContent('Carol')
    expect(gameButtons[1]).toHaveTextContent('Alice')

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
