'use client'

import { useState, useEffect } from 'react'

export default function AccountPage() {
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const key = localStorage.getItem('openai_api_key')
    if (key) setApiKey(key)
  }, [])

  const handleSave = () => {
    localStorage.setItem('openai_api_key', apiKey.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = () => {
    localStorage.removeItem('openai_api_key')
    setApiKey('')
  }

  return (
    <div className="min-h-screen bg-sage-900 text-sage-100 p-8 flex justify-center">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-6 text-terracotta">Account Settings</h1>

        <div className="bg-sage-800 p-6 rounded-lg border border-white/5 shadow-lg">
          <h2 className="text-xl font-bold mb-4">Bring Your Own Key (BYOK)</h2>
          <p className="text-sage-300 mb-4">
            Enter your OpenAI API Key here to enable AI coaching features without a monthly subscription.
            Your key is stored locally in your browser and is only sent to our servers to process your requests.
          </p>

          <div className="mb-4">
            <label htmlFor="apiKey" className="block text-sm font-medium mb-2 text-sage-200">
              OpenAI API Key
            </label>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-sage-900 border border-sage-700 rounded p-3 text-white focus:ring-2 focus:ring-terracotta focus:outline-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-terracotta text-sage-900 font-bold rounded hover:brightness-110 transition-all"
            >
              {saved ? 'Saved!' : 'Save Key'}
            </button>
            {apiKey && (
              <button
                onClick={handleClear}
                className="px-4 py-2 bg-sage-700 text-sage-200 font-medium rounded hover:bg-sage-600 transition-all"
              >
                Clear
              </button>
            )}
          </div>

          <p className="mt-4 text-xs text-sage-400">
            Note: We recommend using a restricted API key with a spending limit.
          </p>
        </div>
      </div>
    </div>
  )
}
