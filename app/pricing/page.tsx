'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<'monthly' | 'yearly' | null>(null);

  const handleCheckout = async (interval: 'monthly' | 'yearly') => {
    setLoading(interval);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ interval }),
      });

      if (!res.ok) {
        throw new Error('Checkout failed');
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (error) {
      console.error(error);
      alert('Failed to start checkout. Please try again.');
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-[#e0e0e0] flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-8">Upgrade to Pro</h1>
      <p className="text-xl mb-12 text-[#a0a0a0] text-center max-w-2xl">
        Unlock advanced analysis, unlimited insights, and deeper engine depths.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* Monthly Plan */}
        <div className="bg-[#2a2a2a] p-8 rounded-lg border border-[#404040] flex flex-col items-center">
          <h2 className="text-2xl font-semibold mb-4">Monthly</h2>
          <div className="text-3xl font-bold mb-6">$9.99<span className="text-sm font-normal text-[#808080]">/mo</span></div>
          <ul className="mb-8 space-y-2 text-[#cccccc] w-full">
            <li className="flex items-center">✓ Unlimited Analysis</li>
            <li className="flex items-center">✓ Advanced Engine Depth</li>
            <li className="flex items-center">✓ Priority Support</li>
          </ul>
          <button
            onClick={() => handleCheckout('monthly')}
            disabled={!!loading}
            className="w-full py-3 px-6 bg-[#3a3a3a] hover:bg-[#4a4a4a] text-white rounded-md font-medium transition-colors disabled:opacity-50"
          >
            {loading === 'monthly' ? 'Loading...' : 'Go Pro Monthly'}
          </button>
        </div>

        {/* Annual Plan */}
        <div className="bg-[#2a2a2a] p-8 rounded-lg border-2 border-[#d4a373] relative flex flex-col items-center shadow-[0_0_20px_rgba(212,163,115,0.1)]">
          <div className="absolute top-0 right-0 bg-[#d4a373] text-[#1a1a1a] text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">
            BEST VALUE
          </div>
          <h2 className="text-2xl font-semibold mb-4 text-[#d4a373]">Annual</h2>
          <div className="text-3xl font-bold mb-6 text-[#d4a373]">$99.99<span className="text-sm font-normal text-[#808080]">/yr</span></div>
          <ul className="mb-8 space-y-2 text-[#cccccc] w-full">
            <li className="flex items-center">✓ Unlimited Analysis</li>
            <li className="flex items-center">✓ Advanced Engine Depth</li>
            <li className="flex items-center">✓ Priority Support</li>
            <li className="flex items-center text-[#d4a373]">✓ Save 17%</li>
          </ul>
          <button
            onClick={() => handleCheckout('yearly')}
            disabled={!!loading}
            className="w-full py-3 px-6 bg-[#d4a373] hover:bg-[#b58b61] text-[#1a1a1a] rounded-md font-medium transition-colors disabled:opacity-50"
          >
            {loading === 'yearly' ? 'Loading...' : 'Go Pro Annual'}
          </button>
        </div>
      </div>
    </div>
  );
}
