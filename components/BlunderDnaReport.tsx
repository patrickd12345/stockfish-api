'use client'

import { useEffect, useState, useMemo } from 'react'
import FeatureGate from '@/components/FeatureGate'
import { BlunderTheme, GamePhase, type BlunderDnaSnapshot, type BlunderPattern } from '@/lib/blunderDnaV1'
import { explainBlunderPattern, type CoachingExplanation } from '@/lib/blunderDnaExplain'
import { isLocalLlmAvailable } from '@/lib/localLlm'

interface BlunderDnaApiResponse {
  ok: boolean
  snapshot: BlunderDnaSnapshot
  error?: string
  code?: string
}

interface BlunderDnaReportProps {
  onTrainPattern?: (theme: BlunderTheme, phase: GamePhase) => void
}

/**
 * Theme labels for display
 */
const THEME_LABELS: Record<BlunderTheme, string> = {
  [BlunderTheme.HANGING_PIECE]: 'Hanging Piece',
  [BlunderTheme.MISSED_THREAT]: 'Missed Threat',
  [BlunderTheme.MISSED_WIN]: 'Missed Win',
  [BlunderTheme.UNSAFE_KING]: 'Unsafe King',
  [BlunderTheme.BAD_CAPTURE]: 'Bad Capture',
  [BlunderTheme.TIME_TROUBLE]: 'Time Trouble',
}

/**
 * Phase labels for display
 */
const PHASE_LABELS: Record<GamePhase, string> = {
  [GamePhase.OPENING]: 'Opening',
  [GamePhase.MIDDLEGAME]: 'Middlegame',
  [GamePhase.ENDGAME]: 'Endgame',
}

/**
 * Group patterns by phase, then by theme
 */
function groupPatternsByPhase(patterns: BlunderPattern[]): Map<GamePhase, BlunderPattern[]> {
  const grouped = new Map<GamePhase, BlunderPattern[]>()
  
  for (const pattern of patterns) {
    const phasePatterns = grouped.get(pattern.phase) || []
    phasePatterns.push(pattern)
    grouped.set(pattern.phase, phasePatterns)
  }
  
  // Sort patterns within each phase by count descending
  for (const [phase, phasePatterns] of Array.from(grouped.entries())) {
    phasePatterns.sort((a: BlunderPattern, b: BlunderPattern) => 
      b.count - a.count || b.avgCentipawnLoss - a.avgCentipawnLoss
    )
  }
  
  return grouped
}

/**
 * Blunder DNA Report Component
 * Displays read-only snapshot grouped by phase and theme
 */
