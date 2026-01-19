import { render, screen, waitFor } from '@testing-library/react'
import LichessLiveTab from '@/components/LichessLiveTab'
import { vi } from 'vitest'

// Mock useLichessBoard hook
const mockRefreshState = vi.fn()
const mockUseLichessBoard = vi.fn()

vi.mock('@/hooks/useLichessBoard', () => ({
  useLichessBoard: () => mockUseLichessBoard()
}))

// Mock child components
vi.mock('./ChessBoard', () => ({
  default: () => <div data-testid="chess-board">ChessBoard</div>
}))
vi.mock('./LiveCommentary', () => ({
  default: () => <div data-testid="live-commentary">LiveCommentary</div>
}))

describe('components/LichessLiveTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockUseLichessBoard.mockReturnValue({
      state: null,
      error: null,
      refreshState: mockRefreshState
    })
  })

  it('shows Seek Match button when session is connected and no game is active', async () => {
    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url === '/api/lichess/board/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'connected' })
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchSpy)

    render(<LichessLiveTab />)

    await waitFor(() => {
      expect(screen.getByText('Seek Human')).toBeInTheDocument()
    })
  })

  it('shows Seek Match button when session is finished and no game is active', async () => {
    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url === '/api/lichess/board/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'finished' })
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchSpy)

    render(<LichessLiveTab />)

    await waitFor(() => {
      expect(screen.getByText('Seek Human')).toBeInTheDocument()
    })
  })

  it('does not show Seek Match button when session is idle', async () => {
    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url === '/api/lichess/board/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'idle' })
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchSpy)

    render(<LichessLiveTab />)

    await waitFor(() => {
      expect(screen.queryByText('Seek Match')).not.toBeInTheDocument()
      expect(screen.getByText('Start Live Session')).toBeInTheDocument()
    })
  })

  it('does not show Seek Match button when game is active', async () => {
     mockUseLichessBoard.mockReturnValue({
      state: { gameId: '123', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: '', status: 'started' },
      error: null,
      refreshState: mockRefreshState
    })

    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url === '/api/lichess/board/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'connected' })
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchSpy)

    render(<LichessLiveTab />)

    await waitFor(() => {
      expect(screen.queryByText('Seek Match')).not.toBeInTheDocument()
      expect(screen.getByTestId('chess-board')).toBeInTheDocument()
    })
  })
})
