'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<'loading' | 'active' | 'error'>('loading');

  useEffect(() => {
    if (!sessionId) {
        // If no session ID, redirect to account or show error
        // But for now we just verify entitlement
    }

    // Poll for activation
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/billing/subscription');
        const data = await res.json();
        if (data.plan === 'PRO') {
          setStatus('active');
        } else {
          // Keep polling or show pending
          // For simplicity in this iteration, we just check once or twice.
          // Real-world: retry with backoff.
          setTimeout(checkStatus, 2000);
        }
      } catch (e) {
        console.error(e);
      }
    };

    checkStatus();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-[#e0e0e0] flex flex-col items-center justify-center p-8">
      <div className="bg-[#2a2a2a] p-8 rounded-lg border border-[#404040] max-w-md w-full text-center">
        <div className="text-5xl mb-6">🎉</div>
        <h1 className="text-3xl font-bold mb-4 text-[#d4a373]">Upgrade Successful!</h1>
        <p className="text-[#a0a0a0] mb-8">
          You now have access to Pro features.
        </p>

        {status === 'loading' && (
          <div className="text-sm text-[#808080] mb-6">Confirming subscription activation...</div>
        )}

        {status === 'active' && (
          <button
            onClick={() => router.push('/account')}
            className="w-full py-3 bg-[#d4a373] hover:bg-[#b58b61] text-[#1a1a1a] rounded-md font-medium transition-colors"
          >
            Go to Account
          </button>
        )}
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center text-[#e0e0e0]">Loading...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
