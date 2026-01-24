import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured, connectToDb, isNeonQuotaError } from '@/lib/database'
import { getAnalysisCoverage } from '@/lib/engineStorage'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const analysisDepth = Math.max(
    8,
    Math.min(
      25,
      Number(request.nextUrl.searchParams.get('analysisDepth') ?? process.env.ANALYSIS_DEPTH ?? 15)
    )
  )

  try {
    await connectToDb()
    const coverage = await getAnalysisCoverage('stockfish', analysisDepth)

    return NextResponse.json({
      ok: true,
      engineName: 'stockfish',
      analysisDepth,
      coverage,
      updatedAt: new Date().toISOString(),
    })
  } catch (error: unknown) {
    if (isNeonQuotaError(error)) {
      return NextResponse.json({
        ok: true,
        engineName: 'stockfish',
        analysisDepth,
        coverage: { totalGames: 0, analyzedGames: 0, failedGames: 0, pendingGames: 0 },
        updatedAt: new Date().toISOString(),
        quotaExceeded: true,
      })
    }
    console.error('Engine coverage API failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load engine coverage' },
      { status: 500 }
    )
  }
}

