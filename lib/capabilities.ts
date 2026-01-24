export type CapabilityKey =
  | 'serverExecution'
  | 'outboundNetwork'
  | 'database'
  | 'persistence'
  | 'secrets'

export type CapabilityFacts = Record<CapabilityKey, boolean>

function detectDatabaseConfigured(): boolean {
  return Boolean(
    process.env.POSTGRES_URL?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      process.env.POSTGRES_PRISMA_URL?.trim()
  )
}

function detectPersistenceEnabled(): boolean {
  const readOnly =
    process.env.READONLY_DB === 'true' ||
    process.env.DATABASE_READ_ONLY === 'true' ||
    process.env.READ_ONLY_DB === 'true'
  return detectDatabaseConfigured() && !readOnly
}

function detectOutboundNetwork(): boolean {
  return !(
    process.env.OUTBOUND_NETWORK_DISABLED === 'true' ||
    process.env.SANDBOXED === 'true'
  )
}

function detectSecretsAvailable(): boolean {
  return Boolean(
    process.env.MYCHESSCOACH_SECRET ||
      process.env.VERCEL_VIRTUAL_KEY ||
      process.env.STRIPE_SECRET_KEY
  )
}

export function getServerCapabilityFacts(): CapabilityFacts {
  return {
    serverExecution: true,
    outboundNetwork: detectOutboundNetwork(),
    database: detectDatabaseConfigured(),
    persistence: detectPersistenceEnabled(),
    secrets: detectSecretsAvailable(),
  }
}

export function getClientCapabilityFallbacks(): CapabilityFacts {
  return {
    serverExecution: false,
    outboundNetwork: typeof navigator !== 'undefined' ? navigator.onLine : true,
    database: false,
    persistence: false,
    secrets: false,
  }
}
