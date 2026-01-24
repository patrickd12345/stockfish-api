'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChessBoard from './ChessBoard'

type ModuleId = 'basics' | 'pieces' | 'tactics' | 'endgames' | 'strategy'
type LessonId = string

interface Lesson {
  id: LessonId
  title: string
  description: string
  fen: string
  explanation: string
  exercise?: {
    question: string
    correctMove: string
    hint?: string
  }
  completed?: boolean
}

interface Module {
  id: ModuleId
  title: string
  description: string
  icon: string
  lessons: Lesson[]
  completed?: boolean
}

const TRAINING_MODULES: Module[] = [
  {
    id: 'basics',
    title: 'Chess Basics',
    description: 'Learn the fundamentals of chess',
    icon: '♟️',
    lessons: [
      {
        id: 'board-setup',
        title: 'The Chess Board',
        description: 'Understanding the board and coordinates',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        explanation: `The chessboard has 64 squares arranged in an 8x8 grid. Each square has a unique name using a letter (a-h) for the file and a number (1-8) for the rank. The board is always set up with a light square in the bottom-right corner from White's perspective.`,
      },
      {
        id: 'piece-values',
        title: 'Piece Values',
        description: 'Understanding relative piece values',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        explanation: `Piece values help you make better decisions:
• Pawn = 1 point
• Knight = 3 points
• Bishop = 3 points
• Rook = 5 points
• Queen = 9 points
• King = Priceless (cannot be captured)

These are guidelines, not absolute rules. Sometimes a piece's value changes based on the position.`,
      },
      {
        id: 'check-checkmate',
        title: 'Check and Checkmate',
        description: 'The goal of chess',
        fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1',
        explanation: `Check: When your king is under attack by an enemy piece. You must get out of check on your next move.

Checkmate: When your king is in check and there's no legal move to escape. This ends the game.

Stalemate: When it's your turn, you're not in check, but you have no legal moves. This is a draw.`,
      },
    ],
  },
  {
    id: 'pieces',
    title: 'Piece Movement',
    description: 'Master how each piece moves',
    icon: '♞',
    lessons: [
      {
        id: 'pawn-moves',
        title: 'Pawn Movement',
        description: 'How pawns move and capture',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        explanation: `Pawns move forward one square at a time, but on their first move they can move two squares. They capture diagonally forward one square. Pawns cannot move backward or sideways.

Special rules:
• En passant: If a pawn moves two squares and lands next to an enemy pawn, the enemy can capture it as if it only moved one square.
• Promotion: When a pawn reaches the 8th rank, it must be promoted to a Queen, Rook, Bishop, or Knight.`,
        exercise: {
          question: 'Can the white pawn on e2 move to e4?',
          correctMove: 'e2e4',
          hint: 'Pawns can move two squares on their first move',
        },
      },
      {
        id: 'knight-moves',
        title: 'Knight Movement',
        description: 'The L-shaped move',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        explanation: `Knights move in an L-shape: two squares in one direction, then one square perpendicular. They are the only pieces that can jump over other pieces.

Knights are powerful in closed positions and can fork (attack two pieces at once).`,
        exercise: {
          question: 'Move the knight from b1 to c3',
          correctMove: 'b1c3',
          hint: 'Knights move in an L-shape',
        },
      },
      {
        id: 'bishop-moves',
        title: 'Bishop Movement',
        description: 'Diagonal movement',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        explanation: `Bishops move diagonally any number of squares. Each player starts with two bishops: one on a light square and one on a dark square. They stay on their starting color throughout the game.

Bishops are strong in open positions with long diagonals.`,
      },
      {
        id: 'rook-moves',
        title: 'Rook Movement',
        description: 'Horizontal and vertical movement',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        explanation: `Rooks move horizontally or vertically any number of squares. They cannot move diagonally.

Rooks are powerful when placed on open files (columns with no pawns). They work well together when doubled on the same file or rank.`,
      },
      {
        id: 'queen-moves',
        title: 'Queen Movement',
        description: 'The most powerful piece',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        explanation: `The queen combines the movement of a rook and bishop. She can move horizontally, vertically, or diagonally any number of squares.

The queen is the most powerful piece, but don't bring her out too early in the opening. She can become a target for your opponent's pieces.`,
      },
      {
        id: 'king-moves',
        title: 'King Movement',
        description: 'Protecting the king',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        explanation: `The king moves one square in any direction (horizontally, vertically, or diagonally).

Castling: A special move where the king moves two squares toward a rook, and the rook jumps over to the square next to the king. You can only castle if:
• Neither piece has moved
• There are no pieces between them
• The king is not in check
• The king does not pass through or land on a square attacked by the enemy`,
      },
    ],
  },
  {
    id: 'tactics',
    title: 'Basic Tactics',
    description: 'Essential tactical patterns',
    icon: '⚔️',
    lessons: [
      {
        id: 'fork',
        title: 'The Fork',
        description: 'Attacking two pieces at once',
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
        explanation: `A fork is when one piece attacks two or more enemy pieces at the same time. Knights are excellent at forking because of their unique movement.

In this position, look for opportunities to attack multiple pieces with a single move.`,
        exercise: {
          question: 'Find a fork with the knight',
          correctMove: 'f3g5',
          hint: 'Look for squares where the knight attacks two pieces',
        },
      },
      {
        id: 'pin',
        title: 'The Pin',
        description: 'Restricting piece movement',
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
        explanation: `A pin occurs when a piece cannot move because it would expose a more valuable piece behind it to attack. The pinned piece is "stuck" protecting the piece behind it.

Bishops, rooks, and queens can create pins along the lines they control.`,
      },
      {
        id: 'skewer',
        title: 'The Skewer',
        description: 'Attacking through a piece',
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
        explanation: `A skewer is like a pin, but reversed. You attack a valuable piece, and when it moves, you capture the less valuable piece behind it.

Skewers are powerful because your opponent must move the attacked piece, giving you a free capture.`,
      },
      {
        id: 'discovered-attack',
        title: 'Discovered Attack',
        description: 'Unleashing hidden threats',
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
        explanation: `A discovered attack happens when you move one piece, revealing an attack by another piece behind it. This can be devastating because your opponent must deal with both threats.

The piece that moves can also create its own threat, making it a double attack.`,
      },
    ],
  },
  {
    id: 'endgames',
    title: 'Basic Endgames',
    description: 'Finishing the game',
    icon: '🏁',
    lessons: [
      {
        id: 'king-pawn',
        title: 'King and Pawn Endgames',
        description: 'Promoting pawns',
        fen: '8/8/8/8/8/4P3/4K3/8 w - - 0 1',
        explanation: `In king and pawn endgames, your goal is to promote a pawn to a queen. The key is to use your king actively to support your pawn's advance.

Key principles:
• The king should be in front of the pawn when possible
• Opposition: When kings face each other with one square between them, the player who doesn't move has the opposition
• Square of the pawn: If the defending king can reach the square in front of the pawn, the pawn can be stopped`,
      },
      {
        id: 'king-queen',
        title: 'King and Queen vs King',
        description: 'The basic checkmate',
        fen: '8/8/8/8/8/3Q4/4K3/8 w - - 0 1',
        explanation: `With a king and queen, you can always checkmate a lone king. The technique involves:
1. Using your queen to control squares and limit the enemy king's movement
2. Bringing your own king closer to help
3. Forcing the enemy king to the edge of the board
4. Delivering checkmate

This is a fundamental endgame pattern you should master.`,
      },
    ],
  },
  {
    id: 'strategy',
    title: 'Opening Principles',
    description: 'How to start a game',
    icon: '🎯',
    lessons: [
      {
        id: 'opening-principles',
        title: 'Basic Opening Principles',
        description: 'The foundation of good chess',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        explanation: `Follow these principles in the opening:

1. Control the center: The center squares (e4, e5, d4, d5) are the most important. Control them with pawns and pieces.

2. Develop your pieces: Get your knights and bishops out early. Don't move the same piece multiple times unless necessary.

3. Castle early: Get your king to safety by castling. This also connects your rooks.

4. Don't bring the queen out too early: She can become a target and waste time moving around.

5. Connect your rooks: After castling, your rooks should be able to see each other.`,
      },
      {
        id: 'common-mistakes',
        title: 'Common Opening Mistakes',
        description: 'What to avoid',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        explanation: `Avoid these common mistakes:

1. Moving too many pawns: While controlling the center is important, don't overextend. Every pawn move weakens squares.

2. Moving the queen too early: She'll be chased around by enemy pieces, wasting time.

3. Ignoring development: Don't make too many pawn moves. Get your pieces out!

4. Not castling: Your king is vulnerable in the center. Castle to safety.

5. Moving pieces multiple times: Develop all your pieces before moving the same one twice.`,
      },
    ],
  },
]

