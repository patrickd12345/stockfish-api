import { getLichessToken } from '@/lib/lichess/tokenStorage'
import { BoardStreamHandler } from '@/lib/lichess/streamHandler'
import { getStreamHandler, registerStreamHandler, removeStreamHandler } from '@/lib/lichess/streamRegistry'
import { updateSessionError } from '@/lib/lichess/sessionManager'

export async function startBoardSession(lichessUserId: string, waitForConnection: boolean = false): Promise<void> {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/lichess/sessionService.ts:6',message:'startBoardSession called',data:{lichessUserId,waitForConnection},timestamp:Date.now(),sessionId:'debug-session',runId:'debug-test'})}).catch(()=>{});
  // #endregion
  const existing = getStreamHandler(lichessUserId)
  if (existing) {
    // Only log if this is a new request (not just polling)
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/lichess/sessionService.ts:9',message:'Stream handler exists',data:{lichessUserId,isConnected:existing.isStreamConnected()},timestamp:Date.now(),sessionId:'debug-session',runId:'debug-test'})}).catch(()=>{});
    // #endregion
    // If we need to wait for connection and it's not connected, wait a bit
    if (waitForConnection && !existing.isStreamConnected()) {
      console.log(`[Lichess Session] Waiting for stream connection...`)
      const connected = await existing.waitForConnection(3000)
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/lichess/sessionService.ts:13',message:'Connection wait result',data:{lichessUserId,connected},timestamp:Date.now(),sessionId:'debug-session',runId:'debug-test'})}).catch(()=>{});
      // #endregion
      if (!connected) {
        console.warn(`[Lichess Session] Stream not connected after wait, but continuing`)
      }
    }
    return
  }

  const stored = await getLichessToken(lichessUserId)
  if (!stored || stored.revokedAt) {
    await updateSessionError(lichessUserId, 'Missing or revoked token')
    throw new Error('Missing or revoked token')
  }

  console.log(`[Lichess Session] Creating new stream handler for user ${lichessUserId}`)
  const handler = new BoardStreamHandler(stored.token.accessToken, lichessUserId)
  registerStreamHandler(lichessUserId, handler)
  const startPromise = handler.start().catch((error) => {
    console.error(`[Lichess Session] Stream handler failed to start:`, error)
    updateSessionError(lichessUserId, error instanceof Error ? error.message : 'Stream error').catch(() => null)
  })
  
  if (waitForConnection) {
    // Wait a short time for the stream to connect
    await Promise.race([
      startPromise.then(() => handler.waitForConnection(2000)),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000))
    ])
  }
}

export function stopBoardSession(lichessUserId: string): void {
  const handler = getStreamHandler(lichessUserId)
  if (!handler) return
  handler.stop()
  removeStreamHandler(lichessUserId)
}
