import { NextRequest, NextResponse } from 'next/server'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { getGameAnalysisData } from '@/lib/models'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database is not configured' }, { status: 503 })
  }
  try {
    await connectToDb()
    const data = await getGameAnalysisData(params.id)
    if (!data) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching game analysis:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch game analysis' },
      { status: 500 }
    )
  }
}
