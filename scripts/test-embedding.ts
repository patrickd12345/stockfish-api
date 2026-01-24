#!/usr/bin/env tsx

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { getAIGatewayConfig } from '@/lib/openaiClient'
import { getEmbedding } from '@/lib/embeddings'

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    let envRaw = fs.readFileSync(envPath, 'utf8')
    if (envRaw.charCodeAt(0) === 0xfeff) envRaw = envRaw.slice(1)
    const parsed = dotenv.parse(envRaw)
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value
    }
  } else {
    dotenv.config({ path: envPath })
  }
}

async function main() {
  loadEnvLocal()

  const cfg = getAIGatewayConfig()
  const provider =
    (process.env.OPENAI_PROVIDER || '').trim().toLowerCase() ||
    (cfg?.baseURL ? 'gateway(default)' : 'direct(default)')

  console.log('Provider:', provider)
  console.log('Model:', (process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small').trim())
  console.log('Base URL:', cfg?.baseURL || '(direct)')

  try {
    const vec = await getEmbedding('Hello from embeddings test.')
    console.log('Embedding:', vec ? `ok (len=${vec.length})` : 'null (no client/config)')
  } catch (e: any) {
    console.error('Embedding error:', e?.status || '', e?.message || e)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('Test failed:', e)
  process.exit(1)
})

