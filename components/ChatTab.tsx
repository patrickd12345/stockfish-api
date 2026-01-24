'use client'

import { useState, useRef, useEffect } from 'react'
import ChessBoard from './ChessBoard'
import LiveCommentary from './LiveCommentary'
import SuggestionBubbles from './SuggestionBubbles'
import FirstInsightsPanel from '@/components/FirstInsightsPanel'
import { useExecutionMode } from '@/contexts/ExecutionModeContext'

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

function LocalChatTab({ selectedGameId, fill = false }: ChatTabProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
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
      // Lichess live games use `lichess:<gameId>` ids in the UI list.
      // Those aren't stored in the `games` table yet, so don't pass them as DB game context.
      const safeGameId =
        selectedGameId && selectedGameId.startsWith('lichess:') ? null : selectedGameId

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message,
          gameId: safeGameId 
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

  return (
    <div
      className={`glass-panel p-6 ${fill ? 'flex flex-col h-full min-h-0' : ''}`}
    >
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-xl font-bold text-terracotta tracking-tight">Coach Chat</h2>
        {selectedGameId && (
          <div className="text-xs font-semibold text-terracotta-dark bg-terracotta/10 border border-terracotta/20 px-3 py-1 rounded-full">
            Context: Game {selectedGameId.substring(0, 8)}...
          </div>
        )}
      </div>

      <div
        className={`bg-sage-950/30 rounded-xl p-4 mb-4 overflow-y-auto ${fill ? 'flex-1 min-h-0' : 'h-[600px]'} border border-white/5 scrollbar-hide`}
      >
        {messages.length === 0 && (
          <div className="text-sage-500 italic text-center mt-12">
            Start a conversation with your chess coach
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`mb-4 p-4 rounded-xl border max-w-[90%] ${
              msg.role === 'user'
                ? 'ml-auto bg-terracotta/10 border-terracotta/20 text-sage-100 rounded-tr-none'
                : 'mr-auto bg-sage-800/60 border-white/5 text-sage-200 rounded-tl-none'
            }`}
          >
            <div className={`font-bold text-xs mb-2 uppercase tracking-wider ${msg.role === 'user' ? 'text-terracotta' : 'text-ochre'}`}>
              {msg.role === 'user' ? 'You' : 'Coach'}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
            {msg.boardSvg && (
              <div className="mt-4 bg-sage-900 p-2 rounded-lg inline-block">
                <ChessBoard svg={msg.boardSvg} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="text-sage-500 text-sm animate-pulse ml-4 mb-4">Coach is thinking...</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          placeholder="Ask your coach..."
          className="flex-1 bg-sage-900/50 border border-sage-700/50 rounded-lg px-4 py-3 text-sage-100 placeholder-sage-500 focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/20 transition-all"
          disabled={loading}
        />
        <button
            onClick={() => handleSend(input)}
            disabled={loading || !input.trim()}
            className="btn-primary"
        >
          Send
        </button>
      </div>
    </div>
  )
}

function ServerChatTab({ selectedGameId, fill = false, currentPage }: ChatTabProps) {
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
      // Lichess live games use `lichess:<gameId>` ids in the UI list.
      // Those aren't stored in the `games` table yet, so don't pass them as DB game context.
      const safeGameId =
        selectedGameId && selectedGameId.startsWith('lichess:') ? null : selectedGameId

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message,
          gameId: safeGameId 
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
      className={`glass-panel p-6 ${fill ? 'flex flex-col h-full min-h-0' : ''}`}
    >
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-xl font-bold text-terracotta tracking-tight">Coach Chat</h2>
        {selectedGameId && (
          <div className="text-xs font-semibold text-terracotta-dark bg-terracotta/10 border border-terracotta/20 px-3 py-1 rounded-full">
            Context: Game {selectedGameId.substring(0, 8)}...
          </div>
        )}
      </div>

      <FirstInsightsPanel />

      <div
        className={`bg-sage-950/30 rounded-xl p-4 mb-4 overflow-y-auto ${fill ? 'flex-1 min-h-0' : 'h-[600px]'} border border-white/5 scrollbar-hide`}
      >
        {messages.length === 0 && (
          <div className="text-sage-500 italic text-center mt-12">
            Start a conversation with your chess coach
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`mb-4 p-4 rounded-xl border max-w-[90%] ${
              msg.role === 'user'
                ? 'ml-auto bg-terracotta/10 border-terracotta/20 text-sage-100 rounded-tr-none'
                : 'mr-auto bg-sage-800/60 border-white/5 text-sage-200 rounded-tl-none'
            }`}
          >
            <div className={`font-bold text-xs mb-2 uppercase tracking-wider ${msg.role === 'user' ? 'text-terracotta' : 'text-ochre'}`}>
              {msg.role === 'user' ? 'You' : 'Coach'}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
            {msg.boardSvg && (
              <div className="mt-4 bg-sage-900 p-2 rounded-lg inline-block">
                <ChessBoard svg={msg.boardSvg} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="text-sage-500 text-sm animate-pulse ml-4 mb-4">Coach is thinking...</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <SuggestionBubbles
        suggestions={suggestions}
        onSelect={(text) => handleSend(text)}
        disabled={loading}
      />

      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          placeholder="Ask your coach..."
          className="flex-1 bg-sage-900/50 border border-sage-700/50 rounded-lg px-4 py-3 text-sage-100 placeholder-sage-500 focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/20 transition-all"
          disabled={loading}
        />
        <button
            onClick={() => handleSend(input)}
            disabled={loading || !input.trim()}
            className="btn-primary"
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default function ChatTab(props: ChatTabProps) {
  const executionMode = useExecutionMode()
  
  // Early return BEFORE any effects
  if (executionMode === 'local') {
    return <LocalChatTab selectedGameId={props.selectedGameId} fill={props.fill} />
  }
  
  return <ServerChatTab {...props} />
}
