import { getSql } from './database';
import { getEntitlementForUser, type Entitlement } from './billing';

// Default budget limits (configurable via env)
const PRO_MONTHLY_CPU_MS_LIMIT = parseInt(
  process.env.PRO_MONTHLY_CPU_MS_LIMIT || '1000000',
  10
); // ~277 CPU hours
const PRO_MONTHLY_JOBS_LIMIT = parseInt(
  process.env.PRO_MONTHLY_JOBS_LIMIT || '10000',
  10
);

export interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  error?: string;
}

/**
 * Get the current billing period start date for a user.
 * Uses calendar month for simplicity and predictability.
 * This ensures consistent monthly reset regardless of subscription start date.
 */
function getBillingPeriodStart(entitlement: Entitlement): Date {
  // Use calendar month for billing period tracking
  // This ensures monthly reset on the 1st of each month
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Estimate CPU time in milliseconds for an analysis job.
 * This is approximate: depth × game_length × multiplier
 */
export function estimateCpuMs(
  depth: number,
  gameLength: number,
  analysisType: 'game' | 'blunder-dna' | 'batch' = 'game'
): number {
  // Base multiplier per move per depth
  // Rough estimate: depth 15 = ~50ms per move, depth 20 = ~200ms per move
  const baseMsPerMove = Math.max(10, depth * 3);
  
  // Blunder DNA analyzes more positions (all player moves)
  const multiplier = analysisType === 'blunder-dna' ? 1.5 : 1.0;
  
  return Math.round(baseMsPerMove * gameLength * multiplier);
}

/**
 * Check if user has budget remaining and optionally reserve it.
 * Returns whether the operation is allowed and remaining budget.
 */
export async function checkAndIncrementBudget(
  userId: string,
  estimatedCpuMs: number
): Promise<BudgetCheckResult> {
  const sql = getSql();
  
  // Get entitlement to determine billing period
  const entitlement = await getEntitlementForUser(userId);
  if (entitlement.plan !== 'PRO') {
    return {
      allowed: false,
      remaining: 0,
      error: 'Pro subscription required for server-side analysis',
    };
  }
  
  const billingPeriodStart = getBillingPeriodStart(entitlement);
  
  // Get or create usage counter for this period
  const rows = await sql`
    INSERT INTO pro_usage_counters (
      user_id, billing_period_start, engine_cpu_ms_used, engine_jobs_count
    )
    VALUES (${userId}, ${billingPeriodStart}, 0, 0)
    ON CONFLICT (user_id, billing_period_start)
    DO UPDATE SET updated_at = now()
    RETURNING engine_cpu_ms_used, engine_jobs_count
  `;
  
  const currentUsage = rows[0];
  const currentCpuMs = Number(currentUsage.engine_cpu_ms_used) || 0;
  const currentJobs = Number(currentUsage.engine_jobs_count) || 0;
  
  // Check CPU budget
  const newCpuMs = currentCpuMs + estimatedCpuMs;
  if (newCpuMs > PRO_MONTHLY_CPU_MS_LIMIT) {
    return {
      allowed: false,
      remaining: Math.max(0, PRO_MONTHLY_CPU_MS_LIMIT - currentCpuMs),
      error: 'Monthly compute budget exceeded',
    };
  }
  
  // Check jobs budget
  if (currentJobs >= PRO_MONTHLY_JOBS_LIMIT) {
    return {
      allowed: false,
      remaining: Math.max(0, PRO_MONTHLY_CPU_MS_LIMIT - currentCpuMs),
      error: 'Monthly jobs limit exceeded',
    };
  }
  
  // Reserve the budget (increment counters)
  await sql`
    UPDATE pro_usage_counters
    SET 
      engine_cpu_ms_used = engine_cpu_ms_used + ${estimatedCpuMs},
      engine_jobs_count = engine_jobs_count + 1,
      updated_at = now()
    WHERE user_id = ${userId} AND billing_period_start = ${billingPeriodStart}
  `;
  
  return {
    allowed: true,
    remaining: PRO_MONTHLY_CPU_MS_LIMIT - newCpuMs,
  };
}

/**
 * Record actual CPU usage after analysis completes.
 * Adjusts the budget if actual usage differs from the estimate that was reserved.
 * Note: checkAndIncrementBudget already reserved an estimate, so this adjusts to actual.
 */
export async function recordUsageWithAdjustment(
  userId: string,
  estimatedCpuMs: number,
  actualCpuMs: number,
  jobType: 'game' | 'blunder-dna' | 'batch'
): Promise<void> {
  const sql = getSql();
  
  const entitlement = await getEntitlementForUser(userId);
  if (entitlement.plan !== 'PRO') {
    return; // No tracking for free users
  }
  
  const billingPeriodStart = getBillingPeriodStart(entitlement);
  
  // Adjust: subtract estimate (already reserved) and add actual
  const adjustment = actualCpuMs - estimatedCpuMs;
  
  await sql`
    UPDATE pro_usage_counters
    SET 
      engine_cpu_ms_used = engine_cpu_ms_used + ${adjustment},
      updated_at = now()
    WHERE user_id = ${userId} AND billing_period_start = ${billingPeriodStart}
  `;
}

/**
 * Record actual CPU usage after analysis completes.
 * This is a convenience wrapper that uses actualCpuMs as both estimate and actual
 * (for cases where we don't track them separately).
 */
export async function recordUsage(
  userId: string,
  actualCpuMs: number,
  jobType: 'game' | 'blunder-dna' | 'batch'
): Promise<void> {
  await recordUsageWithAdjustment(userId, actualCpuMs, actualCpuMs, jobType);
}

/**
 * Get current usage for a user in the current billing period.
 */
export async function getUsageForPeriod(userId: string): Promise<{
  cpuMsUsed: number;
  cpuMsLimit: number;
  jobsCount: number;
  jobsLimit: number;
  remaining: number;
  periodStart: Date;
}> {
  const sql = getSql();
  
  const entitlement = await getEntitlementForUser(userId);
  const billingPeriodStart = getBillingPeriodStart(entitlement);
  
  const rows = await sql`
    SELECT engine_cpu_ms_used, engine_jobs_count
    FROM pro_usage_counters
    WHERE user_id = ${userId} AND billing_period_start = ${billingPeriodStart}
  `;
  
  const cpuMsUsed = rows.length > 0 ? Number(rows[0].engine_cpu_ms_used) || 0 : 0;
  const jobsCount = rows.length > 0 ? Number(rows[0].engine_jobs_count) || 0 : 0;
  
  return {
    cpuMsUsed,
    cpuMsLimit: PRO_MONTHLY_CPU_MS_LIMIT,
    jobsCount,
    jobsLimit: PRO_MONTHLY_JOBS_LIMIT,
    remaining: Math.max(0, PRO_MONTHLY_CPU_MS_LIMIT - cpuMsUsed),
    periodStart: billingPeriodStart,
  };
}
