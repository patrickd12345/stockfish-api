import { NextRequest, NextResponse } from 'next/server';
import { createPortalSession } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const lichessUserId = request.cookies.get('lichess_user_id')?.value;
    if (!lichessUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url } = await createPortalSession(lichessUserId);

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error('Portal session creation failed:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
