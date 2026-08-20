'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './page.module.css'
import FileWizard from './components/FileWizard'
import Nav from './components/Nav'
import { supabase } from '@/lib/supabase'

type Plan = {
  id:                 string
  name:               string
  display_name:       string
  price_mxn:          number
  max_docs_month:     number | null
  max_pages_per_doc:  number | null
  max_seats:          number | null
  history_days:       number | null
  is_public:          boolean
  sort_order:         number
}

const DAILY_LIMIT = 3
const VOICES = [
  { id: 'es-US-Neural2-A', label: 'Goo — USA Latino A (Mujer) ⭐' },
  { id: 'es-US-Neural2-B', label: 'Goo — USA Latino B (Hombre) ⭐' },
  { id: 'es-ES-Neural2-A', label: 'Goo — España A (Mujer)' },
  { id: 'es-ES-Neural2-F', label: 'Goo — España F (Hombre)' },
  { id: 'es-US-News-F',    label: 'Goo — USA Noticias F (Mujer)' },
  { id: 'es-US-News-D',    label: 'Goo — USA Noticias D (Hombre)' },
  { id: 'es-ES-Standard-A',label: 'Goo — España A' },
  { id: 'es-ES-Standard-B',label: 'Goo — España B' },

  
]

const FREE_CHAR_LIMIT = 2000
function calcPrice(chars: number): number {

  const charsInThousands = chars / 1000

  // 🔹 Pequeños textos
  if (chars <= 10000) {
    return Math.ceil(charsInThousands) * 10
  }

  // 🔹 Medianos
  if (chars <= 50000) {
    return Math.ceil(charsInThousands) * 8
  }

  // 🔹 Grandes
  if (chars <= 100000) {
    return Math.ceil(charsInThousands) * 6
  }

  // 🔹 Muy grandes
  if (chars <= 250000) {
    return Math.ceil(charsInThousands) * 4
  }

  // 🔹 Libros enormes
  if (chars <= 500000) {
    return Math.ceil(charsInThousands) * 3
  }

  // 🔥 Audiolibros gigantes
  return Math.ceil(charsInThousands) * 2
}

function getSkipAmount(duration: number): number {
  if (duration < 30) return 1
  if (duration < 120) return 5
  return 10
}

const FAQ = [
  { q: '¿Es gratis?', a: 'Sí. Puedes generar y escuchar audios de hasta 2,000 caracteres sin pagar nada ni registrarte.' },
  { q: '¿Qué es la marca de agua?', a: 'Un audio corto al inicio que dice "Generado con VozEstudio.com". Desaparece si pagas por el audio.' },
  { q: '¿Puedo generar textos más largos?', a: 'Sí. Si tu texto supera los 2,000 caracteres, puedes generar el audio completo pagando $10 MXN por cada 1,000 caracteres. El pago incluye descarga MP3 sin marca de agua.' },
  { q: '¿Qué formatos puedo descargar?', a: 'Actualmente puedes descargar tus audios en formato MP3.' },
]

const FAQ_DOCUMENTO = [
  { q: '¿Necesito una cuenta para procesar documentos?', a: 'Sí. Debes iniciar sesión para usar el asistente de documentos.' },
  { q: '¿Qué formatos puedo subir?', a: 'PDF, DOCX o TXT, hasta 50 MB por archivo.' },
  { q: '¿Qué puedo hacer con mi documento?', a: 'Explicarlo, resumirlo, generar preguntas, crear una guía de estudio o analizarlo.' },
  { q: '¿En qué formatos puedo descargar el resultado?', a: 'TXT, DOCX o PDF.' },
  { q: '¿Qué hace la Validación TEXVOZLAB?', a: 'Puede ayudarte a detectar inconsistencias, datos faltantes y contradicciones dentro del documento, señalando dónde aparecen. Como todo análisis con IA, el resultado debe revisarse antes de tomar decisiones importantes.' },
]

// ── Íconos compactos, mismo trazo que /visual-lab (recreados aquí para no depender de esa ruta en runtime) ──
function ShieldGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 3l7 3v5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function FileTextGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3v4h4M9 12h6M9 16h6M9 8h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
function CheckCircleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 12.5l2.3 2.3L16 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ClockGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function HeadphonesGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="3" y="13" width="4" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="17" y="13" width="4" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

const BENEFITS_TTS = [
  { Icon: ShieldGlyph, title: 'Seguro y confiable', sub: 'Tus datos están protegidos' },
  { Icon: HeadphonesGlyph, title: 'Voces de alta calidad', sub: 'Naturales y claras' },
  { Icon: CheckCircleGlyph, title: 'Descarga en MP3', sub: 'Llévalo a donde quieras' },
  { Icon: ClockGlyph, title: 'Disponible 24/7', sub: 'Úsalo cuando quieras' },
]

const BENEFITS_DOCUMENTO: { Icon: () => JSX.Element; title: string; sub: React.ReactNode }[] = [
  { Icon: ShieldGlyph, title: 'Seguro y confidencial', sub: 'Tus documentos están protegidos' },
  { Icon: FileTextGlyph, title: 'PDF, DOCX, TXT', sub: 'Hasta 50 MB por archivo' },
  { Icon: CheckCircleGlyph, title: 'Resultados confiables', sub: <>Validación con <span className={styles.benefitAccent}>TEXVOZLAB</span></> },
  { Icon: ClockGlyph, title: 'Procesamiento rápido', sub: 'Obtén respuestas al instante' },
]

