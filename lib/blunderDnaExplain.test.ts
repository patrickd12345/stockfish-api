import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildExplanationPrompt, parseExplanationResponse, explainBlunderPattern } from './blunderDnaExplain'
import { BlunderTheme, GamePhase, type BlunderPattern } from './blunderDnaV1'

// Mock localLlm module
vi.mock('./localLlm', () => ({
  isLocalLlmAvailable: vi.fn(),
  generateLocalLlmResponse: vi.fn(),
}))

describe('blunderDnaExplain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildExplanationPrompt', () => {
    it('builds prompt with correct pattern data', () => {
      const pattern: BlunderPattern = {
        theme: BlunderTheme.HANGING_PIECE,
        phase: GamePhase.MIDDLEGAME,
        count: 5,
        avgCentipawnLoss: 250,
        exampleGameIds: ['game1', 'game2'],
      }

      const prompt = buildExplanationPrompt(pattern)

      expect(prompt).toContain('hanging piece')
      expect(prompt).toContain('middlegame')
      expect(prompt).toContain('5 occurrences')
      expect(prompt).toContain('250 centipawns')
      expect(prompt).toContain('2.5 pawns')
      expect(prompt).toContain('Pattern Summary')
      expect(prompt).toContain('Why It Hurts')
      expect(prompt).toContain('Study Focus')
    })

    it('handles singular occurrence correctly', () => {
      const pattern: BlunderPattern = {
        theme: BlunderTheme.MISSED_THREAT,
        phase: GamePhase.OPENING,
        count: 1,
        avgCentipawnLoss: 180,
        exampleGameIds: [],
      }

      const prompt = buildExplanationPrompt(pattern)
      expect(prompt).toContain('1 occurrence')
    })
  })

  describe('parseExplanationResponse', () => {
    it('parses structured response with section headers', () => {
      const response = `Pattern Summary: This pattern indicates recurring tactical errors where pieces are left undefended.

Why It Hurts: These errors lead to immediate material loss, often resulting in a significant disadvantage.

Study Focus: Focus on tactical pattern recognition, calculation, and piece safety.`

      const explanation = parseExplanationResponse(response)

      expect(explanation.patternSummary).toContain('tactical errors')
      expect(explanation.whyItHurts).toContain('material loss')
      expect(explanation.studyFocus).toContain('tactical pattern')
    })

    it('parses response with numbered sections', () => {
      const response = `1. Pattern Summary: This is a pattern description.

2. Why It Hurts: This explains the impact.

3. Study Focus: This suggests study areas.`

      const explanation = parseExplanationResponse(response)

      expect(explanation.patternSummary).toBeTruthy()
      expect(explanation.whyItHurts).toBeTruthy()
      expect(explanation.studyFocus).toBeTruthy()
    })

    it('handles malformed response with fallback', () => {
      const response = `Some text here.

More text here.

Even more text.`

      const explanation = parseExplanationResponse(response)

      expect(explanation.patternSummary).toBeTruthy()
      expect(explanation.whyItHurts).toBeTruthy()
      expect(explanation.studyFocus).toBeTruthy()
    })

    it('provides defaults for empty sections', () => {
      const response = ''

      const explanation = parseExplanationResponse(response)

      expect(explanation.patternSummary).toBeTruthy()
      expect(explanation.whyItHurts).toBeTruthy()
      expect(explanation.studyFocus).toBeTruthy()
    })
  })

  describe('explainBlunderPattern', () => {
    it('returns null when local LLM is unavailable', async () => {
      const { isLocalLlmAvailable } = await import('./localLlm')
      vi.mocked(isLocalLlmAvailable).mockResolvedValue(false)

      const pattern: BlunderPattern = {
        theme: BlunderTheme.BAD_CAPTURE,
        phase: GamePhase.ENDGAME,
        count: 3,
        avgCentipawnLoss: 200,
        exampleGameIds: [],
      }

      const result = await explainBlunderPattern(pattern)
      expect(result).toBeNull()
    })

    it('returns explanation when local LLM is available', async () => {
      const { isLocalLlmAvailable, generateLocalLlmResponse } = await import('./localLlm')
      vi.mocked(isLocalLlmAvailable).mockResolvedValue(true)
      vi.mocked(generateLocalLlmResponse).mockResolvedValue({
        content: `Pattern Summary: This pattern indicates recurring tactical errors.

Why It Hurts: These errors lead to material loss.

Study Focus: Focus on tactical patterns.`,
        source: 'ollama',
      })

      const pattern: BlunderPattern = {
        theme: BlunderTheme.UNSAFE_KING,
        phase: GamePhase.MIDDLEGAME,
        count: 4,
        avgCentipawnLoss: 300,
        exampleGameIds: [],
      }

      const result = await explainBlunderPattern(pattern)

      expect(result).not.toBeNull()
      expect(result?.patternSummary).toBeTruthy()
      expect(result?.whyItHurts).toBeTruthy()
      expect(result?.studyFocus).toBeTruthy()
      expect(generateLocalLlmResponse).toHaveBeenCalledWith(
        expect.stringContaining('unsafe king'),
        expect.stringContaining('chess coach'),
        expect.objectContaining({
          temperature: 0.25,
          maxTokens: 500,
        })
      )
    })

    it('returns null when generation fails', async () => {
      const { isLocalLlmAvailable, generateLocalLlmResponse } = await import('./localLlm')
      vi.mocked(isLocalLlmAvailable).mockResolvedValue(true)
      vi.mocked(generateLocalLlmResponse).mockResolvedValue(null)

      const pattern: BlunderPattern = {
        theme: BlunderTheme.MISSED_WIN,
        phase: GamePhase.OPENING,
        count: 2,
        avgCentipawnLoss: 400,
        exampleGameIds: [],
      }

      const result = await explainBlunderPattern(pattern)
      expect(result).toBeNull()
    })
  })
})
