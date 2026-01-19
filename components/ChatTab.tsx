'use client'

import { useState, useRef, useEffect } from 'react'
import ChessBoard from './ChessBoard'
import SuggestionBubbles from './SuggestionBubbles'

interface Message {
  role: 'user' | 'assistant'
  content: string
  boardSvg?: string
}

interface ChatTabProps {
  selectedGameId?: string | null
  fill?: boolean
  currentPage?: string
}

export default function ChatTab({ selectedGameId, fill = false, currentPage }: ChatTabProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async (message: string) => {
    if (!message.trim() || loading) return

    const userMessage: Message = { role: 'user', content: message }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message,
          gameId: selectedGameId 
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response')
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.content || data.response || 'No response',
        boardSvg: data.boardSvg,
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error: any) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${error.message}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const fetchSuggestions = async () => {
      const lastMessage = messages[messages.length - 1]?.content ?? ''
      try {
        const res = await fetch('/api/coach/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            page: currentPage || 'chat',
            gameState: null,
            lastMessage,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch suggestions')
        }
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
      } catch {
        setSuggestions([])
      }
    }

    fetchSuggestions()
  }, [currentPage, selectedGameId, messages])

  return (
    <div
      className="card"
      style={
        fill
          ? {
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: 0,
            }
          : undefined
      }
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Coach Chat</h2>
        {selectedGameId && (
          <div style={{ fontSize: '12px', color: '#2563eb', background: '#dbeafe', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold' }}>
            Context: Game {selectedGameId.substring(0, 8)}...
          </div>
        )}
      </div>

      <div
        style={{
          height: fill ? undefined : '600px',
          flex: fill ? 1 : undefined,
          minHeight: fill ? 0 : undefined,
          overflowY: 'auto',
          marginBottom: '20px',
          padding: '20px',
          background: '#f9fafb',
          borderRadius: '8px',
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#6b7280', textAlign: 'center', marginTop: '50px' }}>
            Start a conversation with your chess coach
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: '20px',
              padding: '15px',
              background: msg.role === 'user' ? '#dbeafe' : 'white',
              borderRadius: '8px',
              borderLeft: `4px solid ${msg.role === 'user' ? '#2563eb' : '#10b981'}`,
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>
              {msg.role === 'user' ? 'You' : 'Coach'}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', color: '#1f2937' }}>{msg.content}</div>
            {msg.boardSvg && (
              <div style={{ marginTop: '15px' }}>
                <ChessBoard svg={msg.boardSvg} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ color: '#6b7280', fontStyle: 'italic' }}>Coach is thinking...</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <SuggestionBubbles
        suggestions={suggestions}
        onSelect={(text) => handleSend(text)}
        disabled={loading}
      />

      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          placeholder="Ask your coach"
          className="input"
          disabled={loading}
        />
        <button onClick={() => handleSend(input)} disabled={loading || !input.trim()} className="button">
          Send
        </button>
      </div>
    </div>
  )
}
