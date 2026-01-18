# Progression Analysis Backfill

This document explains how to perform a one-time backfill of progression analysis for existing games.

## Overview

The batch analysis system requires an initial computation of the `ProgressionSummary` from all existing games in the database. This is a **one-time operation** that should be performed after implementing the batch analysis system.

## When to Run Backfill

Run the backfill when:
- ✅ You have existing games in the database
- ✅ You've just implemented the batch analysis system
- ✅ The progression analysis is missing or outdated
- ❌ **DO NOT** run automatically on app startup
- ❌ **DO NOT** run during `/api/chat` requests

## Method

**There is exactly ONE supported backfill method:**

```bash
npm run rebuild:progression
```

This runs the TypeScript script directly with interactive prompts.

**Alternative direct execution:**
```bash
npx tsx scripts/rebuild-progression.ts
```

**Note:** Batch analysis must be intentional, heavy, and non-addressable via HTTP. No runtime API may trigger global recomputation.

## What Happens During Backfill

1. **Loads all games** from the database ordered by date
2. **Processes games in chunks** (100 at a time) to avoid memory issues
3. **Computes comprehensive statistics** (facts only, no interpretation):
   - Overall win/loss/draw rates
   - Accuracy trends over time
   - Blunder analysis
   - Opening performance
   - Peak performance periods
   - Neutral performance signals
4. **Stores the authoritative summary** in the `progression_summaries` table
5. **Makes data available** to the chat agent immediately

**Important:** The batch analysis layer emits only facts, metrics, trends, and neutral signals. Interpretation and coaching language are generated exclusively by the chat agent at prompt time, never stored.

## After Backfill

Once the backfill completes:
- ✅ The chat agent will have full progression awareness
- ✅ Future game imports will automatically update the analysis
- ✅ No manual intervention needed for new games
- ✅ The stored summary becomes the authoritative source

## Example Output

```
🚀 Starting one-time progression backfill...
============================================================
📋 Checking current progression summary status...
📊 Current game count: 9,880

🔄 Running batch analysis pipeline...
============================================================
📊 Loading all games from database...
📈 Processing 9,880 games...
🔍 Processing chunk 1/99
🔍 Processing chunk 2/99
...
📊 Computing statistics...
💾 Storing progression summary...
✅ Batch analysis completed successfully
============================================================
✅ Backfill completed successfully!
⏱️  Duration: 45.23 seconds

📈 Summary:
   - Total games analyzed: 9,880
   - Period: 2024-04-07 → 2026-01-17
   - Win rate: 97.0%
   - Average accuracy: 100.0%
   - Average blunders: 0.00 per game
   - Computed at: 2026-01-18T00:15:30.123Z

🏆 Strongest opening: Sicilian Defense (98.5% win rate)

📊 Accuracy trend: improving

🎉 The progression analysis is now available to the chat agent!
   Future game imports will automatically update the analysis.
```

## Troubleshooting

### "No games found in database"
- Import some games first using `/api/process-pgn` or `/api/import/chesscom`

### "Progression summary already exists"
- Answer 'y' in the script to rebuild anyway

### "Database connection failed"
- Check your `POSTGRES_URL` environment variable
- Ensure the database is running and accessible

### "Batch analysis failed"
- Check the console logs for specific error details
- Ensure all required dependencies are installed
- Verify the database schema includes the `progression_summaries` table

## Important Notes

- **Batch analysis is intentional and heavy** - it processes all games in the database
- **No HTTP endpoint exists** - batch analysis cannot be triggered via API
- **Facts only** - stored summaries contain metrics and trends, not recommendations
- **Chat agent interprets** - coaching language is generated at prompt time, never stored