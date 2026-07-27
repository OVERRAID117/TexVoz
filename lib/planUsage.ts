import { getSupabaseAdmin } from './supabaseAdmin'

export type PlanLimits = {
  maxDocsMonthly: number | null
  maxPagesPerDoc: number | null
  maxPagesMonthly: number | null
}

export type ActiveSubscription = {
  periodStart: string
  periodEnd: string
  limits: PlanLimits
}

export async function getActiveSubscription(userId: string): Promise<ActiveSubscription | null> {
  const admin = getSupabaseAdmin()

  const { data, error } = await admin
    .from('user_subscriptions')
    .select('period_start, period_end, plans(max_docs_monthly, max_pages_per_doc, max_pages_monthly)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new Error(`No se pudo consultar la suscripción del usuario: ${error.message}`)
  }

  if (!data) return null

  const plan = Array.isArray(data.plans) ? data.plans[0] : data.plans
  if (!plan) {
    throw new Error('La suscripción activa no tiene un plan asociado válido.')
  }

  return {
    periodStart: data.period_start,
    periodEnd: data.period_end,
    limits: {
      maxDocsMonthly: plan.max_docs_monthly,
      maxPagesPerDoc: plan.max_pages_per_doc,
      maxPagesMonthly: plan.max_pages_monthly,
    },
  }
}

export type PeriodUsage = {
  docsUsed: number
  pagesUsed: number
}

// periodStart/periodEnd son columnas `date` (sin hora). Se convierte periodEnd
// a un límite exclusivo del día siguiente para no descartar uso ocurrido
// durante el último día del periodo.
export async function getPeriodUsage(
  userId: string,
  periodStart: string,
  periodEnd: string
): Promise<PeriodUsage> {
  const admin = getSupabaseAdmin()

  const periodEndExclusive = new Date(`${periodEnd}T00:00:00.000Z`)
  periodEndExclusive.setUTCDate(periodEndExclusive.getUTCDate() + 1)

  const { data, error } = await admin
    .from('document_history')
    .select('page_count')
    .eq('user_id', userId)
    .gte('created_at', `${periodStart}T00:00:00.000Z`)
    .lt('created_at', periodEndExclusive.toISOString())

  if (error) {
    throw new Error(`No se pudo consultar el consumo del periodo: ${error.message}`)
  }

  const rows = data ?? []

  return {
    docsUsed: rows.length,
    pagesUsed: rows.reduce((sum, row) => sum + (row.page_count ?? 0), 0),
  }
}

// Cuenta marcadores reales de página de PDF (mismo formato que extract-text
// incrusta: "--- PAGINA N ---"). Si no hay marcadores (TXT/DOCX), estima por
// caracteres.
const PAGE_MARKER = /--- PAGINA \d+ ---/g
const CHARS_PER_PAGE = 2000

export function estimatePageCount(text: string): number {
  const markers = text.match(PAGE_MARKER)
  if (markers && markers.length > 0) return markers.length
  return Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE))
}

export async function recordUsage(params: {
  userId: string
  fileName: string
  originalText: string
  resultText: string
  mode: string
  resultLength: string
  pageCount: number
}): Promise<{ id: string }> {
  const admin = getSupabaseAdmin()

  const { data, error } = await admin
    .from('document_history')
    .insert({
      user_id: params.userId,
      file_name: params.fileName,
      original_text: params.originalText,
      result_text: params.resultText,
      mode: params.mode,
      result_length: params.resultLength,
      page_count: params.pageCount,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`No se pudo registrar el uso: ${error?.message ?? 'error desconocido'}`)
  }

  return { id: data.id }
}
