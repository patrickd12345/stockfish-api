/**
 * Runtime Capability Detection
 * 
 * Detects available services at runtime based on actual availability,
 * not just environment variables. This enables capability-based local
 * development mode that works because services are available, not because
 * it's "dev".
 * 
 * Capabilities are cached per process to avoid repeated probes.
 */

let cachedCapabilities: RuntimeCapabilities | null = null
let ollamaProbePromise: Promise<boolean> | null = null

export interface RuntimeCapabilities {
  localDb: boolean
  hostedDb: boolean
  localEngine: boolean
  localLLM: boolean
  billingEnabled: boolean
}

/**
 * Detects if DATABASE_URL points to a local database
 */
function detectLocalDb(): boolean {
  // Check explicit override first
  if (process.env.LOCAL_DB === 'true') {
    return true
  }
  
  const dbUrl = process.env.POSTGRES_URL?.trim() ||
                process.env.DATABASE_URL?.trim() ||
                process.env.POSTGRES_PRISMA_URL?.trim() ||
                ''
  
  if (!dbUrl) {
    return false
  }
  
  // Check if URL points to localhost or 127.0.0.1
  try {
    const url = new URL(dbUrl)
    const hostname = url.hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    // If URL parsing fails, check for localhost in string
    return /localhost|127\.0\.0\.1|::1/.test(dbUrl)
  }
}

/**
 * Probes Ollama API to detect if local LLM is available
 * Caches result per process to avoid repeated network calls
 */
async function probeOllama(): Promise<boolean> {
  // Return cached promise if probe is already in flight
  if (ollamaProbePromise) {
    return ollamaProbePromise
  }
  
  ollamaProbePromise = (async () => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2000) // 2s timeout
      
      const response = await fetch('http://localhost:11434/api/tags', {
        signal: controller.signal,
        method: 'GET',
      })
      
      clearTimeout(timeout)
      
      if (response.ok) {
        return true
      }
    } catch (error) {
      // Ollama not available - this is fine, just return false
    }
    
    return false
  })()
  
  return ollamaProbePromise
}

/**
 * Detects if billing is enabled
 * Billing is disabled in development unless explicitly enabled
 */
function detectBillingEnabled(): boolean {
  // Billing is disabled in development by default
  if (process.env.NODE_ENV === 'development') {
    return process.env.BILLING_ENABLED === 'true'
  }
  
  // In production/staging, billing is enabled unless explicitly disabled
  return process.env.BILLING_ENABLED !== 'false'
}

/**
 * Gets runtime capabilities, caching results per process
 * 
 * Note: localLLM detection is async and may take up to 2 seconds
 * on first call. Subsequent calls return cached result.
 */
export async function getRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  // Return cached if available
  if (cachedCapabilities) {
    return cachedCapabilities
  }
  
  const localDb = detectLocalDb()
  const hostedDb = !localDb
  const localEngine = true // Local engine availability is assumed in dev builds
  const localLLM = await probeOllama()
  const billingEnabled = detectBillingEnabled()
  
  cachedCapabilities = {
    localDb,
    hostedDb,
    localEngine,
    localLLM,
    billingEnabled,
  }
  
  return cachedCapabilities
}

/**
 * Synchronous version that returns capabilities without probing Ollama
 * Use this when you need immediate results and can tolerate localLLM being false
 */
export function getRuntimeCapabilitiesSync(): Omit<RuntimeCapabilities, 'localLLM'> & { localLLM: boolean | null } {
  const localDb = detectLocalDb()
  const hostedDb = !localDb
  const localEngine = true
  const billingEnabled = detectBillingEnabled()
  
  return {
    localDb,
    hostedDb,
    localEngine,
    localLLM: null, // Unknown without async probe
    billingEnabled,
  }
}

/**
 * Resets cached capabilities (useful for testing)
 */
export function resetRuntimeCapabilities(): void {
  cachedCapabilities = null
  ollamaProbePromise = null
}
