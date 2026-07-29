'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import FileWizard, { type HistoryRow } from '../components/FileWizard'
import { useDashboardSession } from './dashboard-session-context'
import {
  fetchDocumentHistoryPage,
  fetchDocumentHistoryDetail,
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

function fileIcon(name: string) {
  const ext = name?.split('.').pop()?.toLowerCase()
  if (ext === 'pdf')  return '📄'
  if (ext === 'docx' || ext === 'doc') return '📝'
  return '🗒️'
}

function downloadTxt(item: DocumentHistoryDetail) {
  const blob = new Blob([item.result_text], { type: 'text/plain;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${item.file_name.replace(/\.[^/.]+$/, '')}_${item.mode}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

async function downloadFromHistory(item: DocumentHistoryDetail) {
  // Registros viejos sin formato → descargar TXT directo del texto en memoria
  if (!item.output_format || !item.output_filename) {
    downloadTxt(item)
    return
  }
  // Registros nuevos → regenerar el archivo en el formato original
  try {
    const res = await fetch('/api/generate-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text:     item.result_text,
        format:   item.output_format,
        fileName: item.output_filename.replace(/\.[^/.]+$/, ''),
      }),
    })
    if (!res.ok) throw new Error('Error al regenerar documento')
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = item.output_filename
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('[downloadFromHistory]', err)
    alert('No se pudo descargar. Intenta de nuevo.')
  }
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

    if (typeof d.period !== 'object' || d.period === null) return false
    const period = d.period as Record<string, unknown>
    if (typeof period.start !== 'string' || typeof period.endExclusive !== 'string') return false

    if (!isMetricUsage(d.docs) || !isMetricUsage(d.pages)) return false

    return true
  }

  return false
}

function formatPeriodDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function subtractOneUTCDay(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function formatPeriodRange(start: string, endExclusive: string) {
  return `${formatPeriodDate(start)} – ${formatPeriodDate(subtractOneUTCDay(endExclusive))}`
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

function renderUsageMetric(label: string, metric: MetricUsage) {
  const badge = usageBadge(metric.percentage)
  return (
    <div className={styles.usageMetric}>
      <div className={styles.usageMetricHeader}>
        <span>{label}</span>
        <span>{usageFractionText(metric)}</span>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={`${styles.progressFill} ${usageBarClass(metric.percentage)}`}
          style={{ width: `${usageBarWidth(metric.percentage)}%` }}
        />
      </div>
      <p className={styles.consumptionNote}>
        {usageRemainingText(metric)}
        {badge && <span className={badge.className} style={{ marginLeft: 8 }}>{badge.label}</span>}
      </p>
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

  // id del item recién agregado — controla la animación de entrada sutil
  const [newItemId, setNewItemId] = useState<string | null>(null)

  // consumo real del plan (Fase E)
  const [usageStatus, setUsageStatus] = useState<UsageStatus>('idle')
  const [usageData, setUsageData] = useState<AccountUsageData | null>(null)
  const usageRequestIdRef = useRef(0)

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

  // Se llama desde FileWizard cuando una explicación se guarda con éxito en document_history.
  // Recarga la página 1 respetando los filtros/búsqueda/orden activos —
  // nunca los limpia, y si el documento nuevo no coincide, simplemente no aparece.
  const handleNewHistoryItem = async (row: HistoryRow) => {
    setNewItemId(row.id)
    await loadPage(1)
    await loadUsage()
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

  // ── Descarga bajo demanda ─────────────────────────────────────────
  const handleDownloadClick = async (id: string) => {
    setDetailLoadingId(id)
    try {
      const result = await fetchDocumentHistoryDetail(id, session.user.id)
      if (result.status === 'not_found') {
        alert('Este documento ya no existe o no tienes acceso a él.')
        return
      }
      if (result.status === 'error') {
        alert('No se pudo descargar. Intenta de nuevo.')
        return
      }
      await downloadFromHistory(result.detail)
    } catch (err) {
      console.error('[handleDownloadClick error]', err)
      alert('No se pudo descargar. Intenta de nuevo.')
    } finally {
      setDetailLoadingId(null)
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
    <div className={styles.container}>

        {/* ── Bienvenida ── */}
        <h1 className={styles.welcomeTitle}>Hola, {displayName} 👋</h1>
        <p className={styles.welcomeSubtitle}>Este es tu panel de VozEstudio.</p>

        {/* ── Plan actual (CTA solo cuando no hay plan activo) ── */}
        {usageStatus === 'no_plan' && (
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
          </div>
        )}

        {/* ── Área de trabajo ── */}
        <section id="herramientas" className={styles.workSection}>
          <h2 className={styles.sectionTitle}>Área de trabajo</h2>
          <p className={styles.workSubtitle}>Sube un documento y genera tu explicación.</p>
          <FileWizard onSaved={handleNewHistoryItem} />
        </section>

        {/* ── Consumo del plan ── */}
        <section id="consumo" className={styles.section}>
          <h2 className={styles.sectionTitle}>Consumo del plan</h2>
          <div className={styles.consumptionCard}>

            {(usageStatus === 'idle' || usageStatus === 'loading') && (
              <p className={styles.usageStateText}>Cargando consumo…</p>
            )}

            {usageStatus === 'error' && (
              <div className={styles.usageStateText}>
                <p>No se pudo cargar el consumo del plan.</p>
                <button
                  onClick={() => {
                    void loadUsage()
                  }}
                  className={styles.filterButton}
                >
                  Reintentar
                </button>
              </div>
            )}

            {usageStatus === 'no_plan' && (
              <p className={styles.consumptionNote}>Disponible cuando actives un plan.</p>
            )}

            {usageStatus === 'ok' && usageData && (
              <>
                <div className={styles.consumptionRow}>
                  <span>{usageData.plan.displayName}</span>
                  <span>{formatPeriodRange(usageData.period.start, usageData.period.endExclusive)}</span>
                </div>
                {renderUsageMetric('Documentos', usageData.docs)}
                {renderUsageMetric('Páginas', usageData.pages)}
              </>
            )}

          </div>
        </section>

        {/* ── Historial ── */}
        <section id="historial" className={styles.section}>

          {/* Cabecera historial */}
          <div className={styles.historyHeader}>
            <h2 className={`${styles.sectionTitle} ${styles.sectionTitleFlex}`}>Historial</h2>
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

                  {/* Fila superior: icono + nombre + fecha + badges */}
                  <div className={styles.historyCardTop}>
                    <div className={styles.historyCardIconGroup}>
                      <span className={styles.historyCardIcon}>
                        {item.output_format === 'pdf'  ? '📄'
                        : item.output_format === 'docx' ? '📝'
                        : item.output_format === 'txt'  ? '🗒️'
                        : fileIcon(item.file_name)}
                      </span>
                      <div>
                        <p className={styles.historyCardFileName}>
                          {item.output_filename || item.file_name}
                        </p>
                        <p className={styles.historyCardDate}>{formatDate(item.created_at)}</p>
                      </div>
                    </div>

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
                    </div>
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
                      ⬇️ Descargar {item.output_format ? item.output_format.toUpperCase() : 'TXT'}
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
                    <span>📦 Formato: {selectedDetail.output_format ? selectedDetail.output_format.toUpperCase() : 'Sin elegir aún'}</span>
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
                onClick={() => selectedDetail && downloadFromHistory(selectedDetail)}
                disabled={detailStatus !== 'ready' || !selectedDetail?.result_text.trim()}
                className={styles.modalButtonSecondary}
              >
                ⬇️ Descargar {selectedDetail?.output_format ? selectedDetail.output_format.toUpperCase() : 'TXT'}
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

    </>
  )
}
