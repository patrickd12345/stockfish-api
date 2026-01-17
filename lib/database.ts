import { neon } from '@neondatabase/serverless'

const POSTGRES_URL = process.env.POSTGRES_URL

if (!POSTGRES_URL) {
  console.warn('Please define the POSTGRES_URL environment variable inside .env.local')
}

let _sql: ReturnType<typeof neon> | null = null

export function getSql(): ReturnType<typeof neon> {
  if (!POSTGRES_URL) throw new Error('POSTGRES_URL is not set')
  if (!_sql) _sql = neon(POSTGRES_URL)
  return _sql
}

export function isDbConfigured(): boolean {
  return !!POSTGRES_URL
}

export async function connectToDb(): Promise<void> {
  // No-op: Neon serverless uses HTTP, no persistent connection to open
}

export async function initDb(): Promise<void> {
  await connectToDb()
}
