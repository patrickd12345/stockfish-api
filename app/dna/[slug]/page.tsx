import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDnaShareBySlug, loadDnaSnapshot } from '@/lib/dnaShare'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function SharedDnaPage(props: { params: { slug: string } }) {
  const { slug } = props.params
  const share = await getDnaShareBySlug(slug)
  if (!share) notFound()

  const snapshot = await loadDnaSnapshot(share.lichessUserId)
  const progression = snapshot.progression
  const engine = snapshot.engine

  return (
    <div className="container">
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px' }}>Chess DNA</h1>
          <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '13px' }}>
            Share link: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{slug}</span>
          </div>
          <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '13px' }}>
            Rendered only from stored summaries + stored drills (no on-demand analysis).
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Link className="button" href="/" style={{ background: '#111827' }}>
            Open app
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '16px', alignItems: 'start' }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Overview</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
            <Metric label="Games (progression)" value={progression ? progression.totalGames : '—'} />
            <Metric label="Games w/ engine" value={engine ? engine.gamesWithEngineAnalysis : '—'} />
            <Metric label="Engine coverage" value={engine ? `${engine.coveragePercent.toFixed(1)}%` : '—'} />
          </div>
          {progression ? (
            <div style={{ marginTop: '12px', color: '#6b7280', fontSize: '13px' }}>
              Period: {progression.period.start} → {progression.period.end} ({progression.period.days} days) · Computed {new Date(progression.computedAt).toLocaleString()}
            </div>
          ) : (
            <div style={{ marginTop: '12px', color: '#6b7280', fontSize: '13px' }}>
              No stored progression summary found yet.
            </div>
          )}
          {engine ? (
            <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '13px' }}>
              Engine: {engine.engineInfo.engineName}
              {engine.engineInfo.engineVersion ? ` ${engine.engineInfo.engineVersion}` : ''} · Depth {engine.engineInfo.analysisDepth} · Computed{' '}
              {new Date(engine.computedAt).toLocaleString()}
            </div>
          ) : (
            <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '13px' }}>
              No stored engine summary found yet.
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Time controls</h2>
          {snapshot.timeControls.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: '13px' }}>No stored time-control data found.</div>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {snapshot.timeControls.map((t) => (
                <div key={t.timeControl} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ fontWeight: 700 }}>{t.timeControl}</div>
                  <div style={{ color: '#6b7280' }}>{t.games.toLocaleString()} games</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Openings</h2>
          {progression ? (
            <div style={{ display: 'grid', gap: '14px' }}>
              <OpeningList title="Most played" rows={progression.openings.mostPlayed} />
              <OpeningList title="Strongest (min 3 games)" rows={progression.openings.strongest} />
              <OpeningList title="Weakest (min 3 games)" rows={progression.openings.weakest} />
            </div>
          ) : (
            <div style={{ color: '#6b7280', fontSize: '13px' }}>No stored opening summary found yet.</div>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Blunder DNA (recurring mistakes)</h2>
          {snapshot.patterns.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: '13px' }}>No stored Blunder DNA patterns found yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {snapshot.patterns.slice(0, 8).map((p) => (
                <div
                  key={p.patternTag}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ fontWeight: 800, color: '#111827' }}>{p.label}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{p.occurrences} hits</div>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#374151' }}>
                    Weakness score: <strong>{p.weaknessScore.toFixed(2)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Proof (clickable examples)</h2>
        {snapshot.evidence.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: '13px' }}>
            No stored drill examples found yet. Generate Blunder DNA drills first (they’re what powers evidence links).
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {snapshot.evidence.map((block) => (
              <div key={block.patternTag} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 900, color: '#111827' }}>{block.label}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>{block.patternTag}</div>
                </div>
                <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                  {block.drills.map((d) => (
                    <Link
                      key={`${d.lichessGameId}:${d.ply}`}
                      href={`/dna/${encodeURIComponent(slug)}/game/${encodeURIComponent(d.lichessGameId)}?ply=${encodeURIComponent(String(d.ply))}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: '#0f172a',
                        color: '#f8fafc'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontWeight: 800 }}>
                          Game {d.lichessGameId} · ply {d.ply}
                        </div>
                        <div style={{ fontSize: '12px', opacity: 0.9 }}>
                          Best: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{d.bestMove}</span>{' '}
                          · Played:{' '}
                          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{d.myMove}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', opacity: 0.9, alignSelf: 'center' }}>Open →</div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <div style={{ color: '#6b7280', fontSize: '12px' }}>{props.label}</div>
      <div style={{ fontWeight: 900, marginTop: '4px' }}>{props.value}</div>
    </div>
  )
}

function OpeningList(props: {
  title: string
  rows: Array<{ opening: string; games: number; winRate: number; avgAccuracy?: number; avgBlunders: number }>
}) {
  return (
    <div>
      <div style={{ fontWeight: 900, color: '#111827' }}>{props.title}</div>
      {props.rows.length === 0 ? (
        <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '13px' }}>No data.</div>
      ) : (
        <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
          {props.rows.slice(0, 5).map((r) => (
            <div key={r.opening} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ fontWeight: 700, color: '#111827' }}>{r.opening}</div>
              <div style={{ color: '#6b7280', fontSize: '13px' }}>
                {r.games}g · {(r.winRate * 100).toFixed(0)}% win · {r.avgAccuracy !== undefined ? `${r.avgAccuracy.toFixed(1)} acc` : '—'} ·{' '}
                {r.avgBlunders.toFixed(2)} bl/g
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

