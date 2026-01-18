import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { resolveStockfishPath } from '@/lib/stockfish'

describe('lib/stockfish', () => {
  const originalPath = process.env.PATH

  afterEach(() => {
    process.env.PATH = originalPath
  })

  it('returns the provided path when it exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-'))
    const bin = path.join(dir, process.platform === 'win32' ? 'stockfish.exe' : 'stockfish')
    fs.writeFileSync(bin, '')

    try {
      expect(resolveStockfishPath(bin)).toBe(bin)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves from PATH when the binary exists there', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-path-'))
    const bin = path.join(dir, process.platform === 'win32' ? 'stockfish.exe' : 'stockfish')
    fs.writeFileSync(bin, '')

    try {
      process.env.PATH = dir
      const resolved = resolveStockfishPath('stockfish')
      expect(resolved).toBe(bin)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws when no candidate exists', () => {
    process.env.PATH = ''
    const cwd = process.cwd()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-miss-'))
    try {
      process.chdir(dir)
      expect(() => resolveStockfishPath('definitely-not-a-binary')).toThrow(
        /Stockfish binary not found/i
      )
    } finally {
      process.chdir(cwd)
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

