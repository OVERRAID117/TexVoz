'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import FileWizard, { type HistoryRow } from '../components/FileWizard'
import { useDashboardSession } from './dashboard-session-context'
import {
  fetchDocumentHistoryPage,
  fetchDocumentHistoryDetail,
  effectiveFormat,
  HISTORY_PAGE_SIZE,
  type DocumentHistorySummary,
  type DocumentHistoryDetail,
  type DocumentHistoryQuery,
  type SortOption,
  type OutputFormatFilter,
} from '@/lib/documentHistory'
import type { AccountUsageData, AccountUsageResponse, MetricUsage } from '@/lib/accountUsage'
import styles from './dashboard.module.css'

// ── Opciones de filtro (capa de UI — valores reales de document_history) ──
const MODE_FILTER_OPTIONS = [
  { value: 'explicar',     label: 'Explicar' },
  { value: 'resumir',      label: 'Resumir' },
  { value: 'ordenar',      label: 'Ordenar' },
  { value: 'simplificar',  label: 'Simplificar' },
  { value: 'preguntas',    label: 'Preguntas' },
  { value: 'guia-estudio', label: 'Guía de estudio' },
  { value: 'analizar',     label: 'Analizar' },
] as const

const RESULT_LENGTH_OPTIONS = [
  { value: 'corto',    label: 'Corto' },
  { value: 'medio',    label: 'Medio' },
  { value: 'largo',    label: 'Largo' },
  { value: 'completo', label: 'Completo' },
] as const

const OUTPUT_FORMAT_OPTIONS: { value: OutputFormatFilter; label: string }[] = [
  { value: 'txt',  label: 'TXT' },
  { value: 'docx', label: 'DOCX' },
  { value: 'pdf',  label: 'PDF' },
  { value: 'none', label: 'Sin formato' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'created_desc', label: 'Más recientes' },
  { value: 'created_asc',  label: 'Más antiguos' },
  { value: 'name_asc',     label: 'Nombre A-Z' },
  { value: 'name_desc',    label: 'Nombre Z-A' },
  { value: 'pages_desc',   label: 'Más páginas' },
  { value: 'pages_asc',    label: 'Menos páginas' },
]

// ── Helpers ─────────────────────────────────────────────────────────
const MODE_EMOJI: Record<string, string> = {
  explicar: '🧠', resumir: '📌', ordenar: '🗂️', simplificar: '✨',
}
const LENGTH_COLOR: Record<string, string> = {
  corto: '#059669', medio: '#b8860b', largo: '#7c3aed', completo: '#1a1a2e',
}

// Clasificación visual (ícono/filtro/badge) de un documento del historial —
// delega en effectiveFormat() (lib/documentHistory.ts), la misma precedencia
// de 3 niveles (moderno explícito / moderno "Sin formato" / legacy inferido)
// que ya usa el filtro server-side del historial.
function historyItemExtension(item: { file_name: string; output_format: string | null; output_format_known: boolean; output_filename: string | null }) {
  return effectiveFormat(item) ?? ''
}

type HistoryFileIcon =
  | { kind: 'image'; src: string }
  | { kind: 'emoji'; glyph: string }

// Assets reales en public/dashboard/icons/ (solo pdf/docx/txt) — no hay un
// PNG de fallback genérico, así que el estado "formato desconocido" usa un
// emoji neutro en el mismo contenedor, no una imagen inventada.
function historyFileIconFor(ext: string): HistoryFileIcon {
  if (ext === 'pdf') return { kind: 'image', src: '/dashboard/icons/file-pdf.png' }
  if (ext === 'docx' || ext === 'doc') return { kind: 'image', src: '/dashboard/icons/file-docx.png' }
  if (ext === 'txt') return { kind: 'image', src: '/dashboard/icons/file-txt.png' }
  return { kind: 'emoji', glyph: '🗒️' }
}

// Los 3 formatos que ofrece el selector de descarga en Historial — mismos
// íconos reales que historyFileIconFor(), reutilizados para consistencia
// visual entre el ícono de la tarjeta y las opciones del selector.
const DOWNLOAD_FORMAT_OPTIONS: { format: 'txt' | 'docx' | 'pdf'; label: string; icon: string }[] = [
  { format: 'txt',  label: 'TXT',  icon: '/dashboard/icons/file-txt.png' },
  { format: 'docx', label: 'DOCX', icon: '/dashboard/icons/file-docx.png' },
  { format: 'pdf',  label: 'PDF',  icon: '/dashboard/icons/file-pdf.png' },
]

