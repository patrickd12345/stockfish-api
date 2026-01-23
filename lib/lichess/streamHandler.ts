import { lichessFetch } from '@/lib/lichess/apiClient'
import { LichessStreamEvent, LichessGameStateEvent, LichessGameFullEvent, LichessChatLineEvent } from '@/lib/lichess/types'
import { recordGameStart, recordGameState, recordGameFinish, recordChatMessage, updateSessionError, ensureBoardSession, getSession, recordGameFull } from '@/lib/lichess/sessionManager'

const INITIAL_RECONNECT_DELAY_MS = 2000
const MAX_RECONNECT_DELAY_MS = 60000

export class BoardStreamHandler {
  private readonly token: string
  private readonly lichessUserId: string
  private abortController: AbortController | null = null
  private gameAbortController: AbortController | null = null
  private activeGameId: string | null = null
  private running = false
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS

  constructor(token: string, lichessUserId: string) {
    this.token = token
    this.lichessUserId = lichessUserId
  }

  async start(): Promise<void> {
    console.log(`[Lichess Stream] Starting stream for user ${this.lichessUserId}`)
    this.running = true
    try {
    await ensureBoardSession(this.lichessUserId)
      console.log(`[Lichess Stream] Session ensured. Connecting to stream...`)
    } catch (err) {
      console.error(`[Lichess Stream] Failed to ensure session:`, err)
      this.running = false
      return
    }

    while (this.running) {
      try {
        console.log(`[Lichess Stream] Consuming stream...`)
        await this.consumeStream()
        // If consumeStream returns normally (e.g. server closed connection), 
        // reset the delay for the next attempt.
        this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown stream error'
        const isRateLimit = message.includes('429')
        const isUnauthorized = message.includes('401')
        
        console.error(`[Lichess Stream] Error: ${message}`)
        await updateSessionError(this.lichessUserId, message)
        
        if (!this.running || isUnauthorized) {
          console.log(`[Lichess Stream] Stopping stream due to ${isUnauthorized ? 'unauthorized error' : 'request'}.`)
          this.running = false
          break
        }
        
        // Exponential backoff
        const currentDelay = this.reconnectDelay
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
        
        // If we were rate limited, maybe the user needs to wait a bit longer
        if (isRateLimit) {
          this.reconnectDelay = Math.max(this.reconnectDelay, 15000) // Increase to 15s for 429
        }

        console.log(`[Lichess Stream] Retrying in ${currentDelay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, currentDelay))
      }
    }
    console.log(`[Lichess Stream] Handler stopped.`)
  }

  stop(): void {
    this.running = false
    this.abortController?.abort()
    this.gameAbortController?.abort()
  }

  private async consumeStream(): Promise<void> {
    this.abortController = new AbortController()
    console.log(`[Lichess Stream] Connecting to Event Stream (/api/stream/event)...`)
    
    // Connect to the main event stream to detect when games start
    const response = await lichessFetch('/api/stream/event', {
      token: this.token,
      signal: this.abortController.signal
    })

    console.log(`[Lichess Stream] Connected. Status: ${response.status}`)

    if (!response.body) {
      throw new Error('Lichess stream did not provide a body')
    }

    // If we're already playing a game according to our DB, ensure we track it
    // But the event stream is the primary "keep-alive" connection
    this.resyncActiveGameState().catch(err => 
      console.warn('[Lichess Stream] Initial game sync failed:', err)
    )

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (this.running) {
      const { value, done } = await reader.read()
      if (done) {
        console.log(`[Lichess Stream] Stream closed by server.`)
        break
      }
      
      const chunk = decoder.decode(value, { stream: true })
      buffer += chunk
      
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) {
          console.log(`[Lichess Stream] Event received: ${line.substring(0, 50)}...`)
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
      console.error(`[Lichess Stream] JSON Parse Error: ${line}`, error)
      await updateSessionError(this.lichessUserId, 'Failed to parse stream event')
      return
    }

    console.log(`[Lichess Stream] Processing event type: ${event.type}`)

    switch (event.type) {
      case 'gameStart':
        console.log(`[Lichess Stream] Game start detected: ${event.game.id}`)
        await recordGameStart(this.lichessUserId, event)
        // Start streaming the actual game events (moves, chat, clocks).
        this.startGameStream(event.game.id).catch((err) =>
          console.warn('[Lichess Stream] Failed to start game stream:', err)
        )
        return
      case 'gameState':
        console.log(`[Lichess Stream] Game state update.`)
        await this.safeRecordGameState(event)
        return
      case 'gameFull':
        console.log(`[Lichess Stream] Game full state received.`)
        await recordGameFull(this.lichessUserId, event, this.activeGameId ?? undefined)
        await this.safeRecordGameState(event.state)
        return
      case 'gameFinish':
        console.log(`[Lichess Stream] Game finished.`)
        await recordGameFinish(this.lichessUserId, event)
        this.gameAbortController?.abort()
        return
      case 'chatLine':
        console.log(`[Lichess Stream] Chat received: ${event.username}: ${event.text}`)
        await recordChatMessage(this.lichessUserId, event)
        return
      default:
        console.log(`[Lichess Stream] Unhandled event type: ${(event as any).type}`)
        return
    }
  }

  private async safeRecordGameState(event: LichessGameStateEvent): Promise<void> {
    try {
      await recordGameState(this.lichessUserId, event, this.activeGameId ?? undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update game state'
      await updateSessionError(this.lichessUserId, message)
    }
  }

  private async resyncActiveGameState(): Promise<void> {
    const session = await getSession(this.lichessUserId)
    const gameId = session?.activeGameId
    if (!gameId) return
    this.startGameStream(gameId).catch((err) => console.warn('[Lichess Stream] Resync stream failed:', err))
  }

  private async startGameStream(gameId: string): Promise<void> {
    if (!this.running) return
    if (this.activeGameId === gameId && this.gameAbortController) return

    this.gameAbortController?.abort()
    this.activeGameId = gameId
    this.gameAbortController = new AbortController()

    console.log(`[Lichess Stream] Connecting to Game Stream (/api/board/game/stream/${gameId})...`)
    const response = await lichessFetch(`/api/board/game/stream/${gameId}`, {
      token: this.token,
      signal: this.gameAbortController.signal
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
        if (!line) {
          newlineIndex = buffer.indexOf('\n')
          continue
        }

        try {
          const event = JSON.parse(line) as LichessGameFullEvent | LichessGameStateEvent | LichessChatLineEvent
          if (event.type === 'gameFull') {
            await recordGameFull(this.lichessUserId, event, gameId)
            await this.safeRecordGameState(event.state)
          } else if (event.type === 'gameState') {
            await this.safeRecordGameState(event)
          } else if (event.type === 'chatLine') {
            await recordChatMessage(this.lichessUserId, event, gameId)
          }
        } catch (err) {
          console.warn('[Lichess Stream] Failed to parse game stream line:', err)
        }

        newlineIndex = buffer.indexOf('\n')
      }
    }
  }
}
