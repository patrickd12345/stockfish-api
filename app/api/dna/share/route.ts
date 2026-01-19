import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/database'
import { createOrRotateDnaShare, getActiveDnaShareForUser } from '@/lib/dnaShare'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured' }, { status: 500 })

  try {
    const share = await getActiveDnaShareForUser(lichessUserId)
    if (!share) return NextResponse.json({ ok: true, share: null })
    const origin = new URL(request.url).origin
    return NextResponse.json({
      ok: true,
      share: {
        slug: share.slug,
        url: `${origin}/dna/${share.slug}`,
        createdAt: share.createdAt,
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load share link' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured' }, { status: 500 })

  try {
    const share = await createOrRotateDnaShare(lichessUserId)
    const origin = new URL(request.url).origin
    return NextResponse.json({
      ok: true,
      share: {
        slug: share.slug,
        url: `${origin}/dna/${share.slug}`,
        createdAt: share.createdAt,
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to create share link' }, { status: 500 })
  }
}

