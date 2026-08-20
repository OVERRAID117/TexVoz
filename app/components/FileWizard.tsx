'use client'
 
import { useState, useEffect, useRef } from 'react'
import styles from './FileWizard.module.css'
import { supabase } from '@/lib/supabase'
 
// ── Tipos ──────────────────────────────────────────────────────────────────
type Step   = 1 | 2 | 3
type Action = 'audio' | 'ia' | 'ambos'
 
// Mismas voces que page.tsx → conectadas a Google TTS via /api/tts
const VOICES = [
  { id: 'es-US-Neural2-A', label: 'Goo — USA Latino A (Mujer) ⭐' },
  { id: 'es-US-Neural2-B', label: 'Goo — USA Latino B (Hombre) ⭐' },
  { id: 'es-ES-Neural2-A', label: 'Goo — España A (Mujer)' },
  { id: 'es-ES-Neural2-F', label: 'Goo — España F (Hombre)' },
  { id: 'es-US-News-F',    label: 'Goo — USA Noticias F (Mujer)' },
  { id: 'es-US-News-D',    label: 'Goo — USA Noticias D (Hombre)' },
  { id: 'es-ES-Standard-A',label: 'Goo — España Standard A' },
  { id: 'es-ES-Standard-B',label: 'Goo — España Standard B' },
]
 const IA_MODES = [
  { label: '🧠 Explícamelo', desc: 'Comprende el documento con una explicación clara y sencilla.' },
  { label: '📌 Resúmelo', desc: 'Obtén la información esencial del documento.' },
  { label: '❓ Generar preguntas inteligentes', desc: 'Crea las mejores preguntas según el contenido.' },
  { label: '👨‍🏫 Crear guía de estudio', desc: 'Organiza el contenido para aprender y repasar.' },
  { label: '🔍 Analizar documento', desc: 'Detecta hallazgos, riesgos y puntos importantes.' },
]

// Cajita de color por herramienta, mismo criterio que /visual-lab (mismo orden que IA_MODES)
const TOOL_ICON_COLORS = ['toolCardIconOrange', 'toolCardIconGreen', 'toolCardIconPurple', 'toolCardIconYellow', 'toolCardIconBlue'] as const
 
const IA_MODE_PREVIEWS: Record<number, { text: string; example: string }> = {
  0: {
    text: 'Convertiremos las partes difíciles en explicaciones claras y sencillas.',
    example: 'Texto original: La obligación subsistirá durante cinco años.\nExplicación: Las partes deberán guardar la información durante cinco años.',
  },
  1: {
    text: 'Recibirás los puntos más importantes de tu documento.',
    example: '• Fecha límite: 15 de mayo\n• Pago total: $285,000\n• Garantía: 12 meses',
  },
  2: {
    text: 'Recibirás las preguntas más importantes junto con sus respuestas.',
    example: 'Pregunta: ¿Cuál es la fecha límite?\nRespuesta: El 15 de mayo de 2026.',
  },
  3: {
    text: 'Recibirás una guía organizada para estudiar y repasar tu documento.',
    example: 'Tema principal: Obligaciones\nConcepto clave: Confidencialidad\nRecuerda: Su vigencia es de cinco años.',
  },
  4: {
    text: 'Detectaremos fechas, pagos, obligaciones, riesgos, inconsistencias y datos importantes.',
    example: 'Fecha: 15 de mayo de 2026\nPago: $285,000\nRiesgo: El anexo menciona otra fecha de entrega.',
  },
}

// Nombres cortos de las 5 herramientas reales, para el sidebar del preview del documento
const PREVIEW_TOOL_NAMES = ['Explicar', 'Resumir', 'Preguntas', 'Guía de estudio', 'Analizar documento']

// Contenido de demostración del preview "Así verás tu documento" (solo landing, showToolsWithUpload).
// Independiente de IA_MODE_PREVIEWS (esa se usa en el paso 3 del wizard real/dashboard, no se toca).
type DocPreviewContent =
  | { kind: 'paragraphs'; items: string[] }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'qa'; items: { q: string; a: string }[] }
  | { kind: 'sections'; items: { title: string; points: string[] }[] }
  | { kind: 'findings'; items: string[] }

const DOCUMENT_PREVIEW_CONTENT: Record<number, DocPreviewContent> = {
  0: {
    kind: 'paragraphs',
    items: [
      'Este contrato establece los términos bajo los cuales el proveedor brindará servicios al cliente. Define responsabilidades, tiempos de entrega, pagos y condiciones de terminación.',
      'En términos simples: el proveedor debe entregar el trabajo acordado, el cliente debe pagar en los plazos establecidos, y cualquiera de las partes puede terminar el contrato si la otra incumple sus obligaciones.',
    ],
  },
  1: {
    kind: 'bullets',
    items: [
      'Vigencia: 12 meses a partir de la firma',
      'Pago total: $285,000 en 3 exhibiciones',
      'Fecha de entrega: 15 de mayo de 2026',
      'Confidencialidad obligatoria durante 5 años',
      'Terminación anticipada: 30 días de aviso previo',
    ],
  },
  2: {
    kind: 'qa',
    items: [
      { q: '¿Cuál es la fecha límite de entrega?', a: '15 de mayo de 2026.' },
      { q: '¿Cuánto debe pagarse en total?', a: '$285,000 MXN en 3 exhibiciones.' },
      { q: '¿Qué pasa si una parte incumple?', a: 'La otra parte puede terminar el contrato.' },
      { q: '¿Cuánto dura la confidencialidad?', a: '5 años a partir de la firma.' },
    ],
  },
  3: {
    kind: 'sections',
    items: [
      { title: 'Obligaciones contractuales', points: ['Qué debe cumplir cada parte', 'Cuándo se considera incumplimiento'] },
      { title: 'Confidencialidad', points: ['Vigencia de 5 años', 'Aplica a ambas partes'] },
      { title: 'Para repasar', points: ['Fechas de pago y entrega', 'Condiciones de terminación anticipada'] },
    ],
  },
  4: {
    kind: 'findings',
    items: [
      'Riesgo: el anexo menciona una fecha de entrega distinta a la cláusula principal',
      'Fecha clave: 15 de mayo de 2026',
      'Pago: $285,000 en 3 exhibiciones',
      'Inconsistencia: el monto no coincide entre la sección 2 y el anexo B',
      'Obligación: confidencialidad por 5 años tras la terminación',
    ],
  },
}

const EXTENSIONES = [
  { label: 'Corto', desc: 'Solo lo más importante.', value: 0.25 },
  { label: 'Medio', desc: 'Más contexto sin hacerlo extenso.', value: 0.50 },
  { label: 'Largo', desc: 'La explicación más completa.', value: 0.75 },
]
// ── Precios escalonados ─────────────────────────────────────

const calculateTierPrice = (
  chars: number,
  tiers: { limit: number; price: number }[]
) => {
  let remaining = chars
  let total = 0
  let lastLimit = 0

  for (const tier of tiers) {
    if (remaining <= 0) break

    const tierSize = tier.limit - lastLimit
    const charsInTier = Math.min(remaining, tierSize)

    total += Math.ceil(charsInTier / 1000) * tier.price

    remaining -= charsInTier
    lastLimit = tier.limit
  }

  if (remaining > 0) {
    const lastPrice = tiers[tiers.length - 1].price
    total += Math.ceil(remaining / 1000) * lastPrice
  }

  return total
}

// 🎧 AUDIO
const AUDIO_TIERS = [
  { limit: 10_000,  price: 10 },
  { limit: 50_000,  price: 7 },
  { limit: 150_000, price: 4 },
  { limit: Infinity, price: 2 },
]

// 🧠 IA
const IA_TIERS = [
  { limit: 10_000,  price: 5 },
  { limit: 50_000,  price: 3 },
  { limit: Infinity, price: 1.5 },
]
 
