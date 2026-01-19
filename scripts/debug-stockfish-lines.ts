#!/usr/bin/env tsx

import { resolveStockfishPath, StockfishEngine } from '../lib/stockfish'

async function main() {
  const fen = process.argv[2] ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const depth = Number(process.argv[3] ?? 10)
  const enginePath = resolveStockfishPath('stockfish.exe')
  const engine = new StockfishEngine(enginePath)
  const engineAny = engine as any

  await engine.start()
  try {
    const wait = engineAny.waitFor((line: string) => line.startsWith('bestmove'), 30000)
    engineAny.send(`position fen ${fen}`)
    engineAny.send(`go depth ${depth}`)
    const lines: string[] = await wait
    console.log(lines.slice(-30).join('\n'))
  } finally {
    await engine.stop().catch(() => null)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

