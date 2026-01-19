import { lichessFetch } from '@/lib/lichess/apiClient'
import { LichessStreamEvent, LichessGameStateEvent, LichessGameFullEvent } from '@/lib/lichess/types'
import { recordGameStart, recordGameState, recordGameFinish, updateSessionError, ensureBoardSession, getSession } from '@/lib/lichess/sessionManager'

const RECONNECT_DELAY_MS = 2000

export class BoardStreamHandler {
  private readonly token: string
  private readonly lichessUserId: string
  private abortController: AbortController | null = null
  private running = false

  constructor(token: string, lichessUserId: string) {
    this.token = token
    this.lichessUserId = lichessUserId
  }

  async start(): Promise<void> {
    this.running = true
    await ensureBoardSession(this.lichessUserId)

    while (this.running) {
      try {
        await this.consumeStream()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown stream error'
        await updateSessionError(this.lichessUserId, message)
        await this.resyncActiveGameState()
        if (!this.running) break
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS))
      }
    }
  }

  stop(): void {
    this.running = false
    this.abortController?.abort()
  }

  private async consumeStream(): Promise<void> {
    this.abortController = new AbortController()
    const response = await lichessFetch('/api/board/game/stream', {
      token: this.token,
      signal: this.abortController.signal
    })

    if (!response.body) {
      throw new Error('Lichess stream did not provide a body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (this.running) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) {
          await this.handleLine(line)
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }
  }

  private async handleLine(line: string): Promise<void> {
    let event: LichessStreamEvent | null = null
    try {
      event = JSON.parse(line) as LichessStreamEvent
    } catch (error) {
      await updateSessionError(this.lichessUserId, 'Failed to parse stream event')
      return
    }

    switch (event.type) {
      case 'gameStart':
        await recordGameStart(this.lichessUserId, event)
        return
      case 'gameState':
        await this.safeRecordGameState(event)
        return
      case 'gameFull':
        await this.safeRecordGameState(event.state)
        return
      case 'gameFinish':
        await recordGameFinish(this.lichessUserId, event)
        return
      case 'chatLine':
        return
      default:
        return
    }
  }

  private async safeRecordGameState(event: LichessGameStateEvent): Promise<void> {
    try {
      await recordGameState(this.lichessUserId, event)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update game state'
      await updateSessionError(this.lichessUserId, message)
    }
  }

  private async resyncActiveGameState(): Promise<void> {
    const session = await getSession(this.lichessUserId)
    const gameId = session?.activeGameId
    if (!gameId) return

    const response = await lichessFetch(`/api/board/game/stream/${gameId}`, {
      token: this.token
    })
    if (!response.body) return

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (this.running) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) {
          try {
            const event = JSON.parse(line) as LichessGameFullEvent | LichessGameStateEvent
            if (event.type === 'gameFull') {
              await this.safeRecordGameState(event.state)
              return
            }
            if (event.type === 'gameState') {
              await this.safeRecordGameState(event)
              return
            }
          } catch {
            return
          }
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }
  }
}
