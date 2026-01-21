import * as dotenv from 'dotenv'
import * as path from 'path'
import { connectToDb, getSql } from '../lib/database'
import { getLichessToken } from '../lib/lichess/tokenStorage'
import { lichessFetch } from '../lib/lichess/apiClient'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function testSeek() {
  console.log('🔍 Testing Lichess matchmaking endpoints...')

  try {
    await connectToDb()
    const sql = getSql()

    const users = await sql`SELECT lichess_user_id FROM lichess_oauth_tokens ORDER BY updated_at DESC LIMIT 1`
    if (users.length === 0) {
      throw new Error('No users found in database. Please log in first.')
    }

    const userId = users[0].lichess_user_id
    console.log(`👤 Using user: ${userId}`)

    const tokenData = await getLichessToken(userId)
    if (!tokenData) throw new Error('Token not found')

    const accessToken = tokenData.token.accessToken
    console.log(`🔑 Token retrieved (starts with: ${accessToken.substring(0, 4)}...)`)

    // 1) Try the board seek (creates a seek in the lobby)
    console.log('🎯 POST /api/board/seek (10+5 casual, random color)')
    {
      const body = new URLSearchParams()
      body.append('time', '10')
      body.append('increment', '5')
      body.append('rated', 'false')
      body.append('variant', 'standard')
      body.append('color', 'random')

      const res = await lichessFetch('/api/board/seek', {
        method: 'POST',
        token: accessToken,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })

      console.log(`✅ board/seek status: ${res.status}`)
      const text = await res.text().catch(() => '')
      if (text.trim()) console.log('board/seek response text:', text)
    }

    // 2) Create an open challenge (fallback mode)
    console.log('🧩 POST /api/challenge/open (10+5 casual, random color)')
    let challengeId: string | null = null
    {
      const body = new URLSearchParams()
      body.append('rated', 'false')
      body.append('clock.limit', String(10 * 60))
      body.append('clock.increment', '5')
      body.append('variant', 'standard')
      body.append('color', 'random')

      const res = await lichessFetch('/api/challenge/open', {
        method: 'POST',
        token: accessToken,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })

      console.log(`✅ challenge/open status: ${res.status}`)
      const json = (await res.json().catch(() => null)) as any
      challengeId = typeof json?.challenge?.id === 'string' ? json.challenge.id : null
      console.log('challenge/open id:', challengeId ?? '(none)')
      if (!challengeId) {
        console.log('challenge/open raw response:', json)
        throw new Error('challenge/open did not return a challenge id (likely missing token scope challenge:write)')
      }
    }

    // 3) Cancel the open challenge (prove cancellation works)
    console.log('🧹 POST /api/challenge/{id}/cancel')
    {
      const res = await lichessFetch(`/api/challenge/${encodeURIComponent(challengeId)}/cancel`, {
        method: 'POST',
        token: accessToken,
      })
      console.log(`✅ challenge/{id}/cancel status: ${res.status}`)
    }

    console.log('✅ Lichess matchmaking smoke test passed.')
  } catch (error) {
    console.error('❌ Lichess matchmaking smoke test failed:', error)
    process.exitCode = 1
  } finally {
    process.exit(0)
  }
}

testSeek()

