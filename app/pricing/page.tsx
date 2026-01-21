import Link from 'next/link'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-sage-900 text-sage-100 p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full text-center">
        <h1 className="text-4xl font-bold mb-4 text-terracotta">Simple Pricing</h1>
        <p className="text-xl text-sage-300 mb-12">
          Choose how you want to power your chess improvement.
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Subscription Plan */}
          <div className="bg-sage-800 p-8 rounded-xl border border-white/5 shadow-xl flex flex-col items-center opacity-75 grayscale relative">
            <div className="absolute top-4 right-4 bg-sage-700 text-xs px-2 py-1 rounded">Coming Soon</div>
            <h2 className="text-2xl font-bold mb-2">Pro Subscription</h2>
            <div className="text-4xl font-black mb-4">$29<span className="text-lg font-normal text-sage-400">/mo</span></div>
            <p className="text-sage-300 mb-6 text-center">
              We handle everything. Unlimited AI coaching, deep analysis, and server-side processing.
            </p>
            <ul className="text-left space-y-3 mb-8 w-full px-8">
              <li className="flex items-center">✓ Unlimited AI Chat</li>
              <li className="flex items-center">✓ Deep Game Review</li>
              <li className="flex items-center">✓ Repertoire Analysis</li>
              <li className="flex items-center">✓ Cloud Storage</li>
            </ul>
            <button disabled className="mt-auto px-6 py-3 bg-sage-700 text-sage-400 font-bold rounded cursor-not-allowed">
              Join Waitlist
            </button>
          </div>

          {/* BYOK Plan */}
          <div className="bg-sage-800 p-8 rounded-xl border-2 border-terracotta shadow-xl flex flex-col items-center relative transform scale-105">
            <div className="absolute -top-4 bg-terracotta text-sage-900 px-4 py-1 rounded-full text-sm font-bold shadow-lg">
              Recommended for Developers
            </div>
            <h2 className="text-2xl font-bold mb-2">BYOK License</h2>
            <div className="text-4xl font-black mb-4">$9<span className="text-lg font-normal text-sage-400"> one-time</span></div>
            <p className="text-sage-300 mb-6 text-center">
              Unlock the AI interface forever. You provide the intelligence (OpenAI Key), we provide the platform.
            </p>
            <ul className="text-left space-y-3 mb-8 w-full px-8">
              <li className="flex items-center text-white"><span className="text-terracotta mr-2">✓</span> Pay for usage directly to OpenAI</li>
              <li className="flex items-center text-white"><span className="text-terracotta mr-2">✓</span> Full access to AI features</li>
              <li className="flex items-center text-white"><span className="text-terracotta mr-2">✓</span> No monthly platform fees</li>
              <li className="flex items-center text-white"><span className="text-terracotta mr-2">✓</span> Privacy focused</li>
            </ul>
            <Link href="/account" className="mt-auto px-8 py-3 bg-terracotta text-sage-900 font-bold rounded hover:brightness-110 transition-all shadow-lg hover:shadow-terracotta/20">
              Enter Key & Start
            </Link>
            <p className="mt-3 text-xs text-sage-400">
              *Requires your own OpenAI API account
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
