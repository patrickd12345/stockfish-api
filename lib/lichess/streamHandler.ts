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
  private streamConnected = false
  private gameStartPromiseResolvers: Array<{ resolve: (gameId: string) => void; reject: (error: Error) => void }> = []

  constructor(token: string, lichessUserId: string) {
    this.token = token
    this.lichessUserId = lichessUserId
  }

  /**
   * Wait for a gameStart event. Returns a promise that resolves with the gameId when a match is found.
   * @param timeoutMs Maximum time to wait in milliseconds (default: 60000 = 60 seconds)
   */
  async waitForGameStart(timeoutMs: number = 60000): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.gameStartPromiseResolvers = this.gameStartPromiseResolvers.filter(r => r.resolve !== resolve)
        reject(new Error(`Timeout waiting for game start after ${timeoutMs}ms`))
      }, timeoutMs)
      
      this.gameStartPromiseResolvers.push({
        resolve: (gameId: string) => {
          clearTimeout(timeout)
          resolve(gameId)
        },
        reject: (error: Error) => {
          clearTimeout(timeout)
          reject(error)
        }
      })
    })
  }

  isStreamConnected(): boolean {
    return this.streamConnected && this.running
  }

  async waitForConnection(timeoutMs: number = 5000): Promise<boolean> {
    if (this.isStreamConnected()) return true
    
    const startTime = Date.now()
    while (Date.now() - startTime < timeoutMs) {
      if (this.isStreamConnected()) return true
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return this.isStreamConnected()
  }

  async start(): Promise<void> {
    // Only log stream start once, not on every retry
    if (!this.running) {
      console.log(`[Lichess Stream] Starting stream for user ${this.lichessUserId}`)
    }
    this.running = true
    this.streamConnected = false
    
    try {
    await ensureBoardSession(this.lichessUserId)
    } catch (err) {
      console.error(`[Lichess Stream] Failed to ensure session:`, err)
      this.running = false
      return
    }

    while (this.running) {
      try {
        await this.consumeStream()
        // If consumeStream returns normally (e.g. server closed connection), 
        // reset the delay for the next attempt.
        this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS
        this.streamConnected = false
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown stream error'
        const isRateLimit = message.includes('429')
        const isUnauthorized = message.includes('401')
        
        console.error(`[Lichess Stream] Error: ${message}`)
        await updateSessionError(this.lichessUserId, message)
        
        this.streamConnected = false
        
        // Only reject waitForGameStart promises on fatal errors (401 unauthorized)
        // Rate limit errors (429) are temporary and shouldn't cancel pending seeks
        if (isUnauthorized) {
          const resolvers = [...this.gameStartPromiseResolvers]
          this.gameStartPromiseResolvers = []
          resolvers.forEach(r => r.reject(new Error(message)))
        }
        // For rate limits (429), keep the promises pending - the seek is still active
        // and we'll reconnect and potentially receive the gameStart event
        
        if (!this.running || isUnauthorized) {
          console.log(`[Lichess Stream] Stopping stream due to ${isUnauthorized ? 'unauthorized error' : 'request'}.`)
          this.running = false
          // Reject any remaining promises when stopping
          if (!this.running) {
            const resolvers = [...this.gameStartPromiseResolvers]
            this.gameStartPromiseResolvers = []
            resolvers.forEach(r => r.reject(new Error('Stream stopped')))
          }
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
    this.streamConnected = false
    this.abortController?.abort()
    this.gameAbortController?.abort()
  }

  private async consumeStream(): Promise<void> {
    this.abortController = new AbortController()
    this.streamConnected = false
    // Connection logs only in debug mode - too verbose for normal operation
    
    // Connect to the main event stream to detect when games start
    const response = await lichessFetch('/api/stream/event', {
      token: this.token,
      signal: this.abortController.signal
    })

    // Only log connection errors, not successful connections
    if (!response.ok) {
      console.error(`[Lichess Stream] Connection failed. Status: ${response.status}`)
    }

    if (!response.body) {
      throw new Error('Lichess stream did not provide a body')
    }

    // Mark as connected once we have a valid response body
    this.streamConnected = true

    // If we're already playing a game according to our DB, ensure we track it
    // But the event stream is the primary "keep-alive" connection
    this.resyncActiveGameState().catch(err => 
      console.warn('[Lichess Stream] Initial game sync failed:', err)
    )

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (this.running) {
      try {
        const { value, done } = await reader.read()
        if (done) {
          console.log(`[Lichess Stream] Stream closed by server (done=true)`)
          break
        }
        
        if (!value || value.length === 0) {
          // Keep-alive ping - no need to log
          continue
        }
        
        const chunk = decoder.decode(value, { stream: true })
        // Only log chunks in debug mode or if they contain actual events
        buffer += chunk
        
        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          if (line) {
            // Only log actual events, not keep-alive pings
            await this.handleLine(line)
          }
          // Empty lines are keep-alive pings - no need to log
          newlineIndex = buffer.indexOf('\n')
        }
      } catch (readError) {
        console.error(`[Lichess Stream] Error reading from stream:`, readError)
        throw readError
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

    // Only log important events, not every event type
    switch (event.type) {
      case 'gameStart':
        console.log(`[Lichess Stream] Game start detected: ${event.game.id}`)
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/lichess/streamHandler.ts:178',message:'GameStart event received',data:{gameId:event.game.id,color:event.game.color,opponent:event.game.opponent?.username,rated:event.game.rated,timeControl:event.game.clock},timestamp:Date.now(),sessionId:'debug-session',runId:'debug-test'})}).catch(()=>{});
        // #endregion
        await recordGameStart(this.lichessUserId, event)
        // Resolve any pending waitForGameStart promises
        const resolvers = [...this.gameStartPromiseResolvers]
        this.gameStartPromiseResolvers = []
        resolvers.forEach(r => r.resolve(event.game.id))
        // Start streaming the actual game events (moves, chat, clocks).
        this.startGameStream(event.game.id).catch((err) =>
          console.warn('[Lichess Stream] Failed to start game stream:', err)
        )
        return
      case 'gameState':
        // Game state updates are frequent - only log errors
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
        // Chat messages are frequent - only log in debug mode
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

    // Game stream connection - only log errors
    const response = await lichessFetch(`/api/board/game/stream/${gameId}`, {
      token: this.token,
      signal: this.gameAbortController.signal
    })
    if (!response.body) {
      console.warn(`[Lichess Stream] Game stream ${gameId} did not provide a body`)
      return
    }
    if (!response.ok) {
      console.error(`[Lichess Stream] Game stream ${gameId} connection failed. Status: ${response.status}`)
      return
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
            // Chat messages are frequent - only log in debug mode
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
