export type AgentTone = 'neutral' | 'empathic' | 'jockey' | 'sarcastic'

export const AGENT_TONE_STORAGE_KEY = 'agent_tone_v1'

export const AGENT_TONE_OPTIONS: Array<{
  value: AgentTone
  label: string
  description: string
  example: string
}> = [
  {
    value: 'neutral',
    label: 'Neutral',
    description: 'Direct, calm, analytical. No fluff.',
    example: '“You’re slightly worse. Trade queens and stabilize the king.”'
  },
  {
    value: 'empathic',
    label: 'Empathic',
    description: 'Supportive and encouraging, still precise.',
    example: '“Tough moment, but it’s fixable. Focus on king safety first.”'
  },
  {
    value: 'jockey',
    label: 'Jockey',
    description: 'Playful, hype, light banter.',
    example: '“Nice! Now keep the pressure—don’t let them breathe.”'
  },
  {
    value: 'sarcastic',
    label: 'Sarcastic',
    description: 'Dry humor, witty, never mean-spirited.',
    example: '“Bold choice. Anyway, let’s save the position with a solid defense.”'
  }
]

export function normalizeAgentTone(value: unknown): AgentTone {
  if (value === 'neutral' || value === 'empathic' || value === 'jockey' || value === 'sarcastic') {
    return value
  }
  return 'neutral'
}

