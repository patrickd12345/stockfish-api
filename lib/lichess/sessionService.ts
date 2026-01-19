import { getLichessToken } from '@/lib/lichess/tokenStorage'
import { BoardStreamHandler } from '@/lib/lichess/streamHandler'
import { getStreamHandler, registerStreamHandler, removeStreamHandler } from '@/lib/lichess/streamRegistry'
import { updateSessionError } from '@/lib/lichess/sessionManager'

export async function startBoardSession(lichessUserId: string): Promise<void> {
  const existing = getStreamHandler(lichessUserId)
  if (existing) return

  const stored = await getLichessToken(lichessUserId)
  if (!stored || stored.revokedAt) {
    await updateSessionError(lichessUserId, 'Missing or revoked token')
    throw new Error('Missing or revoked token')
  }

  const handler = new BoardStreamHandler(stored.token.accessToken, lichessUserId)
  registerStreamHandler(lichessUserId, handler)
  handler.start().catch((error) => {
    updateSessionError(lichessUserId, error instanceof Error ? error.message : 'Stream error').catch(() => null)
  })
}

export function stopBoardSession(lichessUserId: string): void {
  const handler = getStreamHandler(lichessUserId)
  if (!handler) return
  handler.stop()
  removeStreamHandler(lichessUserId)
}
