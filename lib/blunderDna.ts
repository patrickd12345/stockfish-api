import { Chess } from 'chess.js'
import { connectToDb, getSql, isDbConfigured } from '@/lib/database'
import { lichessFetch } from '@/lib/lichess/apiClient'
import { resolveStockfishPath } from '@/lib/stockfish'
import { StockfishEngine } from '@/lib/stockfish'
import { getLichessToken } from '@/lib/lichess/tokenStorage'

export type PatternTag =
  | 'hanging_piece'
  | 'missed_threat'
  | 'missed_win'
  | 'unsafe_king'
  | 'bad_capture'
  | 'time_trouble_collapse'

export const PATTERN_TAXONOMY_V1: Record<PatternTag, { label: string; description: string }> = {
  hanging_piece: {
    label: 'Hanging piece (one-move loss)',
    description: 'A move that leaves a piece en prise or allows an immediate capture with big loss.'
  },
  missed_threat: {
    label: 'Missed opponent threat',
    description: 'A move that allows a strong opponent tactic next move that could have been prevented.'
  },
  missed_win: {
    label: 'Missed win',
    description: 'A position where a winning tactic existed, but a different move was played and the advantage dropped.'
  },
  unsafe_king: {
    label: 'Unsafe king',
    description: 'King safety deteriorates sharply (mate threats / forced lines).'
  },
  bad_capture: {
    label: 'Bad capture',
    description: 'A capture that loses material due to tactics/recaptures or wrong exchange.'
  },
  time_trouble_collapse: {
    label: 'Time trouble collapse',
    description: 'Mistakes spike under low remaining clock.'
  }
}

export interface InputGame {
  lichessGameId: string
  pgn: string
  timeControl: string | null
  createdAt: string | null
}

export interface DrillRow {
  drillId: string
  lichessGameId: string
  ply: number
  fen: string
  sideToMove: 'white' | 'black'
  myMove: string
  bestMove: string
  pv: string
  evalBefore: number
  evalAfter: number
  patternTag: PatternTag
  difficulty: number
  createdAt: string
}

export interface PatternSummaryRow {
  patternTag: PatternTag
  label: string
  occurrences: number
  weaknessScore: number
  updatedAt: string
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function computeDifficulty(deltaCp: number): number {
  // 1..5
  if (deltaCp >= 800) return 5
  if (deltaCp >= 450) return 4
  if (deltaCp >= 250) return 3
  if (deltaCp >= 150) return 2
  return 1
}

function normalizeUsername(s: string): string {
  return s.trim().toLowerCase()
}

function parseLichessGameIdFromPgn(pgn: string): string | null {
  const m = pgn.match(/\[Site\s+"https?:\/\/lichess\.org\/([a-zA-Z0-9]{8,})"/)
  return m?.[1] ?? null
}

function parseTimeControlFromPgn(pgn: string): string | null {
  const m = pgn.match(/\[TimeControl\s+"([^"]+)"/)
  return m?.[1] ?? null
}

function parseCreatedAtFromPgn(pgn: string): string | null {
  const d = pgn.match(/\[UTCDate\s+"([^"]+)"/)?.[1]
  const t = pgn.match(/\[UTCTime\s+"([^"]+)"/)?.[1]
  if (!d || !t) return null
  // UTCDate is like 2026.01.19 and UTCTime like 12:34:56
  const iso = `${d.replace(/\./g, '-') }T${t}Z`
  return iso
}

export async function fetchRecentLichessGames(lichessUserId: string, n: number): Promise<InputGame[]> {
  const stored = await getLichessToken(lichessUserId)
  if (!stored) throw new Error('Missing Lichess token')

  const max = clampInt(n, 1, 200)
  const params = new URLSearchParams()
  params.set('max', String(max))
  params.set('pgnInJson', 'true')
  params.set('clocks', 'true')
  params.set('moves', 'true')

  const response = await lichessFetch(`/api/games/user/${encodeURIComponent(lichessUserId)}?${params.toString()}`, {
    token: stored.token.accessToken,
    headers: {
      Accept: 'application/x-ndjson'
    }
  })

  if (!response.body) return []

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const games: InputGame[] = []

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx = buffer.indexOf('\n')
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (line) {
        try {
          const obj = JSON.parse(line) as any
          const pgn = typeof obj.pgn === 'string' ? obj.pgn : ''
          const lichessGameId = typeof obj.id === 'string' ? obj.id : (parseLichessGameIdFromPgn(pgn) || '')
          if (lichessGameId && pgn) {
            games.push({
              lichessGameId,
              pgn,
              timeControl: typeof obj.clock === 'string' ? obj.clock : parseTimeControlFromPgn(pgn),
              createdAt: typeof obj.createdAt === 'number' ? new Date(obj.createdAt).toISOString() : parseCreatedAtFromPgn(pgn)
            })
          }
        } catch {
          // ignore malformed lines
        }
      }
      idx = buffer.indexOf('\n')
    }
  }