// Ejemplos pregrabados de "Escucha ejemplos" — assets reales en public/landing/audio-examples/{slug}.jpg|.mp3
const TTS_EXAMPLE_CATEGORIES = ['Todos', 'Audiolibros', 'Capítulos de libros', 'Resúmenes', 'Clásicos', 'Ciencia y cultura']

const TTS_EXAMPLES = [
  { title: 'El principito', author: 'Antoine de Saint-Exupéry', duration: '5:21', slug: 'el-principito', category: 'Audiolibros' },
  { title: 'Hábitos atómicos', author: 'James Clear', duration: '7:42', slug: 'habitos-atomicos', category: 'Capítulos de libros' },
  { title: 'Piense y hágase rico', author: 'Napoleon Hill', duration: '6:18', slug: 'piense-y-hagase-rico', category: 'Capítulos de libros' },
  { title: 'Resumen: El poder del ahora', author: 'Eckhart Tolle', duration: '4:30', slug: 'el-poder-del-ahora', category: 'Resúmenes' },
  { title: 'La insoportable levedad del ser', author: 'Milan Kundera', duration: '8:15', slug: 'la-insoportable-levedad-del-ser', category: 'Clásicos' },
]

export default function Home() {
  const [dailyUses, setDailyUses] = useState(0)
  const [previewCooldown, setPreviewCooldown] = useState(0)
  const [text, setText] = useState('')
  const [voice, setVoice] = useState(VOICES[0].id)
  const [speed, setSpeed] = useState(1)
  const [loading, setLoading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [status, setStatus] = useState<{ type: string; msg: string }>({ type: '', msg: '' })
  const [generated, setGenerated] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [plansError, setPlansError] = useState(false)

  // Vista activa de la landing: 'documento' (FileWizard) o 'tts' (Escribe y escucha).
  // Fase A: solo el control visual — todavía no condiciona qué se renderiza.
  const [activeTab, setActiveTab] = useState<'documento' | 'tts'>('documento')

  // Recorrido del sticky de los banners: .pageLayout no cambia de ancho (geometría
  // horizontal intacta), pero gana una fila "fantasma" del alto real de .wideSection
  // (medido, no estimado) para que los asides (grid-row:1/3) tengan caja alta de
  // verdad. .wideSection se reposiciona con margin-top negativo de ese mismo alto,
  // así queda exactamente donde ya estaba — sin mover Planes/Cómo funciona ni un píxel.
  const pageLayoutRef = useRef<HTMLDivElement>(null)
  const wideSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layoutEl = pageLayoutRef.current
    const wideEl = wideSectionRef.current
    if (!layoutEl || !wideEl) return
    const updateWideHeight = () => {
      // .wideSection es hermano de .pageLayout (no descendiente) — las variables CSS
      // no heredan entre hermanos, así que se setea en ambos nodos directamente.
      const px = `${wideEl.offsetHeight}px`
      layoutEl.style.setProperty('--wide-height', px)
      wideEl.style.setProperty('--wide-height', px)
    }
    updateWideHeight()
    const ro = new ResizeObserver(updateWideHeight)
    ro.observe(wideEl)
    return () => ro.disconnect()
  }, [])

  // "Escucha ejemplos" — audios pregrabados locales, independientes del generador TTS real
  const [exampleCategory, setExampleCategory] = useState(TTS_EXAMPLE_CATEGORIES[0])
  const [examplePlayingSlug, setExamplePlayingSlug] = useState<string | null>(null)
  const [exampleImgError, setExampleImgError] = useState<Record<string, boolean>>({})
  const exampleAudioRef = useRef<HTMLAudioElement>(null)

  const [freeAudioBuf, setFreeAudioBuf] = useState<AudioBuffer | null>(null)
  const [isPlayingFree, setIsPlayingFree] = useState(false)
  const [freeDuration, setFreeDuration] = useState(0)
  const [freeProgress, setFreeProgress] = useState(0)
  const [paidAudioUrl, setPaidAudioUrl] = useState<string | null>(null)
  const [paidAudioBlob, setPaidAudioBlob] = useState<Blob | null>(null)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const startTimeRef = useRef(0)
  const pauseOffsetRef = useRef(0)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const remaining = Math.max(0, DAILY_LIMIT - dailyUses)
  const charCount = text.length
  const isPaid = charCount > FREE_CHAR_LIMIT
  const price = calcPrice(charCount)
  const noFreeLeft = remaining === 0 && !isPaid && charCount > 0

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const saved = localStorage.getItem('daily_usage')
    if (!saved) { localStorage.setItem('daily_usage', JSON.stringify({ date: today, count: 0 })); return }
    const parsed = JSON.parse(saved)
    if (parsed.date !== today) {
      localStorage.setItem('daily_usage', JSON.stringify({ date: today, count: 0 }))
    } else {
      setDailyUses(parsed.count || 0)
    }
  }, [])

