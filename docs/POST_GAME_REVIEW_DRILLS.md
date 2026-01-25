# Post-Game Review Drill Creation

## Overview

The post-game review drill creation feature allows users to convert post-game AI coach reviews into practice drills that are automatically integrated into the Blunder DNA training system. When a game ends, the AI coach suggests a "next-step drill or focus" in the review text. Users can now click a button to create an actual drill from that suggestion, which becomes part of their personalized training program.

## User Flow

1. **Game Completion**: After a Lichess game ends, the post-game review is automatically generated
2. **Review Display**: The review appears in the LiveCommentary overlay (post-game mode) or PostGameReview component
3. **Drill Creation**: User clicks "📚 Create Drill from Review" button
4. **Drill Generation**: System analyzes the game position and creates a drill record
5. **Integration**: Drill appears in the Blunder DNA tab for practice
6. **Practice**: User can practice the drill in the Daily Drills section

## Features

### 1. Automatic Drill Creation
- Extracts drill suggestion from post-game review text
- Analyzes the game position with Stockfish engine
- Infers pattern tag from review content (hanging_piece, missed_threat, missed_win, unsafe_king, bad_capture, time_trouble_collapse)
- Creates drill record linked to the specific game and position

### 2. Blunder DNA Integration
- Drills are stored in `blunder_dna_drills` table
- Automatically added to mastery tracking system
- Included in daily drills queue
- Linked to the original Lichess game for reference

### 3. Related Drills Display
- Shows count of drills from the current game
- Provides link to Blunder DNA tab to view/practice drills
- Updates automatically after creating new drills

## API Endpoints

### POST `/api/blunder-dna/create-drill`

Creates a drill from a post-game review.

**Authentication**: Requires `lichess_user_id` cookie and `blunder_dna` feature access

**Request Body**:
```json
{
  "lichessGameId": "string (required)",
  "fen": "string (required)",
  "moves": "string (required, PGN format)",
  "myColor": "white" | "black",
  "review": "string (review text)",
  "evaluation": "number (centipawns)",
  "bestMove": "string (UCI)",
  "bestLine": "string (space-separated UCI moves)",
  "depth": "number (analysis depth)"
}
```

**Response**:
```json
{
  "success": true,
  "drill": {
    "drillId": "uuid",
    "lichessGameId": "string",
    "ply": "number",
    "fen": "string",
    "patternTag": "PatternTag",
    "difficulty": "number (1-5)"
  }
}
```

**Error Responses**:
- `400`: Missing required fields
- `401`: Unauthorized (missing cookie)
- `403`: Feature access denied
- `500`: Server error

### GET `/api/blunder-dna/game-drills?gameId={gameId}`

Gets all drills for a specific Lichess game.

**Authentication**: Requires `lichess_user_id` cookie

**Query Parameters**:
- `gameId` (required): Lichess game ID

**Response**:
```json
{
  "drills": [
    {
      "drillId": "uuid",
      "ply": "number",
      "patternTag": "PatternTag",
      "difficulty": "number",
      "createdAt": "ISO date string"
    }
  ]
}
```

## Technical Implementation

### Pattern Tag Inference

The system analyzes the review text to determine the appropriate pattern tag:

| Pattern Tag | Keywords |
|------------|----------|
| `hanging_piece` | "hanging", "en prise", "capture" |
| `missed_threat` | "threat", "tactic" |
| `missed_win` | "win", "winning" |
| `unsafe_king` | "king", "safety", "check" |
| `time_trouble_collapse` | "time", "clock" |
| `bad_capture` | "bad" + "capture" |
| `missed_threat` (default) | (fallback) |

### Drill Creation Process

1. **Position Analysis**: Uses Stockfish to analyze the final position (or critical position if identified)
2. **Move Extraction**: Extracts best move and principal variation
3. **Evaluation**: Calculates evaluation before and after the position
4. **Difficulty Calculation**: Based on evaluation swing (1-5 scale)
5. **Database Storage**: Creates drill record with conflict handling (prevents duplicates)
6. **Mastery Tracking**: Initializes mastery row for spaced repetition

### Component Integration

#### LiveCommentary Component
- Used in LichessLiveTab for post-game reviews
- Accepts `lichessGameId` prop
- Shows "Create Drill" button when:
  - `variant === 'postGame'`
  - Review has been generated
  - `lichessGameId` is available
- Displays related drills count and link to Blunder DNA tab

#### PostGameReview Component
- Standalone component for post-game reviews
- Accepts `lichessGameId` prop
- Includes drill creation functionality
- Can be used in other contexts (e.g., Game Inspector)

## Database Schema

Drills are stored in the `blunder_dna_drills` table:

```sql
CREATE TABLE blunder_dna_drills (
  drill_id UUID PRIMARY KEY,
  lichess_user_id TEXT NOT NULL,
  lichess_game_id TEXT NOT NULL,
  ply INT NOT NULL,
  fen TEXT NOT NULL,
  side_to_move TEXT NOT NULL,
  my_move TEXT NOT NULL,
  best_move TEXT NOT NULL,
  pv TEXT NOT NULL,
  eval_before INT NOT NULL,
  eval_after INT NOT NULL,
  pattern_tag TEXT NOT NULL,
  difficulty INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lichess_user_id, lichess_game_id, ply, pattern_tag)
);
```

## Feature Access

- **Feature Gate**: `blunder_dna`
- **Required Capabilities**: `serverExecution`, `database`, `persistence`
- **Tier**: `PRO` (requires Pro subscription)

## Usage Examples

### Creating a Drill from Post-Game Review

```typescript
// In LiveCommentary component (post-game mode)
const handleCreateDrill = async () => {
  const res = await fetch('/api/blunder-dna/create-drill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lichessGameId: 'abc123',
      fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
      moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6',
      myColor: 'white',
      review: 'You missed a tactical opportunity...',
      evaluation: 150,
      bestMove: 'e4e5',
      bestLine: 'e4e5 d6e5 Nf3e5',
      depth: 15
    })
  })
  
  const json = await res.json()
  if (json.success) {
    // Drill created successfully
  }
}
```

### Fetching Drills for a Game

```typescript
const fetchGameDrills = async (gameId: string) => {
  const res = await fetch(`/api/blunder-dna/game-drills?gameId=${gameId}`)
  const json = await res.json()
  return json.drills // Array of drill objects
}
```

## Integration Points

### Blunder DNA Tab
- Drills created from post-game reviews appear in the Daily Drills section
- Can be filtered by pattern tag or game phase
- Supports spaced repetition via mastery tracking

### Daily Queue System
- New drills are automatically considered for the daily queue
- Queue is rebuilt daily based on:
  - Weakest pattern (highest priority)
  - Mastery status (due date)
  - Difficulty level

## Future Enhancements

Potential improvements:
1. **Multi-position drills**: Extract multiple critical positions from a single game
2. **Review text parsing**: More sophisticated extraction of drill suggestions
3. **Custom drill notes**: Allow users to add personal notes to drills
4. **Drill sharing**: Share drills with other users via DNA share links
5. **Auto-create option**: Automatically create drills for all post-game reviews

## Related Documentation

- [Blunder DNA Architecture](./ARCHITECTURE_CAPABILITIES_AND_TIERS.md)
- [Feature Access System](./AUTH_ENTITLEMENT_AUDIT.md)
- Database Schema: `lib/sql/migrations/003_blunder_dna.sql`
