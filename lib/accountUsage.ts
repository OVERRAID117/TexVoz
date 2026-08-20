export type MetricUsage = {
  used: number
  limit: number | null
  remaining: number | null
  percentage: number | null
}

export type AccountUsageData = {
  plan: {
    name: string
    displayName: string
    maxPagesPerDoc: number | null
    historyDays: number | null
  }
  period: {
    start: string
    endExclusive: string
  }
  docs: MetricUsage
  pages: MetricUsage
  mostUsedMode: { mode: string; count: number } | null
}

export type AccountUsageResponse =
  | { status: 'ok'; data: AccountUsageData }
  | { status: 'no_plan' }
  | { status: 'error' }

// limit === 0 no admite división real (used/0). Por convención: sin uso → 0%,
// cualquier uso → 100% (ya excedido). Para limit > 0 el porcentaje real puede
// superar 100 y se devuelve tal cual, sin ocultarlo.
function calculatePercentage(used: number, limit: number): number {
  if (limit === 0) return used > 0 ? 100 : 0
  return Math.round((used / limit) * 100)
}

export function buildMetricUsage(used: number, limit: number | null): MetricUsage {
  if (limit === null) {
    return { used, limit: null, remaining: null, percentage: null }
  }
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    percentage: calculatePercentage(used, limit),
  }
}
