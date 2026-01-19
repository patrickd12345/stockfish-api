import * as dotenv from 'dotenv'
import * as path from 'path'
import { connectToDb, getSql } from '../lib/database'
import { getLichessToken } from '../lib/lichess/tokenStorage'
import { lichessFetch } from '../lib/lichess/apiClient'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function testStream() {
  console.log('🔍 Testing Lichess Stream Connection...')
  
  try {
    await connectToDb()
    const sql = getSql()
    
    // 1. Get the most recent user token
    const users = await sql`SELECT lichess_user_id FROM lichess_oauth_tokens ORDER BY updated_at DESC LIMIT 1`
    if (users.length === 0) {
      throw new Error('No users found in database. Please log in first.')
    }
    
    const userId = users[0].lichess_user_id
    console.log(`👤 Using user: ${userId}`)
    
    const tokenData = await getLichessToken(userId)
    if (!tokenData) throw new Error('Token not found')
    
    console.log(`🔑 Token retrieved (starts with: ${tokenData.token.accessToken.substring(0, 4)}...)`)

    // 2. Open Stream
    console.log('📡 Connecting to Lichess Event Stream...')
    const response = await lichessFetch('/api/stream/event', {
      token: tokenData.token.accessToken
    })
    
    console.log(`✅ Connection Status: ${response.status}`)
    
    if (!response.body) throw new Error('No body in response')
    
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    
    console.log('👂 Listening for events (press Ctrl+C to stop)...')
    
    // Read a few chunks to verify flow
    for (let i = 0; i < 3; i++) {
      const { value, done } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      if (text.trim()) {
        console.log(`📦 Chunk ${i + 1}:`, text)
      } else {
        console.log(`💓 Heartbeat`)
      }
    }
    
    console.log('✅ Stream test successful (received data)')
    
  } catch (error) {
    console.error('❌ Stream test failed:', error)
  } finally {
    process.exit(0)
  }
}

testStream()
