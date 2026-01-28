import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processGame } from './batchAnalysis'

describe('processGame', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    // Default mock player names
    process.env.CHESS_PLAYER_NAMES = 'hero,champion'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  function checkExclusivity(result: any) {
    const flags = [result.isWin, result.isLoss, result.isDraw, result.isUnknown]
    const trueCount = flags.filter(Boolean).length
    expect(trueCount).toBe(1)
  }

  const baseGame = {
    id: '1',
    created_at: new Date(),
    blunders: 0,
    pgn_text: '',
    my_accuracy: 80
  }

  it('identifies a win for White (1-0)', () => {
    const result = processGame({
      ...baseGame,
      white: 'Hero',
      black: 'Villain',
      result: '1-0'
    })
    expect(result.isWin).toBe(true)
    checkExclusivity(result)
  })

  it('identifies a win for Black (0-1)', () => {
    const result = processGame({
      ...baseGame,
      white: 'Villain',
      black: 'Hero',
      result: '0-1'
    })
    expect(result.isWin).toBe(true)
    checkExclusivity(result)
  })

  it('identifies a loss for White (0-1)', () => {
    const result = processGame({
      ...baseGame,
      white: 'Hero',
      black: 'Villain',
      result: '0-1'
    })
    expect(result.isLoss).toBe(true)
    checkExclusivity(result)
  })

  it('identifies a loss for Black (1-0)', () => {
    const result = processGame({
      ...baseGame,
      white: 'Villain',
      black: 'Hero',
      result: '1-0'
    })
    expect(result.isLoss).toBe(true)
    checkExclusivity(result)
  })

  it('identifies a draw (1/2-1/2)', () => {
    const result = processGame({
      ...baseGame,
      white: 'Hero',
      black: 'Villain',
      result: '1/2-1/2'
    })
    expect(result.isDraw).toBe(true)
    checkExclusivity(result)
  })

  it('handles unknown player as unknown result', () => {
    const result = processGame({
      ...baseGame,
      white: 'Stranger1',
      black: 'Stranger2',
      result: '1-0'
    })
    expect(result.isUnknown).toBe(true)
    checkExclusivity(result)
  })

  it('handles incomplete games (*) as unknown', () => {
    const result = processGame({
      ...baseGame,
      white: 'Hero',
      black: 'Villain',
      result: '*'
    })
    expect(result.isUnknown).toBe(true)
    checkExclusivity(result)
  })

  it('handles empty result as unknown', () => {
    const result = processGame({
      ...baseGame,
      white: 'Hero',
      black: 'Villain',
      result: ''
    })
    expect(result.isUnknown).toBe(true)
    checkExclusivity(result)
  })

  it('handles self-play 1-0 as Win', () => {
     // If I play myself, and 1-0 happens, white (me) won.
    const result = processGame({
      ...baseGame,
      white: 'Hero',
      black: 'Hero',
      result: '1-0'
    })
    expect(result.isWin).toBe(true)
    checkExclusivity(result)
  })

  it('handles self-play 0-1 as Win', () => {
     // If I play myself, and 0-1 happens, black (me) won.
    const result = processGame({
      ...baseGame,
      white: 'Hero',
      black: 'Hero',
      result: '0-1'
    })
    expect(result.isWin).toBe(true)
    checkExclusivity(result)
  })

})
