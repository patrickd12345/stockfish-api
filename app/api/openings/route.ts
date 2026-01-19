import { NextResponse } from 'next/server'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { getOpeningStats } from '@/lib/models'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ openings: [] })
  }
  try {
    await connectToDb()
    const openings = await getOpeningStats(1000)
    return NextResponse.json({ openings })
  } catch (error: any) {
    console.error('Error fetching opening stats:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch opening stats' },
      { status: 500 }
    )
  }
}
