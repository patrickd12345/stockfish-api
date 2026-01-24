/**
 * Runtime Capabilities Banner (Server Component)
 * 
 * Checks runtime capabilities at startup and logs a dev-only banner
 * indicating which local services are available.
 */

import { getRuntimeCapabilities } from '@/lib/runtimeCapabilities'

export async function RuntimeCapabilitiesBanner() {
  // Only log in development
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  try {
    const capabilities = await getRuntimeCapabilities()
    
    const services: string[] = []
    if (capabilities.localDb) services.push('DB')
    if (capabilities.localEngine) services.push('Engine')
    if (capabilities.localLLM) services.push('Ollama')
    
    if (services.length > 0) {
      const mode = capabilities.localDb && capabilities.localEngine && capabilities.localLLM
        ? 'LOCAL FULL MODE'
        : 'LOCAL PARTIAL MODE'
      
      console.log(`\n${'='.repeat(60)}`)
      console.log(`Running in ${mode} (${services.join(' + ')})`)
      console.log(`${'='.repeat(60)}\n`)
    }
  } catch (error) {
    // Silently fail - capabilities check shouldn't block startup
    console.warn('Failed to check runtime capabilities:', error)
  }

  return null // This component doesn't render anything
}
