'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import FileWizard, { type HistoryRow } from '../components/FileWizard'
import { useDashboardSession } from './dashboard-session-context'
import styles from './dashboard.module.css'

// ── Tipos ───────────────────────────────────────────────────────────
// Reutiliza la forma real de la fila tal como la define y devuelve FileWizard/Supabase
type HistoryItem = HistoryRow

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

function downloadTxt(item: HistoryItem) {
  const blob = new Blob([item.result_text], { type: 'text/plain;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${item.file_name.replace(/\.[^/.]+$/, '')}_${item.mode}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

async function downloadFromHistory(item: HistoryItem) {
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

// ── Componente ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const session = useDashboardSession()
  const [history,        setHistory]        = useState<HistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // filtros y búsqueda (client-side, rápido)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [filterMode,    setFilterMode]    = useState('todos')
  const [filterLength,  setFilterLength]  = useState('todos')
  const [filterFileType, setFilterFileType] = useState('todos')
  const [sortOrder,     setSortOrder]     = useState<'desc' | 'asc'>('desc')

  // modales
  const [selectedItem,    setSelectedItem]    = useState<HistoryItem | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting,        setDeleting]        = useState(false)

  // id del item recién agregado — controla la animación de entrada sutil
  const [newItemId, setNewItemId] = useState<string | null>(null)

  // Se llama desde FileWizard cuando una explicación se guarda con éxito en document_history.
  // Antepone la fila real al historial — sin refrescar, sin volver a consultar Supabase.
  const handleNewHistoryItem = (row: HistoryItem) => {
    setHistory(prev => [row, ...prev])
    setNewItemId(row.id)
    setTimeout(() => setNewItemId(curr => (curr === row.id ? null : curr)), 300)
  }

  // ── Fetch historial ────────────────────────────────────────────────
  const fetchHistory = async (userId: string) => {
    setLoadingHistory(true)
    const { data, error } = await supabase
      .from('document_history')
      .select('id, file_name, mode, result_length, result_text, created_at, user_id, output_format, output_filename')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }) // siempre traemos desc; el sort visual es client-side
    if (error) console.error('[history fetch error]', error)
    else setHistory(data || [])
    setLoadingHistory(false)
  }

  // La validación de sesión y el redirect ya viven en layout.tsx.
  // Aquí solo usamos la sesión ya resuelta (garantizada por el Context) para cargar el historial.
  useEffect(() => {
    fetchHistory(session.user.id)
  }, [session.user.id])

  // ── Filtrado + búsqueda + sort (client-side) ────────────────────────
  const filteredHistory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return history
      .filter(item => {
        const matchSearch = !q ||
          item.file_name?.toLowerCase().includes(q) ||
          item.result_text?.toLowerCase().includes(q)
        const matchMode     = filterMode     === 'todos' || item.mode          === filterMode
        const matchLength   = filterLength   === 'todos' || item.result_length === filterLength
        const matchFileType = filterFileType === 'todos' || (item.output_format ?? 'txt') === filterFileType
        return matchSearch && matchMode && matchLength && matchFileType
      })
      .sort((a, b) => {
        const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        return sortOrder === 'desc' ? diff : -diff
      })
  }, [history, searchQuery, filterMode, filterLength, filterFileType, sortOrder])

  // ── Delete ─────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleting(true)
    const { error } = await supabase.from('document_history').delete().eq('id', id)
   if (error) {
    console.error('[delete error]', error)
    alert(`No se pudo eliminar: ${error.message}`)
    } else {
      setHistory(prev => prev.filter(item => item.id !== id))
      if (selectedItem?.id === id) setSelectedItem(null)
    }
    setConfirmDeleteId(null)
    setDeleting(false)
  }

  const displayName =
    session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    session.user.email

  const hasFilters = searchQuery || filterMode !== 'todos' || filterLength !== 'todos' || filterFileType !== 'todos'

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
    <div className={styles.container}>

        {/* ── Bienvenida ── */}
        <h1 className={styles.welcomeTitle}>Hola, {displayName} 👋</h1>
        <p className={styles.welcomeSubtitle}>Este es tu panel de VozEstudio.</p>

        {/* ── Plan actual ── */}
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
            <div className={styles.consumptionRow}>
              <span>Documentos usados este mes</span>
              <span>— / —</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} />
            </div>
            <p className={styles.consumptionNote}>Disponible cuando actives un plan.</p>
          </div>
        </section>

        {/* ── Historial ── */}
        <section id="historial" className={styles.section}>

          {/* Cabecera historial */}
          <div className={styles.historyHeader}>
            <h2 className={`${styles.sectionTitle} ${styles.sectionTitleFlex}`}>Historial</h2>
            {history.length > 0 && (
              <span className={styles.historyCountBadge}>
                {filteredHistory.length} de {history.length} documentos
              </span>
            )}
          </div>

          {/* ── Buscador + filtros (solo si hay historial) ── */}
          {history.length > 0 && (
            <div className={styles.filtersWrapper}>
              <input
                type="text"
                placeholder="🔍 Buscar por nombre de archivo o contenido..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />

              <div className={styles.filtersRow}>
                {/* Tipo de documento */}
                <select value={filterFileType} onChange={e => setFilterFileType(e.target.value)} className={styles.filterSelect}>
                  <option value="todos">📁 Todos los tipos</option>
                  <option value="pdf">📄 PDF</option>
                  <option value="docx">📝 Word (.docx)</option>
                  <option value="txt">🗒️ Texto (.txt)</option>
                </select>

                {/* Longitud */}
                <select value={filterLength} onChange={e => setFilterLength(e.target.value)} className={styles.filterSelect}>
                  <option value="todos">📏 Todas las longitudes</option>
                  <option value="corto">Corto</option>
                  <option value="medio">Medio</option>
                  <option value="largo">Largo</option>
                  <option value="completo">Completo</option>
                </select>

                {/* Orden fecha */}
                <button onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')} className={styles.filterButton}>
                  {sortOrder === 'desc' ? '↓ Más recientes' : '↑ Más antiguos'}
                </button>

                {/* Limpiar filtros */}
                {hasFilters && (
                  <button
                    onClick={() => { setSearchQuery(''); setFilterMode('todos'); setFilterLength('todos'); setFilterFileType('todos') }}
                    className={styles.filterButtonClear}
                  >
                    ✕ Limpiar filtros
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Estados ── */}
          {loadingHistory && (
            <div className={`${styles.stateBox} ${styles.stateBoxSolid}`}>
              Cargando historial…
            </div>
          )}

          {!loadingHistory && history.length === 0 && (
            <div className={`${styles.stateBox} ${styles.stateBoxDashed}`}>
              Aún no has explicado ningún documento.<br />Tus análisis aparecerán aquí.
            </div>
          )}

          {!loadingHistory && history.length > 0 && filteredHistory.length === 0 && (
            <div className={`${styles.stateBox} ${styles.stateBoxDashed}`}>
              No se encontraron coincidencias. Intenta con otra búsqueda o cambia los filtros.
            </div>
          )}

          {/* ── Lista ── */}
          {!loadingHistory && filteredHistory.length > 0 && (
            <div className={styles.historyList}>
              {filteredHistory.map(item => {
                const preview = item.result_text?.slice(0, 200).trim()
                const hasMore = (item.result_text?.length ?? 0) > 200

                return (
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
                      </div>
                    </div>

                    {/* Preview resultado */}
                    <p className={styles.historyPreview}>
                      {preview}{hasMore && <span className={styles.previewEllipsis}>…</span>}
                    </p>

                    {/* Acciones */}
                    <div className={styles.historyActions}>
                      <button onClick={() => setSelectedItem(item)} className={styles.actionButtonPrimary}>
                        👁️ Ver explicación
                      </button>
                      <button onClick={() => downloadFromHistory(item)} className={styles.actionButtonSecondary}>
                        ⬇️ Descargar {item.output_format ? item.output_format.toUpperCase() : 'TXT'}
                      </button>
                      <button onClick={() => setConfirmDeleteId(item.id)} className={styles.actionButtonDanger}>
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </div>{/* /container */}

      {/* ══════════════════════════════════════
          MODAL: Ver explicación completa
      ══════════════════════════════════════ */}
      {selectedItem && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setSelectedItem(null) }}
          className={styles.modalOverlay}
        >
          <div className={styles.modalBox}>

            {/* Header */}
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.badgeGroupModal}>
                  <span className={styles.badgeMode}>
                    {MODE_EMOJI[selectedItem.mode]} {selectedItem.mode}
                  </span>
                  <span className={styles.badgeLength} style={{ color: LENGTH_COLOR[selectedItem.result_length] ?? '#1a1a2e' }}>
                    {selectedItem.result_length}
                  </span>
                </div>
                <p className={styles.modalFileName}>
                  {selectedItem.output_filename || selectedItem.file_name}
                </p>
                <p className={styles.modalDate}>
                  {new Date(selectedItem.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button onClick={() => setSelectedItem(null)} className={styles.modalCloseButton}>
                ✕
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className={styles.modalContent}>
              <p className={styles.modalResultText}>{selectedItem.result_text}</p>
            </div>

            {/* Footer */}
            <div className={styles.modalFooter}>
              <button onClick={() => downloadFromHistory(selectedItem)} className={styles.modalButtonSecondary}>
                ⬇️ Descargar {selectedItem.output_format ? selectedItem.output_format.toUpperCase() : 'TXT'}
              </button>
              <button onClick={() => setSelectedItem(null)} className={styles.modalButtonPrimary}>
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
