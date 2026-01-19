import { BoardStreamHandler } from '@/lib/lichess/streamHandler'

type HandlerMap = Map<string, BoardStreamHandler>

function getRegistry(): HandlerMap {
  const globalAny = globalThis as { __lichessStreamRegistry?: HandlerMap }
  if (!globalAny.__lichessStreamRegistry) {
    globalAny.__lichessStreamRegistry = new Map()
  }
  return globalAny.__lichessStreamRegistry
}

export function getStreamHandler(lichessUserId: string): BoardStreamHandler | undefined {
  return getRegistry().get(lichessUserId)
}

export function registerStreamHandler(lichessUserId: string, handler: BoardStreamHandler): void {
  getRegistry().set(lichessUserId, handler)
}

export function removeStreamHandler(lichessUserId: string): void {
  getRegistry().delete(lichessUserId)
}
