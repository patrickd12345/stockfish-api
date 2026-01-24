/**
 * Blunder DNA Pattern Explanation
 * 
 * Generates explainable coaching text for Blunder DNA patterns using local Ollama.
 * Uses only Blunder DNA data (no raw games, no engine lines).
 * Explanations are factual and general, avoiding specific moves, ratings, or game references.
 */

import { type BlunderPattern, BlunderTheme, GamePhase } from './blunderDnaV1'
import { generateLocalLlmResponse } from './localLlm'
import { isLocalLlmAvailable } from './localLlm'

export interface CoachingExplanation {
  patternSummary: string
  whyItHurts: string
  studyFocus: string
}

/**
 * Theme descriptions for prompt context
 */
const THEME_DESCRIPTIONS: Record<BlunderTheme, string> = {
  [BlunderTheme.HANGING_PIECE]: 'hanging piece - leaving a piece en prise or allowing an immediate capture with significant material loss',
  [BlunderTheme.MISSED_THREAT]: 'missed threat - failing to prevent a strong opponent tactic that could have been stopped',
  [BlunderTheme.MISSED_WIN]: 'missed win - a position where a winning tactic existed but was not played, causing the advantage to drop',
  [BlunderTheme.UNSAFE_KING]: 'unsafe king - king safety deteriorates sharply, often involving mate threats or forced lines',
  [BlunderTheme.BAD_CAPTURE]: 'bad capture - a capture that loses material due to tactics, recaptures, or wrong exchange',
  [BlunderTheme.TIME_TROUBLE]: 'time trouble - mistakes spike under low remaining clock time',
}

/**
 * Phase descriptions for prompt context
 */
const PHASE_DESCRIPTIONS: Record<GamePhase, string> = {
  [GamePhase.OPENING]: 'opening phase (moves 1-15)',
  [GamePhase.MIDDLEGAME]: 'middlegame phase (moves 16-30)',
  [GamePhase.ENDGAME]: 'endgame phase (moves 31+)',
}

/**
 * Builds the prompt for explaining a Blunder DNA pattern
 */
export function buildExplanationPrompt(pattern: BlunderPattern): string {
  const themeDesc = THEME_DESCRIPTIONS[pattern.theme]
  const phaseDesc = PHASE_DESCRIPTIONS[pattern.phase]
  const avgLoss = pattern.avgCentipawnLoss
  const count = pattern.count
  
  return `Explain this chess blunder pattern in plain, factual terms:

Pattern: ${themeDesc}
Phase: ${phaseDesc}
Frequency: ${count} ${count === 1 ? 'occurrence' : 'occurrences'}
Average loss: ${avgLoss} centipawns (${(avgLoss / 100).toFixed(1)} pawns)

Provide exactly three sections:

1. Pattern Summary: A concise, factual description of what this pattern means in chess terms. No specific moves or game references.

2. Why It Hurts: Explain the concrete consequences of this type of blunder. Focus on material loss, positional damage, or tactical vulnerability. No motivational language.

3. Study Focus: Suggest specific, actionable study areas to address this pattern. Focus on tactical patterns, calculation, or positional concepts. No rating assumptions.

Keep each section to 2-3 sentences. Be factual and general.`
}

/**
 * Parses the LLM response into a CoachingExplanation
 * Handles various response formats and extracts the three required sections
 */
export function parseExplanationResponse(response: string): CoachingExplanation {
  const lines = response.split('\n').map(l => l.trim()).filter(Boolean)
  
  let patternSummary = ''
  let whyItHurts = ''
  let studyFocus = ''
  
  let currentSection: 'summary' | 'hurts' | 'focus' | null = null
  const sections: string[] = []
  
  for (const line of lines) {
    const lower = line.toLowerCase()
    
    // Detect section headers
    if (lower.includes('pattern summary') || lower.includes('1.') || lower.startsWith('summary')) {
      currentSection = 'summary'
      sections.push('')
      continue
    }
    if (lower.includes('why it hurts') || lower.includes('2.') || lower.startsWith('hurts')) {
      currentSection = 'hurts'
      sections.push('')
      continue
    }
    if (lower.includes('study focus') || lower.includes('3.') || lower.startsWith('focus')) {
      currentSection = 'focus'
      sections.push('')
      continue
    }
    
    // Accumulate content
    if (currentSection && sections.length > 0) {
      const lastIdx = sections.length - 1
      if (sections[lastIdx]) {
        sections[lastIdx] += ' ' + line
      } else {
        sections[lastIdx] = line
      }
    }
  }
  
  // Extract sections (fallback to simple split if structured parsing fails)
  if (sections.length >= 3) {
    patternSummary = sections[0] || ''
    whyItHurts = sections[1] || ''
    studyFocus = sections[2] || ''
  } else {
    // Fallback: try to split by common delimiters
    const parts = response.split(/\n\n+|---+/).filter(p => p.trim())
    patternSummary = parts[0]?.trim() || 'Pattern explanation unavailable.'
    whyItHurts = parts[1]?.trim() || 'Impact explanation unavailable.'
    studyFocus = parts[2]?.trim() || 'Study suggestions unavailable.'
  }
  
  // Clean up section text
  patternSummary = patternSummary.replace(/^(pattern summary|1\.|summary)[:\-]?\s*/i, '').trim()
  whyItHurts = whyItHurts.replace(/^(why it hurts|2\.|hurts)[:\-]?\s*/i, '').trim()
  studyFocus = studyFocus.replace(/^(study focus|3\.|focus)[:\-]?\s*/i, '').trim()
  
  // Ensure we have content
  if (!patternSummary) patternSummary = 'This pattern indicates recurring tactical errors.'
  if (!whyItHurts) whyItHurts = 'These errors lead to material loss or positional damage.'
  if (!studyFocus) studyFocus = 'Focus on tactical pattern recognition and calculation.'
  
  return {
    patternSummary,
    whyItHurts,
    studyFocus,
  }
}

/**
 * System prompt for the explanation generation
 */
const SYSTEM_PROMPT = `You are a chess coach providing factual, general explanations of blunder patterns.
Your explanations must be:
- Factual and based on chess principles
- General (no specific moves, games, or players)
- Concise (2-3 sentences per section)
- Free of motivational language or rating assumptions
- Structured exactly as requested (three sections)

Do not invent specific moves, reference specific games, or make assumptions about player strength.`

/**
 * Generates a coaching explanation for a Blunder DNA pattern
 * 
 * Requires local LLM (Ollama) to be available.
 * Returns null if local LLM is unavailable or generation fails.
 */
export async function explainBlunderPattern(pattern: BlunderPattern): Promise<CoachingExplanation | null> {
  // Guard: require local LLM
  const available = await isLocalLlmAvailable()
  if (!available) {
    return null
  }
  
  const prompt = buildExplanationPrompt(pattern)
  
  const response = await generateLocalLlmResponse(
    prompt,
    SYSTEM_PROMPT,
    {
      temperature: 0.25, // Deterministic, low temperature
      maxTokens: 500, // Keep explanations concise
    }
  )
  
  if (!response || !response.content) {
    return null
  }
  
  return parseExplanationResponse(response.content)
}