export default function BlunderDnaReport({ onTrainPattern }: BlunderDnaReportProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<BlunderDnaSnapshot | null>(null)
  const [localLlmAvailable, setLocalLlmAvailable] = useState<boolean | null>(null)
  const [explanations, setExplanations] = useState<Map<string, CoachingExplanation>>(new Map())
  const [explainingPatterns, setExplainingPatterns] = useState<Set<string>>(new Set())
  const [explanationErrors, setExplanationErrors] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    
    const fetchSnapshot = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const res = await fetch('/api/blunder-dna')
        const data: BlunderDnaApiResponse = await res.json()
        
        if (cancelled) return
        
        if (!res.ok) {
          if (data.code === 'PRO_REQUIRED') {
            setError('Pro subscription required')
          } else {
            setError(data.error || 'Failed to load Blunder DNA report')
          }
          return
        }
        
        if (data.ok && data.snapshot) {
          setSnapshot(data.snapshot)
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load Blunder DNA report')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    
    fetchSnapshot()
    
    return () => {
      cancelled = true
    }
  }, [])

  // Check local LLM availability
  useEffect(() => {
    let cancelled = false
    
    const checkLlm = async () => {
      try {
        const available = await isLocalLlmAvailable()
        if (!cancelled) {
          setLocalLlmAvailable(available)
        }
      } catch (e) {
        if (!cancelled) {
          setLocalLlmAvailable(false)
        }
      }
    }
    
    checkLlm()
    
    return () => {
      cancelled = true
    }
  }, [])

  const handleExplainPattern = async (pattern: BlunderPattern) => {
    const patternKey = `${pattern.theme}-${pattern.phase}`
    
    // Don't re-fetch if already explaining or already have explanation
    if (explainingPatterns.has(patternKey) || explanations.has(patternKey)) {
      return
    }
    
    setExplainingPatterns(prev => new Set(prev).add(patternKey))
    setExplanationErrors(prev => {
      const next = new Map(prev)
      next.delete(patternKey)
      return next
    })
    
    try {
      const explanation = await explainBlunderPattern(pattern)
      
      if (explanation) {
        setExplanations(prev => new Map(prev).set(patternKey, explanation))
      } else {
        setExplanationErrors(prev => new Map(prev).set(patternKey, 'Explanation unavailable. Ollama may not be running.'))
      }
    } catch (e: any) {
      setExplanationErrors(prev => new Map(prev).set(patternKey, e?.message || 'Failed to generate explanation'))
    } finally {
      setExplainingPatterns(prev => {
        const next = new Set(prev)
        next.delete(patternKey)
        return next
      })
    }
  }

  const patternsByPhase = useMemo(() => {
    if (!snapshot?.patterns) return new Map<GamePhase, BlunderPattern[]>()
    return groupPatternsByPhase(snapshot.patterns)
  }, [snapshot?.patterns])

  const phaseOrder: GamePhase[] = [GamePhase.OPENING, GamePhase.MIDDLEGAME, GamePhase.ENDGAME]

  return (
    <FeatureGate
      feature="blunder_dna"
      lockedFallback={
        <div className="glass-panel p-6">
          <div className="text-center py-12">
            <div className="text-sage-400 mb-4">
              Blunder DNA report requires Pro subscription.
            </div>
            <button
              onClick={() => window.location.href = '/pricing'}
              className="btn-primary"
            >
              Upgrade to Pro
            </button>
          </div>
        </div>
      }
    >
      <div className="glass-panel p-6 flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-terracotta tracking-tight">
              Blunder DNA Report
            </h2>
            <div className="mt-1 text-sm text-sage-400">
              Deterministic blunder pattern analysis from your last {snapshot?.gamesAnalyzed || 0} analyzed games.
            </div>
          </div>
          {snapshot && (
            <div className="text-xs font-mono text-sage-400 bg-sage-900 px-3 py-1.5 rounded">
              {snapshot.snapshotDate}
            </div>
          )}
        </div>

        {loading && (
          <div className="text-center py-12 text-sage-500 italic animate-pulse">
            Loading Blunder DNA report...
          </div>
        )}

        {error && (
          <div className="bg-rose-900/40 border border-rose-700 text-rose-200 px-4 py-3 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        {!loading && !error && snapshot && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-sage-900/40 p-4 rounded-xl border border-white/5">
                <div className="text-xs text-sage-500 uppercase tracking-wider mb-1">Games Analyzed</div>
                <div className="text-2xl font-bold text-sage-200">{snapshot.gamesAnalyzed}</div>
              </div>
              <div className="bg-sage-900/40 p-4 rounded-xl border border-white/5">
                <div className="text-xs text-sage-500 uppercase tracking-wider mb-1">Total Blunders</div>
                <div className="text-2xl font-bold text-terracotta">{snapshot.blundersTotal}</div>
              </div>
            </div>

            {/* Patterns grouped by phase */}
            {patternsByPhase.size === 0 ? (
              <div className="text-center py-12 text-sage-500 italic">
                No blunder patterns found. Run analysis to generate patterns.
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {phaseOrder.map((phase) => {
                  const phasePatterns = patternsByPhase.get(phase)
                  if (!phasePatterns || phasePatterns.length === 0) return null

                  return (
                    <div
                      key={phase}
                      className="bg-sage-900/40 p-5 rounded-xl border border-white/5"
                    >
                      <h3 className="font-bold text-lg text-sage-200 mb-4">
                        {PHASE_LABELS[phase]}
                      </h3>
                      <div className="flex flex-col gap-3">
                        {phasePatterns.map((pattern: BlunderPattern) => (
                          <div
                            key={`${pattern.theme}-${pattern.phase}`}
                            className="p-4 rounded-xl bg-sage-800/40 border border-white/5 hover:bg-sage-800/60 transition-colors"
                          >
                            <div className="flex justify-between items-start gap-4 mb-2">
                              <div className="font-bold text-sage-200">
                                {THEME_LABELS[pattern.theme]}
                              </div>
                              <div className="text-xs font-medium text-sage-400 bg-sage-900/50 px-2 py-1 rounded">
                                {pattern.count} {pattern.count === 1 ? 'blunder' : 'blunders'}
                              </div>
                            </div>
                            
                            <div className="text-sm text-sage-400 mb-3">
                              Avg loss: <strong className="text-terracotta">{pattern.avgCentipawnLoss} cp</strong>
                            </div>

                            {localLlmAvailable && (
                              <div className="mt-3">
                                <button
                                  onClick={() => handleExplainPattern(pattern)}
                                  disabled={explainingPatterns.has(`${pattern.theme}-${pattern.phase}`)}
                                  className="text-sm text-emerald-400 hover:text-emerald-300 font-medium transition-colors underline disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {explainingPatterns.has(`${pattern.theme}-${pattern.phase}`)
                                    ? 'Generating explanation...'
                                    : 'Explain this pattern →'}
                                </button>
                              </div>
                            )}

                            {explanations.has(`${pattern.theme}-${pattern.phase}`) && (
                              <div className="mt-4 pt-4 border-t border-white/10">
                                <div className="text-xs text-sage-500 uppercase tracking-wider mb-3">
                                  Coaching Explanation
                                </div>
                                {(() => {
                                  const explanation = explanations.get(`${pattern.theme}-${pattern.phase}`)!
                                  return (
                                    <div className="flex flex-col gap-3 text-sm">
                                      <div>
                                        <div className="font-semibold text-sage-300 mb-1">Pattern Summary</div>
                                        <div className="text-sage-400">{explanation.patternSummary}</div>
                                      </div>
                                      <div>
                                        <div className="font-semibold text-sage-300 mb-1">Why It Hurts</div>
                                        <div className="text-sage-400">{explanation.whyItHurts}</div>
                                      </div>
                                      <div>
                                        <div className="font-semibold text-sage-300 mb-1">Study Focus</div>
                                        <div className="text-sage-400">{explanation.studyFocus}</div>
                                      </div>
                                    </div>
                                  )
                                })()}
                              </div>
                            )}

                            {explanationErrors.has(`${pattern.theme}-${pattern.phase}`) && (
                              <div className="mt-3 text-xs text-rose-400">
                                {explanationErrors.get(`${pattern.theme}-${pattern.phase}`)}
                              </div>
                            )}

                            {onTrainPattern && (
                              <div className="mt-3">
                                <button
                                  onClick={() => onTrainPattern(pattern.theme, pattern.phase)}
                                  className="text-sm text-purple-400 hover:text-purple-300 font-medium transition-colors underline"
                                >
                                  Train this pattern →
                                </button>
                              </div>
                            )}

                            {pattern.exampleGameIds.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-white/5">
                                <div className="text-xs text-sage-500 uppercase tracking-wider mb-2">
                                  Example Games
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {pattern.exampleGameIds.map((gameId: string) => (
                                    <div
                                      key={gameId}
                                      className="text-xs font-mono text-sage-400 bg-sage-900/50 px-2 py-1 rounded border border-white/5"
                                    >
                                      {gameId}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </FeatureGate>
  )
}
