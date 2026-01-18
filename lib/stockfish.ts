import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import readline from 'readline'
import fs from 'fs'
import path from 'path'

const MATE_SCORE = 100000
const DEFAULT_MOVE_TIME_MS = 100

type Waiter = {
  predicate: (line: string) => boolean
  resolve: (lines: string[]) => void
  reject: (err: Error) => void
  lines: string[]
  timeoutId: NodeJS.Timeout
}

export function resolveStockfishPath(stockfishPath: string): string {
  const candidates = [
    stockfishPath,
    './stockfish',
    'stockfish',
    process.platform === 'win32' ? 'stockfish.exe' : '',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (!candidate) continue
    if (fs.existsSync(candidate)) {
      return candidate
    }
    const resolved = resolveFromPath(candidate)
    if (resolved) return resolved
  }

  throw new Error('Stockfish binary not found. Provide a valid path.')
}

function resolveFromPath(command: string): string | null {
  const pathEntries = (process.env.PATH || '').split(path.delimiter)
  for (const entry of pathEntries) {
    const full = path.join(entry, command)
    if (fs.existsSync(full)) return full
    if (process.platform === 'win32' && fs.existsSync(`${full}.exe`)) {
      return `${full}.exe`
    }
  }
  return null
}

export class StockfishEngine {
  private proc: ChildProcessWithoutNullStreams | null = null
  private rl: readline.Interface | null = null
  private waiter: Waiter | null = null
  private readonly moveTimeMs: number

  constructor(
    private readonly enginePath: string,
    moveTimeMs?: number
  ) {
    this.moveTimeMs = moveTimeMs ?? DEFAULT_MOVE_TIME_MS
  }

  async start(): Promise<void> {
    this.proc = spawn(this.enginePath, [], { stdio: 'pipe' })
    this.rl = readline.createInterface({ input: this.proc.stdout })
    this.rl.on('line', line => this.handleLine(line))
    this.proc.on('error', err => this.rejectWaiter(err))
    this.proc.on('exit', () => this.rejectWaiter(new Error('Stockfish exited')))

    await this.sendAndWait('uci', line => line === 'uciok', 5000)
    await this.isReady()
    this.send('ucinewgame')
    await this.isReady()
  }

  async stop(): Promise<void> {
    if (this.proc) {
      this.send('quit')
      this.proc.kill()
    }
    this.rl?.close()
    this.proc = null
    this.rl = null
    this.waiter = null
  }

  async evaluate(fen: string, sideToMove: 'w' | 'b'): Promise<number> {
    const wait = this.waitFor(line => line.startsWith('bestmove'), 10000)
    this.send(`position fen ${fen}`)
    this.send(`go movetime ${this.moveTimeMs}`)
    const lines = await wait
    const score = parseScore(lines)
    return sideToMove === 'b' ? -score : score
  }

  private async isReady(): Promise<void> {
    await this.sendAndWait('isready', line => line === 'readyok', 5000)
  }

  private send(command: string): void {
    if (!this.proc?.stdin) {
      throw new Error('Stockfish process is not available')
    }
    this.proc.stdin.write(`${command}\n`)
  }

  private waitFor(
    predicate: (line: string) => boolean,
    timeoutMs: number
  ): Promise<string[]> {
    if (this.waiter) {
      return Promise.reject(new Error('Stockfish wait already in progress'))
    }
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.rejectWaiter(new Error('Stockfish response timed out'))
      }, timeoutMs)
      this.waiter = { predicate, resolve, reject, lines: [], timeoutId }
    })
  }

  private async sendAndWait(
    command: string,
    predicate: (line: string) => boolean,
    timeoutMs: number
  ): Promise<string[]> {
    const wait = this.waitFor(predicate, timeoutMs)
    this.send(command)
    return wait
  }

  private handleLine(line: string): void {
    if (!this.waiter) return
    this.waiter.lines.push(line)
    if (this.waiter.predicate(line)) {
      clearTimeout(this.waiter.timeoutId)
      const lines = this.waiter.lines
      const resolve = this.waiter.resolve
      this.waiter = null
      resolve(lines)
    }
  }

  private rejectWaiter(err: Error): void {
    if (!this.waiter) return
    clearTimeout(this.waiter.timeoutId)
    const reject = this.waiter.reject
    this.waiter = null
    reject(err)
  }
}

function parseScore(lines: string[]): number {
  let lastScore: number | null = null
  for (const line of lines) {
    const cpMatch = line.match(/score\s+cp\s+(-?\d+)/)
    if (cpMatch) {
      lastScore = parseInt(cpMatch[1], 10)
      continue
    }
    const mateMatch = line.match(/score\s+mate\s+(-?\d+)/)
    if (mateMatch) {
      const mate = parseInt(mateMatch[1], 10)
      lastScore = mate > 0 ? MATE_SCORE : -MATE_SCORE
    }
  }
  return lastScore ?? 0
}