// Conversión pura texto→archivo, sin IA — mismo endpoint que ya usa
// FileWizard para el mismo propósito. No consume uso ni toca DeepSeek.
async function downloadGeneratedFile(text: string, format: 'txt' | 'docx' | 'pdf', baseFileName: string) {
  const res = await fetch('/api/generate-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, format, fileName: baseFileName }),
  })
  if (!res.ok) throw new Error('Error al generar el documento')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${baseFileName}.${format}`
  a.click()
  URL.revokeObjectURL(url)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Consumo del plan (Fase E) ──────────────────────────────────────
type UsageStatus = 'idle' | 'loading' | 'ok' | 'no_plan' | 'error'

function isMetricUsage(value: unknown): value is MetricUsage {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.used === 'number' &&
    (typeof v.limit === 'number' || v.limit === null) &&
    (typeof v.remaining === 'number' || v.remaining === null) &&
    (typeof v.percentage === 'number' || v.percentage === null)
  )
}

function isAccountUsageResponse(value: unknown): value is AccountUsageResponse {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>

  if (v.status === 'no_plan' || v.status === 'error') return true

  if (v.status === 'ok') {
    if (typeof v.data !== 'object' || v.data === null) return false
    const d = v.data as Record<string, unknown>

    if (typeof d.plan !== 'object' || d.plan === null) return false
    const plan = d.plan as Record<string, unknown>
    if (typeof plan.name !== 'string' || typeof plan.displayName !== 'string') return false
    if (typeof plan.maxPagesPerDoc !== 'number' && plan.maxPagesPerDoc !== null) return false
    if (typeof plan.historyDays !== 'number' && plan.historyDays !== null) return false

    if (typeof d.period !== 'object' || d.period === null) return false
    const period = d.period as Record<string, unknown>
    if (typeof period.start !== 'string' || typeof period.endExclusive !== 'string') return false

    if (!isMetricUsage(d.docs) || !isMetricUsage(d.pages)) return false

    if (d.mostUsedMode !== null) {
      if (typeof d.mostUsedMode !== 'object' || d.mostUsedMode === null) return false
      const m = d.mostUsedMode as Record<string, unknown>
      if (typeof m.mode !== 'string' || typeof m.count !== 'number') return false
    }

    return true
  }

  return false
}

// ── Acceso beta (Fase 3) ─────────────────────────────────────────────
// Tipo del JSON crudo que devuelve GET /api/beta/status. Se declara aquí en
// vez de en lib/ porque esta fase no toca ningún archivo de lib/ — no es una
// preferencia de diseño, es una restricción de alcance de esta fase.
type BetaStatusApiResponse =
  | { status: 'none'; redemptionEnabled: boolean }
  | {
      status: 'active'
      redemptionEnabled: boolean
      roundNumber: number
      docsUsed: number
      docsLimit: number
      pagesPerDocLimit: number
      expiresAt: string
    }
  | {
      status: 'ended'
      redemptionEnabled: boolean
      reason: 'exhausted' | 'expired'
      roundNumber: number
      docsUsed: number
      docsLimit: number
      expiresAt: string
    }
  | { status: 'error' }

function isBetaStatusApiResponse(value: unknown): value is BetaStatusApiResponse {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>

  if (v.status === 'error') return true

  if (v.status === 'none') {
    return typeof v.redemptionEnabled === 'boolean'
  }

  if (v.status === 'active') {
    return (
      typeof v.redemptionEnabled === 'boolean' &&
      typeof v.roundNumber === 'number' &&
      typeof v.docsUsed === 'number' &&
      typeof v.docsLimit === 'number' &&
      typeof v.pagesPerDocLimit === 'number' &&
      typeof v.expiresAt === 'string'
    )
  }

  if (v.status === 'ended') {
    return (
      typeof v.redemptionEnabled === 'boolean' &&
      (v.reason === 'exhausted' || v.reason === 'expired') &&
      typeof v.roundNumber === 'number' &&
      typeof v.docsUsed === 'number' &&
      typeof v.docsLimit === 'number' &&
      typeof v.expiresAt === 'string'
    )
  }

  return false
}

// Estado en memoria del acceso beta — 'idle'/'loading' son estados puramente
// locales (antes de que la primera respuesta llegue), el resto refleja 1:1
// lo que ya valida isBetaStatusApiResponse.
type BetaStatusState =
  | { kind: 'idle' | 'loading' | 'error' }
  | { kind: 'none'; redemptionEnabled: boolean }
  | {
      kind: 'active'
      redemptionEnabled: boolean
      roundNumber: number
      docsUsed: number
      docsLimit: number
      pagesPerDocLimit: number
      expiresAt: string
    }
  | {
      kind: 'ended'
      redemptionEnabled: boolean
      reason: 'exhausted' | 'expired'
      roundNumber: number
      docsUsed: number
      docsLimit: number
      expiresAt: string
    }

function mapBetaStatusResponse(json: BetaStatusApiResponse): BetaStatusState {
  if (json.status === 'error') return { kind: 'error' }
  if (json.status === 'none') return { kind: 'none', redemptionEnabled: json.redemptionEnabled }
  if (json.status === 'active') {
    return {
      kind: 'active',
      redemptionEnabled: json.redemptionEnabled,
      roundNumber: json.roundNumber,
      docsUsed: json.docsUsed,
      docsLimit: json.docsLimit,
      pagesPerDocLimit: json.pagesPerDocLimit,
      expiresAt: json.expiresAt,
    }
  }
  return {
    kind: 'ended',
    redemptionEnabled: json.redemptionEnabled,
    reason: json.reason,
    roundNumber: json.roundNumber,
    docsUsed: json.docsUsed,
    docsLimit: json.docsLimit,
    expiresAt: json.expiresAt,
  }
}

// Acceso combinado — 4 estados explícitos (ver plan Fase 3, punto 2). Un
// error de /api/account/usage o /api/beta/status NUNCA se trata como "no hay
// acceso": es un estado aparte que no abre el gate comercial ni afirma que
// falta un plan.
type AccessResolution =
  | { kind: 'checking' }
  | { kind: 'granted' }
  | { kind: 'denied' }
  | { kind: 'verification_failed' }

function resolveAccess(usageStatus: UsageStatus, betaStatus: BetaStatusState): AccessResolution {
  if (usageStatus === 'idle' || usageStatus === 'loading') return { kind: 'checking' }
  if (usageStatus === 'ok') return { kind: 'granted' }
  if (usageStatus === 'error') return { kind: 'verification_failed' }

  // usageStatus === 'no_plan' a partir de aquí — la decisión pasa a beta
  if (betaStatus.kind === 'idle' || betaStatus.kind === 'loading') return { kind: 'checking' }
  if (betaStatus.kind === 'error') return { kind: 'verification_failed' }
  if (betaStatus.kind === 'active') return { kind: 'granted' }
  return { kind: 'denied' } // betaStatus.kind es 'none' o 'ended'
}

function formatPeriodDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function formatPeriodRange(start: string, endExclusive: string) {
  return `${formatPeriodDate(start)} – ${formatPeriodDate(endExclusive)}`
}

function usageFractionText(metric: MetricUsage) {
  return `${metric.used} / ${metric.limit === null ? 'Ilimitado' : metric.limit}`
}

function usageRemainingText(metric: MetricUsage) {
  return metric.limit === null ? 'Ilimitado' : `${metric.remaining} restantes`
}

function usageBarWidth(percentage: number | null) {
  if (percentage === null) return 0
  return Math.min(100, Math.max(0, percentage))
}

function usageBarClass(percentage: number | null) {
  if (percentage === null || percentage < 80) return styles.progressFillNormal
  if (percentage < 100) return styles.progressFillWarning
  return styles.progressFillDanger
}

function usageBadge(percentage: number | null): { label: string; className: string } | null {
  if (percentage === null) return null
  if (percentage >= 100) return { label: 'Agotado', className: styles.usageBadgeDanger }
  if (percentage >= 80) return { label: 'Casi agotado', className: styles.usageBadgeWarning }
  return null
}

// Tarjeta compacta de resumen (Inicio + Consumo y plan) — usada para las
// métricas con barra de progreso (Documentos, Páginas).
function renderSummaryTile(label: string, metric: MetricUsage) {
  const badge = usageBadge(metric.percentage)
  return (
    <div className={styles.summaryTile}>
      <span className={styles.summaryTileLabel}>{label}</span>
      <span className={styles.summaryTileValue}>{usageFractionText(metric)}</span>
      <div className={styles.progressTrack}>
        <div
          className={`${styles.progressFill} ${usageBarClass(metric.percentage)}`}
          style={{ width: `${usageBarWidth(metric.percentage)}%` }}
        />
      </div>
      <p className={styles.summaryTileFootnote}>
        {usageRemainingText(metric)}
        {badge && <span className={badge.className} style={{ marginLeft: 6 }}>{badge.label}</span>}
      </p>
    </div>
  )
}

function modeLabel(mode: string): string {
  return MODE_FILTER_OPTIONS.find(o => o.value === mode)?.label ?? mode
}

// Promedio de páginas por documento del periodo — aritmética local sobre
// docs/pages ya cargados, sin query ni campo nuevo del backend.
function averagePagesPerDoc(docs: MetricUsage, pages: MetricUsage): number {
  if (docs.used === 0) return 0
  return pages.used / docs.used
}

// Tarjetas del bloque superior ("Tu consumo") que no encajan en el formato
// de barra de progreso de renderSummaryTile — herramienta más usada y
// promedio de páginas por documento del periodo.
function renderMostUsedModeTile(mostUsedMode: { mode: string; count: number } | null) {
  return (
    <div className={styles.summaryTile}>
      <span className={styles.summaryTileLabel}>Herramienta más usada</span>
      <span className={styles.summaryTileValue}>
        {mostUsedMode ? modeLabel(mostUsedMode.mode) : '—'}
      </span>
      <p className={styles.summaryTileFootnote}>
        {mostUsedMode
          ? `${mostUsedMode.count} ${mostUsedMode.count === 1 ? 'documento' : 'documentos'}`
          : 'Sin actividad aún'}
      </p>
    </div>
  )
}

function renderAveragePagesTile(docs: MetricUsage, pages: MetricUsage) {
  const avg = Math.round(averagePagesPerDoc(docs, pages) * 10) / 10
  return (
    <div className={styles.summaryTile}>
      <span className={styles.summaryTileLabel}>Promedio por documento</span>
      <span className={styles.summaryTileValue}>{avg}</span>
      <p className={styles.summaryTileFootnote}>páginas por documento</p>
    </div>
  )
}

// ── Componente ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const session = useDashboardSession()
  const [history,        setHistory]        = useState<DocumentHistorySummary[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError,   setHistoryError]   = useState(false)

  // paginación
  const [page,       setPage]       = useState(1)
  const [total,      setTotal]      = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // búsqueda, filtros y orden
  const [searchInput,      setSearchInput]      = useState('')
  const [search,           setSearch]           = useState('')
  const [modeFilter,       setModeFilter]       = useState('')
  const [lengthFilter,     setLengthFilter]     = useState('')
  const [formatFilter,     setFormatFilter]     = useState<OutputFormatFilter | ''>('')
  const [downloadableOnly, setDownloadableOnly] = useState(false)
  const [sort,             setSort]             = useState<SortOption>('created_desc')

  // JIT-fetch de detalle/descarga (id de la tarjeta con fetch en curso)
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)

  // detalle del documento abierto
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<DocumentHistoryDetail | null>(null)
  const [detailStatus,   setDetailStatus]   = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading')

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting,        setDeleting]        = useState(false)

  // selector de formato de descarga (Historial) — id del documento para el
  // que se está eligiendo formato, y qué formato está convirtiéndose ahora.
  const [downloadFormatFor, setDownloadFormatFor] = useState<string | null>(null)
  const [downloadingFormat, setDownloadingFormat] = useState<'txt' | 'docx' | 'pdf' | null>(null)

  // id del item recién agregado — controla la animación de entrada sutil
  const [newItemId, setNewItemId] = useState<string | null>(null)

  // consumo real del plan (Fase E)
  const [usageStatus, setUsageStatus] = useState<UsageStatus>('idle')
  const [usageData, setUsageData] = useState<AccountUsageData | null>(null)
  const usageRequestIdRef = useRef(0)

  // acceso beta (Fase 3) — completamente independiente del estado de arriba,
  // combinado solo a través de resolveAccess()
  const [betaStatus, setBetaStatus] = useState<BetaStatusState>({ kind: 'idle' })
  const betaStatusRequestIdRef = useRef(0)

  const [betaGateOpen, setBetaGateOpen] = useState(false)

  const [redeemCode, setRedeemCode] = useState('')
  const [redeemStatus, setRedeemStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [redeemError, setRedeemError] = useState<string | null>(null)

  // ── Carga paginada ────────────────────────────────────────────────
  const loadPage = async (pageNum: number) => {
    setLoadingHistory(true)
    setHistoryError(false)
    try {
      const query: DocumentHistoryQuery = {
        search,
        mode: modeFilter || undefined,
        resultLength: lengthFilter || undefined,
        outputFormat: formatFilter || undefined,
        downloadableOnly,
        sort,
      }
      const result = await fetchDocumentHistoryPage(session.user.id, pageNum, HISTORY_PAGE_SIZE, query)
      setHistory(result.items)
      setPage(result.page)
      setTotal(result.total)
      setTotalPages(result.totalPages)
    } catch (err) {
      console.error('[history fetch error]', err)
      setHistoryError(true)
    } finally {
      setLoadingHistory(false)
    }
  }

  // ── Consumo real del plan ──────────────────────────────────────────
  const loadUsage = useCallback(async () => {
    const requestId = ++usageRequestIdRef.current
    setUsageStatus('loading')
    let nextStatus: UsageStatus = 'error'
    let nextData: AccountUsageData | null = null
    try {
      const res = await fetch('/api/account/usage', {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (res.ok) {
        const json: unknown = await res.json()
        if (isAccountUsageResponse(json)) {
          if (json.status === 'ok') {
            nextStatus = 'ok'
            nextData = json.data
          } else if (json.status === 'no_plan') {
            nextStatus = 'no_plan'
          }
        }
      }
    } catch (err) {
      console.error('[loadUsage error]', err)
    } finally {
      if (requestId === usageRequestIdRef.current) {
        setUsageStatus(nextStatus)
        setUsageData(nextData)
      }
    }
  }, [session.access_token])

  // ── Acceso beta (Fase 3) — mismo patrón anti-carrera que loadUsage ──
  const loadBetaStatus = useCallback(async () => {
    const requestId = ++betaStatusRequestIdRef.current
    setBetaStatus({ kind: 'loading' })
    let next: BetaStatusState = { kind: 'error' }
    try {
      const res = await fetch('/api/beta/status', {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (res.ok) {
        const json: unknown = await res.json()
        if (isBetaStatusApiResponse(json)) {
          next = mapBetaStatusResponse(json)
        }
      }
    } catch (err) {
      console.error('[loadBetaStatus error]', err)
    } finally {
      if (requestId === betaStatusRequestIdRef.current) {
        setBetaStatus(next)
      }
    }
  }, [session.access_token])

  // Acceso combinado (ver resolveAccess arriba) — se recalcula en cada
  // render, no es estado propio.
  const access = resolveAccess(usageStatus, betaStatus)

  // Apertura automática al entrar: se evalúa UNA sola vez por montaje real de
  // la página, en cuanto el acceso deja de estar 'checking'. 'verification_failed'
  // no cuenta esa evaluación — si la verificación falla y luego "Reintentar"
  // confirma que de verdad no hay acceso, el gate todavía debe poder abrirse.
  // No depende de sessionStorage ni de ninguna marca persistente.
  const hasAutoOpenedRef = useRef(false)
  useEffect(() => {
    if (hasAutoOpenedRef.current) return
    if (access.kind === 'checking') return
    if (access.kind === 'verification_failed') return

    if (access.kind === 'granted') {
      hasAutoOpenedRef.current = true
      return
    }

    hasAutoOpenedRef.current = true
    setBetaGateOpen(true)
  }, [access.kind])

  // Reapertura manual: solo el clic real en "Inicio" del sidebar (evento
  // texvoz:dashboard-home, ver sidebar.tsx) puede reabrir el gate después de
  // que el usuario lo cerró con la X — nunca un simple re-render.
  const accessKindRef = useRef(access.kind)
  useEffect(() => {
    accessKindRef.current = access.kind
  }, [access.kind])

  useEffect(() => {
    function handleHomeNav() {
      if (accessKindRef.current === 'denied') setBetaGateOpen(true)
    }
    window.addEventListener('texvoz:dashboard-home', handleHomeNav)
    return () => window.removeEventListener('texvoz:dashboard-home', handleHomeNav)
  }, [])

  // La X solo cierra el modal en ese instante — no desbloquea generación (el
  // enforcement real sigue siendo el 403 de ia-explain) ni persiste nada.
  function dismissBetaGate() {
    setBetaGateOpen(false)
  }

  async function submitRedeemCode() {
    const code = redeemCode.trim()
    if (!code) return
    setRedeemStatus('loading')
    setRedeemError(null)
    try {
      const res = await fetch('/api/beta/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ code }),
      })
      const json: unknown = await res.json()
      if (!res.ok) {
        const message =
          typeof json === 'object' && json !== null && 'error' in json && typeof (json as { error: unknown }).error === 'string'
            ? (json as { error: string }).error
            : 'No se pudo procesar el código. Intenta de nuevo.'
        setRedeemStatus('error')
        setRedeemError(message)
        return
      }
      setRedeemStatus('idle')
      setRedeemError(null)
      setRedeemCode('')
      await loadBetaStatus()
      setBetaGateOpen(false)
    } catch (err) {
      console.error('[submitRedeemCode error]', err)
      setRedeemStatus('error')
      setRedeemError('No se pudo procesar el código. Intenta de nuevo.')
    }
  }

  // Debounce de búsqueda: separa lo que el usuario escribe (searchInput) del
  // valor que realmente dispara la consulta (search), sin instalar paquetes.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(timeout)
  }, [searchInput])

  // Única fuente de recarga a página 1: sesión, búsqueda debounced, filtros y
  // orden. No incluye `page` a propósito — los botones Anterior/Siguiente
  // llaman a loadPage directamente, sin pasar por este efecto.
  useEffect(() => {
    loadPage(1)
  }, [session.user.id, search, modeFilter, lengthFilter, formatFilter, downloadableOnly, sort])

  // Carga de consumo real: efecto independiente, solo depende de loadUsage
  // (memoizado con session.access_token) — no se re-dispara por búsqueda,
  // filtros, orden ni paginación.
  useEffect(() => {
    void loadUsage()
  }, [loadUsage])

  // Carga de acceso beta — efecto independiente, mismo motivo que el de arriba.
  useEffect(() => {
    void loadBetaStatus()
  }, [loadBetaStatus])

  // Se llama desde FileWizard cuando una explicación se guarda con éxito en document_history.
  // Recarga la página 1 respetando los filtros/búsqueda/orden activos —
  // nunca los limpia, y si el documento nuevo no coincide, simplemente no aparece.
  const handleNewHistoryItem = async (row: HistoryRow) => {
    setNewItemId(row.id)
    await loadPage(1)
    await loadUsage()
    await loadBetaStatus()
    setTimeout(() => setNewItemId(curr => (curr === row.id ? null : curr)), 300)
  }

  // ── Filtros: evitar la combinación contradictoria "sin formato" + "solo descargables" ──
  const handleDownloadableOnlyChange = (checked: boolean) => {
    setDownloadableOnly(checked)
    if (checked && formatFilter === 'none') {
      setFormatFilter('')
    }
  }

  const handleFormatFilterChange = (value: OutputFormatFilter | '') => {
    setFormatFilter(value)
    if (value === 'none' && downloadableOnly) {
      setDownloadableOnly(false)
    }
  }

  const handleClearFilters = () => {
    setSearchInput('')
    setSearch('')
    setModeFilter('')
    setLengthFilter('')
    setFormatFilter('')
    setDownloadableOnly(false)
    setSort('created_desc')
  }

  // ── Detalle bajo demanda ──────────────────────────────────────────
  const handleOpenDetail = async (id: string) => {
    setSelectedId(id)
    setSelectedDetail(null)
    setDetailStatus('loading')
    setDetailLoadingId(id)
    try {
      const result = await fetchDocumentHistoryDetail(id, session.user.id)
      if (result.status === 'ok') {
        setSelectedDetail(result.detail)
        setDetailStatus('ready')
      } else {
        setDetailStatus(result.status)
      }
    } catch (err) {
      console.error('[handleOpenDetail error]', err)
      setDetailStatus('error')
    } finally {
      setDetailLoadingId(null)
    }
  }

  const handleCloseDetail = () => {
    setSelectedId(null)
    setSelectedDetail(null)
    setDetailStatus('loading')
  }

  // ── Selector de formato de descarga ────────────────────────────────
  // Abre el selector (TXT/DOCX/PDF) — la conversión real ocurre en
  // downloadHistoryItemAs una vez el usuario elige.
  const handleDownloadClick = (id: string) => {
    setDownloadFormatFor(id)
  }

  // Convierte result_text al formato elegido y lo descarga — sin IA, sin
  // consumir uso (mismos endpoints /api/generate-doc + /api/document-history/
  // finalize que ya usa FileWizard, ninguno de los dos toca planUsage/betaAccess).
  const downloadHistoryItemAs = async (id: string, format: 'txt' | 'docx' | 'pdf') => {
    setDownloadingFormat(format)
    try {
      let detail: DocumentHistoryDetail | null = selectedId === id ? selectedDetail : null
      if (!detail) {
        const result = await fetchDocumentHistoryDetail(id, session.user.id)
        if (result.status === 'not_found') {
          alert('Este documento ya no existe o no tienes acceso a él.')
          return
        }
        if (result.status === 'error') {
          alert('No se pudo descargar. Intenta de nuevo.')
          return
        }
        detail = result.detail
      }

      if (!detail.result_text.trim()) {
        alert('Este documento no tiene contenido generado.')
        return
      }

      const baseName = (detail.output_filename ?? detail.file_name).replace(/\.[^/.]+$/, '')
      await downloadGeneratedFile(detail.result_text, format, baseName)

      // Persiste el formato elegido para que el ícono/badge lo reflejen la
      // próxima vez — no es necesario para que la descarga funcione.
      const outputFilename = `${baseName}.${format}`
      const finalizeRes = await fetch('/api/document-history/finalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          historyId: id,
          resultText: detail.result_text,
          outputFormat: format,
          outputFilename,
        }),
      })

      if (finalizeRes.ok) {
        setHistory(prev => prev.map(item =>
          item.id === id
            ? { ...item, output_format: format, output_format_known: true, output_filename: outputFilename }
            : item
        ))
        setSelectedDetail(prev =>
          prev && prev.id === id
            ? { ...prev, output_format: format, output_format_known: true, output_filename: outputFilename }
            : prev
        )
      } else {
        console.error('[downloadHistoryItemAs finalize error]', await finalizeRes.text())
      }
    } catch (err) {
      console.error('[downloadHistoryItemAs error]', err)
      alert('Hubo un error al descargar. Intenta de nuevo.')
    } finally {
      setDownloadingFormat(null)
      setDownloadFormatFor(null)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleting(true)
    const { error } = await supabase.from('document_history').delete().eq('id', id)
   if (error) {
    console.error('[delete error]', error)
    alert(`No se pudo eliminar: ${error.message}`)
    } else {
      setHistory(prev => prev.filter(item => item.id !== id))
      if (selectedId === id) handleCloseDetail()
    }
    setConfirmDeleteId(null)
    setDeleting(false)
  }

  const displayName =
    session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    session.user.email

  const hasActiveFilters =
    searchInput !== '' || modeFilter !== '' || lengthFilter !== '' || formatFilter !== '' ||
    downloadableOnly || sort !== 'created_desc'

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
    <div className={styles.pageGrid}>
      <aside className={styles.sideBannerAside}>
        <div className={styles.sideBannerSticky}>
          <img src="/landing/banner-documento-audio.png" alt="" className={styles.sideBannerImg} />
        </div>
      </aside>

    <div className={styles.container}>

        {/* ── Hero / Bienvenida ── */}
        <section className={styles.heroSection}>
          <div className={styles.heroBgWrap} aria-hidden="true">
            <Image
              src="/dashboard/hero/reporte-libros-hero.png"
              alt=""
              fill
              priority
              sizes="(max-width: 900px) 70vw, 640px"
              className={styles.heroBgImage}
            />
          </div>
          <div className={styles.heroText}>
            <h1 className={styles.welcomeTitle}>Hola, {displayName} 👋</h1>
            <p className={styles.welcomeSubtitle}>Bienvenido a tu panel de VozEstudio.</p>
          </div>
        </section>

        {/* ── Resumen del plan ── */}
        <section className={styles.summarySection}>
          {usageStatus === 'no_plan' && (betaStatus.kind === 'idle' || betaStatus.kind === 'loading') && (
            <div className={styles.summaryGrid}>
              {['Plan actual'].map(label => (
                <div key={label} className={`${styles.summaryTile} ${styles.summaryTileSkeleton}`}>
                  <span className={styles.summaryTileLabel}>{label}</span>
                  <span className={styles.summaryTileValuePlaceholder} />
                </div>
              ))}
            </div>
          )}

          {usageStatus === 'no_plan' && betaStatus.kind === 'error' && (
            <div className={styles.summaryErrorBox}>
              <p>No pudimos verificar tu acceso. Intenta recargar.</p>
              <button onClick={() => { void loadUsage(); void loadBetaStatus() }} className={styles.filterButton}>
                Reintentar
              </button>
            </div>
          )}

          {usageStatus === 'no_plan' && betaStatus.kind === 'active' && (
            <div className={styles.planCard}>
              <div className={styles.planHeader}>
                <span className={styles.planEmoji}>🧪</span>
                <div>
                  <div className={styles.planName}>Beta #{betaStatus.roundNumber}</div>
                  <div className={styles.planPrice}>{betaStatus.docsUsed} de {betaStatus.docsLimit} documentos usados</div>
                </div>
              </div>
              <p className={styles.planDescription}>
                Máximo {betaStatus.pagesPerDocLimit} páginas por documento · Expira: {formatDate(betaStatus.expiresAt)}
              </p>
            </div>
          )}

          {usageStatus === 'no_plan' && betaStatus.kind === 'ended' && (
            <div className={styles.planCard}>
              <div className={styles.planHeader}>
                <span className={styles.planEmoji}>🧪</span>
                <div>
                  <div className={styles.planName}>
                    {betaStatus.reason === 'expired' ? 'Tu ronda beta expiró' : 'Agotaste tu ronda beta'}
                  </div>
                  <div className={styles.planPrice}>Beta #{betaStatus.roundNumber} · Sin plan activo</div>
                </div>
              </div>
              <p className={styles.planDescription}>
                Elige un plan para desbloquear más documentos y funciones.
              </p>
              <button className={styles.btnPrimary} onClick={() => { window.location.href = '/#planes' }}>
                Ver planes disponibles
              </button>
              {betaStatus.redemptionEnabled && (
                <button className={styles.filterButton} style={{ marginTop: 8 }} onClick={() => setBetaGateOpen(true)}>
                  Canjear otro código beta
                </button>
              )}
            </div>
          )}

          {usageStatus === 'no_plan' && betaStatus.kind === 'none' && (
            <div className={styles.planCard}>
              <div className={styles.planHeader}>
                <span className={styles.planEmoji}>📋</span>
                <div>
                  <div className={styles.planName}>Plan actual</div>
                  <div className={styles.planPrice}>Sin plan activo</div>
                </div>
              </div>
              <p className={styles.planDescription}>
                Aún no tienes una suscripción activa. Elige un plan para desbloquear más documentos y funciones.
              </p>
              <button className={styles.btnPrimary} onClick={() => { window.location.href = '/#planes' }}>
                Ver planes disponibles
              </button>
              {betaStatus.redemptionEnabled && (
                <button className={styles.filterButton} style={{ marginTop: 8 }} onClick={() => setBetaGateOpen(true)}>
                  ¿Tienes acceso beta?
                </button>
              )}
            </div>
          )}

          {(usageStatus === 'idle' || usageStatus === 'loading') && (
            <div className={styles.summaryGrid}>
              {['Usos este mes', 'Páginas este mes', 'Herramienta más usada', 'Promedio por documento'].map(label => (
                <div key={label} className={`${styles.summaryTile} ${styles.summaryTileSkeleton}`}>
                  <span className={styles.summaryTileLabel}>{label}</span>
                  <span className={styles.summaryTileValuePlaceholder} />
                </div>
              ))}
            </div>
          )}

          {usageStatus === 'error' && (
            <div className={styles.summaryErrorBox}>
              <p>No se pudo cargar el resumen de tu plan.</p>
              <button onClick={() => { void loadUsage() }} className={styles.filterButton}>
                Reintentar
              </button>
            </div>
          )}

          {usageStatus === 'ok' && usageData && (
            <div className={styles.summaryGrid}>
              {renderSummaryTile('Usos este mes', usageData.docs)}
              {renderSummaryTile('Páginas este mes', usageData.pages)}
              {renderMostUsedModeTile(usageData.mostUsedMode)}
              {renderAveragePagesTile(usageData.docs, usageData.pages)}
            </div>
          )}
        </section>

        {/* ── Área de trabajo ── */}
        <section id="herramientas" className={styles.workSection}>
          <div className={styles.workHeader}>
            <p className={styles.workEyebrow}>
              <span className={styles.workEyebrowStar}>✦</span> Área de trabajo
            </p>
            <h2 className={styles.workTitle}>Sube tu documento y elige cómo quieres procesarlo</h2>
            <p className={styles.workTitleSub}>Carga tu archivo y selecciona la herramienta que necesitas.</p>
          </div>
          <FileWizard
            onSaved={handleNewHistoryItem}
            allowAudio={false}
            showToolsWithUpload
            hideCostUI
            accessChecking={access.kind === 'checking'}
            generationLocked={access.kind === 'denied' || access.kind === 'verification_failed'}
            lockedMessage={
              access.kind === 'verification_failed'
                ? 'No pudimos verificar tu acceso. Intenta recargar.'
                : access.kind === 'denied'
                  ? 'Necesitas un plan activo o acceso beta para generar.'
                  : undefined
            }
            onOpenAccessOptions={access.kind === 'denied' ? () => setBetaGateOpen(true) : undefined}
            onRetryAccessCheck={
              access.kind === 'verification_failed'
                ? () => { void loadUsage(); void loadBetaStatus() }
                : undefined
            }
            usingBetaAccess={usageStatus === 'no_plan' && betaStatus.kind === 'active'}
          />
        </section>

        {/* ── Consumo y plan ── */}
        <section id="consumo" className={styles.section}>
          <div className={styles.consumoHeader}>
            <h2 className={styles.sectionTitle}>Consumo del plan</h2>
            <button
              onClick={() => { void loadUsage() }}
              className={styles.filterButton}
              disabled={usageStatus === 'loading'}
            >
              🔄 Actualizar
            </button>
          </div>
          <p className={styles.consumoSubtitle}>Resumen de tu uso actual y límites de tu plan.</p>

          {(usageStatus === 'idle' || usageStatus === 'loading') && (
            <p className={styles.usageStateText}>Cargando consumo…</p>
          )}

          {usageStatus === 'error' && (
            <div className={styles.summaryErrorBox}>
              <p>No se pudo cargar el consumo del plan.</p>
              <button onClick={() => { void loadUsage() }} className={styles.filterButton}>
                Reintentar
              </button>
            </div>
          )}

          {usageStatus === 'no_plan' && (
            <p className={styles.consumptionNote}>Disponible cuando actives un plan.</p>
          )}

          {usageStatus === 'ok' && usageData && (
            <>
              <div className={styles.summaryGrid}>
                {renderSummaryTile('Documentos', usageData.docs)}
                {renderSummaryTile('Páginas', usageData.pages)}
                <div className={styles.summaryTile}>
                  <span className={styles.summaryTileLabel}>Historial</span>
                  <span className={styles.summaryTileValue}>
                    {usageData.plan.historyDays !== null ? `${usageData.plan.historyDays} días` : 'Ilimitado'}
                  </span>
                  <p className={styles.summaryTileFootnote}>de retención</p>
                </div>
                <div className={styles.summaryTile}>
                  <span className={styles.summaryTileLabel}>Plan actual</span>
                  <div className={styles.summaryTilePlanRow}>
                    <span className={styles.summaryTileValue}>{usageData.plan.displayName}</span>
                    <span className={styles.planActiveBadge}>Activo</span>
                  </div>
                </div>
              </div>

              <div className={styles.consumoLowerGrid}>
                <div className={styles.consumoChartCard}>
                  <h3 className={styles.consumoCardTitle}>Este periodo</h3>
                  <p className={styles.consumoChartEmpty}>
                    Aún no hay suficiente historial diario para mostrar una gráfica de este periodo.
                    Cuando proceses más documentos, aquí verás tu consumo de Documentos y Páginas a lo largo del mes.
                  </p>
                </div>

                <div className={styles.consumoLimitsCard}>
                  <h3 className={styles.consumoCardTitle}>Límites de tu plan</h3>
                  <dl className={styles.limitsList}>
                    <div className={styles.limitsRow}>
                      <dt>Documentos por mes</dt>
                      <dd>{usageData.docs.limit === null ? 'Ilimitado' : usageData.docs.limit}</dd>
                    </div>
                    <div className={styles.limitsRow}>
                      <dt>Páginas por documento</dt>
                      <dd>{usageData.plan.maxPagesPerDoc === null ? 'Sin límite' : usageData.plan.maxPagesPerDoc}</dd>
                    </div>
                    <div className={styles.limitsRow}>
                      <dt>Historial</dt>
                      <dd>{usageData.plan.historyDays === null ? 'Ilimitado' : `${usageData.plan.historyDays} días`}</dd>
                    </div>
                    <div className={styles.limitsRow}>
                      <dt>Tamaño máx. por archivo</dt>
                      <dd>50 MB</dd>
                    </div>
                    <div className={styles.limitsRow}>
                      <dt>Formatos permitidos</dt>
                      <dd>PDF, DOCX, TXT</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <p className={styles.consumptionNote} style={{ marginTop: 12 }}>
                Periodo actual: {formatPeriodRange(usageData.period.start, usageData.period.endExclusive)}
              </p>
            </>
          )}
        </section>

        {/* ── Historial ── */}
        <section id="historial" className={styles.section}>

          {/* Cabecera historial */}
          <div className={styles.historyHeader}>
            <div>
              <h2 className={`${styles.sectionTitle} ${styles.sectionTitleFlex}`}>Historial de documentos</h2>
              <p className={styles.consumoSubtitle} style={{ margin: '2px 0 0' }}>Consulta tus documentos generados recientemente.</p>
            </div>
            {total > 0 && (
              <span className={styles.historyCountBadge}>
                {total} {total === 1 ? 'documento' : 'documentos'} en total
              </span>
            )}
          </div>

          {/* ── Búsqueda + filtros + orden ── */}
          <div className={styles.filtersWrapper}>
            <input
              type="text"
              placeholder="🔍 Buscar por nombre de archivo…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className={styles.searchInput}
            />

            <div className={styles.filtersRow}>
              <select value={modeFilter} onChange={e => setModeFilter(e.target.value)} className={styles.filterSelect}>
                <option value="">🧠 Todos los modos</option>
                {MODE_FILTER_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <select value={lengthFilter} onChange={e => setLengthFilter(e.target.value)} className={styles.filterSelect}>
                <option value="">📏 Todas las longitudes</option>
                {RESULT_LENGTH_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <select
                value={formatFilter}
                onChange={e => handleFormatFilterChange(e.target.value as OutputFormatFilter | '')}
                className={styles.filterSelect}
              >
                <option value="">📁 Todos los formatos</option>
                {OUTPUT_FORMAT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <select value={sort} onChange={e => setSort(e.target.value as SortOption)} className={styles.filterSelect}>
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <label className={styles.filterButton} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={downloadableOnly}
                  onChange={e => handleDownloadableOnlyChange(e.target.checked)}
                />
                Solo con descarga
              </label>

              {hasActiveFilters && (
                <button onClick={handleClearFilters} className={styles.filterButtonClear}>
                  ✕ Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {/* ── Estados ── */}
          {loadingHistory && (
            <div className={`${styles.stateBox} ${styles.stateBoxSolid}`}>
              Cargando historial…
            </div>
          )}

          {!loadingHistory && historyError && (
            <div className={`${styles.stateBox} ${styles.stateBoxDashed}`}>
              No se pudo cargar tu historial.{' '}
              <button onClick={() => loadPage(page)} className={styles.filterButton}>
                Reintentar
              </button>
            </div>
          )}

          {!loadingHistory && !historyError && history.length === 0 && (
            <div className={`${styles.stateBox} ${styles.stateBoxDashed}`}>
              {hasActiveFilters
                ? 'No se encontraron documentos con estos filtros.'
                : <>Aún no has explicado ningún documento.<br />Tus análisis aparecerán aquí.</>}
            </div>
          )}

          {/* ── Lista ── */}
          {!loadingHistory && !historyError && history.length > 0 && (
            <div className={styles.historyList}>
              {history.map(item => (
                <div
                  key={item.id}
                  className={`${styles.historyCard} ${item.id === newItemId ? styles.historyItemNew : ''}`}
                >

                  {/* Fila principal: icono grande + nombre + fecha */}
                  <div className={styles.historyCardMain}>
                    {(() => {
                      const icon = historyFileIconFor(historyItemExtension(item))
                      return (
                        <div className={styles.historyFileIconWrap}>
                          {icon.kind === 'image' ? (
                            <img src={icon.src} alt="" className={styles.historyFileIconImg} loading="lazy" />
                          ) : (
                            <span className={styles.historyFileIconEmoji}>{icon.glyph}</span>
                          )}
                        </div>
                      )
                    })()}
                    <div className={styles.historyFileInfo}>
                      <p className={styles.historyCardFileName}>
                        {item.output_filename || item.file_name}
                      </p>
                      <p className={styles.historyCardDate}>{formatDate(item.created_at)}</p>
                    </div>
                  </div>

                  {/* Badges: modo, longitud, páginas, formato */}
                  <div className={styles.badgeGroup}>
                    <span className={styles.badgeMode}>
                      {MODE_EMOJI[item.mode] ?? '🧠'} {item.mode}
                    </span>
                    <span className={styles.badgeLength} style={{ color: LENGTH_COLOR[item.result_length] ?? '#1a1a2e' }}>
                      {item.result_length}
                    </span>
                    <span className={styles.badgeLength}>
                      📄 {item.page_count ?? '—'}
                    </span>
                    {effectiveFormat(item) === null && (
                      <span className={styles.badgeNoFormat}>Sin formato</span>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className={styles.historyActions}>
                    <button
                      onClick={() => handleOpenDetail(item.id)}
                      disabled={detailLoadingId !== null}
                      className={styles.actionButtonPrimary}
                    >
                      {detailLoadingId === item.id ? '⏳ Cargando…' : '👁️ Ver explicación'}
                    </button>
                    <button
                      onClick={() => handleDownloadClick(item.id)}
                      disabled={detailLoadingId !== null}
                      className={styles.actionButtonSecondary}
                    >
                      ⬇️ Descargar
                    </button>
                    <button onClick={() => setConfirmDeleteId(item.id)} className={styles.actionButtonDanger}>
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Paginación ── */}
          {totalPages > 1 && (
            <div className={styles.paginationRow}>
              <button
                onClick={() => loadPage(page - 1)}
                disabled={page <= 1 || loadingHistory}
                className={styles.filterButton}
              >
                ← Anterior
              </button>
              <span className={styles.historyCountBadge}>
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => loadPage(page + 1)}
                disabled={page >= totalPages || loadingHistory}
                className={styles.filterButton}
              >
                Siguiente →
              </button>
            </div>
          )}
        </section>

      </div>{/* /container */}

      <aside className={styles.sideBannerAside}>
        <div className={styles.sideBannerSticky}>
          <img src="/landing/banner-documento-doc.png" alt="" className={styles.sideBannerImg} />
        </div>
      </aside>
    </div>{/* /pageGrid */}

      {/* ══════════════════════════════════════
          MODAL: Ver explicación completa
      ══════════════════════════════════════ */}
      {selectedId && (
        <div
          onClick={e => { if (e.target === e.currentTarget) handleCloseDetail() }}
          className={styles.modalOverlay}
        >
          <div className={styles.modalBox}>

            {/* Header — oculto hasta que el detalle esté listo */}
            <div className={styles.modalHeader}>
              <div>
                {detailStatus === 'ready' && selectedDetail && (
                  <>
                    <div className={styles.badgeGroupModal}>
                      <span className={styles.badgeMode}>
                        {MODE_EMOJI[selectedDetail.mode] ?? '🧠'} {selectedDetail.mode}
                      </span>
                      <span className={styles.badgeLength} style={{ color: LENGTH_COLOR[selectedDetail.result_length] ?? '#1a1a2e' }}>
                        {selectedDetail.result_length}
                      </span>
                    </div>
                    <p className={styles.modalFileName}>
                      {selectedDetail.output_filename || selectedDetail.file_name}
                    </p>
                    <p className={styles.modalDate}>
                      {new Date(selectedDetail.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </>
                )}
              </div>
              <button onClick={handleCloseDetail} className={styles.modalCloseButton}>
                ✕
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className={styles.modalContent}>
              {detailStatus === 'loading' && (
                <p className={styles.modalStateText}>Cargando documento…</p>
              )}

              {detailStatus === 'not_found' && (
                <p className={styles.modalStateText}>Este documento ya no existe o no tienes acceso a él.</p>
              )}

              {detailStatus === 'error' && (
                <p className={styles.modalStateText}>
                  No se pudo cargar el documento.{' '}
                  <button onClick={() => selectedId && handleOpenDetail(selectedId)} className={styles.filterButton}>
                    Reintentar
                  </button>
                </p>
              )}

              {detailStatus === 'ready' && selectedDetail && (
                <>
                  <div className={styles.modalMetaGrid}>
                    <span>📄 Páginas: {selectedDetail.page_count ?? '—'}</span>
                    <span>📦 Formato: {effectiveFormat(selectedDetail)?.toUpperCase() ?? 'Sin formato'}</span>
                    <span>🗂️ Archivo: {selectedDetail.output_filename ?? '—'}</span>
                  </div>

                  <h4 className={styles.modalSectionTitle}>Texto original</h4>
                  {selectedDetail.original_text.trim()
                    ? <p className={styles.modalOriginalText}>{selectedDetail.original_text}</p>
                    : <p className={styles.modalStateText}>No se guardó el texto original de este documento.</p>}

                  <h4 className={styles.modalSectionTitle}>Resultado</h4>
                  {selectedDetail.result_text.trim()
                    ? <p className={styles.modalResultText}>{selectedDetail.result_text}</p>
                    : <p className={styles.modalStateText}>Este documento no tiene contenido generado.</p>}
                </>
              )}
            </div>

            {/* Footer */}
            <div className={styles.modalFooter}>
              <button
                onClick={() => selectedDetail && setDownloadFormatFor(selectedDetail.id)}
                disabled={detailStatus !== 'ready' || !selectedDetail?.result_text.trim()}
                className={styles.modalButtonSecondary}
              >
                ⬇️ Descargar
              </button>
              <button onClick={handleCloseDetail} className={styles.modalButtonPrimary}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          MODAL: Confirmar eliminación
      ══════════════════════════════════════ */}
      {confirmDeleteId && (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmModalBox}>
            <p className={styles.confirmModalEmoji}>🗑️</p>
            <h3 className={styles.confirmModalTitle}>¿Eliminar esta explicación?</h3>
            <p className={styles.confirmModalText}>Esta acción no se puede deshacer.</p>
            <div className={styles.confirmModalActions}>
              <button onClick={() => setConfirmDeleteId(null)} disabled={deleting} className={styles.confirmButtonCancel}>
                Cancelar
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)} disabled={deleting} className={styles.confirmButtonDelete}>
                {deleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          MODAL: Elegir formato de descarga
      ══════════════════════════════════════ */}
      {downloadFormatFor && (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmModalBox}>
            <h3 className={styles.confirmModalTitle}>¿En qué formato lo descargas?</h3>
            <p className={styles.confirmModalText}>
              Se genera a partir del resultado ya guardado — no vuelve a usar la IA ni consume otro uso.
            </p>
            <div className={styles.downloadFormatOptions}>
              {DOWNLOAD_FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.format}
                  onClick={() => downloadHistoryItemAs(downloadFormatFor, opt.format)}
                  disabled={downloadingFormat !== null}
                  className={styles.downloadFormatOption}
                >
                  <img src={opt.icon} alt="" className={styles.downloadFormatOptionIcon} />
                  <span>{downloadingFormat === opt.format ? 'Generando…' : opt.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setDownloadFormatFor(null)}
              disabled={downloadingFormat !== null}
              className={styles.confirmButtonCancel}
              style={{ width: '100%', marginTop: 4 }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          MODAL: Gate de acceso (Fase 3 — beta)
      ══════════════════════════════════════ */}
      {betaGateOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.betaGateBox}>
            <button onClick={dismissBetaGate} className={`${styles.modalCloseButton} ${styles.betaGateClose}`} aria-label="Cerrar">
              ×
            </button>
            <h3 className={styles.confirmModalTitle}>Aún no tienes acceso a la generación.</h3>
            <p className={styles.confirmModalText}>Elige una opción para continuar.</p>

            <div className={styles.betaGateActions}>
              <button className={styles.btnPrimary} onClick={() => { window.location.href = '/#planes' }}>
                Ver planes
              </button>
              <button className={styles.betaGatePaySecondary} onClick={() => { window.location.href = '/' }}>
                Pagar un documento
              </button>
            </div>

            {(betaStatus.kind === 'none' || betaStatus.kind === 'ended') && betaStatus.redemptionEnabled && (
              <div className={styles.betaGateRedeem}>
                <p className={styles.betaGateRedeemLabel}>¿Tienes un código beta?</p>
                <div className={styles.betaGateRedeemRow}>
                  <input
                    type="text"
                    value={redeemCode}
                    onChange={e => setRedeemCode(e.target.value)}
                    placeholder="Ej. BETA-TEST-01"
                    className={styles.betaGateRedeemInput}
                    disabled={redeemStatus === 'loading'}
                  />
                  <button
                    onClick={() => { void submitRedeemCode() }}
                    disabled={redeemStatus === 'loading' || !redeemCode.trim()}
                    className={styles.btnPrimary}
                  >
                    {redeemStatus === 'loading' ? 'Canjeando…' : 'Canjear'}
                  </button>
                </div>
                {redeemStatus === 'error' && redeemError && (
                  <p className={styles.betaGateRedeemError}>{redeemError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </>
  )
}
