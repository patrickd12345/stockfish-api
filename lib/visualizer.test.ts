import { renderBoard } from '@/lib/visualizer'

describe('lib/visualizer', () => {
  it('renders an SVG board with default size', async () => {
    const svg = await renderBoard(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    )
    expect(svg).toContain('<svg')
    expect(svg).toContain('width="400"')
    expect(svg).toContain('height="400"')
    // Starting position should include kings and pawns
    expect(svg).toContain('♔')
    expect(svg).toContain('♚')
    expect(svg).toContain('♙')
    expect(svg).toContain('♟')
    expect(svg).toContain('</svg>')
  })

  it('respects custom size', async () => {
    const svg = await renderBoard(
      '8/8/8/8/8/8/8/4K2k w - - 0 1',
      800
    )
    expect(svg).toContain('width="800"')
    expect(svg).toContain('height="800"')
  })
})

