import { neon, neonConfig, type NeonQueryFunction } from '@neondatabase/serverless'
import { Pool, type QueryResult } from 'pg'
import crypto from 'crypto'
import { getRuntimeCapabilitiesSync } from './runtimeCapabilities'

// Next.js may cache global fetch calls in the App Router; ensure DB queries are never cached.
// This prevents stale reads between route handlers (e.g., analyze -> daily).
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

/**
 * Determines if the connection string points to a local database
 */
function isLocalConnection(connectionString: string): boolean {
  // Check explicit override first
  if (process.env.LOCAL_DB === 'true') {
    return false // LOCAL_DB=true means "allow hosted DB", so this is NOT local
  }
  
  try {
    const url = new URL(connectionString)
    const hostname = url.hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    // If URL parsing fails, check for localhost in string
    return /localhost|127\.0\.0\.1|::1/.test(connectionString)
  }
}

/**
 * SQL client interface - compatible with both Neon and pg drivers
 */
type SqlClient = {
  (strings: TemplateStringsArray, ...values: any[]): Promise<any[]>
}

let _sql: SqlClient | null = null
let _pgPool: Pool | null = null
let _driverType: 'neon' | 'pg' | null = null
let hostedDbGuardChecked = false

/**
 * Reset the hosted DB guard check for testing
 * @internal - Only for test use
 */
export function resetHostedDbGuard(): void {
  hostedDbGuardChecked = false
}

/**
 * Creates a pg Pool-based SQL client wrapper
 * Converts tagged template literals to pg query format
 */
function createPgSqlClient(pool: Pool): SqlClient {
  return async (strings: TemplateStringsArray, ...values: any[]): Promise<any[]> => {
    // Convert tagged template literal to SQL query string
    let queryText = ''
    for (let i = 0; i < strings.length; i++) {
      queryText += strings[i]
      if (i < values.length) {
        // pg uses $1, $2, etc. for parameters
        queryText += `$${i + 1}`
      }
    }
    
    const result: QueryResult = await pool.query(queryText, values)
    return result.rows
  }
}

/**
 * Guards against hosted DB usage in local execution mode.
 * This must be called before any database queries to fail fast.
 * 
 * SAFETY: This check only applies when executionMode === 'local'.
 * Server-side execution (API routes) can still use hosted DBs.
 */
export function checkHostedDbGuard(executionMode?: 'local' | 'server'): void {
  // Only check in local execution mode
  if (executionMode !== 'local') {
    return
  }
  
  // Only check once per process
  if (hostedDbGuardChecked) {
    return
  }
  
  hostedDbGuardChecked = true
  
  const capabilities = getRuntimeCapabilitiesSync()
  
  if (capabilities.hostedDb) {
    throw new Error(
      'Hosted DB access blocked in local execution mode. ' +
      'Set DATABASE_URL to a local PostgreSQL instance or set LOCAL_DB=true to use a local database.'
    )
  }
}

/**
 * Gets the SQL client, selecting the appropriate driver based on connection type.
 * - Local connections (localhost/127.0.0.1) use native `pg` Pool
 * - Hosted connections use `@neondatabase/serverless`
 */
export function getSql(): SqlClient {
  const connectionString = getConnectionString()
  if (!connectionString) {
    throw new Error('No database connection string found. Please set one of: POSTGRES_URL, DATABASE_URL, or POSTGRES_PRISMA_URL')
  }
  
  // Return cached client if already initialized
  if (_sql && _driverType) {
    return _sql
  }
  
  // Determine driver based on connection type
  const useLocalDriver = isLocalConnection(connectionString)
  
  if (useLocalDriver) {
    // Use native pg driver for local connections
    if (!_pgPool) {
      _pgPool = new Pool({
        connectionString,
        max: 10, // Reasonable pool size for local dev
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      })
      
      // Log driver selection at startup
      if (process.env.NODE_ENV === 'development') {
        console.log('[Database] Using native pg driver for local PostgreSQL connection')
      }
    }
    
    _driverType = 'pg'
    _sql = createPgSqlClient(_pgPool)
  } else {
    // Use Neon serverless driver for hosted connections
    // In development, prevent accidental hosted DB usage that causes quota errors
    if (process.env.NODE_ENV === 'development' && process.env.LOCAL_DB !== 'true') {
      const capabilities = getRuntimeCapabilitiesSync()
      if (capabilities.hostedDb) {
        throw new Error(
          'Hosted database access blocked in development mode to prevent quota errors.\n' +
          'Options:\n' +
          '1. Set DATABASE_URL to a local PostgreSQL instance (e.g., postgres://localhost:5432/dbname)\n' +
          '2. Set LOCAL_DB=true to explicitly allow hosted DB in development\n' +
          '3. Use NODE_ENV=production for production-like testing'
        )
      }
    }
    
    _driverType = 'neon'
    _sql = neon<false, false>(connectionString) as unknown as SqlClient
    
    // Log driver selection at startup
    if (process.env.NODE_ENV === 'development') {
      console.log('[Database] Using Neon serverless driver for hosted PostgreSQL connection')
    }
  }
  
  return _sql
}

export function isDbConfigured(): boolean {
  return !!getConnectionString()
}

export function getDbDebugInfo(): { configured: boolean; source: string; fingerprint: string | null; driver: 'pg' | 'neon' | null } {
  const cs = getConnectionString()
  if (!cs) return { configured: false, source: getConnectionStringSource(), fingerprint: null, driver: null }
  const fingerprint = crypto.createHash('sha256').update(cs).digest('hex').slice(0, 10)
  const driver = _driverType || (isLocalConnection(cs) ? 'pg' : 'neon')
  return { configured: true, source: getConnectionStringSource(), fingerprint, driver }
}

export async function connectToDb(): Promise<void> {
  // Initialize the cached client for serverless reuse.
  getSql()
}

export async function initDb(): Promise<void> {
  await connectToDb()
}

/**
 * Cleanup function to close pg pool connections (useful for tests)
 */
export async function closeDb(): Promise<void> {
  if (_pgPool) {
    await _pgPool.end()
    _pgPool = null
    _sql = null
    _driverType = null
  }
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
