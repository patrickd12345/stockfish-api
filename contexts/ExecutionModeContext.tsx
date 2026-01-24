'use client'

import { createContext, useContext, type ReactNode } from 'react'

export type ExecutionMode = 'local' | 'server'

const defaultMode: ExecutionMode = 'local'

const ExecutionModeContext = createContext<ExecutionMode>(defaultMode)

export function ExecutionModeProvider({ children, value = defaultMode }: { children: ReactNode; value?: ExecutionMode }) {
  return (
    <ExecutionModeContext.Provider value={value}>
      {children}
    </ExecutionModeContext.Provider>
  )
}

export function useExecutionMode(): ExecutionMode {
  return useContext(ExecutionModeContext) ?? defaultMode
}
