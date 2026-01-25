'use client'

import { useState } from 'react'
import { useIsAuthenticated, useRefreshEntitlement } from '@/contexts/EntitlementContext'

/**
 * DEV-only authentication button component.
 * Shows login/logout button only in development mode.
 */
export default function AuthButton() {
  const isAuthenticated = useIsAuthenticated()
  const refreshEntitlement = useRefreshEntitlement()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthButton.tsx:21',message:'Login button clicked',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthButton.tsx:32',message:'Login API response received',data:{status:res.status,ok:res.ok,headers:Object.fromEntries(res.headers.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthButton.tsx:35',message:'Login API failed',data:{status:res.status,error:data.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        throw new Error(data.error || 'Login failed')
      }

      const loginData = await res.json()
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthButton.tsx:40',message:'Login successful, calling refreshEntitlement',data:{loginData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      // Refresh entitlement to update auth state
      refreshEntitlement()
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthButton.tsx:43',message:'refreshEntitlement called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthButton.tsx:45',message:'Login error caught',data:{error:err instanceof Error ? err.message : String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error('Logout failed')
      }

      // Refresh entitlement to update auth state
      refreshEntitlement()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {isAuthenticated ? (
        <button
          type="button"
          onClick={handleLogout}
          disabled={loading}
          className="px-3 py-2 rounded-lg text-xs font-bold border bg-sage-800/50 text-sage-200 border-white/5 hover:bg-sage-700/70 hover:text-sage-100 hover:border-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="DEV: Logout"
        >
          {loading ? 'Logging out...' : 'Logout (DEV)'}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="px-3 py-2 rounded-lg text-xs font-bold border bg-emerald-600/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-600/30 hover:text-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="DEV: Login"
        >
          {loading ? 'Logging in...' : 'Login (DEV)'}
        </button>
      )}
      {error && (
        <span className="text-xs text-rose-400" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
