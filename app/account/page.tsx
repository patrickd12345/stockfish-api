'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Entitlement {
  plan: 'FREE' | 'PRO';
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export default function AccountPage() {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // In a real app, we'd have a useUser hook or similar, or fetch from an API that calls getEntitlementForUser
    // Since we don't have a dedicated /api/me for entitlement yet, we might need one or inject it into the page.
    // However, the prompt says "Client UI must NOT decide entitlement based on local state; it calls /api/me or similar"

    // I haven't implemented /api/me yet. I should probably add one or fetch from a new route.
    // Let's assume I can fetch it from a simple endpoint I'll creating now or just mock it for this step.
    // Wait, I should implement /api/billing/entitlement or similar.

    // I will implement a quick fetcher here assuming the endpoint exists,
    // but I realize I missed adding an endpoint for the client to fetch status.
    // The prompt said: "Client UI must NOT decide entitlement based on local state; it calls /api/me or similar to fetch entitlement."

    // I will add a GET handler to /api/billing/subscription or similar in a moment.
    // For now, I'll write the fetch code.
    fetch('/api/billing/subscription')
      .then(res => {
        if (res.status === 401) {
            // Redirect to login or show unauthorized
            return null;
        }
        return res.json();
      })
      .then(data => {
        if (data) setEntitlement(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to create portal session');
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      console.error(err);
      alert('Failed to open billing portal');
      setPortalLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center text-[#e0e0e0]">Loading...</div>;
  }

  if (!entitlement) {
    return <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center text-[#e0e0e0]">Please log in.</div>;
  }

  const isPro = entitlement.plan === 'PRO';

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-[#e0e0e0] p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Account & Billing</h1>

        <div className="bg-[#2a2a2a] p-6 rounded-lg border border-[#404040]">
          <h2 className="text-xl font-semibold mb-4">Subscription Status</h2>

          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[#a0a0a0] text-sm mb-1">Current Plan</div>
              <div className={`text-2xl font-bold ${isPro ? 'text-[#d4a373]' : 'text-[#e0e0e0]'}`}>
                {entitlement.plan}
              </div>
            </div>
            <div>
              <div className="text-[#a0a0a0] text-sm mb-1">Status</div>
              <div className="capitalize">{entitlement.status.toLowerCase().replace('_', ' ')}</div>
            </div>
          </div>

          {entitlement.current_period_end && (
            <div className="mb-6">
              <div className="text-[#a0a0a0] text-sm mb-1">
                {entitlement.cancel_at_period_end ? 'Expires on' : 'Renews on'}
              </div>
              <div>{new Date(entitlement.current_period_end).toLocaleDateString()}</div>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="px-4 py-2 bg-[#404040] hover:bg-[#505050] rounded text-white font-medium transition-colors"
            >
              {portalLoading ? 'Loading...' : 'Manage Billing'}
            </button>
            {!isPro && (
              <button
                onClick={() => router.push('/pricing')}
                className="px-4 py-2 bg-[#d4a373] hover:bg-[#b58b61] text-[#1a1a1a] rounded font-medium transition-colors"
              >
                Upgrade to Pro
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
