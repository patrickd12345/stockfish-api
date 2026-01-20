import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    // Keep Vitest unit tests separate from Playwright E2E tests in `tests/**`.
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'tests/**',
      'node_modules/**',
      '.next/**',
      'playwright-report/**',
      'test-results/**',
    ],
    alias: {
      '@': resolve(__dirname, './')
    }
  },
})