const TRAINING_PROGRESS_STORAGE_KEY = 'mychesscoach:trainingProgress:v1'

type TrainingProgressV1 = {
  version: 1
  activeModuleId: ModuleId
  activeLessonId: LessonId | null
  completedLessonIds: LessonId[]
}

function isModuleId(value: unknown): value is ModuleId {
  return value === 'basics' || value === 'pieces' || value === 'tactics' || value === 'endgames' || value === 'strategy'
}

function findModule(moduleId: ModuleId): Module | null {
  return TRAINING_MODULES.find((m) => m.id === moduleId) ?? null
}

function hasLesson(module: Module, lessonId: LessonId): boolean {
  return module.lessons.some((l) => l.id === lessonId)
}

function clearTrainingProgressStorage(): void {
  try {
    window.localStorage.removeItem(TRAINING_PROGRESS_STORAGE_KEY)
  } catch {
    // ignore
  }
}

class TrainingTabErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state: { hasError: boolean } = { hasError: false }

  static getDerivedStateFromError(): { hasError: true } {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('[TrainingTab] crashed:', error)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="glass-panel p-6 flex flex-col gap-4 min-h-[420px]">
        <div className="text-lg font-black tracking-tight text-sage-100">Training temporarily unavailable</div>
        <div className="text-sm text-sage-300 leading-relaxed">
          Something went wrong while rendering the Training tab. You can reload it, or reset saved progress if the issue
          persists.
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false })
              window.location.reload()
            }}
            className="btn-primary"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              clearTrainingProgressStorage()
              this.setState({ hasError: false })
              window.location.reload()
            }}
            className="btn-secondary"
          >
            Reset saved progress
          </button>
        </div>
      </div>
    )
  }
}

