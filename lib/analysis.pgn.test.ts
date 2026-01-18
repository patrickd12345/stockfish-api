import { parsePgnWithoutEngine } from '@/lib/analysis'

describe('lib/analysis PGN parsing', () => {
  it('returns empty array for empty input', async () => {
    await expect(parsePgnWithoutEngine('')).resolves.toEqual([])
  })

  it('parses headers without moves into a game with empty moves', async () => {
    const pgn = [
      '[Event "Header Only"]',
      '[White "Alice"]',
      '[Black "Bob"]',
      '[Result "*"]',
      '',
      '*',
    ].join('\n')

    const result = await parsePgnWithoutEngine(pgn)
    expect(result).toHaveLength(1)
    expect(result[0].moves).toEqual([])
  })

  it('handles garbage input without throwing', async () => {
    await expect(parsePgnWithoutEngine('not a pgn at all')).resolves.toEqual([])
  })

  it('parses games with massive comments', async () => {
    const comment = 'a'.repeat(5000)
    const pgn = [
      '[Event "Comment Stress"]',
      '[White "Alice"]',
      '[Black "Bob"]',
      '[Result "1-0"]',
      '',
      `1. e4 {${comment}} e5 2. Nf3 Nc6 1-0`,
    ].join('\n')

    const result = await parsePgnWithoutEngine(pgn)
    expect(result).toHaveLength(1)
    expect(result[0].moves).toHaveLength(4)
  })
})
