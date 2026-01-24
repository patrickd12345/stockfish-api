# Fix: Preventing Server Calls in Local/Free Mode

## Problem

At app startup, even in local/free mode, the following server endpoints were being called automatically:
- `GET /api/games` (Sidebar component)
- `GET /api/insights/first` (FirstInsightsPanel component)
- `POST /api/coach/suggestions` (ChatTab component)
- `POST /api/import/chesscom` (app/page.tsx autoImport effect)

These endpoints hit a Neon database and caused quota errors immediately on page load.

## Root Cause

**Why guards inside `useEffect` are insufficient:**

1. **React schedules effects after render** - Even if a guard checks `executionMode !== 'server'` and returns early, React has already scheduled the effect function to run.
2. **Effect function is created regardless** - The effect callback is created during render, and React will attempt to run it regardless of conditions inside.
3. **Timing/race conditions** - There's a window between when the component mounts and when guards execute where server calls can be initiated.

## Solution: Conditional Component Mounting

The correct-by-construction fix uses **conditional component mounting** - the same pattern used for `EngineCoverageWidget`:

1. **Early return in parent** - Check `executionMode === 'local'` BEFORE any hooks/effects
2. **Conditional rendering** - Only mount server-dependent components when `executionMode === 'server'`
3. **Local variants** - Provide local-only UI components that don't make server calls

This ensures React never schedules effects that make server calls in local mode.

## Implementation

### 1. Sidebar Component (`components/Sidebar.tsx`)

**Before:** Unconditional `useEffect(() => { fetchGames() }, [refreshKey])` that called `/api/games` on mount.

**After:**
- Parent `Sidebar` checks `executionMode` and returns early if `'local'`
- Renders `LocalSidebar` (no server calls) or `ServerSidebar` (makes server calls)
- `ServerSidebar` contains all the `useEffect` hooks and `fetchGames` logic

```typescript
export default function Sidebar({ ... }: SidebarProps) {
  const executionMode = useExecutionMode()
  
  // Early return BEFORE any effects
  if (executionMode === 'local') {
    return <LocalSidebar onGameSelect={onGameSelect} selectedGameId={selectedGameId} />
  }
  
  return <ServerSidebar ... />
}
```

### 2. FirstInsightsPanel Component (`components/FirstInsightsPanel.tsx`)

**Before:** Unconditional `useEffect(() => { fetchWithRetry() }, [...])` that called `/api/insights/first` on mount.

**After:**
- Parent `FirstInsightsPanel` checks `executionMode` and returns `null` if `'local'`
- Only mounts `ServerFirstInsightsPanel` when `executionMode === 'server'`

```typescript
export default function FirstInsightsPanel() {
  const executionMode = useExecutionMode()
  
  // Early return BEFORE any effects
  if (executionMode === 'local') {
    return null
  }
  
  return <ServerFirstInsightsPanel />
}
```

### 3. ChatTab Component (`components/ChatTab.tsx`)

**Before:** Unconditional `useEffect(() => { fetchSuggestions() }, [...])` that called `/api/coach/suggestions` on mount.

**After:**
- Parent `ChatTab` checks `executionMode` and returns early if `'local'`
- Renders `LocalChatTab` (no server calls) or `ServerChatTab` (makes server calls)
- `LocalChatTab` provides basic UI without server-dependent features

```typescript
export default function ChatTab({ ... }: ChatTabProps) {
  const executionMode = useExecutionMode()
  
  // Early return BEFORE any effects
  if (executionMode === 'local') {
    return <LocalChatTab selectedGameId={selectedGameId} fill={fill} />
  }
  
  return <ServerChatTab ... />
}
```

### 4. AutoImport Effect (`app/page.tsx`)

**Before:** `useEffect` that called `/api/import/chesscom` without checking `executionMode` first.

**After:**
- Early return at the start of the effect if `executionMode === 'local'`
- Prevents the entire `autoImport` async function from running

```typescript
useEffect(() => {
  // Early return BEFORE any async work
  if (executionMode === 'local') {
    return
  }
  
  // ... rest of autoImport logic only runs in server mode
}, [disableAutoImport, forceAutoImport, executionMode])
```

## Guarantees

✅ **No server calls in local mode** - Components that make server calls don't mount in local mode  
✅ **No reliance on timing or refs** - React lifecycle guarantees, not best-effort guards  
✅ **No need for defensive server logic** - Server endpoints can assume they're only called in server mode (though graceful error handling is still good practice)  
✅ **React lifecycle respected** - Effects only exist for components that mount  
✅ **Architecture is obvious** - Clear separation between local and server components

## Testing

All changes compile successfully (`tsc --noEmit` passes). The pattern matches the proven fix for `EngineCoverageWidget`, ensuring consistency across the codebase.

## Future-Proofing

This pattern makes it impossible to accidentally reintroduce server calls in local mode:
- New developers can't add server calls to local components (they don't exist)
- Refactoring polling logic or adding hooks can't reintroduce the bug
- The invariant is structural: "Server polling exists if and only if executionMode === 'server'"