useEffect(() => {
  const fetchPlans = async () => {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('is_public', true)
      .order('sort_order', { ascending: true })
    if (error) { console.error(error); setPlansError(true) }
    else setPlans(data || [])
    setLoadingPlans(false)
  }
  fetchPlans()
}, [])

  useEffect(() => {
    if (status.type === 'error') {
      const t = setTimeout(() => setStatus({ type: '', msg: '' }), 4000)
      return () => clearTimeout(t)
    }
  }, [status])

  useEffect(() => {
    return () => {
      stopFreeAudio()
      if (progressTimer.current) clearInterval(progressTimer.current)
    }
  }, [])

  function scrollToGenerator() {
    setActiveTab('tts')
    requestAnimationFrame(() => {
      document.getElementById('generador')?.scrollIntoView({ behavior: 'smooth' })
    })
  }

  // "Escucha ejemplos": audio HTML5 local, ajeno al AudioContext del generador real de arriba
  function toggleExamplePlay(slug: string) {
    const audio = exampleAudioRef.current
    if (!audio) return
    if (examplePlayingSlug === slug) {
      audio.pause()
      setExamplePlayingSlug(null)
      return
    }
    audio.src = `/landing/audio-examples/${slug}.mp3`
    audio.currentTime = 0
    setExamplePlayingSlug(slug)
    audio.play().catch(() => setExamplePlayingSlug(null))
  }

  function selectExampleCategory(cat: string) {
    setExampleCategory(cat)
    exampleAudioRef.current?.pause()
    setExamplePlayingSlug(null)
  }

  function stopFreeAudio() {
    try { sourceNodeRef.current?.stop() } catch { }
    sourceNodeRef.current = null
    if (progressTimer.current) clearInterval(progressTimer.current)
    progressTimer.current = null
  }

  
  function startProgressTimer(ctx: AudioContext, duration: number) {
    if (progressTimer.current) clearInterval(progressTimer.current)
    progressTimer.current = setInterval(() => {
      const elapsed = ctx.currentTime - startTimeRef.current
      const pct = Math.min(100, (elapsed / duration) * 100)
      setFreeProgress(pct)
      if (pct >= 100) {
        clearInterval(progressTimer.current!)
        setIsPlayingFree(false)
        setFreeProgress(0)
        pauseOffsetRef.current = 0
      }
    }, 80)
  }

  function playFreeBuffer(buffer: AudioBuffer, offset = 0) {
    const ctx = audioCtxRef.current!
    stopFreeAudio()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0, offset)
    startTimeRef.current = ctx.currentTime - offset
    source.onended = () => {
      if (sourceNodeRef.current === source) {
        setIsPlayingFree(false)
        setFreeProgress(0)
        pauseOffsetRef.current = 0
        sourceNodeRef.current = null
      }
    }
    sourceNodeRef.current = source
    setIsPlayingFree(true)
    startProgressTimer(ctx, buffer.duration)
  }

  function toggleFreePlay() {
    if (!freeAudioBuf || !audioCtxRef.current) return
    const ctx = audioCtxRef.current
    if (isPlayingFree) {
      pauseOffsetRef.current = ctx.currentTime - startTimeRef.current
      stopFreeAudio()
      setIsPlayingFree(false)
    } else {
      playFreeBuffer(freeAudioBuf, pauseOffsetRef.current)
    }
  }

  function restartFreeAudio() {
    if (!freeAudioBuf) return
    pauseOffsetRef.current = 0
    playFreeBuffer(freeAudioBuf, 0)
  }

  function seekFreeAudio(delta: number) {
    if (!freeAudioBuf || !audioCtxRef.current) return
    const ctx = audioCtxRef.current
    const currentPos = isPlayingFree
      ? ctx.currentTime - startTimeRef.current
      : pauseOffsetRef.current
    const newPos = Math.max(0, Math.min(freeAudioBuf.duration, currentPos + delta))
    if (isPlayingFree) {
      playFreeBuffer(freeAudioBuf, newPos)
    } else {
      pauseOffsetRef.current = newPos
      setFreeProgress((newPos / freeAudioBuf.duration) * 100)
    }
  }

  async function previewVoice() {
    if (previewing || previewCooldown > 0) return
    setPreviewing(true)
    setStatus({ type: 'loading', msg: '🔊 Reproduciendo preview...' })
    let seconds = 7
    setPreviewCooldown(seconds)
    const interval = setInterval(() => {
      seconds--
      setPreviewCooldown(seconds)
      if (seconds <= 0) clearInterval(interval)
    }, 1000)
    try {
      const audio = new Audio(`/previews/${voice}.mp3`)
      audio.onended = () => setPreviewing(false)
      audio.onerror = () => {
        setPreviewing(false)
        setStatus({ type: 'error', msg: 'No se encontró el preview de esta voz' })
      }
      setStatus({ type: 'success', msg: '🔊 Reproduciendo preview...' })
      await audio.play()
    } catch (e: unknown) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Error desconocido' })
    } finally {
      setLoading(false)
      setPreviewing(false)
    }
  }

  // 🔥 WATERMARK MERGE FUNCTION - CORREGIDA (sin error removeChild)
  async function mergeBuffers(wm: AudioBuffer, main: AudioBuffer, ctx: AudioContext) {
    try {
      let wmData = wm
      if (wm.sampleRate !== main.sampleRate) {
        const ratio = wm.sampleRate / main.sampleRate
        const newLength = Math.round(wm.length / ratio)
        const resampled = ctx.createBuffer(wm.numberOfChannels, newLength, main.sampleRate)
        for (let ch = 0; ch < wm.numberOfChannels; ch++) {
          const src = wm.getChannelData(ch)
          const dst = resampled.getChannelData(ch)
          for (let i = 0; i < newLength; i++) {
            dst[i] = src[Math.min(Math.round(i * ratio), src.length - 1)]
          }
        }
        wmData = resampled
      }
      const totalLength = wmData.length + main.length
      const output = ctx.createBuffer(main.numberOfChannels, totalLength, main.sampleRate)
      for (let ch = 0; ch < main.numberOfChannels; ch++) {
        const channel = output.getChannelData(ch)
        channel.set(wmData.getChannelData(Math.min(ch, wmData.numberOfChannels - 1)), 0)
        channel.set(main.getChannelData(ch), wmData.length)
      }
      return output
    } catch (err) {
      console.warn("Error en watermark, usando audio original", err)
      return main
    }
  }

  async function handleGenerate() {
    if (!text.trim()) {
      setStatus({ type: 'error', msg: 'Escribe o pega algo de texto primero' })
      return
    }
    if (noFreeLeft) {
      setStatus({ type: 'error', msg: '🚫 Agotaste tus 3 audios gratis hoy. Vuelve mañana o desbloquea PRO 💎' })
      setGenerated(false)
      setFreeAudioBuf(null)
      setPaidAudioUrl(null)
      return
    }

    const treatAsPaid = isPaid
    setLoading(true)
    setStatus({ type: 'loading', msg: 'Generando tu audio...' })
    setGenerated(false)
    setFreeAudioBuf(null)
    setPaidAudioUrl(null)
    setPaidAudioBlob(null)
    stopFreeAudio()
    setIsPlayingFree(false)
    setFreeProgress(0)
    pauseOffsetRef.current = 0

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, speed, paid: treatAsPaid }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Error generando audio')
      }

      if (treatAsPaid) {
        const blob = await res.blob()
        setPaidAudioBlob(blob)
        setPaidAudioUrl(URL.createObjectURL(blob))
      } else {
        const arrayBuf = await res.arrayBuffer()
        const ctx = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        audioCtxRef.current = ctx
        const decoded = await ctx.decodeAudioData(arrayBuf)

        let finalAudio = decoded
        try {
          const wmRes = await fetch('/vozestudio.mp3')
          if (wmRes.ok) {
            const wmBuf = await wmRes.arrayBuffer()
            const wmDecoded = await ctx.decodeAudioData(wmBuf)
            finalAudio = await mergeBuffers(wmDecoded, decoded, ctx)
          }
        } catch (wmErr) {
          console.warn("[VozEstudio] Watermark falló:", wmErr)
        }

        setFreeAudioBuf(finalAudio)
        setFreeDuration(finalAudio.duration)
        pauseOffsetRef.current = 0

        const today = new Date().toISOString().slice(0, 10)
        const saved = localStorage.getItem('daily_usage')
        const parsed = saved ? JSON.parse(saved) : { date: today, count: 0 }
        const newCount = (parsed.count || 0) + 1
        localStorage.setItem('daily_usage', JSON.stringify({ date: today, count: newCount }))
        setDailyUses(newCount)

        playFreeBuffer(finalAudio, 0)
      }
      setGenerated(true)
      setStatus({
        type: 'success',
        msg: treatAsPaid ? '✅ ¡Audio listo! Descárgalo abajo' : '✅ ¡Audio listo! Escúchalo abajo',
      })
    } catch (e: unknown) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Error desconocido' })
    } finally {
      setLoading(false)
      setPreviewing(false)
    }
  }

  function downloadPaid() {
    if (!paidAudioBlob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(paidAudioBlob)
    a.download = 'vozestudio.mp3'
    a.click()
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const freeElapsed = freeAudioBuf ? (freeProgress / 100) * freeDuration : 0
  const skipAmt = getSkipAmount(freeDuration)

  return (
    <div className={styles.page}>
      <Nav />

      <div className={styles.badgeRow}>
        <span className={styles.topBadge}>
          {activeTab === 'documento'
            ? '🔬 IA avanzada + Validación TEXVOZLAB'
            : '🎧 3 audios gratis al día · Sin registro'}
        </span>
      </div>

      <div className={styles.tabSwitchWrap}>
        <div className={styles.tabSwitch}>
          <button
            className={`${styles.tabButton} ${activeTab === 'documento' ? styles.tabButtonActive : ''}`}
            onClick={() => { setActiveTab('documento'); setOpenFaq(null) }}
          >
            📄 Subir documento
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'tts' ? styles.tabButtonActive : ''}`}
            onClick={() => { setActiveTab('tts'); setOpenFaq(null) }}
          >
            🎧 Escribe y escucha
          </button>
        </div>
      </div>

      <div className={styles.pageLayout} ref={pageLayoutRef}>
        <aside className={styles.adSideLeft}>
          <div className={styles.sideBanner}>
            <img
              src={activeTab === 'documento' ? '/landing/banner-documento-audio.png' : '/landing/banner-tts-audio.png'}
              alt="Entiende tus ideas en voz alta"
              className={styles.sideBannerImage}
            />
          </div>
        </aside>

        <div className={styles.pageCenter}>
          {activeTab === 'tts' && (
          <>
          <section className={styles.hero}>
            <div>
              <h1 className={styles.heroTitle}>Entiende tus ideas <em>en voz alta</em></h1>
              <p className={styles.heroSub}>Escribe tu texto, elige una voz y escúchalo al instante. Ideal para estudiar, repasar o hacer más accesible cualquier contenido.</p>
            </div>
            <div className={styles.heroImageWrap}>
              <img src="/landing/tts-hero.png" alt="Audífonos y forma de onda" className={styles.heroImage} />
            </div>
          </section>

          <main className={styles.mainCard} id="generador">
            <div className={styles.ttsGrid}>
              <div className={styles.textareaWrap}>
                <textarea className={`${styles.textarea} ${isPaid ? styles.textareaPaid : ''}`} placeholder="Pega aquí tu texto, tarea, apuntes o lo que quieras escuchar..." value={text} onChange={(e) => setText(e.target.value)} />
                <div className={styles.charRow}>
                  <span className={`${styles.charCount} ${isPaid ? styles.charPaid : ''}`}>{charCount.toLocaleString('es')} caracteres</span>
                  {charCount === 0 ? (
                    <span className={styles.charTag}>Gratis hasta 2,000 · Te quedan {remaining} de {DAILY_LIMIT} hoy</span>
                  ) : !isPaid ? (
                    <span className={styles.charTagFree}>✅ Gratis: puedes escucharlo sin pagar · Te quedan <b>{remaining}</b> usos hoy</span>
                  ) : (
                    <span className={styles.charTagPaid}>⚠️ Supera el límite gratis · Audios largos: disponible próximamente</span>
                  )}
                </div>
              </div>

              <div className={styles.ttsGridRight}>
                <div className={styles.ctrlGroup}>
                  <label className={styles.ctrlLabel}>🗣️ Elige una voz</label>
                  <div className={styles.voiceRow}>
                    <select className={styles.select} value={voice} onChange={(e) => setVoice(e.target.value)}>
                      {VOICES.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
                    </select>
                    <button className={`${styles.btnPreview} ${previewing ? styles.btnPreviewOn : ''}`} onClick={previewVoice} disabled={previewing || previewCooldown > 0}>
                      {previewing ? '🔊 Reproduciendo...' : previewCooldown > 0 ? `⏳ Espera ${previewCooldown}s` : '🔊 Probar'}
                    </button>
                  </div>
                </div>
                <div className={styles.ctrlGroup}>
                  <label className={styles.ctrlLabel}>⚡ Velocidad — <span className={styles.speedVal}>{speed.toFixed(1)}×</span></label>
                  <input type="range" min={0.5} max={2} step={0.1} value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} className={styles.range} />
                  <p className={styles.speedHint}>⚡ La velocidad se aplica al generar el audio.</p>
                </div>
                <div className={styles.actionRow}>
                  <button
                    className={loading || charCount === 0 ? styles.btnGenerate : isPaid ? styles.btnGeneratePaid : noFreeLeft ? styles.btnGenerateOrange : styles.btnGenerate}
                    onClick={handleGenerate}
                    disabled={loading || charCount === 0 || isPaid || noFreeLeft}
                  >
                    {loading
                      ? <><span className={styles.btnSpinner} /> Generando audio...</>
                      : isPaid
                        ? '🔒 Audios largos: disponible próximamente'
                        : noFreeLeft
                          ? '🔒 Más audios hoy: disponible próximamente'
                          : '🎧 Generar audio gratis'}
                  </button>
                </div>
              </div>
            </div>

            {status.type && (
              <div className={`${styles.statusBar} ${styles['status_' + status.type]}`}>
                {status.type === 'loading' && <span className={styles.spinner} />}
                {status.msg}
              </div>
            )}

            {generated && (
              <div className={styles.resultBox}>
                <div className={styles.resultHeader}>
                  <div className={styles.waveBars}><span /><span /><span /><span /><span /></div>
                  <span className={styles.resultLabel}>Audio generado con VozEstudio.com</span>
                </div>

                {!isPaid && freeAudioBuf && (
                  <div className={styles.freePlayer}>
                    <div className={styles.freePlayerRow}>
                      <button className={styles.freeSeekBtn} onClick={() => seekFreeAudio(-skipAmt)} title={`Retroceder ${skipAmt}s`}>
                        <span className={styles.freeSeekIcon}>«</span><span className={styles.freeSeekLabel}>{skipAmt}s</span>
                      </button>
                      <button className={styles.freePlayBtn} onClick={toggleFreePlay} title={isPlayingFree ? 'Pausar' : 'Reproducir'}>
                        {isPlayingFree ? (
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="white"><rect x="3" y="2" width="4" height="14" rx="1.5"/><rect x="11" y="2" width="4" height="14" rx="1.5"/></svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="white"><path d="M4 2.5l12 6.5-12 6.5V2.5z"/></svg>
                        )}
                      </button>
                      <button className={styles.freeSeekBtn} onClick={() => seekFreeAudio(skipAmt)} title={`Adelantar ${skipAmt}s`}>
                        <span className={styles.freeSeekLabel}>{skipAmt}s</span><span className={styles.freeSeekIcon}>»</span>
                      </button>
                      <button className={styles.freeRestartBtn} onClick={restartFreeAudio} title="Desde el inicio">
                        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 7.5A5.5 5.5 0 1 0 4.5 3"/><path d="M2 2v4h4"/></svg>
                      </button>
                    </div>
                    <div className={styles.freeProgressArea}>
                      <div className={styles.freeProgressBar}><div className={styles.freeProgressFill} style={{ width: `${freeProgress}%` }} /></div>
                      <div className={styles.freeTime}>{fmtTime(freeElapsed)} / {fmtTime(freeDuration)}</div>
                    </div>
                    <p className={styles.freePlayerNote}>🔒 Solo escucha · Para descargar en MP3 paga abajo</p>
                  </div>
                )}

                {isPaid && paidAudioUrl && (
                  <div className={styles.audioWrap}><audio ref={audioRef} src={paidAudioUrl} controls className={styles.audioPlayer} /></div>
                )}

                {!isPaid && (
                  <div className={styles.upsellBox}>
                    <div className={styles.upsellText}><strong>¿Quieres descargarlo sin marca de agua?</strong><span>Descarga sin marca de agua: disponible próximamente.</span></div>
                    {dailyUses >= DAILY_LIMIT && (<div className={styles.limitMsg}>⚠️ Ya agotaste tus 3 audios gratis de hoy.</div>)}
                    <button className={styles.btnBuy} disabled>🔒 Próximamente</button>
                  </div>
                )}

                {isPaid && (
                  <div className={styles.downloadBox}>
                    <p className={styles.downloadMsg}>✅ Pago incluido · Sin marca de agua</p>
                    <button className={styles.btnDownloadFull} onClick={downloadPaid}>⬇️ Descargar MP3 — ${price} MXN</button>
                  </div>
                )}
              </div>
            )}
          </main>

          <section className={styles.ttsExamplesSection}>
            <p className={styles.ttsExamplesEyebrow}>Escucha ejemplos de audiolibros y contenido pregrabado</p>
            <div className={styles.ttsExamplesPills}>
              {TTS_EXAMPLE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`${styles.ttsExamplesPill} ${exampleCategory === cat ? styles.ttsExamplesPillActive : ''}`}
                  onClick={() => selectExampleCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            {TTS_EXAMPLES.filter((ex) => exampleCategory === 'Todos' || ex.category === exampleCategory).length === 0 ? (
              <p className={styles.ttsExamplesEmpty}>Todavía no hay ejemplos en esta categoría.</p>
            ) : (
              <div className={styles.ttsExamplesGrid}>
                {TTS_EXAMPLES.filter((ex) => exampleCategory === 'Todos' || ex.category === exampleCategory).map((ex) => (
                  <div key={ex.slug} className={styles.ttsExampleCard}>
                    <div className={styles.ttsExampleThumb}>
                      {!exampleImgError[ex.slug] ? (
                        <img
                          src={`/landing/audio-examples/${ex.slug}.jpg`}
                          alt={ex.title}
                          className={styles.ttsExampleThumbImg}
                          onError={() => setExampleImgError((prev) => ({ ...prev, [ex.slug]: true }))}
                        />
                      ) : (
                        <span className={styles.ttsExampleThumbFallback}>🎧</span>
                      )}
                    </div>
                    <p className={styles.ttsExampleTitle}>{ex.title}</p>
                    <p className={styles.ttsExampleMeta}>{ex.author}</p>
                    <div className={styles.ttsExampleWaveRow}>
                      <button
                        type="button"
                        className={styles.ttsExamplePlay}
                        onClick={() => toggleExamplePlay(ex.slug)}
                        aria-label={examplePlayingSlug === ex.slug ? 'Pausar ejemplo' : 'Reproducir ejemplo'}
                      >
                        {examplePlayingSlug === ex.slug ? (
                          <svg width="9" height="9" viewBox="0 0 18 18" fill="currentColor"><rect x="3" y="2" width="4" height="14" rx="1" /><rect x="11" y="2" width="4" height="14" rx="1" /></svg>
                        ) : (
                          <svg width="9" height="9" viewBox="0 0 18 18" fill="currentColor"><path d="M4 2.5l12 6.5-12 6.5V2.5z" /></svg>
                        )}
                      </button>
                      <span className={styles.ttsExampleWave}>
                        {Array.from({ length: 10 }).map((_, i) => <span key={i} />)}
                      </span>
                      <span className={styles.ttsExampleDuration}>{ex.duration}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <audio
              ref={exampleAudioRef}
              onEnded={() => setExamplePlayingSlug(null)}
              onError={() => setExamplePlayingSlug(null)}
              hidden
            />
          </section>
          </>
          )}

          {activeTab === 'documento' && (
            <div id="documento-generador">
              <FileWizard allowAudio={false} showToolsWithUpload />
            </div>
          )}

          <div className={styles.benefitsRow}>
            {(activeTab === 'tts' ? BENEFITS_TTS : BENEFITS_DOCUMENTO).map((b, i) => (
              <div key={i} className={styles.benefitItem}>
                <span className={styles.benefitIcon}><b.Icon /></span>
                <div>
                  <strong className={styles.benefitTitle}>{b.title}</strong>
                  <p className={styles.benefitSub}>{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className={styles.adSideRight}>
          <div className={styles.sideBanner}>
            <img
              src={activeTab === 'documento' ? '/landing/banner-documento-doc.png' : '/landing/banner-tts-doc.png'}
              alt="Entiende tus documentos sin complicarte"
              className={styles.sideBannerImage}
            />
          </div>
        </aside>
      </div>

      <div className={styles.wideSection} ref={wideSectionRef}>
          <section className={styles.howSection} id="como-funciona">
            <div className={styles.sectionBadge}>⚡ Simple y rápido</div>
            <h2 className={styles.sectionTitle}>Cómo funciona</h2>
            <div className={styles.stepsGrid}>
              {(activeTab === 'tts'
                ? [
                    { n: '1', icon: '📋', title: 'Pega tu texto', desc: 'Copia y pega cualquier texto. Sin límite de escritura.' },
                    { n: '2', icon: '🗣️', title: 'Elige voz y velocidad', desc: 'Selecciona la voz que más te guste y ajusta la velocidad.' },
                    { n: '3', icon: '🎧', title: 'Genera tu audio gratis', desc: 'Hasta 2,000 caracteres son gratis.' },
                    { n: '4', icon: '⬇️', title: 'Descarga sin marca de agua', desc: 'El pago desbloquea el audio completo y la descarga.' },
                  ]
                : [
                    { n: '1', icon: '📤', title: 'Sube tu documento', desc: 'PDF, DOCX o TXT, hasta 50 MB.' },
                    { n: '2', icon: '🧠', title: 'Elige una herramienta', desc: 'Explicar, resumir, preguntas, guía de estudio o análisis.' },
                    { n: '3', icon: '⚙️', title: 'La IA procesa tu documento', desc: 'Necesitas iniciar sesión para generarlo.' },
                    { n: '4', icon: '⬇️', title: 'Descarga tu resultado', desc: 'En TXT, DOCX o PDF.' },
                  ]
              ).map((s) => (
                <div key={s.n} className={styles.stepCard}>
                  <div className={styles.stepNum}>{s.n}</div>
                  <div className={styles.stepIcon}>{s.icon}</div>
                  <div className={styles.stepTitle}>{s.title}</div>
                  <div className={styles.stepDesc}>{s.desc}</div>
                </div>
              ))}
            </div>
            <p className={styles.howUses}>
              {activeTab === 'tts'
                ? <>Ideal para <strong>tareas, apuntes, TikTok, audiolibros, manuales y trabajo.</strong></>
                : <>Ideal para <strong>contratos, tareas, manuales, artículos y documentos complejos.</strong></>}
            </p>
            <button
              className={styles.btnCta}
              onClick={
                activeTab === 'tts'
                  ? scrollToGenerator
                  : () => document.getElementById('documento-generador')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              {activeTab === 'tts' ? '🎧 Probar ahora gratis' : '📄 Probar con mi documento'}
            </button>
          </section>

          <section className={styles.planesSection} id="planes">
            <div className={styles.sectionBadge}>💎 Sin sorpresas</div>
            <h2 className={styles.sectionTitle}>
              {activeTab === 'tts' ? 'Audio gratis y pago por uso' : 'Planes'}
            </h2>
            <p className={styles.sectionSub}>
              {activeTab === 'tts'
                ? 'Empieza gratis, paga solo si quieres más.'
                : 'Elige el plan que mejor se adapte a tu uso de documentos.'}
            </p>

            {activeTab === 'tts' && (
              <div className={styles.planCard} style={{ maxWidth: 420, margin: '0 auto 24px' }}>
                <div className={styles.planHeader}>
                  <span className={styles.planEmoji}>✅</span>
                  <div>
                    <div className={styles.planName}>Gratis</div>
                    <div className={styles.planPrice}>$0 <span>/ siempre</span></div>
                  </div>
                </div>
                <p className={styles.planDesc}>Perfecto para estudiar y escuchar textos sin pagar.</p>
                <ul className={styles.planList}>
                  {['3 audios por día', 'Hasta 2,000 caracteres por audio', 'Voces estándar de alta calidad', 'Escucha en línea', 'Audio con marca de agua'].map((b, i) => (
                    <li key={i}><span className={styles.checkFree}>✓</span>{b}</li>
                  ))}
                </ul>
                <button className={styles.btnPlanFree} onClick={scrollToGenerator}>🎧 Probar Gratis</button>
              </div>
            )}

            {activeTab === 'documento' && (
              <div className={styles.planesGrid}>

                {/* ── Cards dinámicas desde Supabase ── */}
                {loadingPlans && (
                  <div className={styles.planCard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, opacity: 0.5 }}>
                    <span>Cargando planes...</span>
                  </div>
                )}

                {!loadingPlans && plansError && (
                  <div className={styles.planCard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, opacity: 0.6 }}>
                    <span>⚠️ No se pudieron cargar los planes. Intenta más tarde.</span>
                  </div>
                )}

                {!loadingPlans && !plansError && plans.length === 0 && (
                  <div className={styles.planCard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, opacity: 0.5 }}>
                    <span>No hay planes disponibles.</span>
                  </div>
                )}

                {!loadingPlans && plans.map((plan) => {
                  const isFeatured = plan.name === 'empresarial'
                  return (
                    <div key={plan.id} className={`${styles.planCard} ${isFeatured ? styles.planCardPro : ''}`}>
                      {isFeatured && <div className={styles.planBestBadge}>⭐ Recomendado</div>}
                      <div className={styles.planHeader}>
                        <span className={styles.planEmoji}>{isFeatured ? '💎' : '🚀'}</span>
                        <div>
                          <div className={styles.planName}>{plan.display_name}</div>
                          <div className={`${styles.planPrice} ${isFeatured ? styles.planPricePro : ''}`}>
                            ${plan.price_mxn} MXN <span>/ mes</span>
                          </div>
                        </div>
                      </div>
                      <ul className={styles.planList}>
                        <li>
                          <span className={isFeatured ? styles.checkPro : styles.checkFree}>✓</span>
                          {plan.max_docs_month === null ? 'Documentos ilimitados' : `${plan.max_docs_month} documentos por mes`}
                        </li>
                        <li>
                          <span className={isFeatured ? styles.checkPro : styles.checkFree}>✓</span>
                          {plan.max_pages_per_doc === null ? 'Sin límite de páginas' : `Hasta ${plan.max_pages_per_doc} páginas por documento`}
                        </li>
                        <li>
                          <span className={isFeatured ? styles.checkPro : styles.checkFree}>✓</span>
                          {plan.max_seats === 1 ? '1 usuario' : '1 usuario · Multiusuario próximamente'}
                        </li>
                        <li>
                          <span className={isFeatured ? styles.checkPro : styles.checkFree}>✓</span>
                          {plan.history_days === null ? 'Historial ilimitado' : `Historial de ${plan.history_days} días`}
                        </li>
                      </ul>
                      <button
                        className={isFeatured ? styles.btnPlanPro : styles.btnPlanFree}
                        onClick={() => {
                          if (plan.name === 'pro') {
                            window.location.href = '/checkout/pro'
                          } else if (plan.name === 'empresarial') {
                            window.location.href = '/checkout/enterprise'
                          } else if (plan.name === 'corporativo') {
                            window.location.href = '/checkout/corporate'
                          } else {
                            alert('Este plan estará disponible para contratación próximamente.')
                          }
                        }}
                      >
                        {isFeatured ? '⭐ Quiero ' : '🚀 Elegir '}
                        {plan.display_name}
                     </button>
                    </div>
                  )
                })}
              </div>
            )}

            {activeTab === 'tts' && (
              <div className={styles.payPerCard}>
                <div className={styles.payPerHeader}><span style={{ fontSize: '28px', flexShrink: 0 }}>💰</span><div><div className={styles.payPerTitle}>Pago por audio (descarga incluida)</div><div className={styles.payPerSub}>Escucha gratis hasta 2,000 caracteres. Si tu texto es más largo, puedes generar el audio completo pagando según el tamaño. <strong>Incluye descarga MP3 sin marca de agua.</strong></div></div></div>
                <div className={styles.payPerTable}>
                  <div className={styles.payPerTableHead}><span>Tamaño del texto</span><span>Precio total</span></div>
                  {[['Hasta 1,000 caracteres', '$10 MXN'], ['Hasta 2,000 caracteres', '$20 MXN'], ['Hasta 3,000 caracteres', '$30 MXN'], ['Hasta 4,000 caracteres', '$40 MXN'], ['Hasta 5,000 caracteres', '$50 MXN']].map(([chars, p], i) => (<div key={i} className={`${styles.payPerRow} ${i % 2 === 0 ? styles.payPerRowAlt : ''}`}><span>{chars}</span><span className={styles.payPerPrice}>{p}</span></div>))}
                </div>
                <p className={styles.payPerNote}>$10 MXN por cada 1,000 caracteres · Sin suscripción · Solo pagas cuando quieres</p>
              </div>
            )}
          </section>

          <section className={styles.nosotrosSection} id="nosotros">
            <div className={styles.sectionBadge}>🫶 Quiénes somos</div>
            <h2 className={styles.sectionTitle}>Nosotros</h2>
            <p className={styles.nosotrosText}>
              VozEstudio convierte documentos y texto en información más fácil de entender, estudiar y escuchar.
            </p>
          </section>

          <section className={styles.paraQuienSection} id="para-quien">
            <div className={styles.sectionBadge}>🎯 Para ti</div>
            <h2 className={styles.sectionTitle}>¿Para quién?</h2>
            <p className={styles.sectionSub}>
              Para estudiantes, profesionistas y cualquier persona que trabaje con documentos, tareas, apuntes o textos largos.
            </p>
            <div className={styles.paraQuienGrid}>
              {[
                { icon: '🎓', title: 'Estudiantes', desc: 'Tareas, apuntes y libros de texto.' },
                { icon: '💼', title: 'Profesionistas', desc: 'Contratos, informes y documentos de trabajo.' },
                { icon: '📚', title: 'Uso cotidiano', desc: 'Cualquier texto o documento largo del día a día.' },
              ].map((c) => (
                <div key={c.title} className={styles.paraQuienCard}>
                  <span className={styles.paraQuienIcon}>{c.icon}</span>
                  <strong>{c.title}</strong>
                  <p>{c.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.faqSection} id="faq">
            <h3 className={styles.faqTitle}>Preguntas frecuentes</h3>
            <div className={styles.faqList}>
              {(activeTab === 'tts' ? FAQ : FAQ_DOCUMENTO).map((f, i) => (
                <div key={i} className={styles.faqItem} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <div className={styles.faqQ}><span>{f.q}</span><span className={`${styles.faqArrow} ${openFaq === i ? styles.faqArrowOpen : ''}`}>▼</span></div>
                  {openFaq === i && <div className={styles.faqA}>{f.a}</div>}
                </div>
              ))}
            </div>
          </section>
      </div>

      <footer className={styles.footer}>VozEstudio © 2025 · Hecho para estudiantes hispanohablantes 🫶</footer>
    </div>
  )
}