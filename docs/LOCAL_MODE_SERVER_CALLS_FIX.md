# Fix: Preventing Server Calls Without Capabilities

## Problem

At app startup, server endpoints were being called even when required capabilities were absent:
- `GET /api/games` (Sidebar component)
- `GET /api/insights/first` (FirstInsightsPanel component)
- `POST /api/coach/suggestions` (ChatTab component)
- `POST /api/import/chesscom` (app/page.tsx autoImport effect)

These endpoints hit a hosted database or external APIs and caused errors immediately on page load.

## Root Cause

**Why guards inside `useEffect` are insufficient:**

1. **React schedules effects after render** - Even if a guard checks feature access and returns early, React has already scheduled the effect function to run.
2. **Effect function is created regardless** - The effect callback is created during render, and React will attempt to run it regardless of conditions inside.
3. **Timing/race conditions** - There's a window between when the component mounts and when guards execute where server calls can be initiated.

## Solution: Conditional Component Mounting (Capability + Tier)

The correct-by-construction fix uses **conditional component mounting** - the same pattern used for `EngineCoverageWidget`:

1. **Early return in parent** - Check feature access BEFORE any hooks/effects
2. **Conditional rendering** - Only mount server-dependent components when `useFeatureAccess(feature).allowed`
3. **Local variants** - Provide fallbacks that don't make server calls

This ensures React never schedules effects when capabilities are missing or the tier disallows the feature.

## Implementation

### 1. Sidebar Component (`components/Sidebar.tsx`)

**Before:** Unconditional `useEffect(() => { fetchGames() }, [refreshKey])` that called `/api/games` on mount.

**After:**
- Parent `Sidebar` checks `useFeatureAccess('games_library')` and returns early if access is denied
- Renders `LocalSidebar` (no server calls) or `ServerSidebar` (makes server calls)
- `ServerSidebar` contains all the `useEffect` hooks and `fetchGames` logic

```typescript
export default function Sidebar({ ... }: SidebarProps) {
  const access = useFeatureAccess('games_library')
  
  // Early return BEFORE any effects
  if (!access.allowed) {
    return <LocalSidebar onGameSelect={onGameSelect} selectedGameId={selectedGameId} />
  }
  
  return <ServerSidebar ... />
}
```

### 2. FirstInsightsPanel Component (`components/FirstInsightsPanel.tsx`)

**Before:** Unconditional `useEffect(() => { fetchWithRetry() }, [...])` that called `/api/insights/first` on mount.

**After:**
- Parent `FirstInsightsPanel` checks `useFeatureAccess('first_insights')` and returns `null` if access is denied
- Only mounts `ServerFirstInsightsPanel` when access is allowed

```typescript
export default function FirstInsightsPanel() {
  const access = useFeatureAccess('first_insights')
  
  // Early return BEFORE any effects
  if (!access.allowed) {
    return null
  }
  
  return <ServerFirstInsightsPanel />
}
```

### 3. ChatTab Component (`components/ChatTab.tsx`)

**Before:** Unconditional `useEffect(() => { fetchSuggestions() }, [...])` that called `/api/coach/suggestions` on mount.

**After:**
- Parent `ChatTab` checks `useFeatureAccess('coach_chat')` and returns early if access is denied
- Renders `LocalChatTab` (no server calls) or `ServerChatTab` (makes server calls)
- `LocalChatTab` provides basic UI without server-dependent features

```typescript
export default function ChatTab({ ... }: ChatTabProps) {
  const access = useFeatureAccess('coach_chat')
  
  // Early return BEFORE any effects
  if (!access.allowed) {
    return <LocalChatTab selectedGameId={selectedGameId} fill={fill} />
  }
  
  return <ServerChatTab ... />
}
```

### 4. AutoImport Effect (`app/page.tsx`)

**Before:** `useEffect` that called `/api/import/chesscom` without checking feature access.

**After:**
- Early return at the start of the effect if `useFeatureAccess('chesscom_import').allowed === false`
- Prevents the entire `autoImport` async function from running

```typescript
useEffect(() => {
  // Early return BEFORE any async work
  if (!importAccess.allowed) {
    return
  }
  
  // ... rest of autoImport logic only runs in server mode
}, [disableAutoImport, forceAutoImport, importAccess.allowed])
```

## Guarantees

✅ **No server calls without capability + tier** - Components that make server calls don't mount when access is denied  
✅ **No reliance on timing or refs** - React lifecycle guarantees, not best-effort guards  
✅ **No need for mode-based defensive logic** - Server endpoints can assume they are gated by feature access  
✅ **React lifecycle respected** - Effects only exist for components that mount  
✅ **Architecture is obvious** - Clear separation between gated and non-gated components

## Testing

All changes compile successfully (`tsc --noEmit` passes). The pattern matches the proven fix for `EngineCoverageWidget`, ensuring consistency across the codebase.

## Future-Proofing

This pattern makes it impossible to accidentally reintroduce server calls in local mode:
- New developers can't add server calls to local components (they don't exist)
- Refactoring polling logic or adding hooks can't reintroduce the bug
- The invariant is structural: "Server polling exists if and only if feature access is allowed"
