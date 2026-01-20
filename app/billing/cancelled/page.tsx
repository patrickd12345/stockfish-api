'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function CancelledPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-[#e0e0e0] flex flex-col items-center justify-center p-8">
      <div className="bg-[#2a2a2a] p-8 rounded-lg border border-[#404040] max-w-md w-full text-center">
        <div className="text-5xl mb-6">⚠️</div>
        <h1 className="text-3xl font-bold mb-4">Checkout Cancelled</h1>
        <p className="text-[#a0a0a0] mb-8">
          Your payment was cancelled and you have not been charged.
        </p>

        <div className="flex flex-col gap-4">
          <button
            onClick={() => router.push('/pricing')}
            className="w-full py-3 bg-[#d4a373] hover:bg-[#b58b61] text-[#1a1a1a] rounded-md font-medium transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => router.push('/account')}
            className="w-full py-3 bg-[#3a3a3a] hover:bg-[#4a4a4a] text-white rounded-md font-medium transition-colors"
          >
            Return to Account
          </button>
        </div>
      </div>
    </div>
  );
}
