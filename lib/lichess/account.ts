import { lichessFetch } from '@/lib/lichess/apiClient'

export interface LichessAccount {
  id: string
  username: string
  perfs?: Record<string, unknown>
}

export async function fetchAccount(token: string): Promise<LichessAccount> {
  const response = await lichessFetch('/api/account', { token })
  return (await response.json()) as LichessAccount
}
