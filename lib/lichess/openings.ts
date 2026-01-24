/**
 * Common chess openings dictionary for fast local detection.
 * Maps FEN (position only, no move clocks/numbers) to opening name.
 */
export const COMMON_OPENINGS: Record<string, string> = {
  // King's Pawn
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR': "King's Pawn Opening",
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR': "King's Pawn Game",
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R': "King's Knight Opening",
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R': 'Italian / Ruy Lopez...',
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR': 'Vienna Game',

  // Sicilian Defense
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR': 'Sicilian Defense',
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R': 'Sicilian Defense: Open',
  'rnbqkb1r/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R': 'Sicilian Defense: 2...d6',
  'r1bqkbnr/pp2pppp/3p4/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R': 'Sicilian Defense: Open (2...d6)',
  'rnbqkb1r/pp2pppp/3p1n2/2p5/3NP3/2N5/PPP2PPP/R1BQKB1R': 'Sicilian Defense: Classical / Dragon / Najdorf...',
  'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R': 'Sicilian Defense: Najdorf Variation',
  'r1bqkb1r/pp2pp1p/2np1np1/8/3NP3/2N5/PPP2PPP/R1BQKB1R': 'Sicilian Defense: Dragon Variation',
  'r1bqkb1r/pp2pp1p/2np1np1/8/3NP3/2N5/PPP1BPPP/R1BQK2R': 'Sicilian Defense: Dragon (Classical)',
  'r1bqkb1r/pp2ppbp/2np1np1/8/3NP3/2N1B3/PPP2PPP/R2QKB1R': 'Sicilian Defense: Dragon (Yugoslav Attack)',
  'rnbqkb1r/pp2ppbp/3p1n2/2p5/3NP3/2N5/PPP2PPP/R1BQKB1R': 'Sicilian Defense: Dragon (Initial)',
  'r1bqkbnr/pp2pppp/2np4/2p5/3NP3/2N5/PPP2PPP/R1BQKB1R': 'Sicilian Defense: Classical Variation',
  'r1bqkb1r/pp1ppppp/2n2n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R': 'Sicilian Defense: Four Knights Variation',
  'rnbqkb1r/pp1ppppp/5n2/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R': 'Sicilian Defense: 2...Nf6',
  'rnbqkbnr/pp2pppp/3p4/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR': 'Sicilian Defense: Closed',
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR': 'Sicilian Defense: Closed Variation',

  // French Defense
  'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR': 'French Defense',
  'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR': 'French Defense: Normal',
  'rnbqkbnr/pppp1ppp/4p3/8/3PP3/2N5/PPP2PPP/R1BQKBNR': 'French Defense: Steinitz / Winawer / 3.Nc3',
  'rnbqkbnr/pppp1ppp/4p3/3P4/4P3/8/PPP2PPP/RNBQKBNR': 'French Defense: Advance / Exchange Variation',

  // Caro-Kann Defense
  'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR': 'Caro-Kann Defense',
  'rnbqkbnr/pp1ppppp/2p5/8/3PP3/8/PPP2PPP/RNBQKBNR': 'Caro-Kann Defense: Normal',
  'rnbqkbnr/pp1ppppp/2p5/8/3PP3/2N5/PPP2PPP/R1BQKBNR': 'Caro-Kann Defense: Main Line (3.Nc3)',
  'rnbqkbnr/pp1ppppp/2p5/3P4/4P3/8/PPP2PPP/RNBQKBNR': 'Caro-Kann Defense: Advance / Exchange Variation',

  // Ruy Lopez Variations
  'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R': 'Ruy Lopez',
  'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R': 'Ruy Lopez: Morphy Defense',
  'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/3PP3/5N2/PPP2PPP/RNBQK2R': 'Ruy Lopez: Morphy Defense (Open)',

  // Italian Game Variations
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R': 'Italian Game',
  'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R': 'Italian Game: Giuoco Piano',
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R': 'Italian Game: Two Knights Defense',

  // Queen's Gambit
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR': "Queen's Pawn Opening",
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR': "Queen's Gambit / Slav...",
  'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR': "Queen's Gambit",
  'rnbqkbnr/pp2pppp/8/2pp4/2PP4/8/PP2PPPP/RNBQKBNR': 'Queen\'s Gambit: Slav Defense',
  'rnbqkbnr/ppp1pppp/8/3p4/2PP4/5N2/PP2PPPP/RNBQKB1R': "Queen's Gambit Declined",
  'rnbqkbnr/pp2pppp/8/2pp4/2PP4/5N2/PP2PPPP/RNBQKB1R': 'Queen\'s Gambit: Semi-Slav Defense',

  // Other Common Openings
  'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR': 'English Opening',
  'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R': 'Reti Opening',
  'rnbqkbnr/pppp1ppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR': 'Scandinavian Defense',
  'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR': "Alekhine's Defense",
  'rnbqkbnr/ppp1pppp/3p4/8/4P3/8/PPPP1PPP/RNBQKBNR': 'Pirc Defense',
  'rnbqkbnr/pppppp1p/6p1/8/4P3/8/PPPP1PPP/RNBQKBNR': 'Modern Defense',
}

/**
 * Normalizes a FEN string to just the board position.
 */
export function normalizeFen(fen: string): string {
  return fen.split(' ')[0]
}

/**
 * Attempts to identify an opening name from a FEN string.
 */
export function identifyOpening(fen: string): string | null {
  if (!fen) return null
  const pos = normalizeFen(fen)
  return COMMON_OPENINGS[pos] || null
}

import { Chess } from 'chess.js'

/**
 * Replays moves and returns the furthest recognized opening name.
 */
export function detectFurthestOpening(movesUci: string): string | null {
  if (!movesUci.trim()) return null
  const tokens = movesUci.trim().split(/\s+/).filter(Boolean)
  const chess = new Chess()
  let furthestOpening: string | null = null

  // Check start position
  const startOpening = identifyOpening(chess.fen())
  if (startOpening) furthestOpening = startOpening

  for (const token of tokens) {
    try {
      const move = chess.move(token, { strict: false })
      if (!move) break
      
      const currentOpening = identifyOpening(chess.fen())
      if (currentOpening) {
        furthestOpening = currentOpening
      }
    } catch {
      break
    }
  }

  return furthestOpening
}
