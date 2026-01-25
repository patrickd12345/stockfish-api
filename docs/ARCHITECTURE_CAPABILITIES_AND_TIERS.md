## Capabilities and Tiers: Core Invariant

This system enforces **feature availability** by a strict two-axis rule:

**A feature is available iff required capabilities are present AND the user’s tier explicitly allows it.**

No feature may rely on environment names (local/dev/prod), mode strings, or implicit tier behavior.

This document is the canonical authority. If code and this document diverge, this document is authoritative.

---

### Capability Model (Facts)

Capabilities are derived from runtime facts, not labels.

Current capability keys:
- `serverExecution` — true when running server-side.
- `outboundNetwork` — true unless explicitly sandboxed (`OUTBOUND_NETWORK_DISABLED=true` or `SANDBOXED=true`).
- `database` — true when a database connection string is configured.
- `persistence` — true when the database is configured **and** not flagged read-only (`READONLY_DB`, `DATABASE_READ_ONLY`, `READ_ONLY_DB`).
- `secrets` — true when required server secrets are present (e.g. Lichess, AI, Stripe).

Negative capabilities are explicit and supported (e.g. `outboundNetwork=false` in sandboxed/test contexts).

---

### Tier Model (Policy — Explicit)

Tiers are explicit policy, not implicit behavior.  
Current tiers:
- `ANON`
- `FREE`
- `PRO`

**Policy is set in code** at `lib/tierPolicy.ts`.  
Updates to tier allowances must be deliberate and reflected here and in the mapping below.

---

### Feature Registry (Source of Truth)

Each feature declares:
1) Required capabilities  
2) Allowed tiers

Feature keys are **snake_case** and **never renamed** once published.

Registry: `lib/featureRegistry.ts`  
Tier policy: `lib/tierPolicy.ts`

#### Feature → Capabilities → Tiers

| Feature Key | Required Capabilities | Allowed Tiers |
| --- | --- | --- |
| `engine_analysis` | `serverExecution`, `database`, `persistence` | `PRO` |
| `batch_analysis` | `serverExecution`, `database`, `persistence` | `PRO` |
| `blunder_dna` | `serverExecution`, `database`, `persistence` | `PRO` |
| `blunder_dna_create_drill` | `serverExecution`, `database`, `persistence` | `PRO` (inherits from `blunder_dna`) |
| `deep_analysis` | `serverExecution`, `database`, `persistence` | `PRO` |
| `unlimited_analysis` | `serverExecution`, `database`, `persistence` | `PRO` |
| `engine_coverage` | `serverExecution`, `database` | `ANON`, `FREE`, `PRO` |
| `lichess_live` | `serverExecution`, `outboundNetwork`, `database`, `persistence`, `secrets` | `FREE`, `PRO` |
| `games_library` | `serverExecution`, `database` | `ANON`, `FREE`, `PRO` |
| `first_insights` | `serverExecution`, `database` | `ANON`, `FREE`, `PRO` |
| `chesscom_import` | `serverExecution`, `outboundNetwork`, `database`, `persistence` | `ANON`, `FREE`, `PRO` |
| `coach_chat` | `serverExecution`, `outboundNetwork`, `secrets` | `ANON`, `FREE`, `PRO` |

---

### Error Semantics (Mandatory)

- **Capability failure:** `Feature X is not supported in this environment.`
- **Tier failure:** `Upgrade required to use Feature X.`

These messages are enforced in `lib/featureGate/core.ts`.

---

### Core / Server Split

- `lib/featureGate/core.ts` contains pure, deterministic feature access logic and is safe for client and server usage.
- `lib/featureGate/server.ts` contains enforcement logic that depends on cookies, billing, and the database, and must never be imported by client code.
- **Invariant:** Client code imports from `lib/featureGate/core.ts` only.

---

### Enforcement API

Single source of enforcement:
- **Server-side:** `requireFeature()` / `requireFeatureForUser()`  
- **Client-side:** `canUseFeature()` / `useFeatureAccess()`

No new feature may ship unless it is:
1) Added to the feature registry  
2) Mapped to capabilities  
3) Explicitly allowed by tier policy  
4) Reflected in this document

