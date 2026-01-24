import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ExecutionModeProvider } from '@/contexts/ExecutionModeContext'
import EngineCoverageWidget from '@/components/EngineCoverageWidget'

function coverageOk() {
  return {
    ok: true,
    engineName: 'stockfish',
    analysisDepth: 15,
    coverage: { totalGames: 10, analyzedGames: 2, failedGames: 0, pendingGames: 8 },
    updatedAt: new Date().toISOString(),
  }
}

function queueOk() {
  return {
    ok: true,
    engineName: 'stockfish',
    analysisDepth: 15,
    stats: { total: 8, pending: 8, processing: 0, done: 0, failed: 0, staleProcessing: 0 },
    updatedAt: new Date().toISOString(),
  }
}

describe('components/EngineCoverageWidget', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.startsWith('/api/engine/coverage')) {
          return { ok: true, json: async () => coverageOk() } as Response
        }
        if (u.includes('/api/engine/queue/diagnostics')) {
          return { ok: true, json: async () => queueOk() } as Response
        }
        return { ok: false, json: async () => ({ error: 'unknown' }) } as Response
      })
    )
  })

  it('shows Resume when executionMode is server and coverage loaded', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.startsWith('/api/engine/coverage')) return { ok: true, json: async () => coverageOk() } as Response
      if (u.includes('diagnostics')) return { ok: true, json: async () => queueOk() } as Response
      return { ok: false, json: async () => ({}) } as Response
    })
    vi.stubGlobal('fetch', fetchSpy)

    render(
      <ExecutionModeProvider value="server">
        <EngineCoverageWidget active />
      </ExecutionModeProvider>
    )

    await waitFor(() => {
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    })
    const resumeBtn = await screen.findByRole('button', { name: /Resume/i })
    expect(resumeBtn).toBeEnabled()
  })

  it('shows local-only status and no Resume when executionMode is local', () => {
    render(
      <ExecutionModeProvider value="local">
        <EngineCoverageWidget active />
      </ExecutionModeProvider>
    )

    expect(screen.getByText(/Engine: local only/i)).toBeInTheDocument()
    expect(screen.getByText(/Server analysis off in this mode/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Resume/i })).not.toBeInTheDocument()
  })

  it('does not call fetch for /api/engine/analyze or /api/engine/analyze/worker when executionMode is local', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.startsWith('/api/engine/coverage')) return { ok: true, json: async () => coverageOk() } as Response
      if (u.includes('diagnostics')) return { ok: true, json: async () => queueOk() } as Response
      return { ok: false, json: async () => ({}) } as Response
    })
    vi.stubGlobal('fetch', fetchSpy)

    render(
      <ExecutionModeProvider value="local">
        <EngineCoverageWidget active />
      </ExecutionModeProvider>
    )

    expect(screen.getByText(/Engine: local only/i)).toBeInTheDocument()

    const analyzeCalls = fetchSpy.mock.calls.filter(
      ([url]) => String(url).includes('/api/engine/analyze') && !String(url).includes('coverage') && !String(url).includes('diagnostics')
    )
    expect(analyzeCalls.length).toBe(0)
  })

  it('calls fetch for /api/engine/analyze when server and Resume clicked', async () => {
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.startsWith('/api/engine/coverage')) return { ok: true, json: async () => coverageOk() } as Response
      if (u.includes('diagnostics')) return { ok: true, json: async () => queueOk() } as Response
      if (u === '/api/engine/analyze' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ ok: true, enqueued: 0, skipped: 0 }) } as Response
      }
      if (u === '/api/engine/analyze/worker' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ ok: true, processed: 0, succeeded: 0, failed: 0, autoEnqueued: 0 }) } as Response
      }
      return { ok: false, json: async () => ({}) } as Response
    })
    vi.stubGlobal('fetch', fetchSpy)

    render(
      <ExecutionModeProvider value="server">
        <EngineCoverageWidget active />
      </ExecutionModeProvider>
    )

    await waitFor(() => {
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    })
    const resumeBtn = await screen.findByRole('button', { name: /Resume/i })
    await userEvent.setup().click(resumeBtn)

    await waitFor(() => {
      const analyzePostCalls = fetchSpy.mock.calls.filter(
        ([url, init]) => String(url) === '/api/engine/analyze' && (init as RequestInit)?.method === 'POST'
      )
      expect(analyzePostCalls.length).toBeGreaterThan(0)
    })
  })
})