// ── Utilidades ─────────────────────────────────────────────────────────────
const formatPrice = (mxn: number) => `$${mxn.toLocaleString('es-MX')} MXN`
const fmtBytes    = (b: number)   =>
  b < 1_048_576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1_048_576).toFixed(1)} MB`
 
const formatDuration = (chars: number, speed: number) => {
  const words   = chars / 5
  const minutes = words / (150 * speed)
  const h = Math.floor(minutes / 60)
  const m = Math.floor(minutes % 60)
  if (h > 0) return `${h}h ${m}m aprox`
  return `${m}m aprox`
}
 
type FileTypeIcon =
  | { kind: 'image'; src: string }
  | { kind: 'emoji'; glyph: string }

const fileTypeIcon = (name: string): FileTypeIcon => {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return { kind: 'image', src: '/dashboard/icons/file-pdf.png' }
  if (ext === 'docx' || ext === 'doc') return { kind: 'image', src: '/dashboard/icons/file-docx.png' }
  if (ext === 'txt') return { kind: 'image', src: '/dashboard/icons/file-txt.png' }
  return { kind: 'emoji', glyph: '🗒️' }
}

// Título del modal de error para un 403 de límite — interpreta el mensaje
// FIJO que ya devuelve el backend (ia-explain), sin cambiar ese backend ni
// sus mensajes (solo el título mostrado aquí). Si el texto no coincide con
// ninguno de los casos conocidos, cae al título genérico de suscripción.
function pickLimitErrorTitle(message: string): string {
  if (message === 'Alcanzaste el límite de tu ronda beta.') return 'Alcanzaste el límite de tu ronda beta'
  if (message === 'Tu ronda beta expiró.') return 'Tu acceso beta expiró'
  if (message.includes('páginas por documento de tu ronda beta')) return 'El documento supera el límite de tu Beta'
  if (message === 'No tienes un plan activo.') return 'Necesitas acceso para generar'
  return 'Alcanzaste el límite de tu plan'
}

// ── Historial helpers ──────────────────────────────────────────────────────
type PendingHistoryData = {
  fileName:     string
  originalText: string
  resultText:   string
  mode:         number
  length:       number
  historyId:    string
}

// Forma real de una fila de document_history, tal como la devuelve Supabase
export type HistoryRow = {
  id:              string
  user_id:         string
  file_name:       string
  result_text:     string
  mode:            string
  result_length:   string
  output_format:   string | null
  output_format_known: boolean
  output_filename: string | null
  created_at:      string
}

const MODE_LABELS: Record<number, string> = {
  0: 'explicar', 1: 'resumir', 2: 'preguntas', 3: 'guia-estudio', 4: 'analizar',
}
const LENGTH_LABELS: Record<number, string> = {
  0.25: 'corto', 0.5: 'medio', 0.75: 'largo', 1: 'completo',
}
const getModeLabel   = (idx: number) => MODE_LABELS[idx] ?? 'desconocido'
const getLengthLabel = (val: number) => LENGTH_LABELS[val] ?? 'medio'

// Guarda en historial y devuelve la fila real insertada (con id/created_at generados por Supabase).
// Devuelve null si no hay sesión o si falla — nunca lanza, nunca rompe el flujo principal.
async function saveToHistory(params: PendingHistoryData & {
  outputFormat?:   string | null
  outputFilename?: string | null
}): Promise<HistoryRow | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const res = await fetch('/api/document-history/finalize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        historyId:       params.historyId,
        resultText:      params.resultText,
        outputFormat:    params.outputFormat   ?? null,
        outputFilename:  params.outputFilename ?? null,
      }),
    })

    const data = await res.json()

    if (!res.ok || !data.success) {
      console.error('[document-history finalize error]', data)
      return null
    }

    return {
      id:              data.historyId,
      user_id:         session.user.id,
      file_name:       params.fileName,
      result_text:     params.resultText,
      mode:            getModeLabel(params.mode),
      result_length:   getLengthLabel(params.length),
      output_format:   params.outputFormat   ?? null,
      output_format_known: true,
      output_filename: params.outputFilename ?? null,
      created_at:      data.createdAt,
    }
  } catch (err) {
    console.error('[saveToHistory error]', err)
    return null
  }
}
 
// ── Componente ─────────────────────────────────────────────────────────────
export default function FileWizard({
  onSaved,
  allowAudio = true,
  showToolsWithUpload = false,
  hideCostUI = false,
  accessChecking = false,
  generationLocked = false,
  lockedMessage,
  onOpenAccessOptions,
  onRetryAccessCheck,
  usingBetaAccess = false,
}: {
  onSaved?: (row: HistoryRow) => void
  allowAudio?: boolean
  showToolsWithUpload?: boolean
  // Dashboard (suscriptores): oculta el lenguaje de "pago por uso" heredado del
  // flujo pay-per-use de la landing — el consumo real ya se rige por el plan,
  // no por este costo calculado en cliente (que nunca se envía a la API de
  // generación). No cambia handlers, validaciones ni la llamada real.
  hideCostUI?: boolean
  // Acceso (Fase 3, dashboard) — puramente cosmético: el enforcement real
  // sigue siendo el 403 de /api/ia-explain. FileWizard no sabe nada de
  // suscripciones ni beta, solo refleja el estado que le pasa el llamador.
  accessChecking?: boolean
  generationLocked?: boolean
  lockedMessage?: string
  onOpenAccessOptions?: () => void
  onRetryAccessCheck?: () => void
  usingBetaAccess?: boolean
} = {}) {
  const [step,      setStep]      = useState<Step>(1)
  const step3Ref = useRef<HTMLDivElement>(null)

  // Scroll suave hacia la configuración en cuanto aparece (al elegir un servicio)
  useEffect(() => {
    if (step === 3) {
      step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [step])
  const [file,      setFile]      = useState<File | null>(null)
  const [fileSize,  setFileSize]  = useState(0)
  const [charCount, setCharCount] = useState<number | null>(null)
  const [action,    setAction]    = useState<Action>('audio')
  const [iaMode,    setIaMode]    = useState(0)
  const [extension, setExtension] = useState(0.5)
  const [voice,     setVoice]     = useState(VOICES[0].id)
  const [speed,     setSpeed]     = useState(1)
  const [loading, setLoading] = useState(false)
  const [formatModal, setFormatModal]         = useState(false)
  const [generatingDownload, setGeneratingDownload] = useState(false)
  const [pendingResult, setPendingResult]     = useState('')
  const [pendingFileName, setPendingFileName] = useState('')
  const [pendingHistoryData, setPendingHistoryData] = useState<PendingHistoryData | null>(null)
  const [scannedModal, setScannedModal]       = useState(false)
  const [errorModal, setErrorModal] = useState<{ type: 'limit' | 'other'; message: string; title?: string } | null>(null)
  const [pageMetrics, setPageMetrics] = useState<{ total: number; text: number; scanned: number } | null>(null)
  
 // Ajustar configuración según la herramienta seleccionada
useEffect(() => {
  if (iaMode !== 1) {
    setExtension(0.5)
  }
}, [iaMode])


  // ── Cálculos ──────────────────────────────────────────────────────────
  const baseChars     = charCount || 0
  const iaOutputChars = Math.floor(baseChars * (extension === 1.0 ? 1.0 : extension))
 
const audioCost = baseChars > 0
  ? calculateTierPrice(baseChars, AUDIO_TIERS)
  : 0

const iaInputCost = baseChars > 0
  ? calculateTierPrice(baseChars, IA_TIERS)
  : 0

const iaOutputCost = iaOutputChars > 0
  ? calculateTierPrice(iaOutputChars, IA_TIERS)
  : 0

  let totalCost = 0
  if      (action === 'audio') totalCost = audioCost
  else if (action === 'ia')    totalCost = iaInputCost + iaOutputCost
  else                         totalCost = audioCost + iaInputCost + iaOutputCost
 
  const audioDuration  = formatDuration(baseChars,     speed)
 
  // ── Colores por acción ────────────────────────────────────────────────
  const actionColor = action === 'audio' ? '#7C3AED' : action === 'ia' ? '#059669' : '#F97316'
  const actionLabel = action === 'audio' ? 'Audio completo' : action === 'ia' ? 'Explicación' : 'Combo'
 
  // ── Handlers ──────────────────────────────────────────────────────────
  const handleClearFile = () => {
    setFile(null)
    setFileSize(0)
    setCharCount(null)
    setPageMetrics(null)
    setStep(1)
  }

  const handleUpload = async (selectedFile: File) => {
    setFile(selectedFile)
    const form = new FormData()
    form.append('file', selectedFile)
    const res  = await fetch('/api/extract-text', { method: 'POST', body: form })
    const data = await res.json()
    if (data.error) { alert(data.error); return }
    setCharCount(data.chars)
    setFileSize(data.size || selectedFile.size)
    if (data.totalPages) {
      setPageMetrics({ total: data.totalPages, text: data.textPages, scanned: data.scannedPages })
    }
    if (allowAudio) {
      setStep(2)
    } else {
      setAction('ia')
      setStep(3)
    }
    if (data.isScanned) setScannedModal(true)
  }
 
  const handlePayAndGenerate = async () => {
    if (!file || !charCount) {
      alert('Primero sube un archivo')
      return
    }

    setLoading(true)

    try {
      const form = new FormData()
      form.append('file', file)
      
      const extractRes = await fetch('/api/extract-text', { method: 'POST', body: form })
      const extractData = await extractRes.json()
      console.log(extractData)
      
      if (extractData.error) {
        alert(extractData.error)
        setLoading(false)
        return
      }

      const originalText = extractData.text
      console.log('extractData:', extractData)

      if (action === 'audio') {
        alert(`🎧 Audio generado con ${charCount} caracteres`)
        setLoading(false)
        return
      }

      let finalExtension = extension
      if (iaMode === 2) finalExtension = 1.0
      if (iaMode === 3) finalExtension = 1.0

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        alert('Debes iniciar sesión para usar esta herramienta.')
        setLoading(false)
        return
      }

      const iaRes = await fetch('/api/ia-explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          text: originalText,
          fileName: file.name,
          mode: iaMode,
          extension: finalExtension,
          // Dato de la extracción previa (server-side, calculado de los bytes
          // reales del archivo en /api/extract-text) — no es un dato de
          // seguridad infalsificable. Si falta o es inválido, el backend cae
          // a su propio cálculo autoderivado del texto.
          declaredPageCount: pageMetrics?.total,
        }),
      })

      const iaData = await iaRes.json()
      const formattedResult = (iaData.result || '').replace(
      /\[P(\d+)-L(\d+)\]/g,
      '📄 Página $1 · Línea $2'
      )

      if (iaData.error) {
        const isLimit = iaRes.status === 403
        setErrorModal({
          type: isLimit ? 'limit' : 'other',
          message: iaData.error,
          title: isLimit ? pickLimitErrorTitle(iaData.error) : undefined,
        })
        setLoading(false)
        return
      }

      if (!iaRes.ok || typeof iaData.historyId !== 'string' || !iaData.historyId) {
        alert('No se pudo registrar correctamente el documento.')
        setLoading(false)
        return
      }

      // Datos base de historial — se guardan en estado hasta que el usuario elija formato
      const historyBase: PendingHistoryData = {
        fileName:     file.name,
        originalText: originalText,
        resultText:   formattedResult,
        mode:         iaMode,
        length:       finalExtension,
        historyId:    iaData.historyId,
      }

      // ============================================
      // SOLO IA - Mostrar modal para elegir formato
      // ============================================
      if (action === 'ia') {
        const outputName = `explicacion_${file.name.replace(/\.[^/.]+$/, '')}`
        setPendingResult(formattedResult)
        setPendingFileName(outputName)
        setPendingHistoryData(historyBase)  // ← se actualiza en Supabase si el usuario elige formato

        // La fila ya existe en document_history desde ia-explain (recordUsage),
        // "Sin formato" — se avisa de inmediato sin esperar a que el usuario
        // decida el modal, para que quede visible en Historial aunque cierre
        // la pestaña o pulse "Guardar sin formato" a continuación.
        onSaved?.({
          id:              iaData.historyId,
          user_id:         session.user.id,
          file_name:       historyBase.fileName,
          result_text:     historyBase.resultText,
          mode:            getModeLabel(historyBase.mode),
          result_length:   getLengthLabel(historyBase.length),
          output_format:   null,
          output_format_known: true,
          output_filename: null,
          created_at:      new Date().toISOString(),
        })

        setFormatModal(true)
        setLoading(false)
        return
      }
      // ============================================
      // AMBOS - Guardar sin formato (texto no se descarga directamente)
      // ============================================
      else {
        alert(`✅ Explicación generada (${iaData.resultChars} caracteres)\n🎧 Audio generado con ${charCount} caracteres`)
        const savedRow = await saveToHistory({ ...historyBase, outputFormat: null, outputFilename: null })
        if (savedRow) onSaved?.(savedRow)
      }

    } catch (error) {
      console.error('Error:', error)
      alert('Error al procesar tu solicitud')
    } finally {
      setLoading(false)
    }
  }
 
  // ── Preview del documento: siempre refleja la herramienta seleccionada real ──
  const activeToolSpaceIdx = IA_MODES[iaMode].label.indexOf(' ')
  const activeToolLabel = activeToolSpaceIdx > -1 ? IA_MODES[iaMode].label.slice(activeToolSpaceIdx + 1) : IA_MODES[iaMode].label

  // ── Render ────────────────────────────────────────────────────────────
  const handleDownloadFormat = async (format: 'txt' | 'docx' | 'pdf') => {
    setFormatModal(false)
    setLoading(true)
    setGeneratingDownload(true)

// Permitir que React pinte el overlay
    await new Promise(resolve => requestAnimationFrame(resolve))
    try {
      const docRes = await fetch('/api/generate-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pendingResult, format, fileName: pendingFileName }),
      })
      if (!docRes.ok) throw new Error('Error al generar el documento')
      const blob = await docRes.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${pendingFileName}.${format}`
      a.click()
      URL.revokeObjectURL(url)

      // ✅ Guardar en historial ahora que sabemos formato y nombre real
      if (pendingHistoryData) {
        const savedRow = await saveToHistory({
          ...pendingHistoryData,
          outputFormat:   format,
          outputFilename: `${pendingFileName}.${format}`,
        })
        if (savedRow) onSaved?.(savedRow)
        setPendingHistoryData(null)
      }
    } catch {
      alert('Hubo un error al descargar. Intenta de nuevo.')
    } finally {
      setLoading(false)
      setGeneratingDownload(false)
    }
  }
  return (
    <section className={`${styles.wizard} ${showToolsWithUpload ? styles.wizardWide : ''}`}>
 
      {/* ── CABECERA ── */}
      {!showToolsWithUpload && (
        <div className={styles.wizardHeader}>
          <span className={styles.badge}>⭐ Función Plus</span>
          <h2 className={styles.title}>
            Archivo <small className={styles.titleSub}>(PDF, Word o TXT)</small>
          </h2>
          <p className={styles.subtitle}>Elige qué quieres hacer con tu documento.</p>
        </div>
      )}

      {/* ── PASO 1: ARCHIVO ── */}
      <div className={`${styles.stepSection} ${showToolsWithUpload ? styles.documentCard : ''}`}>
        {!showToolsWithUpload && (
          <div className={styles.stepHeader}>
            <div className={`${styles.stepCircle} ${step >= 1 ? styles.stepCircleActive : ''}`}>
              {step > 1 ? '✓' : '1'}
            </div>
            <h3 className={styles.stepTitle}>{step > 1 ? 'Tu archivo' : 'Sube tu documento'}</h3>
          </div>
        )}

        {showToolsWithUpload ? (
          <div className={styles.documentLayout}>
            <div className={styles.documentUpload}>
              {step === 1 && (
                <label
                  className={`${styles.uploadZone} ${styles.documentUploadZone}`}
                  htmlFor="fileInput"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleUpload(f) }}
                >
                  <input
                    type="file" id="fileInput" accept=".pdf,.docx,.txt" hidden
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
                  />
                  <div className={styles.uploadContent}>
                    <div className={styles.documentUploadIconWrap}>
                      <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
                        <path d="M24 30V14M24 14L18 20M24 14L30 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M10 34c0 3.3 2.7 6 6 6h16c3.3 0 6-2.7 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <strong className={styles.documentUploadTitle}>Arrastra tu documento aquí</strong>
                    <span className={styles.documentUploadBtn}>Elegir archivo</span>
                    <small className={styles.documentUploadCaption}>PDF, DOCX, TXT · Máx. 50 MB</small>
                  </div>
                </label>
              )}

              {step > 1 && file && (
                <div className={styles.fileRow}>
                  <div className={styles.fileCard} style={{ position: 'relative' }}>
                    <span className={styles.fileIcon}>
                      {(() => {
                        const icon = fileTypeIcon(file.name)
                        return icon.kind === 'image'
                          ? <img src={icon.src} alt="" className={styles.fileIconImg} />
                          : icon.glyph
                      })()}
                    </span>
                    <div>
                      <p className={styles.fileName} title={file.name}>
                        {file.name.length > 30 ? file.name.substring(0, 27) + '...' : file.name}
                      </p>
                      <p className={styles.fileMeta}>
                        {fmtBytes(fileSize)} &nbsp;•&nbsp; {charCount?.toLocaleString('es-MX')} caracteres aprox.
                      </p>
                      <p className={styles.fileOk}>✅ Archivo cargado correctamente</p>
                      {pageMetrics && (
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                          <span style={{
                            display:'inline-flex', alignItems:'center', gap:4,
                            background:'#0BB89A18', border:'1px solid #0BB89A44',
                            borderRadius:20, padding:'2px 10px', fontSize:11, color:'#0BB89A', fontWeight:600
                          }}>📄 {pageMetrics.total} {pageMetrics.total === 1 ? 'página' : 'páginas'}</span>

                          {pageMetrics.text > 0 && (
                            <span style={{
                              display:'inline-flex', alignItems:'center', gap:4,
                              background:'#16a34a18', border:'1px solid #16a34a44',
                              borderRadius:20, padding:'2px 10px', fontSize:11, color:'#16a34a', fontWeight:600
                            }}>✓ {pageMetrics.text} con texto</span>
                          )}

                          {pageMetrics.scanned > 0 && (
                            <span style={{
                              display:'inline-flex', alignItems:'center', gap:4,
                              background:'#F5920A18', border:'1px solid #F5920A44',
                              borderRadius:20, padding:'2px 10px', fontSize:11, color:'#F5920A', fontWeight:600
                            }}>⚠ {pageMetrics.scanned} escaneada{pageMetrics.scanned > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleClearFile}
                      title="Quitar archivo"
                      style={{
                        position: 'absolute', top: 10, right: 10,
                        background: '#fee2e2', border: 'none', borderRadius: '50%',
                        width: 28, height: 28, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, color: '#dc2626', fontWeight: 700, lineHeight: 1,
                      }}
                    >✕</button>
                  </div>

                  {hideCostUI ? (
                    <div className={styles.costCard}>
                      <div className={styles.costCardIcon}>📊</div>
                      <div>
                        <p className={styles.costCardLabel}>Este documento consumirá</p>
                        <p className={styles.costCardPrice} style={{ color: actionColor }}>1 uso</p>
                        <p className={styles.costCardNote}>
                          {pageMetrics
                            ? `Aprox. ${pageMetrics.total} ${pageMetrics.total === 1 ? 'página' : 'páginas'}`
                            : 'Analizando páginas del documento…'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.costCard}>
                      <div className={styles.costCardIcon}>🔒</div>
                      <div>
                        <p className={styles.costCardLabel}>Necesitas un plan activo</p>
                        <p className={styles.costCardNote}>Elige un plan para generar este documento.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className={styles.documentTools}>
              <p className={styles.documentToolsTitle}>¿Qué quieres hacer con tu documento?</p>
              <div className={styles.toolList}>
                {IA_MODES.map((m, i) => {
                  const enabled = step > 1
                  const spaceIdx = m.label.indexOf(' ')
                  const toolIcon = spaceIdx > -1 ? m.label.slice(0, spaceIdx) : m.label
                  const toolLabel = spaceIdx > -1 ? m.label.slice(spaceIdx + 1) : m.label
                  const toolIconColor = TOOL_ICON_COLORS[i]
                  return (
                    <label
                      key={i}
                      className={`${styles.toolCard} ${enabled && iaMode === i ? styles.toolCardActive : ''} ${!enabled ? styles.toolCardPreview : ''}`}
                    >
                      <input
                        type="radio"
                        name="iaModeUpfront"
                        className={styles.toolCardRadio}
                        checked={enabled && iaMode === i}
                        disabled={!enabled}
                        onChange={() => { if (enabled) setIaMode(i) }}
                      />
                      <span className={`${styles.toolCardIcon} ${styles[toolIconColor]}`}>{toolIcon}</span>
                      <div className={styles.toolCardBody}>
                        <strong>{toolLabel}</strong>
                        <p>{m.desc}</p>
                      </div>
                      <span className={styles.toolCardArrow} aria-hidden="true">›</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <>
            {step === 1 && (
              <label
                className={styles.uploadZone}
                htmlFor="fileInput"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleUpload(f) }}
              >
                <input
                  type="file" id="fileInput" accept=".pdf,.docx,.txt" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
                />
                <div className={styles.uploadContent}>
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <path d="M24 30V14M24 14L18 20M24 14L30 20" stroke="#00c9a7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 34c0 3.3 2.7 6 6 6h16c3.3 0 6-2.7 6-6" stroke="#00c9a7" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                  <strong>Arrastra tu archivo aquí</strong>
                  <span className={styles.uploadLink}>o haz clic para seleccionar</span>
                  <small>Formatos soportados: PDF, DOCX, TXT</small>
                  <small>Tamaño máximo: 50 MB</small>
                </div>
              </label>
            )}

            {step > 1 && file && (
              <div className={styles.fileRow}>
                <div className={styles.fileCard} style={{ position: 'relative' }}>
                  <span className={styles.fileIcon}>
                    {(() => {
                      const icon = fileTypeIcon(file.name)
                      return icon.kind === 'image'
                        ? <img src={icon.src} alt="" className={styles.fileIconImg} />
                        : icon.glyph
                    })()}
                  </span>
                  <div>
                    <p className={styles.fileName} title={file.name}>
                      {file.name.length > 30 ? file.name.substring(0, 27) + '...' : file.name}
                    </p>
                    <p className={styles.fileMeta}>
                      {fmtBytes(fileSize)} &nbsp;•&nbsp; {charCount?.toLocaleString('es-MX')} caracteres aprox.
                    </p>
                    <p className={styles.fileOk}>✅ Archivo cargado correctamente</p>
                    {pageMetrics && (
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                        <span style={{
                          display:'inline-flex', alignItems:'center', gap:4,
                          background:'#0BB89A18', border:'1px solid #0BB89A44',
                          borderRadius:20, padding:'2px 10px', fontSize:11, color:'#0BB89A', fontWeight:600
                        }}>📄 {pageMetrics.total} {pageMetrics.total === 1 ? 'página' : 'páginas'}</span>

                        {pageMetrics.text > 0 && (
                          <span style={{
                            display:'inline-flex', alignItems:'center', gap:4,
                            background:'#16a34a18', border:'1px solid #16a34a44',
                            borderRadius:20, padding:'2px 10px', fontSize:11, color:'#16a34a', fontWeight:600
                          }}>✓ {pageMetrics.text} con texto</span>
                        )}

                        {pageMetrics.scanned > 0 && (
                          <span style={{
                            display:'inline-flex', alignItems:'center', gap:4,
                            background:'#F5920A18', border:'1px solid #F5920A44',
                            borderRadius:20, padding:'2px 10px', fontSize:11, color:'#F5920A', fontWeight:600
                          }}>⚠ {pageMetrics.scanned} escaneada{pageMetrics.scanned > 1 ? 's' : ''}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleClearFile}
                    title="Quitar archivo"
                    style={{
                      position: 'absolute', top: 10, right: 10,
                      background: '#fee2e2', border: 'none', borderRadius: '50%',
                      width: 28, height: 28, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, color: '#dc2626', fontWeight: 700, lineHeight: 1,
                    }}
                  >✕</button>
                </div>

                <div className={styles.costCard}>
                  <div className={styles.costCardIcon}>🔒</div>
                  <div>
                    <p className={styles.costCardLabel}>Necesitas un plan activo</p>
                    <p className={styles.costCardNote}>Elige un plan para generar este documento.</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {step > 1 && (
          <p className={styles.secureNote}>🔒 Tus documentos se procesan de forma segura. Si inicias sesión, podrás volver a descargarlos desde tu historial cuando quieras.</p>
        )}
      </div>

      {/* ── PREVIEW DEL DOCUMENTO: siempre visible, refleja la herramienta y archivo reales ── */}
      {showToolsWithUpload && (
        <>
          <p className={styles.documentPreviewEyebrow}>Así verás tu documento</p>

          <div className={styles.documentPreviewBlock}>
            <div className={styles.previewMockHeader}>
              <div className={styles.previewMockFileGroup}>
                <span className={styles.previewMockFile}>Así se verá tu documento</span>
                <span className={styles.previewMockFileSub}>Ejemplo de resultado</span>
              </div>
              <span className={styles.previewMockBadge}>
                {file ? (file.name.split('.').pop()?.toUpperCase() ?? 'PDF') : 'PDF'}
              </span>
              {pageMetrics && (
                <span className={styles.previewMockPages}>
                  {pageMetrics.total} {pageMetrics.total === 1 ? 'página' : 'páginas'}
                </span>
              )}
            </div>

            <div className={styles.previewMockBody}>
              <div className={styles.previewMockSidebar}>
                {PREVIEW_TOOL_NAMES.map((name, i) => (
                  <div
                    key={name}
                    className={`${styles.previewMockToolItem} ${i === iaMode ? styles.previewMockToolItemActive : ''}`}
                  >
                    {name}
                  </div>
                ))}
              </div>

              <div className={styles.previewMockContent}>
                <p className={styles.previewMockTitle}>{activeToolLabel}</p>
                {(() => {
                  const content = DOCUMENT_PREVIEW_CONTENT[iaMode] ?? DOCUMENT_PREVIEW_CONTENT[0]
                  switch (content.kind) {
                    case 'paragraphs':
                      return content.items.map((p, i) => (
                        <p key={i} className={styles.previewMockText}>{p}</p>
                      ))
                    case 'bullets':
                      return (
                        <ul className={styles.previewMockBullets}>
                          {content.items.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                      )
                    case 'qa':
                      return (
                        <div className={styles.previewMockQaList}>
                          {content.items.map((item, i) => (
                            <div key={i} className={styles.previewMockQaItem}>
                              <strong>{item.q}</strong>
                              <p>{item.a}</p>
                            </div>
                          ))}
                        </div>
                      )
                    case 'sections':
                      return (
                        <div className={styles.previewMockSections}>
                          {content.items.map((sec, i) => (
                            <div key={i} className={styles.previewMockSection}>
                              <strong>{sec.title}</strong>
                              <ul>
                                {sec.points.map((pt, j) => <li key={j}>{pt}</li>)}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )
                    case 'findings':
                      return (
                        <ul className={styles.previewMockFindings}>
                          {content.items.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                      )
                  }
                })()}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── PASO 2: ELEGIR SERVICIO ── */}
      {allowAudio && step >= 2 && (
        <div className={styles.stepSection}>
          <div className={styles.stepHeader}>
            <div className={`${styles.stepCircle} ${step >= 2 ? styles.stepCircleActive : ''}`}>
              {step > 2 ? '✓' : '2'}
            </div>
            <h3 className={styles.stepTitle}>¿Qué quieres hacer?</h3>
          </div>
          <p className={styles.stepSub}>Elige el servicio que necesitas.</p>
 
          <div className={styles.optionsGrid}>
            <div
              className={`${styles.optionCard} ${action === 'audio' ? styles.optionAudio : ''}`}
              onClick={() => { setAction('audio'); setStep(3) }}
            >
              {action === 'audio' && <span className={styles.checkBadge}>✓</span>}
              <div className={`${styles.optionIcon} ${styles.iconAudio}`}>🎧</div>
              <strong>Escucha tu documento</strong>
              <p>Convertimos todo el documento en audio completo.</p>
              <span className={`${styles.optionPill} ${styles.pillAudio}`}>Audio completo</span>
            </div>
 
            <div
              className={`${styles.optionCard} ${action === 'ia' ? styles.optionIa : ''}`}
              onClick={() => { setAction('ia'); setStep(3) }}
            >
              {action === 'ia' && <span className={styles.checkBadge}>✓</span>}
              <div className={`${styles.optionIcon} ${styles.iconIa}`}>🧠</div>
              <strong>Te lo explicamos fácil</strong>
              <p>Nuestra IA explica, resume y simplifica el contenido.</p>
              <span className={`${styles.optionPill} ${styles.pillIa}`}>Texto explicado</span>
            </div>
 
            <div
              className={`${styles.optionCard} ${action === 'ambos' ? styles.optionAmbos : ''}`}
              onClick={() => { setAction('ambos'); setStep(3) }}
            >
              {action === 'ambos' && <span className={styles.checkBadge}>✓</span>}
              <div className={`${styles.optionIcon} ${styles.iconAmbos}`}>🧠 + 🎧</div>
              <strong>Quiero ambos</strong>
              <p>Primero lo explica la IA y luego lo conviertes en audio.</p>
              <span className={`${styles.optionPill} ${styles.pillAmbos}`}>Combo completo</span>
            </div>
          </div>
 
          <div className={styles.flexNote}>
            ☆ Tú decides. Puedes elegir <strong> solo audio, solo explicación</strong> o ambos. <strong>Sin obligación.</strong>
          </div>
        </div>
      )}
 
      {/* ── PASO 3: CONFIGURAR ── */}
      {step >= 3 && (
        <div className={`${styles.stepSection} ${showToolsWithUpload ? styles.documentCard : ''}`} ref={step3Ref}>
          {!showToolsWithUpload && (
            <div className={styles.stepHeader}>
              <div className={`${styles.stepCircle} ${styles.stepCircleActive}`}>{allowAudio ? '3' : '2'}</div>
              <h3 className={styles.stepTitle}>
                {action === 'ambos' ? 'Personaliza tu pedido (combo)' :
                 action === 'audio' ? 'Configura tu servicio' : 'Configura tu explicación'}
              </h3>
              <span
                className={styles.serviceBadge}
                style={{ background: `${actionColor}18`, color: actionColor, borderColor: `${actionColor}40` }}
              >
                Servicio seleccionado: {actionLabel}
              </span>
            </div>
          )}

          {/* ── AUDIO solo ── */}
          {action === 'audio' && (
            <div className={styles.configGrid}>
              <div className={styles.configBlock}>
                <p className={styles.configBlockTitle} style={{ color: '#7C3AED' }}>Opciones de audio</p>
 
                <label className={styles.fieldLabel}>Voz</label>
                <div className={styles.voiceSelectRow}>
                  <span className={styles.voiceIcon}>🔊</span>
                  <select className={styles.select} value={voice} onChange={e => setVoice(e.target.value)}>
                    {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
 
                <label className={styles.fieldLabel} style={{ marginTop: 16 }}>
                  Velocidad &nbsp;<span className={styles.speedBadge}>{speed.toFixed(1)}x</span>
                </label>
                <div className={styles.rangeRow}>
                  <span>0.5x</span>
                  <input type="range" min={0.5} max={2} step={0.1} value={speed}
                    onChange={e => setSpeed(+e.target.value)} className={styles.range} />
                  <span>2.0x</span>
                </div>
                <p className={styles.speedNote}>⚡ La velocidad se aplica al generar el audio.</p>
 
                <div className={`${styles.durationBox} ${styles.durationBoxPurple}`}>
                  <div>
                    <p className={styles.durationLabel}>Duración estimada del audio</p>
                    <p className={styles.durationVal}>{audioDuration}</p>
                  </div>
                </div>
              </div>
 
              <div className={styles.summaryBox}>
                <p className={styles.summaryTitle}>Resumen de tu pedido</p>
                <div className={styles.summaryRow}><span>Servicio</span><span>Audio completo</span></div>
                <div className={styles.summaryRow}><span>Caracteres</span><span>{baseChars.toLocaleString('es-MX')}</span></div>
                <div className={styles.summaryRow}><span>Precio por cada 1,000</span><span>$10 MXN</span></div>
                <div className={styles.summaryTotal}>
                  <span>Total estimado</span>
                  <span style={{ color: '#7C3AED' }}>{formatPrice(audioCost)}</span>
                </div>
                <div className={styles.secureBox}>
                  🛡️ <div>
                    <p className={styles.secureTitle}>Transacciones 100% seguras</p>
                    <p className={styles.secureDesc}>Tus datos y pagos están protegidos.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
 
          {/* ── IA solo, landing (showToolsWithUpload): solo el control real (extensión del resumen).
               El resto ("Nivel de explicación", "Costo del texto explicado", "Así se verá tu resultado")
               era decorativo/duplicado — ya se comunica en la tarjeta de herramienta y en el preview
               dinámico de arriba (documentPreviewBlock), y el costo ya está en el costCard del paso 1. ── */}
          {action === 'ia' && showToolsWithUpload && iaMode === 1 && (
            <div className={styles.documentExtensionRow}>
              <span className={styles.documentExtensionLabel}>Extensión del resumen</span>
              <div className={styles.documentExtensionPills}>
                {EXTENSIONES.map(e => (
                  <button
                    key={e.value}
                    type="button"
                    className={`${styles.documentExtensionPill} ${extension === e.value ? styles.documentExtensionPillActive : ''}`}
                    onClick={() => setExtension(e.value)}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {action === 'ia' && !showToolsWithUpload && (
            <>
            <div className={styles.configGrid}>
              <div className={styles.configBlock}>
                <p className={styles.configBlockTitle}>Modo de explicación</p>
                <div className={styles.radioGroup}>
                  {IA_MODES.map((m, i) => (
                    <label key={i} className={`${styles.radioItem} ${iaMode === i ? styles.radioActive : ''}`}>
                      <input type="radio" name="iaMode" checked={iaMode === i} onChange={() => setIaMode(i)} />
                      <div>
                        <strong>{m.label}</strong>
                        <p>{m.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.configBlock}>
              {iaMode === 1 ? (
  <>
    <p className={styles.configBlockTitle}>Extensión del resumen</p>

    <div className={styles.radioGroupV}>
      {EXTENSIONES.map(e => (
        <label
          key={e.value}
          className={`${styles.radioItem} ${
            extension === e.value ? styles.radioActive : ''
          }`}
        >
          <input
            type="radio"
            name="ext"
            checked={extension === e.value}
            onChange={() => setExtension(e.value)}
          />

          <div>
            <strong>{e.label}</strong>
            <p>{e.desc}</p>
          </div>
        </label>
      ))}
    </div>
  </>
) : (
  <>
  {iaMode === 0 && (
    <>
      <p className={styles.configBlockTitle}>Nivel de explicación</p>

      <div className={styles.correctionInfo}>
        <div className={`${styles.radioItem} ${styles.radioActive}`}>
          <div>
            <strong>🧠 Explicación automática</strong>
            <p>La IA detecta la dificultad del documento y explica desde los conceptos necesarios hasta el tema completo.</p>
          </div>
        </div>
      </div>
    </>
  )}

  {iaMode === 2 && (
    <>
      <p className={styles.configBlockTitle}>Tipo de preguntas</p>

      <div className={styles.correctionInfo}>
        <div className={`${styles.radioItem} ${styles.radioActive}`}>
          <div>
            <strong>❓ Preguntas automáticas</strong>
            <p>La IA decide automáticamente cantidad, dificultad y tipo de preguntas según el documento.</p>
          </div>
        </div>
      </div>
    </>
  )}

  {iaMode === 3 && (
    <>
      <p className={styles.configBlockTitle}>Guía de estudio</p>

      <div className={styles.correctionInfo}>
        <div className={`${styles.radioItem} ${styles.radioActive}`}>
          <div>
            <strong>👨‍🏫 Guía automática</strong>
            <p>La IA decide estructura, conceptos clave, orden de aprendizaje, repasos y ejercicios.</p>
          </div>
        </div>
      </div>
    </>
  )}

  {iaMode === 4 && (
    <>
      <p className={styles.configBlockTitle}>Análisis inteligente</p>

      <div className={styles.correctionInfo}>
        <div className={`${styles.radioItem} ${styles.radioActive}`}>
          <div>
            <strong>🔍 Análisis automático</strong>
            <p>La IA detecta hallazgos, riesgos, inconsistencias, datos faltantes, puntos críticos y recomendaciones.</p>
          </div>
        </div>
      </div>
    </>
  )}
</>
)}
                <div className={styles.costBlock}>
                  <p className={styles.costBlockLabel}>Costo del texto explicado</p>
                  <p className={styles.costBlockVal} style={{ color: '#059669' }}>{formatPrice(iaInputCost + iaOutputCost)}</p>
                  <p className={styles.costBlockNote}>($5 MXN por cada 1,000 caracteres de texto de salida)</p>
                </div>
              </div>
            </div>

            <div className={styles.configBlock}>
              <div className={styles.includesBox}>
                {(() => {
                  const selectedPreview = IA_MODE_PREVIEWS[iaMode] ?? {
                    text: 'Selecciona una herramienta para ver una vista previa.',
                    example: 'La vista previa aparecerá aquí.',
                  }
                  return (
                    <>
                      <p className={styles.includesTitle}>Así se verá tu resultado</p>
                      <p className={styles.includesItem} style={{ fontSize: 16, lineHeight: 1.6, fontWeight: 600, color: '#1a1a2e', margin: '4px 0' }}>
                        {selectedPreview.text}
                      </p>
                      <p className={styles.includesItem} style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#4a4a6a', margin: '14px 0 4px' }}>
                        Ejemplo
                      </p>
                      <p className={styles.includesItem} style={{ fontSize: 13, lineHeight: 1.6, color: '#4a4a6a', margin: 0, whiteSpace: 'pre-line' }}>
                        {selectedPreview.example}
                      </p>
                    </>
                  )
                })()}
              </div>
            </div>
            </>
          )}

          {/* ── AMBOS ── */}
          {action === 'ambos' && (
            <>
              <div className={styles.configGrid}>
                <div className={styles.configBlock}>
                  <p className={styles.configBlockTitle} style={{ color: '#059669' }}>Parte 1: Explicación con IA</p>
 
                  <label className={styles.fieldLabel}>Modo de explicación</label>
                  <select className={styles.select} value={iaMode} onChange={e => setIaMode(+e.target.value)}>
                    {IA_MODES.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
                  </select>
                  <label className={styles.fieldLabel} style={{ marginTop: 14 }}>Extensión del resultado</label>
                  {iaMode === 1 ? (
                    <select className={styles.select} value={extension} onChange={e => setExtension(+e.target.value)}>
                      <option value={0.25}>Corto</option>
                      <option value={0.5}>Medio</option>
                      <option value={0.75}>Largo</option>
                    </select>
                  ) : (
                    <p className={styles.speedNote} style={{ marginTop: 4 }}>
                      La IA decide automáticamente el resultado.
                    </p>
                  )}
                  <div className={styles.charEstimate} style={{ marginTop: 14 }}>
                    <p className={styles.charEstLabel}>Aprox. cuántos caracteres quedarán:</p>
                    <p className={styles.charEstVal}>{iaOutputChars.toLocaleString('es-MX')} caracteres aprox.</p>
                    <p className={styles.charEstNote}>(Puede variar según el modo elegido)</p>
                  </div>
 
                  <div className={styles.costBlock}>
                    <p className={styles.costBlockLabel}>Costo de la explicación</p>
                    <p className={styles.costBlockVal} style={{ color: '#059669' }}>{formatPrice(iaInputCost + iaOutputCost)}</p>
                    <p className={styles.costBlockNote}>($5 MXN por cada 1,000 caracteres de texto de salida)</p>
                  </div>
                </div>
 
                <div className={styles.configBlock}>
                  <p className={styles.configBlockTitle} style={{ color: '#F97316' }}>Parte 2: Audio</p>
 
                  <label className={styles.fieldLabel}>Voz</label>
                  <div className={styles.voiceSelectRow}>
                    <span className={styles.voiceIcon}>🔊</span>
                    <select className={styles.select} value={voice} onChange={e => setVoice(e.target.value)}>
                      {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </div>
 
                  <label className={styles.fieldLabel} style={{ marginTop: 14 }}>
                    Velocidad &nbsp;<span className={styles.speedBadge}>{speed.toFixed(1)}x</span>
                  </label>
                  <div className={styles.rangeRow}>
                    <span>0.5x</span>
                    <input type="range" min={0.5} max={2} step={0.1} value={speed}
                      onChange={e => setSpeed(+e.target.value)} className={styles.range} />
                    <span>2.0x</span>
                  </div>
                  <p className={styles.speedNote}>⚡ La velocidad se aplica al generar el audio.</p>
 
                  <div className={`${styles.durationBox} ${styles.durationBoxOrange}`}>
                    <div>
                      <p className={styles.durationLabel}>Duración estimada del audio</p>
                      <p className={styles.durationVal}>{audioDuration}</p>
                    </div>
                  </div>

                  <div className={styles.costBlock}>
                    <p className={styles.costBlockLabel}>Costo del audio</p>
                    <p className={styles.costBlockVal} style={{ color: '#F97316' }}>{formatPrice(audioCost)}</p>
                    <p className={styles.costBlockNote}>($10 MXN por cada 1,000 caracteres)</p>
                  </div>
                </div>
              </div>
 
              <div className={styles.comboSummary}>
                <div className={styles.comboSummaryItem}>
                  <span>Explicación (texto)</span>
                  <strong>{formatPrice(iaInputCost + iaOutputCost)}</strong>
                </div>
                <span className={styles.comboPlus}>+</span>
                <div className={styles.comboSummaryItem}>
                  <span>Audio</span>
                  <strong>{formatPrice(audioCost)}</strong>
                </div>
                <span className={styles.comboEq}>=</span>
                <div className={styles.comboTotal}>
                  <span>Total estimado: </span>
                  <strong style={{ color: '#fff' }}>{formatPrice(totalCost)}</strong>
                </div>
              </div>
            </>
          )}
 
          <div className={`${styles.payNote} ${hideCostUI ? styles.payNoteInfo : ''}`}>
            {hideCostUI ? (
              usingBetaAccess ? (
                <>📄 Este documento se generará usando tu acceso Beta.</>
              ) : (
                <>📄 Este documento se generará usando tu plan actual.</>
              )
            ) : (
              <>Necesitas un plan activo para generar este documento.</>
            )}
          </div>

          {hideCostUI ? (
            <button
              className={`${styles.payBtn} ${showToolsWithUpload ? styles.payBtnLarge : ''} ${styles.payBtnBrand}`}
              onClick={handlePayAndGenerate}
              disabled={loading || generationLocked || accessChecking}
            >
              {loading ? (
                <>⏳ Procesando... </>
              ) : accessChecking ? (
                <>Verificando tu acceso…</>
              ) : (
                <>Generar {action === 'audio' ? 'audio' : action === 'ia' ? 'explicación' : 'explicación + audio'}</>
              )}
            </button>
          ) : (
            // Sin Mercado Pago todavía: este CTA de la landing pública nunca llama
            // a ia-explain — solo lleva a elegir un plan. El flujo real de pago por
            // documento sigue sin existir (ver dashboard: hideCostUI=true arriba).
            <button
              className={`${styles.payBtn} ${showToolsWithUpload ? styles.payBtnLarge : ''}`}
              style={{ background: actionColor }}
              onClick={() => { window.location.href = '/#planes' }}
            >
              Ver planes
            </button>
          )}

          {/* Acceso (Fase 3, dashboard) — puramente informativo, sin estilos de
              módulo nuevos (solo inline) porque no se toca FileWizard.module.css
              en esta fase. El enforcement real sigue siendo el backend. */}
          {!accessChecking && generationLocked && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#9090aa', margin: '10px 0 0', lineHeight: 1.5 }}>
              {lockedMessage ?? 'Necesitas un plan activo o acceso beta para generar.'}{' '}
              {onOpenAccessOptions && (
                <button
                  type="button"
                  onClick={onOpenAccessOptions}
                  style={{ background: 'none', border: 'none', padding: 0, color: '#00c9a7', fontSize: 12, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}
                >
                  Ver opciones
                </button>
              )}
              {onRetryAccessCheck && (
                <button
                  type="button"
                  onClick={onRetryAccessCheck}
                  style={{ background: 'none', border: 'none', padding: 0, color: '#00c9a7', fontSize: 12, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}
                >
                  Reintentar
                </button>
              )}
            </p>
          )}
 
          <div className={styles.trustRow}>
            {[
              { icon:'🛡️', title:'Seguro y privado',  desc:'Tus documentos están protegidos. Si inicias sesión, los conservas en tu historial.' },
              { icon:'⚡', title:'Rápido y potente',   desc:'IA avanzada + voces naturales de alta calidad.' },
              { icon:'🔓', title:'Tú tienes el control',desc: hideCostUI ? 'Eliges qué herramienta usar en cada documento.' : 'Eliges qué hacer y cuánto quieres pagar.' },
            ].map(t => (
              <div key={t.title} className={styles.trustItem}>
                <span className={styles.trustIcon}>{t.icon}</span>
                <div>
                  <strong>{t.title}</strong>
                  <p>{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
 
          <div className={`${styles.disclaimer} ${hideCostUI ? styles.disclaimerMuted : ''}`}>
            ⚠️ <strong>Aviso importante:</strong> Las explicaciones generadas por nuestra IA son orientativas.{' '}
            <strong>No constituyen asesoramiento legal, médico ni profesional.</strong>
          </div>
        </div>
      )}
      {/* ── MODAL FORMATO ── */}
      {formatModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000
        }}>
          <div style={{
            background:'#0D2B26', borderRadius:16, padding:32,
            width:'min(460px, 90vw)', boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
            border:'1px solid #1a4a40'
          }}>
            <div style={{ marginBottom:24 }}>
              <p style={{ color:'#0BB89A', fontSize:12, fontWeight:700, letterSpacing:2, margin:0, marginBottom:6 }}>
                DOCUMENTO LISTO ✓
              </p>
              <h3 style={{ color:'#fff', margin:0, fontSize:20, fontWeight:700 }}>
                ¿En qué formato lo descargas?
              </h3>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {([
                { format:'txt',  icon:'/dashboard/icons/file-txt.png',  label:'Texto plano (.txt)',  desc:'Ligero, abre en cualquier dispositivo', color:'#64748b' },
                { format:'docx', icon:'/dashboard/icons/file-docx.png', label:'Word (.docx)',         desc:'Para editar y personalizar fácilmente', color:'#2563eb' },
                { format:'pdf',  icon:'/dashboard/icons/file-pdf.png',  label:'PDF',                  desc:'Para compartir, imprimir o archivar',  color:'#dc2626' },
              ] as const).map(({ format, icon, label, desc, color }) => (
                <button
                  key={format}
                  onClick={() => handleDownloadFormat(format)}
                  style={{
                    display:'flex', alignItems:'center', gap:16,
                    background:'#152E29', border:'1px solid #1e4a40',
                    borderRadius:10, padding:'14px 18px', cursor:'pointer', textAlign:'left', width:'100%'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background='#0BB89A20'; e.currentTarget.style.borderColor='#0BB89A' }}
                  onMouseLeave={e => { e.currentTarget.style.background='#152E29'; e.currentTarget.style.borderColor='#1e4a40' }}
                >
                  <img
                    src={icon}
                    alt=""
                    style={{ width:30, height:30, objectFit:'contain', flexShrink:0, transform:'scale(1.2)', transformOrigin:'center' }}
                  />
                  <div style={{ flex:1 }}>
                    <p style={{ color:'#fff', fontWeight:600, margin:0, fontSize:14 }}>{label}</p>
                    <p style={{ color:'#89bdb5', margin:0, fontSize:12, marginTop:2 }}>{desc}</p>
                  </div>
                  <span style={{
                    background: color + '22', color, border:`1px solid ${color}44`,
                    borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700, flexShrink:0
                  }}>{format.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ERROR IA-EXPLAIN ── */}
      {errorModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000
        }}>
          <div style={{
            background:'#0D2B26', borderRadius:16,
            padding: errorModal.type === 'limit' ? '40px 32px' : 32,
            width:'min(460px, 90vw)', boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
            border: errorModal.type === 'limit' ? '1px solid #3a2000' : '1px solid #4a1a1a',
            display: errorModal.type === 'limit' ? 'flex' : undefined,
            flexDirection: errorModal.type === 'limit' ? 'column' : undefined,
            alignItems: errorModal.type === 'limit' ? 'center' : undefined,
            textAlign: errorModal.type === 'limit' ? 'center' : undefined,
          }}>
            <div style={{
              width: errorModal.type === 'limit' ? 64 : 56,
              height: errorModal.type === 'limit' ? 64 : 56,
              borderRadius:'50%',
              background: errorModal.type === 'limit' ? '#F5920A22' : '#dc262622',
              border: errorModal.type === 'limit' ? '1px solid #F5920A55' : '1px solid #dc262655',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize: errorModal.type === 'limit' ? 32 : 26,
              marginBottom: errorModal.type === 'limit' ? 20 : 16
            }}>{errorModal.type === 'limit' ? '🔒' : '⚠️'}</div>

            <h3 style={{
              color:'#fff',
              margin: errorModal.type === 'limit' ? '0 0 14px' : '0 0 12px',
              fontSize: errorModal.type === 'limit' ? 20 : 18,
              fontWeight:700
            }}>
              {errorModal.type === 'limit' ? (errorModal.title ?? 'Alcanzaste el límite de tu plan') : 'No pudimos procesar el documento'}
            </h3>

            <p style={{
              color: errorModal.type === 'limit' ? '#c9e8e2' : '#89bdb5',
              margin: errorModal.type === 'limit' ? '0 0 16px' : '0 0 12px',
              fontSize: errorModal.type === 'limit' ? 15 : 14,
              lineHeight:1.6
            }}>
              {errorModal.message}
            </p>

            {errorModal.type === 'limit' && (
              <p style={{ color:'#89bdb5', margin:'0 0 24px', fontSize:12, lineHeight:1.5 }}>
                El documento no fue procesado y no se descontó de tu consumo.
              </p>
            )}

            <button
              onClick={() => setErrorModal(null)}
              style={{
                width:'100%', padding:'11px',
                background:'#0BB89A', border:'none', borderRadius:8,
                color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* ── OVERLAY: Generando documento ── */}
      {generatingDownload && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100
        }}>
          <div style={{
            background:'#0D2B26', borderRadius:24, padding:'clamp(24px, 8vw, 52px) clamp(20px, 8vw, 64px)', width:'min(92vw, 620px)',
            boxShadow:'0 24px 64px rgba(0,0,0,0.6)', border:'1px solid #1a4a40', minHeight:'320px',
            display:'flex', flexDirection:'column', alignItems:'center', gap:22, justifyContent:'center',
            textAlign:'center'
          }}>
            <div className={styles.downloadSpinner} />
            <p style={{ color:'#fff', fontWeight:700, fontSize:'clamp(20px, 6vw, 30px)', lineHeight:1.2, margin:0 }}>
              Generando documento…
            </p>
            <p style={{ color:'#b8d8d3', fontSize:18, margin:0, lineHeight:1.7,  maxWidth:'460px'}}>
              Estamos preparando tu documento en el formato seleccionado.
            <br />
              Esto normalmente tarda solo unos segundos.
              <br /><br />
              <strong>No cierres esta ventana.</strong>
               </p>
              </div>
        </div>
      )}

      {/* ── MODAL PDF ESCANEADO ── */}
      {scannedModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000
        }}>
          <div style={{
            background:'#0D2B26', borderRadius:16, padding:32,
            width:'min(440px, 90vw)', boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
            border:'1px solid #3a2000'
          }}>
            {/* Ícono */}
            <div style={{
              width:56, height:56, borderRadius:'50%',
              background:'#F5920A22', border:'1px solid #F5920A55',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:26, marginBottom:16
            }}>⚠️</div>

            {/* Título */}
            <p style={{ color:'#F5920A', fontSize:11, fontWeight:700, letterSpacing:2, margin:'0 0 6px' }}>
              DOCUMENTO ESCANEADO DETECTADO
            </p>
            <h3 style={{ color:'#fff', margin:'0 0 12px', fontSize:18, fontWeight:700 }}>
              Este PDF es una imagen
            </h3>
            <p style={{ color:'#89bdb5', margin:'0 0 20px', fontSize:14, lineHeight:1.6 }}>
              El documento no contiene texto seleccionable — parece ser
              una foto o escaneo. La extracción puede contener errores
              y afectar la calidad del análisis.
            </p>

            {/* Info box */}
            <div style={{
              background:'#F5920A11', border:'1px solid #F5920A33',
              borderRadius:10, padding:'12px 16px', marginBottom:20
            }}>
              <p style={{ color:'#F5920A', margin:0, fontSize:13, fontWeight:600 }}>
                💡 ¿Qué puedes hacer?
              </p>
              <p style={{ color:'#c4956a', margin:'6px 0 0', fontSize:12, lineHeight:1.5 }}>
                Si tienes el documento original en PDF de texto o Word, úsalo en su lugar
                para obtener mejores resultados.
              </p>
            </div>

            {/* Botones */}
            <div style={{ display:'flex', gap:10 }}>
              <button
                onClick={() => { setScannedModal(false); handleClearFile() }}
                style={{
                  flex:1, padding:'11px', background:'transparent',
                  border:'1px solid #2a5a50', borderRadius:8,
                  color:'#89bdb5', cursor:'pointer', fontSize:13
                }}
              >
                Cambiar archivo
              </button>
              <button
                onClick={() => setScannedModal(false)}
                style={{
                  flex:1, padding:'11px',
                  background:'#F5920A', border:'none', borderRadius:8,
                  color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700
                }}
              >
                Continuar de todas formas
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  )
}