function TrainingTabInner() {
  const [activeModuleId, setActiveModuleId] = useState<ModuleId>('basics')
  const [activeLessonId, setActiveLessonId] = useState<LessonId | null>(null)
  const [completedLessons, setCompletedLessons] = useState<Set<LessonId>>(new Set())
  const [exerciseResult, setExerciseResult] = useState<{ correct: boolean; message: string } | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [hydratedFromStorage, setHydratedFromStorage] = useState(false)

  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAutoAdvancingRef = useRef(false)

  const clearAutoAdvanceTimeout = useCallback(() => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current)
      autoAdvanceTimeoutRef.current = null
    }
    isAutoAdvancingRef.current = false
  }, [])

  // Hydrate progress from localStorage once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY)
      if (!raw) {
        setHydratedFromStorage(true)
        return
      }

      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid progress format')
      }

      const v = parsed as Partial<TrainingProgressV1>
      if (v.version !== 1 || !isModuleId(v.activeModuleId) || !Array.isArray(v.completedLessonIds)) {
        throw new Error('Unsupported progress version or fields')
      }

      const savedModule = findModule(v.activeModuleId)
      if (!savedModule) {
        throw new Error('Unknown module')
      }

      const nextCompleted = new Set<LessonId>()
      for (const id of v.completedLessonIds) {
        if (typeof id === 'string') nextCompleted.add(id)
      }

      setCompletedLessons(nextCompleted)
      setActiveModuleId(v.activeModuleId)

      const nextLessonId = typeof v.activeLessonId === 'string' ? v.activeLessonId : null
      setActiveLessonId(nextLessonId && hasLesson(savedModule, nextLessonId) ? nextLessonId : null)
      setStorageError(null)
    } catch (e) {
      // Corrupt JSON or invalid schema — ignore and continue with defaults.
      setStorageError('Saved progress could not be loaded (it may be corrupted).')
    } finally {
      setHydratedFromStorage(true)
    }
  }, [])

  // Persist progress to localStorage after hydration.
  useEffect(() => {
    if (!hydratedFromStorage) return

    try {
      const completedLessonIds: LessonId[] = []
      completedLessons.forEach((id) => completedLessonIds.push(id))

      const payload: TrainingProgressV1 = {
        version: 1,
        activeModuleId,
        activeLessonId,
        completedLessonIds,
      }

      window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify(payload))
      setStorageError(null)
    } catch (e) {
      setStorageError('Progress could not be saved (storage may be blocked).')
    }
  }, [activeLessonId, activeModuleId, completedLessons, hydratedFromStorage])

  // Cleanup pending timeouts on unmount.
  useEffect(() => {
    return () => clearAutoAdvanceTimeout()
  }, [clearAutoAdvanceTimeout])

  const activeModule = useMemo(
    () => TRAINING_MODULES.find((m) => m.id === activeModuleId) || TRAINING_MODULES[0],
    [activeModuleId]
  )

  const activeLesson = useMemo(
    () => activeLessonId ? activeModule.lessons.find((l) => l.id === activeLessonId) : null,
    [activeLessonId, activeModule]
  )

  const handleModuleSelect = useCallback((moduleId: ModuleId) => {
    clearAutoAdvanceTimeout()
    setActiveModuleId(moduleId)
    setActiveLessonId(null)
    setExerciseResult(null)
    setShowHint(false)
  }, [clearAutoAdvanceTimeout])

  const handleLessonSelect = useCallback((lessonId: LessonId) => {
    clearAutoAdvanceTimeout()
    setActiveLessonId(lessonId)
    setExerciseResult(null)
    setShowHint(false)
  }, [clearAutoAdvanceTimeout])

  const handleMove = useCallback(
    (from: string, to: string) => {
      if (!activeLesson?.exercise) return false
      if (exerciseResult?.correct) return false
      if (isAutoAdvancingRef.current) return false

      try {
        if (typeof from !== 'string' || typeof to !== 'string') return false
        if (from.length < 2 || to.length < 2) return false

        const userMove = `${from}${to}`.toLowerCase()
        const correctMove = activeLesson.exercise.correctMove.toLowerCase()

        if (userMove === correctMove) {
          setExerciseResult({ correct: true, message: 'Excellent! You got it right!' })
          setCompletedLessons((prev) => {
            const next = new Set(prev)
            next.add(activeLesson.id)
            return next
          })

          clearAutoAdvanceTimeout()
          isAutoAdvancingRef.current = true
          autoAdvanceTimeoutRef.current = setTimeout(() => {
            isAutoAdvancingRef.current = false
            setExerciseResult(null)
            // Auto-advance to next lesson after 1.5 seconds
            const currentIndex = activeModule.lessons.findIndex((l) => l.id === activeLesson.id)
            if (currentIndex < activeModule.lessons.length - 1) {
              handleLessonSelect(activeModule.lessons[currentIndex + 1].id)
            }
          }, 1500)
          return true
        } else {
          setExerciseResult({
            correct: false,
            message:
              showHint && activeLesson.exercise.hint ? activeLesson.exercise.hint : 'Not quite right. Try again!',
          })
          return false
        }
      } catch (e) {
        setExerciseResult({ correct: false, message: 'Something went wrong evaluating that move. Please try again.' })
        return false
      }
    },
    [activeLesson, activeModule.lessons, clearAutoAdvanceTimeout, exerciseResult?.correct, handleLessonSelect, showHint]
  )

  const progressPercentage = useMemo(() => {
    const totalLessons = TRAINING_MODULES.reduce((sum, m) => sum + m.lessons.length, 0)
    const completed = completedLessons.size
    return totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0
  }, [completedLessons])

  return (
    <div className="glass-panel p-6 flex flex-col gap-6 min-h-[700px]">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-xl font-bold text-terracotta tracking-tight">Chess Learning Journey</h2>
          <div className="mt-1 text-sm text-sage-400">
            Master chess fundamentals step by step
          </div>
          {storageError && (
            <div className="mt-3 text-xs text-rose-300">
              {storageError}{' '}
              <button
                type="button"
                onClick={() => {
                  clearTrainingProgressStorage()
                  setStorageError(null)
                }}
                className="underline hover:text-rose-200"
              >
                Reset saved progress
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-sage-300">
            Progress: <span className="font-bold text-terracotta">{progressPercentage}%</span>
          </div>
          <div className="w-32 h-2 bg-sage-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-terracotta to-ochre transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Module Sidebar */}
        <div className="bg-sage-900/40 p-4 rounded-xl border border-white/5 h-fit">
          <div className="font-bold text-lg text-sage-200 mb-4">Modules</div>
          <div className="flex flex-col gap-2">
            {TRAINING_MODULES.map((module) => {
              const moduleCompleted = module.lessons.every((l) => completedLessons.has(l.id))
              const isActive = activeModuleId === module.id

              return (
                <button
                  key={module.id}
                  onClick={() => handleModuleSelect(module.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isActive
                      ? 'bg-terracotta/20 border-terracotta/50 text-terracotta'
                      : 'bg-sage-800/40 border-white/5 text-sage-300 hover:bg-sage-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg">{module.icon}</span>
                    {moduleCompleted && (
                      <span className="text-xs text-emerald-400">✓</span>
                    )}
                  </div>
                  <div className="font-bold text-sm mb-1">{module.title}</div>
                  <div className="text-xs text-sage-400">{module.description}</div>
                  <div className="mt-2 text-xs text-sage-500">
                    {module.lessons.filter((l) => completedLessons.has(l.id)).length} / {module.lessons.length} lessons
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-col gap-6">
          {!activeLesson ? (
            /* Module Overview */
            <div className="bg-sage-900/40 p-6 rounded-xl border border-white/5">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{activeModule.icon}</span>
                <div>
                  <h3 className="text-xl font-bold text-sage-200">{activeModule.title}</h3>
                  <p className="text-sm text-sage-400">{activeModule.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
                {activeModule.lessons.map((lesson) => {
                  const isCompleted = completedLessons.has(lesson.id)

                  return (
                    <button
                      key={lesson.id}
                      onClick={() => handleLessonSelect(lesson.id)}
                      className={`p-4 rounded-lg border text-left transition-all ${
                        isCompleted
                          ? 'bg-emerald-900/20 border-emerald-700/50 text-emerald-100'
                          : 'bg-sage-800/40 border-white/5 text-sage-300 hover:bg-sage-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-sm">{lesson.title}</div>
                        {isCompleted && (
                          <span className="text-emerald-400 text-lg">✓</span>
                        )}
                      </div>
                      <div className="text-xs text-sage-400">{lesson.description}</div>
                      {lesson.exercise && (
                        <div className="mt-2 text-xs text-ochre font-medium">
                          Interactive Exercise
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            /* Lesson Content */
            <div className="flex flex-col gap-6">
              <div className="bg-sage-900/40 p-6 rounded-xl border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-sage-200">{activeLesson.title}</h3>
                    <p className="text-sm text-sage-400 mt-1">{activeLesson.description}</p>
                  </div>
                  <button
                    onClick={() => setActiveLessonId(null)}
                    className="px-3 py-1.5 bg-sage-800 hover:bg-sage-700 text-sage-200 text-sm font-medium rounded-lg border border-white/10 transition-colors"
                  >
                    Back
                  </button>
                </div>

                <div className="mb-6 p-4 bg-sage-800/40 rounded-lg border border-white/5">
                  <div className="text-sm text-sage-200 leading-relaxed whitespace-pre-wrap">
                    {activeLesson.explanation}
                  </div>
                </div>

                {activeLesson.exercise && (
                  <div className="mb-4 p-4 bg-purple-900/20 border border-purple-700/50 rounded-lg">
                    <div className="font-bold text-purple-200 mb-2">{activeLesson.exercise.question}</div>
                    {activeLesson.exercise.hint && (
                      <button
                        onClick={() => setShowHint((v) => !v)}
                        className="text-xs text-purple-400 hover:text-purple-300 underline"
                      >
                        {showHint ? 'Hide hint' : 'Show hint'}
                      </button>
                    )}
                  </div>
                )}

                <div className="flex justify-center bg-sage-800 p-4 rounded-xl shadow-inner border border-white/5">
                  <ChessBoard
                    fen={activeLesson.fen}
                    theme="wood"
                    size="min(72vw, 520px)"
                    orientation="white"
                    isDraggable={!!activeLesson.exercise}
                    onMove={activeLesson.exercise ? handleMove : undefined}
                  />
                </div>

                {exerciseResult && (
                  <div
                    className={`mt-4 px-4 py-3 rounded-lg border text-sm font-semibold transition-all ${
                      exerciseResult.correct
                        ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300'
                        : 'bg-rose-900/30 border-rose-700 text-rose-300'
                    }`}
                  >
                    {exerciseResult.message}
                  </div>
                )}

                {activeLesson.exercise && !exerciseResult?.correct && (
                  <div className="mt-4 text-sage-400 text-sm italic text-center py-2">
                    Try making the move on the board above...
                  </div>
                )}

                {/* Navigation */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      clearAutoAdvanceTimeout()
                      const currentIndex = activeModule.lessons.findIndex((l) => l.id === activeLesson.id)
                      if (currentIndex > 0) {
                        handleLessonSelect(activeModule.lessons[currentIndex - 1].id)
                      }
                    }}
                    disabled={isAutoAdvancingRef.current || activeModule.lessons.findIndex((l) => l.id === activeLesson.id) === 0}
                    className="btn-secondary flex-1"
                  >
                    Previous Lesson
                  </button>
                  <button
                    onClick={() => {
                      clearAutoAdvanceTimeout()
                      const currentIndex = activeModule.lessons.findIndex((l) => l.id === activeLesson.id)
                      if (currentIndex < activeModule.lessons.length - 1) {
                        handleLessonSelect(activeModule.lessons[currentIndex + 1].id)
                      } else {
                        // Move to next module
                        const currentModuleIndex = TRAINING_MODULES.findIndex((m) => m.id === activeModuleId)
                        if (currentModuleIndex < TRAINING_MODULES.length - 1) {
                          handleModuleSelect(TRAINING_MODULES[currentModuleIndex + 1].id)
                        }
                      }
                    }}
                    disabled={isAutoAdvancingRef.current}
                    className="btn-primary flex-1"
                  >
                    {activeModule.lessons.findIndex((l) => l.id === activeLesson.id) < activeModule.lessons.length - 1
                      ? 'Next Lesson'
                      : 'Next Module'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TrainingTab() {
  return (
    <TrainingTabErrorBoundary>
      <TrainingTabInner />
    </TrainingTabErrorBoundary>
  )
}
