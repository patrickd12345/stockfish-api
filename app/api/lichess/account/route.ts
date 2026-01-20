import { NextRequest, NextResponse } from 'next/server'
import { getLichessToken } from '@/lib/lichess/tokenStorage'
import { fetchAccount } from '@/lib/lichess/account'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json(null, { status: 200 })
  }

  const stored = await getLichessToken(lichessUserId)
  if (!stored || stored.revokedAt) {
    return NextResponse.json(null, { status: 200 })
  }

  try {
    const account = await fetchAccount(stored.token.accessToken)
    return NextResponse.json(account, { status: 200 })
  } catch (error: any) {
    console.warn('[Lichess Account] Failed to fetch account:', error?.message || error)
    return NextResponse.json(null, { status: 200 })
  }
}

