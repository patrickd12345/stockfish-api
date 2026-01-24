import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ExecutionModeProvider, useExecutionMode } from '@/contexts/ExecutionModeContext'

function ShowMode() {
  const mode = useExecutionMode()
  return <span data-testid="mode">{mode}</span>
}

describe('contexts/ExecutionModeContext', () => {
  it('useExecutionMode returns local when outside provider', () => {
    render(<ShowMode />)
    expect(screen.getByTestId('mode')).toHaveTextContent('local')
  })

  it('ExecutionModeProvider with no value defaults to local', () => {
    render(
      <ExecutionModeProvider>
        <ShowMode />
      </ExecutionModeProvider>
    )
    expect(screen.getByTestId('mode')).toHaveTextContent('local')
  })

  it('ExecutionModeProvider value=server yields server', () => {
    render(
      <ExecutionModeProvider value="server">
        <ShowMode />
      </ExecutionModeProvider>
    )
    expect(screen.getByTestId('mode')).toHaveTextContent('server')
  })

  it('ExecutionModeProvider value=local yields local', () => {
    render(
      <ExecutionModeProvider value="local">
        <ShowMode />
      </ExecutionModeProvider>
    )
    expect(screen.getByTestId('mode')).toHaveTextContent('local')
  })

  it('inner provider overrides outer', () => {
    render(
      <ExecutionModeProvider value="server">
        <span data-testid="outer">
          <ShowMode />
        </span>
        <ExecutionModeProvider value="local">
          <span data-testid="inner">
            <ShowMode />
          </span>
        </ExecutionModeProvider>
      </ExecutionModeProvider>
    )
    expect(screen.getByTestId('outer').querySelector('[data-testid="mode"]')).toHaveTextContent('server')
    expect(screen.getByTestId('inner').querySelector('[data-testid="mode"]')).toHaveTextContent('local')
  })
})
