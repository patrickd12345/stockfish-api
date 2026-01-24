import { NextRequest, NextResponse } from 'next/server'
import { runBatchAnalysis } from '@/lib/batchAnalysis'
import { getProgressionSummaryMetadata } from '@/lib/progressionStorage'
import { requireProEntitlement, ForbiddenError } from '@/lib/entitlementGuard'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for batch analysis

/**
 * Manual batch analysis trigger endpoint.
 * Pro-only: requires authenticated Pro user.
 * POST /api/batch-analysis - Run batch analysis
 * GET /api/batch-analysis - Get batch analysis status (no auth required for read)
 */

export async function POST(request: NextRequest) {
  try {
    await requireProEntitlement(request)
    console.log('🔄 Manual batch analysis triggered via API')

    const summary = await runBatchAnalysis()

    return NextResponse.json({
      success: true,
      message: 'Batch analysis completed successfully',
      summary: {
        totalGames: summary.totalGames,
        computedAt: summary.computedAt,
        period: summary.period
      }
    })
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 403 }
      )
    }
    const err = error as Error
    console.error('❌ Manual batch analysis failed:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'Batch analysis failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const metadata = await getProgressionSummaryMetadata()
    
    if (!metadata) {
      return NextResponse.json({
        exists: false,
        message: 'Unable to check batch analysis status'
      })
    }
    
    const needsUpdate = metadata.currentGameCount !== metadata.gameCountUsed
    
    return NextResponse.json({
      exists: metadata.exists,
      gameCountUsed: metadata.gameCountUsed,
      currentGameCount: metadata.currentGameCount,
      computedAt: metadata.computedAt,
      needsUpdate,
      message: metadata.exists 
        ? `Analysis exists for ${metadata.gameCountUsed} games${needsUpdate ? ' (update needed)' : ' (up to date)'}`
        : 'No batch analysis found'
    })
  } catch (error: any) {
    console.error('❌ Failed to get batch analysis status:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to get status' 
      },
      { status: 500 }
    )
  }
}