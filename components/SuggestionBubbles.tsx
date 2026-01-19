'use client'

interface SuggestionBubblesProps {
  suggestions: string[]
  onSelect: (text: string) => void
  disabled?: boolean
}

export default function SuggestionBubbles({
  suggestions,
  onSelect,
  disabled = false,
}: SuggestionBubblesProps) {
  if (suggestions.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSelect(suggestion)}
          disabled={disabled}
          style={{
            padding: '6px 12px',
            borderRadius: '999px',
            border: '1px solid #c7d2fe',
            background: '#eef2ff',
            color: '#3730a3',
            fontSize: '12px',
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
