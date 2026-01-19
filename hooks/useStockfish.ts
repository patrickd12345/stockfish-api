import { useEffect, useRef, useState, useCallback } from 'react'

export interface StockfishState {
  isReady: boolean
  evaluation: number | null // centipawns (positive = white advantage)
  mate: number | null // moves to mate (positive = white wins)
  depth: number
  bestLine: string | null
  bestMove: string | null
  isSearching: boolean
}

interface UseStockfishOptions {
  depth?: number
  lines?: number
}

export function useStockfish({ depth = 18, lines = 1 }: UseStockfishOptions = {}) {
  const workerRef = useRef<Worker | null>(null)
  const [state, setState] = useState<StockfishState>({
    isReady: false,
    evaluation: null,
    mate: null,
    depth: 0,
    bestLine: null,
    bestMove: null,
    isSearching: false,
  })

  const turnRef = useRef<'w' | 'b'>('w')

  // Initialize worker
  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return

    const worker = new Worker('/stockfish.js')
    workerRef.current = worker

    worker.onmessage = (e) => {
      const line = e.data

      if (line === 'uciok') {
        // console.log('Stockfish: uciok')
      } else if (line === 'readyok') {
        setState((s) => ({ ...s, isReady: true }))
      } else if (line.startsWith('info')) {
        parseInfoLine(line)
      } else if (line.startsWith('bestmove')) {
        const parts = line.split(' ')
        const bestMove = parts[1]
        setState((s) => ({ ...s, bestMove, isSearching: false }))
      }
    }

    worker.postMessage('uci')
    worker.postMessage('isready')

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const parseInfoLine = (line: string) => {
    // Example: info depth 10 seldepth 14 multipv 1 score cp 45 nodes 1234 nps 5678 tbhits 0 time 123 pv e2e4 e7e5

    // Extract Depth
    const depthMatch = line.match(/depth\s+(\d+)/)
    const currentDepth = depthMatch ? parseInt(depthMatch[1], 10) : 0

    // Extract Score
    let evaluation: number | null = null
    let mate: number | null = null

    const cpMatch = line.match(/score\s+cp\s+(-?\d+)/)
    const mateMatch = line.match(/score\s+mate\s+(-?\d+)/)

    if (cpMatch) {
      // UCI reports score from the engine's point of view (side to move)
      const rawScore = parseInt(cpMatch[1], 10)
      // Normalize to "White's perspective"
      evaluation = turnRef.current === 'w' ? rawScore : -rawScore
    } else if (mateMatch) {
      const rawMate = parseInt(mateMatch[1], 10)
      // Normalize to "White's perspective"
      mate = turnRef.current === 'w' ? rawMate : -rawMate
    }

    // Extract PV (Principal Variation)
    const pvIndex = line.indexOf(' pv ')
    let bestLine = null
    if (pvIndex !== -1) {
      bestLine = line.substring(pvIndex + 4).trim()
    }

    // Only update state if we have relevant info
    if (currentDepth > 0 || evaluation !== null || mate !== null || bestLine) {
      setState((s) => ({
        ...s,
        depth: currentDepth || s.depth,
        evaluation: evaluation !== null ? evaluation : s.evaluation,
        mate: mate !== null ? mate : s.mate,
        bestLine: bestLine || s.bestLine,
        isSearching: true,
      }))
    }
  }

  const startAnalysis = useCallback((fen: string, turn: 'w' | 'b') => {
    if (!workerRef.current) return

    turnRef.current = turn

    // Stop any previous search
    workerRef.current.postMessage('stop')

    // Reset ephemeral state
    setState((s) => ({
      ...s,
      evaluation: null,
      mate: null,
      depth: 0,
      bestLine: null,
      bestMove: null,
      isSearching: true,
    }))

    // Setup position
    workerRef.current.postMessage(`position fen ${fen} ${turn === 'w' ? 'w' : 'b'}`)

    // Go!
    workerRef.current.postMessage(`go depth ${depth}`)
  }, [depth])

  const stopAnalysis = useCallback(() => {
    workerRef.current?.postMessage('stop')
    setState((s) => ({ ...s, isSearching: false }))
  }, [])

  return {
    state,
    startAnalysis,
    stopAnalysis,
    worker: workerRef.current
  }
}