  // Deterministic ordering for downstream analysis.
  return games.sort((a, b) => (a.lichessGameId.localeCompare(b.lichessGameId)))
}

export async function persistInputGames(lichessUserId: string, games: InputGame[]): Promise<void> {
  if (!isDbConfigured()) return
  await connectToDb()
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS public.lichess_recent_games (
      lichess_user_id TEXT NOT NULL,
      lichess_game_id TEXT NOT NULL,
      pgn TEXT NOT NULL,
      time_control TEXT,
      created_at TIMESTAMPTZ,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (lichess_user_id, lichess_game_id)
    )
  `

  for (const g of games) {
    await sql`
      INSERT INTO public.lichess_recent_games (lichess_user_id, lichess_game_id, pgn, time_control, created_at)
      VALUES (${lichessUserId}, ${g.lichessGameId}, ${g.pgn}, ${g.timeControl ?? null}, ${g.createdAt ? new Date(g.createdAt) : null})
      ON CONFLICT (lichess_user_id, lichess_game_id)
      DO UPDATE SET pgn = EXCLUDED.pgn, time_control = EXCLUDED.time_control, created_at = EXCLUDED.created_at, fetched_at = now()
    `
  }
}

function classifyPatternV1(args: {
  delta: number
  evalBefore: number
  evalAfter: number
  myMoveUci: string
  bestMoveUci: string
  pv: string
  mateLike: boolean
  isCapture: boolean
}): PatternTag {
  const { delta, evalBefore, evalAfter, isCapture, mateLike } = args

  if (mateLike || Math.abs(evalAfter) >= 90000 || Math.abs(evalBefore) >= 90000) {
    return 'unsafe_king'
  }
  if (isCapture && delta >= 150) return 'bad_capture'
  if (evalBefore >= 200 && delta >= 150) return 'missed_win'
  if (evalBefore >= -100 && evalBefore <= 100 && evalAfter <= -150) return 'missed_threat'
  if (delta >= 300) return 'hanging_piece'
  return 'missed_threat'
}

export async function analyzeBlunderDnaFromGames(params: {
  lichessUserId: string
  games: InputGame[]
  stockfishPath?: string
  nPerPattern?: number
  depth?: number
  thresholdCp?: number
}): Promise<{ patterns: PatternSummaryRow[]; drills: DrillRow[] }> {
  const {
    lichessUserId,
    games,
    stockfishPath = 'stockfish.exe',
    nPerPattern = 3,
    depth = 10,
    thresholdCp = 150
  } = params

  if (!isDbConfigured()) {
    return { patterns: [], drills: [] }
  }

  await connectToDb()
  const sql = getSql()

  const enginePath = resolveStockfishPath(stockfishPath)
  const engine = new StockfishEngine(enginePath)
  const engineAny = engine as any

  // Cache in **white perspective** (positive = good for White).
  const evalCache = new Map<string, number>()
  const bestCache = new Map<string, { bestMove: string | null; evalBestWhite: number; pv: string[] }>()

  // Stockfish "score" is from side-to-move perspective. Normalize to **white** perspective.
  const evaluateDepthWhite = async (fen: string, d: number): Promise<number> => {
    const key = `evalw:${d}:${fen}`
    const cached = evalCache.get(key)
    if (typeof cached === 'number') return cached

    const wait = engineAny.waitFor((line: string) => line.startsWith('bestmove'), 30000)
    engineAny.send(`position fen ${fen}`)
    engineAny.send(`go depth ${d}`)
    const lines = await wait
    const scoreFromTurn = parseScoreFromLines(lines)
    const turn = (fen.split(' ')[1] as 'w' | 'b' | undefined) ?? 'w'
    const scoreFromWhite = turn === 'b' ? -scoreFromTurn : scoreFromTurn
    evalCache.set(key, scoreFromWhite)
    return scoreFromWhite
  }

  const bestMoveAndPVWhite = async (fen: string, d: number) => {
    const key = `bestw:${d}:${fen}`
    const cached = bestCache.get(key)
    if (cached) return cached

    const wait = engineAny.waitFor((line: string) => line.startsWith('bestmove'), 30000)
    engineAny.send(`position fen ${fen}`)
    engineAny.send(`go depth ${d}`)
    const lines = await wait
    const scoreFromTurn = parseScoreFromLines(lines)
    const turn = (fen.split(' ')[1] as 'w' | 'b' | undefined) ?? 'w'
    const evalBestWhite = turn === 'b' ? -scoreFromTurn : scoreFromTurn
    const bestMoveLine = lines.find((l: string) => l.startsWith('bestmove'))
    const bestMove = bestMoveLine?.match(/bestmove\s+(\S+)/)?.[1] || null
    const pvLine = [...lines].reverse().find((l: string) => l.startsWith('info') && l.includes(' pv '))
    // Match " pv <moves...>" (avoid matching the "pv" in "multipv").
    const pv = pvLine?.match(/\spv\s+(.+)/)?.[1]?.split(/\s+/) || []

    const out = { bestMove, evalBestWhite, pv }
    bestCache.set(key, out)
    return out
  }

  type DrillCandidate = Omit<DrillRow, 'drillId' | 'createdAt'> & { delta: number }
  const candidates: DrillCandidate[] = []

  const normalizedUser = normalizeUsername(lichessUserId)

  try {
    await engine.start()
    // Determinism + speed: single thread, fixed hash.
    try {
      engineAny.send('setoption name Threads value 1')
      engineAny.send('setoption name Hash value 64')
    } catch {
      // ignore if engine doesn't accept
    }

    for (const g of games) {
      const pgn = g.pgn
      const gameId = g.lichessGameId || parseLichessGameIdFromPgn(pgn) || ''
      if (!gameId || !pgn) continue

      const chess = new Chess()
      try {
        chess.loadPgn(pgn)
      } catch {
        continue
      }

      const headers = chess.header()
      const whiteName = normalizeUsername(headers.White || '')
      const blackName = normalizeUsername(headers.Black || '')
      const isWhite = whiteName.includes(normalizedUser)
      const isBlack = blackName.includes(normalizedUser)
      const myColor: 'white' | 'black' | null = isWhite ? 'white' : isBlack ? 'black' : null
      if (!myColor) continue

      const history = chess.history({ verbose: true }) as any[]
      const temp = new Chess()

      for (let ply = 0; ply < history.length; ply++) {
        const isMyMove = (myColor === 'white' && ply % 2 === 0) || (myColor === 'black' && ply % 2 === 1)
        const moveVerbose = history[ply]
        if (!moveVerbose) break

        const fenBefore = temp.fen()
        const sideToMove = temp.turn() === 'w' ? 'white' : 'black'

        if (!isMyMove) {
          try { temp.move(moveVerbose) } catch { break }
          continue
        }

        const myPerspective = temp.turn()
        const sign = myPerspective === 'w' ? 1 : -1
        const { bestMove, evalBestWhite, pv } = await bestMoveAndPVWhite(fenBefore, depth)

        let played: any = null
        try {
          played = temp.move(moveVerbose)
        } catch {
          break
        }

        const fenAfter = temp.fen()
        const evalAfterWhite = await evaluateDepthWhite(fenAfter, depth)
        const myMoveUci = `${played.from}${played.to}${played.promotion || ''}`.toLowerCase()
        const isCapture = !!played.captured

        const evalBestMy = sign * evalBestWhite
        const evalAfterMy = sign * evalAfterWhite
        const delta = Math.max(0, Math.round(evalBestMy - evalAfterMy))
        const mateLike = Math.abs(evalBestMy) >= 90000 || Math.abs(evalAfterMy) >= 90000

        const pattern = classifyPatternV1({
          delta,
          evalBefore: evalBestMy,
          evalAfter: evalAfterMy,
          myMoveUci,
          bestMoveUci: (bestMove || '').toLowerCase(),
          pv: pv.join(' '),
          mateLike,
          isCapture
        })

        // Always store candidates; threshold filtering happens deterministically afterwards.
        candidates.push({
          lichessGameId: gameId,
          ply,
          fen: fenBefore,
          sideToMove,
          myMove: myMoveUci,
          bestMove: (bestMove || myMoveUci).toLowerCase(),
          pv: pv.slice(0, 8).join(' '),
          evalBefore: Math.round(evalBestMy),
          evalAfter: Math.round(evalAfterMy),
          patternTag: pattern,
          difficulty: computeDifficulty(delta),
          delta
        })
      }
    }
  } finally {
    await engine.stop().catch(() => null)
  }

  const maxDelta = candidates.reduce((m, d) => Math.max(m, d.delta), 0)
  const effectiveThreshold = maxDelta >= thresholdCp ? thresholdCp : Math.min(thresholdCp, 80)
  if (process.env.NODE_ENV !== 'production') {
    const nonZero = candidates.filter((c) => c.evalBefore !== 0 || c.evalAfter !== 0).length
    const maxAbsEval = candidates.reduce((m, c) => Math.max(m, Math.abs(c.evalBefore), Math.abs(c.evalAfter)), 0)
    console.log('[Blunder DNA] analyze stats', {
      lichessUserId,
      candidates: candidates.length,
      nonZero,
      maxAbsEval,
      maxDelta,
      thresholdCp,
      effectiveThreshold
    })
  }

  const occurrences: Record<PatternTag, number> = {
    hanging_piece: 0,
    missed_threat: 0,
    missed_win: 0,
    unsafe_king: 0,
    bad_capture: 0,
    time_trouble_collapse: 0
  }

  for (const c of candidates) {
    if (c.delta >= effectiveThreshold) occurrences[c.patternTag] += 1
  }

  // Choose top drills deterministically: highest delta, then stable tie-breaks.
  const perPattern: Record<PatternTag, Array<DrillCandidate>> = {
    hanging_piece: [],
    missed_threat: [],
    missed_win: [],
    unsafe_king: [],
    bad_capture: [],
    time_trouble_collapse: []
  }

  for (const d of candidates) {
    if (d.delta >= effectiveThreshold) perPattern[d.patternTag].push(d)
  }

  const selected: Array<Omit<DrillRow, 'drillId' | 'createdAt'>> = []
  for (const tag of Object.keys(perPattern) as PatternTag[]) {
    perPattern[tag].sort((a, b) => {
      return (b.delta - a.delta) || a.lichessGameId.localeCompare(b.lichessGameId) || (a.ply - b.ply)
    })
    selected.push(...perPattern[tag].slice(0, clampInt(nPerPattern, 1, 3)).map(({ delta: _delta, ...rest }) => rest))
  }

  // Persist patterns and drills (auditability)
  const now = new Date()
  for (const tag of Object.keys(PATTERN_TAXONOMY_V1) as PatternTag[]) {
    const meta = PATTERN_TAXONOMY_V1[tag]
    const occ = occurrences[tag] ?? 0
    // weaknessScore: no attempts yet => based on occurrences.
    const weaknessScore = occ === 0 ? 0 : Math.min(1, 0.25 + occ / 20)
    await sql`
      INSERT INTO public.blunder_dna_patterns (lichess_user_id, version, pattern_tag, label, description, occurrences, weakness_score, computed_at, updated_at)
      VALUES (${lichessUserId}, 'v1', ${tag}, ${meta.label}, ${meta.description}, ${occ}, ${weaknessScore}, ${now}, ${now})
      ON CONFLICT (lichess_user_id, version, pattern_tag)
      DO UPDATE SET
        occurrences = EXCLUDED.occurrences,
        weakness_score = EXCLUDED.weakness_score,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        computed_at = EXCLUDED.computed_at,
        updated_at = EXCLUDED.updated_at
    `
  }

  const inserted: DrillRow[] = []
  for (const d of selected) {
    const rows = (await sql`
      INSERT INTO public.blunder_dna_drills (
        lichess_user_id, lichess_game_id, ply, fen, side_to_move, my_move, best_move, pv,
        eval_before, eval_after, pattern_tag, difficulty, created_at, updated_at
      ) VALUES (
        ${lichessUserId}, ${d.lichessGameId}, ${d.ply}, ${d.fen}, ${d.sideToMove}, ${d.myMove}, ${d.bestMove}, ${d.pv},
        ${Math.round(d.evalBefore)}, ${Math.round(d.evalAfter)}, ${d.patternTag}, ${d.difficulty}, ${now}, ${now}
      )
      ON CONFLICT (lichess_user_id, lichess_game_id, ply, pattern_tag)
      DO UPDATE SET
        fen = EXCLUDED.fen,
        side_to_move = EXCLUDED.side_to_move,
        my_move = EXCLUDED.my_move,
        best_move = EXCLUDED.best_move,
        pv = EXCLUDED.pv,
        eval_before = EXCLUDED.eval_before,
        eval_after = EXCLUDED.eval_after,
        difficulty = EXCLUDED.difficulty,
        updated_at = now()
      RETURNING drill_id, lichess_game_id, ply, fen, side_to_move, my_move, best_move, pv, eval_before, eval_after, pattern_tag, difficulty, created_at
    `) as Array<any>

    const row = rows[0]
    inserted.push({
      drillId: row.drill_id,
      lichessGameId: row.lichess_game_id,
      ply: row.ply,
      fen: row.fen,
      sideToMove: row.side_to_move,
      myMove: row.my_move,
      bestMove: row.best_move,
      pv: row.pv,
      evalBefore: row.eval_before,
      evalAfter: row.eval_after,
      patternTag: row.pattern_tag,
      difficulty: row.difficulty,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
    })

    // Ensure mastery row exists
    await sql`
      INSERT INTO public.blunder_dna_mastery (drill_id, lichess_user_id, due_date)
      VALUES (${row.drill_id}, ${lichessUserId}, ${now.toISOString().slice(0, 10)}::date)
      ON CONFLICT (drill_id)
      DO NOTHING
    `
  }

  const patterns = await getPatternSummaries(lichessUserId)
  return { patterns, drills: inserted }
}

function parseScoreFromLines(lines: string[]): number {
  const MATE_SCORE = 100000
  let lastScore: number | null = null
  for (const line of lines) {
    const cpMatch = line.match(/score\s+cp\s+(-?\d+)/)
    if (cpMatch) {
      lastScore = parseInt(cpMatch[1], 10)
      continue
    }
    const mateMatch = line.match(/score\s+mate\s+(-?\d+)/)
    if (mateMatch) {
      const mate = parseInt(mateMatch[1], 10)
      lastScore = mate > 0 ? MATE_SCORE : -MATE_SCORE
    }
  }
  return lastScore ?? 0
}

export async function getPatternSummaries(lichessUserId: string): Promise<PatternSummaryRow[]> {
  if (!isDbConfigured()) return []
  await connectToDb()
  const sql = getSql()
  const rows = (await sql`
    SELECT pattern_tag, label, occurrences, weakness_score, updated_at
    FROM public.blunder_dna_patterns
    WHERE lichess_user_id = ${lichessUserId} AND version = 'v1'
    ORDER BY weakness_score DESC, occurrences DESC, pattern_tag ASC
  `) as Array<any>

  return rows.map((r) => ({
    patternTag: r.pattern_tag,
    label: r.label,
    occurrences: r.occurrences,
    weaknessScore: r.weakness_score,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at)
  }))
}

export async function getTodayQueue(lichessUserId: string, date: string): Promise<string[]> {
  await connectToDb()
  const sql = getSql()
  const rows = (await sql`
    SELECT drill_ids
    FROM public.blunder_dna_daily_queue
    WHERE lichess_user_id = ${lichessUserId} AND date = ${date}::date
  `) as Array<{ drill_ids: any }>
  if (rows.length === 0) return []
  const ids = rows[0].drill_ids
  return Array.isArray(ids) ? ids.map(String) : []
}

export async function buildAndStoreTodayQueue(lichessUserId: string, date: string): Promise<string[]> {
  await connectToDb()
  const sql = getSql()

  const patterns = await getPatternSummaries(lichessUserId)
  const weakest = patterns[0]?.patternTag ?? 'missed_threat'

  const dueRows = (await sql`
    SELECT d.drill_id, d.pattern_tag, d.difficulty, COALESCE(m.correct, 0) as correct, COALESCE(m.attempts, 0) as attempts
    FROM public.blunder_dna_drills d
    LEFT JOIN public.blunder_dna_mastery m ON m.drill_id = d.drill_id
    WHERE d.lichess_user_id = ${lichessUserId}
      AND (m.due_date IS NULL OR m.due_date <= ${date}::date)
    ORDER BY d.pattern_tag ASC, d.difficulty ASC, d.drill_id ASC
  `) as Array<any>

  const due = dueRows.map((r) => ({
    id: String(r.drill_id),
    tag: r.pattern_tag as PatternTag,
    difficulty: Number(r.difficulty) || 1,
    attempts: Number(r.attempts) || 0,
    correct: Number(r.correct) || 0
  }))

  const scoreWeak = (x: typeof due[number]) => {
    // Lower success => more urgent
    const rate = x.attempts > 0 ? x.correct / x.attempts : 0
    return 1 - rate
  }

  const weakestPool = due.filter((d) => d.tag === weakest).sort((a, b) => (scoreWeak(b) - scoreWeak(a)) || (a.difficulty - b.difficulty) || a.id.localeCompare(b.id))
  const otherPool = due.filter((d) => d.tag !== weakest).sort((a, b) => (scoreWeak(b) - scoreWeak(a)) || (a.difficulty - b.difficulty) || a.id.localeCompare(b.id))

  const picked: string[] = []
  picked.push(...weakestPool.slice(0, 3).map((d) => d.id))
  picked.push(...otherPool.slice(0, 2).map((d) => d.id))

  // Ensure 1 confidence drill (easiest among due), deterministic:
  const confidence = [...due].sort((a, b) => (a.difficulty - b.difficulty) || a.id.localeCompare(b.id))[0]?.id
  if (confidence && !picked.includes(confidence)) {
    if (picked.length >= 5) picked[picked.length - 1] = confidence
    else picked.push(confidence)
  }

  const finalIds = picked.slice(0, 5)

  await sql`
    INSERT INTO public.blunder_dna_daily_queue (lichess_user_id, date, drill_ids)
    VALUES (${lichessUserId}, ${date}::date, ${JSON.stringify(finalIds)}::jsonb)
    ON CONFLICT (lichess_user_id, date)
    DO UPDATE SET drill_ids = EXCLUDED.drill_ids
  `

  return finalIds
}

export async function getDrillsByIds(lichessUserId: string, ids: string[]): Promise<DrillRow[]> {
  if (ids.length === 0) return []
  await connectToDb()
  const sql = getSql()
  const rows = (await sql`
    SELECT drill_id, lichess_game_id, ply, fen, side_to_move, my_move, best_move, pv, eval_before, eval_after, pattern_tag, difficulty, created_at
    FROM public.blunder_dna_drills
    WHERE lichess_user_id = ${lichessUserId} AND drill_id = ANY(${ids}::uuid[])
  `) as Array<any>

  const byId = new Map<string, DrillRow>()
  for (const r of rows) {
    byId.set(String(r.drill_id), {
      drillId: String(r.drill_id),
      lichessGameId: r.lichess_game_id,
      ply: r.ply,
      fen: r.fen,
      sideToMove: r.side_to_move,
      myMove: r.my_move,
      bestMove: r.best_move,
      pv: r.pv,
      evalBefore: r.eval_before,
      evalAfter: r.eval_after,
      patternTag: r.pattern_tag,
      difficulty: r.difficulty,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
    })
  }

  return ids.map((id) => byId.get(id)).filter(Boolean) as DrillRow[]
}

export async function recordAttempt(params: { lichessUserId: string; drillId: string; userMove: string | null; ok: boolean }) {
  await connectToDb()
  const sql = getSql()
  const now = new Date()

  await sql`
    INSERT INTO public.blunder_dna_attempts (drill_id, lichess_user_id, attempted_at, user_move, ok)
    VALUES (${params.drillId}::uuid, ${params.lichessUserId}, ${now}, ${params.userMove}, ${params.ok})
  `

  const masteryRows = (await sql`
    SELECT attempts, correct, streak, ease, interval_days
    FROM public.blunder_dna_mastery
    WHERE drill_id = ${params.drillId}::uuid
  `) as Array<any>

  const prev = masteryRows[0] || { attempts: 0, correct: 0, streak: 0, ease: 2.5, interval_days: 0 }
  const attempts = Number(prev.attempts) + 1
  const correct = Number(prev.correct) + (params.ok ? 1 : 0)
  const streak = params.ok ? Number(prev.streak) + 1 : 0

  let ease = Number(prev.ease)
  ease = params.ok ? Math.min(3.0, ease + 0.05) : Math.max(1.3, ease - 0.2)
  let intervalDays = Number(prev.interval_days)
  intervalDays = params.ok ? (intervalDays <= 0 ? 1 : Math.round(intervalDays * ease)) : 0

  const dueDate = new Date(now)
  dueDate.setDate(dueDate.getDate() + intervalDays)
  const due = dueDate.toISOString().slice(0, 10)

  await sql`
    INSERT INTO public.blunder_dna_mastery (drill_id, lichess_user_id, attempts, correct, streak, ease, interval_days, due_date, updated_at)
    VALUES (${params.drillId}::uuid, ${params.lichessUserId}, ${attempts}, ${correct}, ${streak}, ${ease}, ${intervalDays}, ${due}::date, ${now})
    ON CONFLICT (drill_id)
    DO UPDATE SET
      attempts = EXCLUDED.attempts,
      correct = EXCLUDED.correct,
      streak = EXCLUDED.streak,
      ease = EXCLUDED.ease,
      interval_days = EXCLUDED.interval_days,
      due_date = EXCLUDED.due_date,
      updated_at = EXCLUDED.updated_at
  `
}

