'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Entitlement {
  plan: 'FREE' | 'PRO'
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export default function AccountPage() {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const router = useRouter()

  const proBullets = useMemo(
    () => [
      'Deeper Stockfish analysis (beyond Free depth cap)',
      'Unlimited engine queue runs',
      'Pro-gated analysis features unlocked',
      'Manage subscription in Stripe customer portal',
    ],
    []
  )

  useEffect(() => {
    fetch('/api/billing/subscription')
      .then(res => {
        if (res.status === 401) return null
        return res.json()
      })
      .then(data => {
        if (data) setEntitlement(data)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  const handleManageBilling = async () => {
    setPortalError(null)
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
      })
      const data = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        const message = typeof data?.error === 'string' ? data.error : 'Failed to open billing portal'
        setPortalError(message)
        setPortalLoading(false)
        return
      }

      const url = typeof data?.url === 'string' ? data.url : null
      if (!url) {
        setPortalError('Billing portal did not return a URL.')
        setPortalLoading(false)
        return
      }
      window.location.href = url
    } catch (err) {
      console.error(err)
      setPortalError('Failed to open billing portal')
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-sage-900 flex items-center justify-center text-sage-100">
        Loading…
      </div>
    )
  }

  if (!entitlement) {
    return (
      <div className="min-h-screen bg-sage-900 flex items-center justify-center text-sage-100">
        Sign in required.
      </div>
    )
  }

  const isPro = entitlement.plan === 'PRO'

  return (
    <div className="min-h-screen bg-sage-900 text-sage-100">
      <div className="absolute inset-0 pointer-events-none bg-noise opacity-70" />

      <div className="relative max-w-3xl mx-auto p-6 md:p-10">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => router.push('/')} className="btn-secondary">
            Back to app
          </button>
          <button type="button" onClick={() => router.push('/pricing')} className="btn-secondary">
            Pricing
          </button>
        </div>

        <h1 className="mt-10 text-3xl font-black tracking-tight">Account & Billing</h1>
        <div className="mt-2 text-sm text-sage-300">
          Subscription status and Stripe portal access.
        </div>

        <div className="mt-8 glass-panel p-6">
          <h2 className="text-xl font-black tracking-tight">Subscription Status</h2>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
            <div className="sm:col-span-7">
              <div className="text-xs uppercase tracking-widest text-sage-400 font-black">Current plan</div>
              <div className={`mt-1 text-3xl font-black ${isPro ? 'text-terracotta' : 'text-sage-100'}`}>
                {entitlement.plan}
              </div>
            </div>

            <div className="sm:col-span-5">
              <div className="text-xs uppercase tracking-widest text-sage-400 font-black">Status</div>
              <div className="mt-1 text-sm text-sage-200 capitalize">
                {entitlement.status.toLowerCase().replace('_', ' ')}
              </div>
            </div>
          </div>

          {entitlement.current_period_end ? (
            <div className="mt-5 rounded-xl border border-white/10 bg-sage-950/20 p-4">
              <div className="text-xs uppercase tracking-widest text-sage-400 font-black">
                {entitlement.cancel_at_period_end ? 'Expires on' : 'Renews on'}
              </div>
              <div className="mt-1 text-sm text-sage-200">
                {new Date(entitlement.current_period_end).toLocaleDateString()}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="btn-secondary font-black"
            >
              {portalLoading ? 'Opening portal…' : 'Manage Billing'}
            </button>
            {!isPro && (
              <button
                onClick={() => router.push('/pricing')}
                className="btn-primary font-black"
              >
                Upgrade to Pro
              </button>
            )}
          </div>

          {portalError ? (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
            >
              {portalError}
            </div>
          ) : null}
        </div>

        {!isPro ? (
          <div className="mt-6 glass-panel p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-sage-400">Why upgrade</div>
                <h2 className="mt-2 text-xl font-black tracking-tight">
                  Pro removes caps and unlocks deeper analysis.
                </h2>
                <div className="mt-2 text-sm text-sage-300 leading-relaxed">
                  Free is great for quick checks. Pro is built for repeated improvement loops.
                </div>
              </div>
            </div>

            <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-sage-200">
              {proBullets.map((b) => (
                <li key={b} className="flex items-start gap-2 rounded-lg border border-white/5 bg-sage-950/20 p-3">
                  <span aria-hidden="true" className="text-terracotta font-black">
                    ✓
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => router.push('/pricing')} className="btn-primary font-black">
                See pricing
              </button>
              <button type="button" onClick={handleManageBilling} className="btn-secondary font-black">
                Open billing portal
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
