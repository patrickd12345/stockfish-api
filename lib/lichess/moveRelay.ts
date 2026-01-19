import { lichessFetch } from '@/lib/lichess/apiClient'

export async function submitMove(token: string, gameId: string, uci: string): Promise<void> {
  await lichessFetch(`/api/board/game/${gameId}/move/${uci}`, {
    method: 'POST',
    token
  })
}
