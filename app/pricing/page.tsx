'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Interval = 'monthly' | 'yearly'

function CheckIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20"
    >
      ✓
    </span>
  )
}

function XIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20"
    >
      ✕
    </span>
  )
}

function FeatureRow({
  label,
  free,
  pro,
}: {
  label: string
  free: boolean | string
  pro: boolean | string
}) {
  const render = (value: boolean | string) => {
    if (typeof value === 'string') return <span className="text-sage-200">{value}</span>
    return value ? <CheckIcon /> : <XIcon />
  }

  return (
    <div className="grid grid-cols-12 gap-3 py-3 border-t border-white/5">
      <div className="col-span-6 text-sm text-sage-200">{label}</div>
      <div className="col-span-3 flex justify-center">{render(free)}</div>
      <div className="col-span-3 flex justify-center">{render(pro)}</div>
    </div>
  )
}

export default function PricingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<Interval | null>(null)
  const [error, setError] = useState<string | null>(null)

  const benefits = useMemo(
    () => [
      {
        title: 'Deeper engine confidence',
        body: 'Raise analysis depth beyond Free limits for fewer “maybe” evaluations and more decisive lines.',
      },
      {
        title: 'Unlimited analysis runs',
        body: 'Queue as many engine jobs as needed without worrying about hitting the Free ceiling.',
      },
      {
        title: 'Faster improvement loops',
        body: 'More accurate blunder detection, cleaner critical moments, better practice targets.',
      },
    ],
    []
  )

  const handleCheckout = async (interval: Interval) => {
    setError(null)
    setLoading(interval)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      })

      const data = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        const message =
          typeof data?.error === 'string'
            ? data.error
            : res.status === 401
              ? 'Sign in with Lichess to upgrade.'
              : 'Checkout failed. Try again.'
        throw new Error(message)
      }

      const url = typeof data?.url === 'string' ? data.url : null
      if (!url) throw new Error('Checkout failed. Try again.')
      window.location.href = url
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Checkout failed. Try again.'
      setError(message)
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-sage-900 text-sage-100">
      <div className="absolute inset-0 pointer-events-none bg-noise opacity-70" />

      <div className="relative mx-auto max-w-6xl px-4 py-10 md:py-16">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => router.push('/')} className="btn-secondary">
            Back to app
          </button>
          <button type="button" onClick={() => router.push('/account')} className="btn-secondary">
            Account
          </button>
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-sage-800/40 px-3 py-1 text-xs font-black tracking-widest text-sage-300">
              PRO SUBSCRIPTION
            </div>

            <h1 className="mt-4 text-4xl md:text-5xl font-black tracking-tight">
              Turn “interesting” games into <span className="text-terracotta">actionable</span> improvement.
            </h1>
            <p className="mt-4 text-base md:text-lg text-sage-300 leading-relaxed max-w-2xl">
              Pro unlocks deeper Stockfish analysis and removes Free caps so every import, replay, and review can be
              pushed further—especially in the positions that decide the game.
            </p>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
              {benefits.map((b) => (
                <div key={b.title} className="glass-card p-4">
                  <div className="text-sm font-black text-terracotta tracking-tight">{b.title}</div>
                  <div className="mt-2 text-xs text-sage-300 leading-relaxed">{b.body}</div>
                </div>
              ))}
            </div>

            {error ? (
              <div
                className="mt-6 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <div className="mt-6 text-xs text-sage-400">
              Stripe Checkout handles payment details. Cancel anytime from the billing portal.
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="glass-panel p-5 md:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-widest text-sage-400">Recommended</div>
                  <div className="mt-1 text-xl font-black tracking-tight text-terracotta">Pro Annual</div>
                  <div className="mt-1 text-sm text-sage-300">Best value for consistent training.</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-terracotta">$99.99</div>
                  <div className="text-xs text-sage-400">per year</div>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-sage-950/30 p-4">
                <div className="grid grid-cols-1 gap-2 text-sm text-sage-200">
                  <div className="flex items-start gap-2">
                    <CheckIcon />
                    <span>
                      Unlimited engine analysis + deeper depth (Free is capped)
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckIcon />
                    <span>Full access to Pro-gated analysis features</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckIcon />
                    <span>Manage subscription in Stripe customer portal</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCheckout('yearly')}
                disabled={loading !== null}
                className="mt-5 w-full btn-primary py-3 font-black"
              >
                {loading === 'yearly' ? 'Starting checkout…' : 'Upgrade to Pro Annual'}
              </button>

              <div className="mt-5 border-t border-white/5 pt-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-black tracking-tight text-sage-100">Pro Monthly</div>
                    <div className="text-xs text-sage-400">Lower commitment, same Pro access.</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black">$9.99</div>
                    <div className="text-[11px] text-sage-400">per month</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCheckout('monthly')}
                  disabled={loading !== null}
                  className="mt-4 w-full btn-secondary py-3 font-black"
                >
                  {loading === 'monthly' ? 'Starting checkout…' : 'Upgrade to Pro Monthly'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 md:mt-16">
          <div className="glass-panel p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-sage-400">Comparison</div>
                <h2 className="mt-2 text-2xl font-black tracking-tight">Free vs Pro</h2>
                <div className="mt-1 text-sm text-sage-300">
                  Pro is built for repeated review loops and deeper engine certainty.
                </div>
              </div>
              <div className="hidden sm:grid grid-cols-12 gap-3 w-[340px] text-xs text-sage-400">
                <div className="col-span-6" />
                <div className="col-span-3 text-center font-black">FREE</div>
                <div className="col-span-3 text-center font-black text-terracotta">PRO</div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-sage-950/20 p-4">
              <div className="grid grid-cols-12 gap-3 pb-3 text-xs text-sage-400 font-black">
                <div className="col-span-6">Feature</div>
                <div className="col-span-3 text-center">Free</div>
                <div className="col-span-3 text-center text-terracotta">Pro</div>
              </div>
              <FeatureRow label="Engine analysis depth" free="Up to 15" pro="Beyond 15" />
              <FeatureRow label="Unlimited engine runs" free={false} pro={true} />
              <FeatureRow label="Priority access to Pro-gated analysis" free={false} pro={true} />
              <FeatureRow label="Stripe customer portal (cancel / update card)" free={false} pro={true} />
            </div>
          </div>
        </div>

        <div className="mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 glass-panel p-6">
            <div className="text-xs font-black uppercase tracking-widest text-sage-400">FAQ</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Common questions</h2>

            <div className="mt-6 grid grid-cols-1 gap-4">
              <div className="rounded-xl border border-white/10 bg-sage-950/20 p-4">
                <div className="font-black">What changes after upgrade?</div>
                <div className="mt-1 text-sm text-sage-300 leading-relaxed">
                  Pro removes Free caps and unlocks deeper engine analysis so critical moments get more accurate evaluations.
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-sage-950/20 p-4">
                <div className="font-black">Can subscription be cancelled?</div>
                <div className="mt-1 text-sm text-sage-300 leading-relaxed">
                  Cancellation and payment method updates are handled in the Stripe customer portal from the Account page.
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-sage-950/20 p-4">
                <div className="font-black">Is it tied to Lichess?</div>
                <div className="mt-1 text-sm text-sage-300 leading-relaxed">
                  Billing is associated with the current signed-in identity (cookie-based Lichess user id).
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 glass-panel p-6">
            <div className="text-xs font-black uppercase tracking-widest text-sage-400">Ready</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Start the next review loop today.</h2>
            <div className="mt-2 text-sm text-sage-300">
              Upgrade, run deeper analysis, then head straight to Account for portal access.
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => handleCheckout('yearly')}
                disabled={loading !== null}
                className="btn-primary py-3 font-black"
              >
                {loading === 'yearly' ? 'Starting checkout…' : 'Upgrade Annual'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/account')}
                className="btn-secondary py-3 font-black"
              >
                Go to Account
              </button>
            </div>
            <div className="mt-4 text-xs text-sage-400">
              Checkout opens in Stripe. Success returns to `/billing/success`.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
