import { NextResponse } from 'next/server'
import { getServerCapabilityFacts } from '@/lib/capabilities'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(getServerCapabilityFacts())
}
