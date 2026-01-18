import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

/**
 * Resolve database connection string from multiple possible environment variable names.
 * Checks in order: POSTGRES_URL, DATABASE_URL, POSTGRES_PRISMA_URL
 */
function getConnectionString(): string | null {
  return (
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    null
  )
}

const CONNECTION_STRING = getConnectionString()

if (!CONNECTION_STRING) {
  console.warn('No database connection string found. Please define one of: POSTGRES_URL, DATABASE_URL, or POSTGRES_PRISMA_URL in .env.local')
}

type SqlClient = NeonQueryFunction<false, false>

let _sql: SqlClient | null = null

export function getSql(): SqlClient {
  const connectionString = getConnectionString()
  if (!connectionString) {
    throw new Error('No database connection string found. Please set one of: POSTGRES_URL, DATABASE_URL, or POSTGRES_PRISMA_URL')
  }
  if (!_sql) _sql = neon<false, false>(connectionString)
  return _sql
}

export function isDbConfigured(): boolean {
  return !!getConnectionString()
}

export async function connectToDb(): Promise<void> {
  // Initialize the cached client for serverless reuse.
  getSql()
}

export async function initDb(): Promise<void> {
  await connectToDb()
}
