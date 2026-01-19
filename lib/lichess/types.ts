export interface LichessOAuthToken {
  accessToken: string
  tokenType: string
  scope: string[]
  expiresIn?: number
  createdAt: Date
}

export interface LichessGameStartEvent {
  type: 'gameStart'
  game: {
    id: string
    opponent: {
      id?: string
      username?: string
      rating?: number
    }
    color: 'white' | 'black'
    rated: boolean
    speed: string
    perf: {
      name: string
    }
    lastMove?: string
    clock?: {
      initial: number
      increment: number
    }
  }
}

export interface LichessGameStateEvent {
  type: 'gameState'
  moves: string
  wtime: number
  btime: number
  winc: number
  binc: number
  status: string
  winner?: 'white' | 'black'
}

export interface LichessGameFinishEvent {
  type: 'gameFinish'
  game: {
    id: string
    status: string
    winner?: 'white' | 'black'
  }
}

export interface LichessChatLineEvent {
  type: 'chatLine'
  room: string
  username: string
  text: string
}

export interface LichessGameFullEvent {
  type: 'gameFull'
  state: LichessGameStateEvent
}

export type LichessStreamEvent =
  | LichessGameStartEvent
  | LichessGameStateEvent
  | LichessGameFinishEvent
  | LichessChatLineEvent
  | LichessGameFullEvent

export interface LichessBoardSession {
  id: string
  lichessUserId: string
  status: 'idle' | 'connected' | 'waiting' | 'playing' | 'finished' | 'error'
  activeGameId?: string | null
  lastEventAt?: Date | null
  lastError?: string | null
}

export interface LichessGameState {
  gameId: string
  lichessUserId: string
  moves: string
  fen: string
  status: string
  winner?: 'white' | 'black'
  wtime: number
  btime: number
  winc: number
  binc: number
  lastMoveAt?: Date | null
  lastClockUpdateAt?: Date | null
  myColor: 'white' | 'black'
  opponentName?: string | null
  opponentRating?: number | null
  initialTimeMs?: number | null
  initialIncrementMs?: number | null
  chatMessages?: Array<{
    username: string
    text: string
    room: string
    receivedAt: Date
  }>
}

export interface ClockSnapshot {
  wtime: number
  btime: number
  winc: number
  binc: number
  receivedAt: number
  activeColor: 'white' | 'black' | null
  isRunning: boolean
  lastClockUpdateAt?: string | null
}
