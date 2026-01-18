import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import OpeningExplorer from '@/components/OpeningExplorer'

describe('components/OpeningExplorer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders empty state when no openings are returned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ openings: [] }),
      } as any)
    )

    render(<OpeningExplorer />)
    expect(await screen.findByText('No opening stats available yet.')).toBeVisible()
  })

  it('filters openings by query', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          openings: [
            {
              openingName: 'Ruy Lopez',
              games: 2,
              whiteWins: 1,
              blackWins: 0,
              draws: 1,
              whiteScore: 0.75,
            },
            {
              openingName: 'French Defense',
              games: 3,
              whiteWins: 1,
              blackWins: 1,
              draws: 1,
              whiteScore: 0.5,
            },
          ],
        }),
      } as any)
    )

    render(<OpeningExplorer />)
    expect(await screen.findByText('Ruy Lopez')).toBeVisible()

    await user.type(screen.getByPlaceholderText('Filter by opening name'), 'French')
    expect(screen.getByText('French Defense')).toBeVisible()
    expect(screen.queryByText('Ruy Lopez')).not.toBeInTheDocument()
  })
})
