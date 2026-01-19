import '@testing-library/jest-dom/vitest'

// JSDOM doesn't implement scrollIntoView; components may call it.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {
    return
  }
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// JSDOM doesn't ship a Worker implementation (used by Stockfish WASM worker)
if (!globalThis.Worker) {
  class MockWorker {
    public onmessage: ((event: { data: any }) => void) | null = null
    
    constructor(_url: string | URL) {}

    postMessage(_message: any) {}

    terminate() {}
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).Worker = MockWorker
}
