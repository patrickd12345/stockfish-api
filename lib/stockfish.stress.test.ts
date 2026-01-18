let lineHandler: ((line: string) => void) | null = null
const procHandlers: Record<string, (err?: Error) => void> = {}

const mockProc = {
  stdout: {},
  stdin: {
    write: vi.fn((data: string) => {
      const cmd = data.trim()
      if (cmd === 'uci') {
        lineHandler?.('uciok')
        return
      }
      if (cmd === 'isready') {
        lineHandler?.('readyok')
        return
      }
      if (cmd.startsWith('go movetime')) {
        lineHandler?.('info score cp 10')
        lineHandler?.('bestmove e2e4')
      }
    }),
  },
  on: vi.fn((event: string, cb: (err?: Error) => void) => {
    procHandlers[event] = cb
  }),
  kill: vi.fn(),
}

vi.mock('child_process', () => ({
  spawn: vi.fn(() => mockProc),
  default: { spawn: vi.fn(() => mockProc) },
}))

vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    on: (event: string, cb: (line: string) => void) => {
      if (event === 'line') {
        lineHandler = cb
      }
    },
    close: vi.fn(),
  })),
  default: {
    createInterface: vi.fn(() => ({
      on: (event: string, cb: (line: string) => void) => {
        if (event === 'line') {
          lineHandler = cb
        }
      },
      close: vi.fn(),
    })),
  },
}))

describe('lib/stockfish stress', () => {
  afterEach(() => {
    lineHandler = null
    vi.clearAllMocks()
  })

  it('resolves concurrent evaluations without errors', async () => {
    const { StockfishEngine } = await import('@/lib/stockfish')
    const engine = new StockfishEngine('/fake/stockfish', 1)
    await engine.start()

    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const tasks = Array.from({ length: 20 }, () => engine.evaluate(fen, 'w'))
    const results = await Promise.all(tasks)

    expect(results).toHaveLength(20)
    for (const score of results) {
      expect(score).toBe(10)
    }

    await engine.stop()
  })
})
