import { parseTimeExpression } from '@/lib/timeWindows'
import type { TimeWindow } from '@/types/ProgressionSummary'
import { getOpenAIClient } from '@/lib/openaiClient'

export type TimeWindowResolution =
  | {
      window: TimeWindow
      source: 'rule'
      assumption: string | null
    }
  | {
      window: TimeWindow
      source: 'llm'
      assumption: string
    }
  | null

function getResolverClient(apiKey: string | null = null) {
  try {
    return getOpenAIClient(apiKey)
  } catch {
    return null
  }
}

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function safeParseJsonObject(text: string): any | null {
  // Try direct parse first.
  try {
    return JSON.parse(text)
  } catch {
    // Extract first {...} block.
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0])
    } catch {
      return null
    }
  }
}

export async function resolveTimeWindowFromMessage(
  message: string,
  byokKey: string | null = null,
  now: Date = new Date()
): Promise<TimeWindowResolution> {
  // 1) Fast deterministic parse.
  const ruleWindow = parseTimeExpression(message, now)
  if (ruleWindow) {
    return { window: ruleWindow, source: 'rule', assumption: null }
  }

  // Guardrail: only ask the LLM for a window when the message looks time-related.
  // This prevents unrelated messages ("in the database", "total games") from being
  // incorrectly coerced into a date range (e.g., "around christmas").
  if (!looksTimeRelated(message)) {
    return null
  }

  // 2) LLM-assisted fuzzy resolution.
  const openai = getResolverClient(byokKey)
  if (!openai) return null

  const nowIso = toIsoDate(now)

  const sys = [
    'You are a time window resolver for a chess stats app.',
    'Given a user message, choose a concrete inclusive date range [start,end] in ISO format (YYYY-MM-DD).',
    'If the message is fuzzy (e.g., "around christmas"), you MUST choose a reasonable default window and state your assumption.',
    'If the user does not specify a year, prefer the most recent relevant period in the past relative to NOW unless they clearly mean the future.',
    'Return ONLY valid JSON with keys: start, end, label, assumption.',
    'Do not include markdown.',
  ].join('\n')

  const user = [
    `NOW: ${nowIso}`,
    `MESSAGE: ${message}`,
    '',
    'Examples:',
    '- "around christmas" -> pick something like Dec 20–Dec 31 for the most recent past Christmas; assumption must mention chosen dates + year.',
    '- "between 2026-01-01 and 2026-01-10" -> start/end exactly those dates.',
    '- "since Jan 5" -> start = Jan 5 (most recent past), end = NOW.',
  ].join('\n')

  const completion = await openai.chat.completions.create({
    model: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim(),
    temperature: 0,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
  })

  const raw = completion.choices?.[0]?.message?.content ?? ''
  const obj = safeParseJsonObject(raw)
  if (!obj) return null

  const start = String(obj.start ?? '').trim()
  const end = String(obj.end ?? '').trim()
  const label = String(obj.label ?? '').trim() || 'Custom period'
  const assumption = String(obj.assumption ?? '').trim() || 'Assumed a reasonable default time window.'

  if (!isIsoDate(start) || !isIsoDate(end)) return null

  // Ensure start <= end.
  const startD = new Date(start + 'T00:00:00Z')
  const endD = new Date(end + 'T00:00:00Z')
  if (isNaN(startD.getTime()) || isNaN(endD.getTime())) return null

  const s = startD <= endD ? start : end
  const e = startD <= endD ? end : start

  return {
    source: 'llm',
    assumption,
    window: {
      start: s,
      end: e,
      label,
      gameCount: 0,
    },
  }
}

function looksTimeRelated(message: string): boolean {
  const text = message.toLowerCase()

  // Obvious numeric dates.
  if (/\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b/.test(text)) return true

  // Relative time and range cues.
  const keywords = [
    'today',
    'yesterday',
    'last',
    'this week',
    'this month',
    'this year',
    'past',
    'previous',
    'since',
    'between',
    'from',
    'to',
    'during',
    'around',
    'before',
    'after',
    'week',
    'month',
    'year',
    'days',
    'weeks',
    'months',
    'years',
  ]
  if (keywords.some((k) => text.includes(k))) return true

  // Month names (common in natural queries).
  if (/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/.test(text)) {
    return true
  }

  return false
}

