import { describe, it, expect } from 'vitest'
import {
  detectBlunders,
  classifyPhase,
  classifyTheme,
  aggregateBlunders,
  BlunderTheme,
  GamePhase,
  type BlunderDetail,
  type BlunderEvent,
} from './blunderDnaV1'

describe('blunderDnaV1', () => {
  describe('classifyPhase', () => {
    it('classifies opening correctly', () => {
      expect(classifyPhase(1)).toBe(GamePhase.OPENING)
      expect(classifyPhase(15)).toBe(GamePhase.OPENING)
    })
    
    it('classifies middlegame correctly', () => {
      expect(classifyPhase(16)).toBe(GamePhase.MIDDLEGAME)
      expect(classifyPhase(30)).toBe(GamePhase.MIDDLEGAME)
    })
    
    it('classifies endgame correctly', () => {
      expect(classifyPhase(31)).toBe(GamePhase.ENDGAME)
      expect(classifyPhase(100)).toBe(GamePhase.ENDGAME)
    })
  })
  
  describe('classifyTheme', () => {
    it('classifies unsafe king for mate positions', () => {
      const blunder: BlunderDetail = {
        moveNumber: 10,
        ply: 20,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        playedMove: 'e4',
        bestMove: 'e5',
        evalBefore: 95000,
        evalAfter: 0,
        bestEval: 95000,
        centipawnLoss: 95000,
      }
      expect(classifyTheme(blunder)).toBe(BlunderTheme.UNSAFE_KING)
    })
    
    it('classifies bad capture', () => {
      const blunder: BlunderDetail = {
        moveNumber: 10,
        ply: 20,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        playedMove: 'Bxe5',
        bestMove: 'Nf3',
        evalBefore: 50,
        evalAfter: -200,
        bestEval: 50,
        centipawnLoss: 250,
      }
      expect(classifyTheme(blunder)).toBe(BlunderTheme.BAD_CAPTURE)
    })
    
    it('classifies missed win', () => {
      const blunder: BlunderDetail = {
        moveNumber: 10,
        ply: 20,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        playedMove: 'e4',
        bestMove: 'Nf3',
        evalBefore: 300,
        evalAfter: 100,
        bestEval: 300,
        centipawnLoss: 200,
      }
      expect(classifyTheme(blunder)).toBe(BlunderTheme.MISSED_WIN)
    })
    
    it('classifies missed threat', () => {
      const blunder: BlunderDetail = {
        moveNumber: 10,
        ply: 20,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        playedMove: 'e4',
        bestMove: 'Nf3',
        evalBefore: 0,
        evalAfter: -200,
        bestEval: 0,
        centipawnLoss: 200,
      }
      expect(classifyTheme(blunder)).toBe(BlunderTheme.MISSED_THREAT)
    })
    
    it('classifies hanging piece for large losses', () => {
      const blunder: BlunderDetail = {
        moveNumber: 10,
        ply: 20,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        playedMove: 'e4',
        bestMove: 'Nf3',
        evalBefore: 0,
        evalAfter: -400,
        bestEval: 0,
        centipawnLoss: 400,
      }
      expect(classifyTheme(blunder)).toBe(BlunderTheme.HANGING_PIECE)
    })
  })
  
  describe('detectBlunders', () => {
    it('filters blunders by threshold', () => {
      const blunders: BlunderDetail[] = [
        {
          moveNumber: 10,
          ply: 20,
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          playedMove: 'e4',
          bestMove: 'Nf3',
          evalBefore: 0,
          evalAfter: -100,
          bestEval: 0,
          centipawnLoss: 100, // Below threshold
        },
        {
          moveNumber: 11,
          ply: 22,
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          playedMove: 'e5',
          bestMove: 'Nf3',
          evalBefore: 0,
          evalAfter: -200,
          bestEval: 0,
          centipawnLoss: 200, // Above threshold
        },
      ]
      
      const events = detectBlunders(blunders, 'game1')
      expect(events.length).toBe(1)
      expect(events[0].centipawnLoss).toBe(200)
      expect(events[0].gameId).toBe('game1')
    })
  })
  
  describe('aggregateBlunders', () => {
    it('aggregates by theme and phase', () => {
      const events: BlunderEvent[] = [
        {
          gameId: 'game1',
          moveNumber: 10,
          ply: 20,
          centipawnLoss: 200,
          evalBefore: 0,
          evalAfter: -200,
          theme: BlunderTheme.MISSED_THREAT,
          phase: GamePhase.OPENING,
        },
        {
          gameId: 'game1',
          moveNumber: 12,
          ply: 24,
          centipawnLoss: 250,
          evalBefore: 0,
          evalAfter: -250,
          theme: BlunderTheme.MISSED_THREAT,
          phase: GamePhase.OPENING,
        },
        {
          gameId: 'game2',
          moveNumber: 20,
          ply: 40,
          centipawnLoss: 300,
          evalBefore: 0,
          evalAfter: -300,
          theme: BlunderTheme.HANGING_PIECE,
          phase: GamePhase.MIDDLEGAME,
        },
      ]
      
      const patterns = aggregateBlunders(events)
      
      expect(patterns.length).toBe(2)
      
      const openingMissedThreat = patterns.find(p => p.theme === BlunderTheme.MISSED_THREAT && p.phase === GamePhase.OPENING)
      expect(openingMissedThreat).toBeDefined()
      expect(openingMissedThreat?.count).toBe(2)
      expect(openingMissedThreat?.avgCentipawnLoss).toBe(225)
      expect(openingMissedThreat?.exampleGameIds).toContain('game1')
      
      const middlegameHanging = patterns.find(p => p.theme === BlunderTheme.HANGING_PIECE && p.phase === GamePhase.MIDDLEGAME)
      expect(middlegameHanging).toBeDefined()
      expect(middlegameHanging?.count).toBe(1)
      expect(middlegameHanging?.avgCentipawnLoss).toBe(300)
      expect(middlegameHanging?.exampleGameIds).toContain('game2')
    })
    
    it('limits example game IDs to 5', () => {
      const events: BlunderEvent[] = []
      for (let i = 0; i < 10; i++) {
        events.push({
          gameId: `game${i}`,
          moveNumber: 10,
          ply: 20,
          centipawnLoss: 200,
          evalBefore: 0,
          evalAfter: -200,
          theme: BlunderTheme.MISSED_THREAT,
          phase: GamePhase.OPENING,
        })
      }
      
      const patterns = aggregateBlunders(events)
      expect(patterns.length).toBe(1)
      expect(patterns[0].exampleGameIds.length).toBe(5)
    })
  })
})
