'use client'

import { useMemo } from 'react'
import { AGENT_TONE_OPTIONS, type AgentTone } from '@/lib/agentTone'
import { useAgentTone } from '@/hooks/useAgentTone'

function RadioCard({
  value,
  selected,
  label,
  description,
  example,
  onChange
}: {
  value: AgentTone
  selected: boolean
  label: string
  description: string
  example: string
  onChange: (tone: AgentTone) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={[
        'w-full text-left rounded-xl border p-4 transition-all',
        selected
          ? 'bg-terracotta/15 border-terracotta text-sage-100 shadow-lg shadow-terracotta/10'
          : 'bg-sage-900/40 border-white/5 text-sage-200 hover:bg-sage-900/55 hover:border-white/10'
      ].join(' ')}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-black tracking-tight">{label}</div>
          <div className="text-xs text-sage-400 mt-1">{description}</div>
        </div>
        <div
          className={[
            'mt-1 h-4 w-4 rounded-full border flex items-center justify-center',
            selected ? 'border-terracotta' : 'border-white/20'
          ].join(' ')}
          aria-hidden="true"
        >
          {selected ? <div className="h-2 w-2 rounded-full bg-terracotta" /> : null}
        </div>
      </div>
      <div className="mt-3 text-xs text-sage-300 italic leading-relaxed">Example: {example}</div>
    </button>
  )
}

export default function ParametersTab() {
  const { tone, setTone, hydrated } = useAgentTone()

  const options = useMemo(() => AGENT_TONE_OPTIONS, [])

  return (
    <div className="glass-panel p-6 min-h-[700px] flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-terracotta tracking-tight">Parameters</h2>
          <div className="text-sm text-sage-400 mt-1">
            Controls how the coach speaks during live games and post-game reviews.
          </div>
        </div>
      </div>

      <div className="bg-sage-900/30 border border-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-sage-400">Agent tone</div>
            <div className="text-sm text-sage-200 mt-1">Choose a personality for in-game comments & review.</div>
          </div>
          <div className="text-xs text-sage-400">
            {hydrated ? (
              <>
                Current: <span className="text-sage-200 font-bold">{tone}</span>
              </>
            ) : (
              'Loading…'
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {options.map((opt) => (
            <RadioCard
              key={opt.value}
              value={opt.value}
              label={opt.label}
              description={opt.description}
              example={opt.example}
              selected={tone === opt.value}
              onChange={setTone}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

