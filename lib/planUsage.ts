import { getSupabaseAdmin } from './supabaseAdmin'

export type PlanLimits = {
  maxDocsMonthly: number | null
  maxPagesPerDoc: number | null
  historyDays: number | null
}

export type ActiveSubscription = {
  periodStart: string
  periodEnd: string
  planName: string
  planDisplayName: string
  limits: PlanLimits
}

export async function getActiveSubscription(userId: string): Promise<ActiveSubscription | null> {
  const admin = getSupabaseAdmin()

  // NOTA: esta consulta pedía antes `plans.max_pages_monthly`, columna que no
  // existe en la tabla real `plans` (confirmado contra el tipo Plan usado en
  // app/page.tsx, que solo tiene max_docs_month/max_pages_per_doc/max_seats/
  // history_days) — PostgREST rechaza la query completa si se pide una
  // columna inexistente, y eso es lo que producía "No se pudo cargar el
  // consumo del plan" para cualquier usuario con suscripción activa. Se quitó
  // esa columna fantasma y se agregó `history_days` (columna real) en su lugar.
  const { data, error } = await admin
    .from('subscriptions')
    .select('period_start, period_end, plans(name, display_name, max_docs_month, max_pages_per_doc, history_days)')
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
    planName: plan.name,
    planDisplayName: plan.display_name,
    limits: {
      maxDocsMonthly: plan.max_docs_month,
      maxPagesPerDoc: plan.max_pages_per_doc,
      historyDays: plan.history_days,
    },
  }
}

export type PeriodUsage = {
  docsUsed: number
  pagesUsed: number
  mostUsedMode: { mode: string; count: number } | null
}

// periodStart/periodEnd son columnas `timestamp with time zone` — period_end
// ya es el instante exclusivo real de fin de periodo (confirmado contra el
// schema real de Supabase), no una fecha sin hora. No se le suma ningún día.
export async function getPeriodUsage(
  userId: string,
  periodStart: string,
  periodEnd: string
): Promise<PeriodUsage> {
  const admin = getSupabaseAdmin()

  const periodStartInclusive = new Date(periodStart)

  if (Number.isNaN(periodStartInclusive.getTime())) {
    throw new Error(`period_start inválido: ${periodStart}`)
  }

  const periodEndExclusive = new Date(periodEnd)

  if (Number.isNaN(periodEndExclusive.getTime())) {
    throw new Error(`period_end inválido: ${periodEnd}`)
  }

  const { data, error } = await admin
    .from('document_history')
    .select('page_count, mode')
    .eq('user_id', userId)
    .eq('origin', 'subscription') // excluye documentos beta/pago-por-uso del consumo comercial
    .gte('created_at', periodStartInclusive.toISOString())
    .lt('created_at', periodEndExclusive.toISOString())

  if (error) {
    throw new Error(`No se pudo consultar el consumo del periodo: ${error.message}`)
  }

  const rows = data ?? []

  const modeCounts = new Map<string, number>()
  for (const row of rows) {
    if (!row.mode) continue
    modeCounts.set(row.mode, (modeCounts.get(row.mode) ?? 0) + 1)
  }
  let mostUsedMode: { mode: string; count: number } | null = null
  modeCounts.forEach((count, mode) => {
    if (!mostUsedMode || count > mostUsedMode.count) mostUsedMode = { mode, count }
  })

  return {
    docsUsed: rows.length,
    pagesUsed: rows.reduce((sum, row) => sum + (row.page_count ?? 0), 0),
    mostUsedMode,
  }
}

export type SourceFormat = 'pdf' | 'docx' | 'txt' | 'unknown'

// Marcadores reales de página de PDF (mismo formato que extract-text incrusta:
// "--- PAGINA N ---", uno por página real de unpdf). Solo son confiables como
// metadata cuando el texto realmente vino de nuestra extracción de PDF — un
// DOCX o TXT puede contener ese mismo texto literal como contenido normal
// (ya ocurrió: un DOCX real con 8 apariciones casuales de "--- PAGINA N ---"
// hizo que esta función devolviera 8 en vez del conteo real). Por eso el
// conteo por marcadores solo se intenta cuando sourceFormat === 'pdf'; para
// cualquier otro formato (o desconocido) se usa siempre el estimado por
// caracteres.
const PAGE_MARKER = /--- PAGINA \d+ ---/g
const CHARS_PER_PAGE = 2000

export function estimatePageCount(text: string, sourceFormat: SourceFormat): number {
  if (sourceFormat === 'pdf') {
    const markers = text.match(PAGE_MARKER)
    if (markers && markers.length > 0) return markers.length
  }
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
  origin?: 'subscription' | 'beta' | 'pay_per_use'
  betaGrantId?: string
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
      origin: params.origin ?? 'subscription',
      beta_grant_id: params.betaGrantId ?? null,
      // A partir de aquí output_format=NULL significa "sin formato elegido"
      // de forma explícita, no "dato ausente" — ver effectiveFormat() en
      // lib/documentHistory.ts.
      output_format_known: true,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`No se pudo registrar el uso: ${error?.message ?? 'error desconocido'}`)
  }

  return { id: data.id }
}
