import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import GameInspector from '@/components/GameInspector'

describe('components/GameInspector', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows empty state when no games exist', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ games: [] }),
    } as any)
    vi.stubGlobal('fetch', fetchSpy)

    render(<GameInspector />)
    expect(await screen.findByText('No games processed yet.')).toBeVisible()
  })

  it('loads games and fetches PGN for first game', async () => {
    const user = userEvent.setup()

    const fetchSpy = vi.fn(async (url: string) => {
        if (url === '/api/games') {
          return {
            ok: true,
            json: async () => ({
              games: [{ id: 'g1', white: 'A', black: 'B', date: '2026.01.01', result: '1-0' }],
            }),
          } as any
        }
        if (url === '/api/games/g1/analysis') {
          return {
            ok: true,
            json: async () => ({
              pgn: '1. e4 e5 2. Nf3 Nc6',
              moves: [{ move_number: 1, ply: 0, fen: '', move_san: 'e4', engine_eval: 20, is_blunder: false }],
              pvSnapshots: [],
              engineVersion: '16',
              analysisDepth: 15,
            }),
          } as any
        }
        return { ok: true, json: async () => ({}) } as any
      })
    vi.stubGlobal('fetch', fetchSpy)

    render(<GameInspector />)

    expect(await screen.findByRole('heading', { name: 'Game Inspector' })).toBeVisible()
    // Wait for first analysis fetch
    await vi.waitFor(() => {
      expect(fetchSpy.mock.calls.some(([u]) => String(u) === '/api/games/g1/analysis')).toBe(true)
    })

    // Interact with select to ensure it's wired
    await user.selectOptions(screen.getByRole('combobox'), ['g1'])
  })
})

