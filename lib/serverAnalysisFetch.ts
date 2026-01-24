import type { ExecutionMode } from '@/contexts/ExecutionModeContext'

/**
 * Use this for any fetch to server-side engine analysis endpoints.
 * In development, throws if executionMode === 'local' to enforce the invariant
 * that local mode must never call server analysis.
 */
export function serverAnalysisFetch(
  url: string,
  init: RequestInit,
  executionMode: ExecutionMode
): Promise<Response> {
  if (
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'development' &&
    executionMode === 'local'
  ) {
    throw new Error('Invariant violation: local mode must not call server analysis')
  }
  return fetch(url, init)
}
