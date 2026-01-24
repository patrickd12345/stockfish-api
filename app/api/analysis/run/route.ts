import { NextRequest, NextResponse } from 'next/server';
import { FeatureAccessError, requireFeatureForUser } from '@/lib/featureGate/server';
import { executeServerSideAnalysis } from '@/lib/engineGateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const userId = request.cookies.get('lichess_user_id')?.value ?? null
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const {
      gameIds,
      gameId,
      pgnText,
      analysisType,
      depth,
      multiPv,
      limit,
      playerNames,
      // Blunder DNA params
      lichessGames,
      thresholdCp,
      nPerPattern,
    } = body;
    
    // Validate analysisType
    if (!analysisType || !['game', 'blunder-dna', 'batch'].includes(analysisType)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid analysisType. Must be "game", "blunder-dna", or "batch"' },
        { status: 400 }
      );
    }

    const featureKey =
      analysisType === 'blunder-dna'
        ? 'blunder_dna'
        : analysisType === 'batch'
          ? 'batch_analysis'
          : 'engine_analysis'

    try {
      await requireFeatureForUser(featureKey, { userId })
    } catch (error: any) {
      if (error instanceof FeatureAccessError) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 403 })
      }
      throw error
    }

    // Validate depth for Pro users (max 25)
    const analysisDepth = depth ? Math.min(Math.max(8, depth), 25) : 15;
    
    // Prepare params for gateway
    const params: any = {
      userId,
      type: analysisType,
      depth: analysisDepth,
      multiPv,
      limit,
      playerNames,
    };
    
    if (analysisType === 'game') {
      if (gameIds) params.gameIds = gameIds;
      if (gameId) params.gameId = gameId;
      if (pgnText) params.pgnText = pgnText;
    } else if (analysisType === 'blunder-dna') {
      if (lichessGames) params.lichessGames = lichessGames;
      if (thresholdCp !== undefined) params.thresholdCp = thresholdCp;
      if (nPerPattern !== undefined) params.nPerPattern = nPerPattern;
    }
    
    // Execute analysis via gateway
    const result = await executeServerSideAnalysis(params);
    
    if (!result.ok) {
      // Check if it's a budget error
      if (result.error?.includes('Budget exceeded') || result.error?.includes('budget')) {
        return NextResponse.json(
          {
            ok: false,
            error: result.error,
            budgetRemaining: result.budgetRemaining,
            budgetExceeded: true,
          },
          { status: 429 }
        );
      }
      
      // Check if it's a forbidden error
      if (result.error?.includes('Upgrade required') || result.error?.includes('Authentication')) {
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: 403 }
        );
      }
      
      // Other errors
      return NextResponse.json(
        { ok: false, error: result.error || 'Analysis failed' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      ok: true,
      result: result.result,
      budgetRemaining: result.budgetRemaining,
    });
  } catch (error: any) {
    console.error('Analysis API error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
