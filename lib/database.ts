import { neon, neonConfig, type NeonQueryFunction } from '@neondatabase/serverless'
import crypto from 'crypto'

// Next.js may cache global fetch calls in the App Router; ensure DB queries are never cached.
// This prevents stale reads between route handlers (e.g. analyze -> daily).
if (!neonConfig.fetchFunction) {
  neonConfig.fetchFunction = (input: RequestInfo | URL, init?: RequestInit) => {
    const nextInit = { ...(init || {}), cache: 'no-store' } as any
    return fetch(input as any, nextInit)
  }
}

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

function getConnectionStringSource(): 'POSTGRES_URL' | 'DATABASE_URL' | 'POSTGRES_PRISMA_URL' | 'none' {
  if (process.env.POSTGRES_URL?.trim()) return 'POSTGRES_URL'
  if (process.env.DATABASE_URL?.trim()) return 'DATABASE_URL'
  if (process.env.POSTGRES_PRISMA_URL?.trim()) return 'POSTGRES_PRISMA_URL'
  return 'none'
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

export function getDbDebugInfo(): { configured: boolean; source: string; fingerprint: string | null } {
  const cs = getConnectionString()
  if (!cs) return { configured: false, source: getConnectionStringSource(), fingerprint: null }
  const fingerprint = crypto.createHash('sha256').update(cs).digest('hex').slice(0, 10)
  return { configured: true, source: getConnectionStringSource(), fingerprint }
}

export async function connectToDb(): Promise<void> {
  // Initialize the cached client for serverless reuse.
  getSql()
}

export async function initDb(): Promise<void> {
  await connectToDb()
}

/**
 * Detect Neon DB HTTP 402 / data transfer quota errors.
 * Use to return a clear user-facing message instead of the raw NeonDbError.
 */
export function isNeonQuotaError(e: unknown): boolean {
  const msg =
    typeof e === 'object' && e !== null && 'message' in e
      ? String((e as { message?: unknown }).message)
      : String(e)
  return (
    msg.includes('402') ||
    /data transfer quota/i.test(msg) ||
    /exceeded.*quota/i.test(msg)
  )
}
