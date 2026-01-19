import Link from 'next/link'
import { notFound } from 'next/navigation'
import SharedPgnInspector from '@/components/SharedPgnInspector'
import { loadSharedDrillAtPly, loadSharedLichessPgn } from '@/lib/dnaShare'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function SharedDnaGamePage(props: {
  params: { slug: string; gameId: string }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const { slug, gameId } = props.params
  const searchParams = props.searchParams ?? {}
  const plyRaw = Array.isArray(searchParams.ply) ? searchParams.ply[0] : searchParams.ply
  const ply = clampInt(plyRaw ? Number(plyRaw) : 0, 0, 10_000)

  const pgnResult = await loadSharedLichessPgn({ slug, lichessGameId: gameId })
  if (!pgnResult) notFound()

  const drill = await loadSharedDrillAtPly({ slug, lichessGameId: gameId, ply })

  return (
    <div className="container">
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Proof game</h1>
          <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '13px' }}>
            Game <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{gameId}</span> · ply{' '}
            {ply}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Link className="button" href={`/dna/${encodeURIComponent(slug)}`} style={{ background: '#111827' }}>
            Back to DNA
          </Link>
          <a className="button" href={`https://lichess.org/${encodeURIComponent(gameId)}#${encodeURIComponent(String(ply))}`} target="_blank" rel="noreferrer">
            Open on Lichess
          </a>
        </div>
      </div>

      {drill ? (
        <div className="card" style={{ border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 900, color: '#111827' }}>{drill.patternTag}</div>
            <div style={{ color: '#6b7280', fontSize: '13px' }}>
              diff {drill.difficulty} · stored {new Date(drill.createdAt).toLocaleString()}
            </div>
          </div>
          <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
            <Metric label="Best" value={drill.bestMove} />
            <Metric label="Played" value={drill.myMove} />
            <Metric label="PV" value={drill.pv} mono />
          </div>
          <div style={{ marginTop: '10px', color: '#6b7280', fontSize: '13px' }}>
            Eval (before → after): {drill.evalBefore} → {drill.evalAfter}
          </div>
        </div>
      ) : null}

      <SharedPgnInspector pgn={pgnResult.pgn} initialPly={ply} />
    </div>
  )
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function Metric(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#f9fafb' }}>
      <div style={{ color: '#6b7280', fontSize: '12px' }}>{props.label}</div>
      <div style={{ marginTop: '4px', fontWeight: 900, color: '#111827', fontFamily: props.mono ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' : undefined }}>
        {props.value}
      </div>
    </div>
  )
}

