'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './page.module.css'
import FileWizard from './components/FileWizard'

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
  return Math.ceil(chars / 1000) * 10
}

function getSkipAmount(duration: number): number {
  if (duration < 30) return 1
  if (duration < 120) return 5
  return 10
}

const FAQ = [
  { q: '¿Es gratis?', a: 'Sí. Puedes generar y escuchar audios de hasta 2,000 caracteres sin pagar nada ni registrarte.' },
  { q: '¿Por qué hay anuncios?', a: 'Los anuncios nos permiten mantener el servicio gratuito. El plan Pro los elimina.' },
  { q: '¿Qué es la marca de agua?', a: 'Un audio corto al inicio que dice "Generado con VozEstudio.com". Desaparece si pagas por el audio.' },
  { q: '¿Puedo generar textos más largos?', a: 'Sí. Si tu texto supera los 2,000 caracteres, puedes generar el audio completo pagando $10 MXN por cada 1,000 caracteres. El pago incluye descarga MP3 sin marca de agua.' },
  { q: '¿Qué incluye el Plan Pro?', a: 'Sin anuncios, sin marca de agua, descargas ilimitadas, voces premium de IA y mayor calidad de audio por $99 MXN al mes.' },
  { q: '¿Qué formatos puedo descargar?', a: 'Por ahora MP3. En versiones futuras agregaremos WAV y otros formatos.' },
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
    document.getElementById('generador')?.scrollIntoView({ behavior: 'smooth' })
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
      <nav className={styles.nav}>
        <div className={styles.logo}>
          <span className={styles.logoDot} />
          VozEstudio
        </div>
        <div className={styles.navPills}>
          <button className={`${styles.navPill} ${styles.navPillActive}`} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Inicio</button>
          <button className={styles.navPill} onClick={() => document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' })}>Planes</button>
          <button className={styles.navPill} onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}>Cómo funciona</button>
        </div>
      </nav>

      <div className={styles.pageLayout}>
        <aside className={styles.adSideLeft}>
          <div className={styles.adSideBox}>
            <span className={styles.adSideLabel}>Publicidad</span>
            <span className={styles.adSideDim}>300 × 600</span>
            <span className={styles.adSideNote}>AdSense</span>
          </div>
        </aside>

        <div className={styles.pageCenter}>
          <section className={styles.hero}>
            <div className={styles.heroBadge}>🎧 Para estudiantes hispanohablantes</div>
            <h1 className={styles.heroTitle}>Convierte cualquier texto<br /><em>en audio en segundos</em> 🎧</h1>
            <p className={styles.heroSub}>Pega tu tarea, apuntes o ese librote de actividades y escúchalo mientras haces otra cosa. Sin registro. Sin complicaciones.</p>
          </section>

          <main className={styles.mainCard} id="generador">
            <div className={styles.controlsGrid}>
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
            </div>

            <div className={styles.textareaWrap}>
              <textarea className={`${styles.textarea} ${isPaid ? styles.textareaPaid : ''}`} placeholder="Pega aquí tu texto, tarea, apuntes o lo que quieras escuchar..." value={text} onChange={(e) => setText(e.target.value)} />
              <div className={styles.charRow}>
                <span className={`${styles.charCount} ${isPaid ? styles.charPaid : ''}`}>{charCount.toLocaleString('es')} caracteres</span>
                {charCount === 0 ? (
                  <span className={styles.charTag}>Gratis hasta 2,000 · Te quedan {remaining} de {DAILY_LIMIT} hoy</span>
                ) : !isPaid ? (
                  <span className={styles.charTagFree}>✅ Gratis: puedes escucharlo sin pagar · Te quedan <b>{remaining}</b> usos hoy</span>
                ) : (
                  <span className={styles.charTagPaid}>⚠️ Supera el límite gratis · Para el audio completo: <strong>${price} MXN</strong></span>
                )}
              </div>
            </div>

            {status.type && (
              <div className={`${styles.statusBar} ${styles['status_' + status.type]}`}>
                {status.type === 'loading' && <span className={styles.spinner} />}
                {status.msg}
              </div>
            )}

            <div className={styles.actionRow}>
              <button
                className={loading || charCount === 0 ? styles.btnGenerate : isPaid ? styles.btnGeneratePaid : noFreeLeft ? styles.btnGenerateOrange : styles.btnGenerate}
                onClick={handleGenerate}
                disabled={loading || charCount === 0}
              >
                {loading ? <><span className={styles.btnSpinner} /> Generando audio...</> : isPaid ? `💳 Generar + Descargar por $${price} MXN` : noFreeLeft ? `🎧 Escuchar este audio por $${calcPrice(charCount)} MXN` : '🎧 Generar audio gratis'}
              </button>
            </div>

            {(loading || generated) && (
              <div className={styles.adBelowBtn}><span className={styles.adInlineLabel}>Publicidad mostrada después de generar audio</span></div>
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
                  <>
                    <div className={styles.adBox}>
                      <span className={styles.adLabel}>Publicidad</span>
                      <div className={styles.adSlot}><div className={styles.adSlotInner}><span className={styles.adSlotTitle}>Publicidad</span><span className={styles.adSlotDim}>728×90 · 300×250</span><span className={styles.adSlotNote}>Banner AdSense</span></div></div>
                    </div>
                    <div className={styles.upsellBox}>
                      <div className={styles.upsellText}><strong>¿Quieres descargarlo sin marca de agua?</strong><span>Descarga este audio en MP3 limpio por solo <strong>${calcPrice(charCount)} MXN</strong></span></div>
                      {dailyUses >= DAILY_LIMIT && (<div className={styles.limitMsg}>⚠️ Ya agotaste tus 3 audios gratis de hoy. Para descargar sin marca de agua debes pagar.</div>)}
                      <button className={styles.btnBuy}>⬇️ Descargar ${calcPrice(charCount)} MXN</button>
                    </div>
                  </>
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

          <FileWizard />

          <section className={styles.howSection} id="como-funciona">
            <div className={styles.sectionBadge}>⚡ Simple y rápido</div>
            <h2 className={styles.sectionTitle}>Cómo funciona</h2>
            <div className={styles.stepsGrid}>
              {[
                { n: '1', icon: '📋', title: 'Pega tu texto', desc: 'Copia y pega cualquier texto. Sin límite de escritura.' },
                { n: '2', icon: '🗣️', title: 'Elige voz y velocidad', desc: 'Selecciona la voz que más te guste y ajusta la velocidad.' },
                { n: '3', icon: '🎧', title: 'Genera tu audio gratis', desc: 'Hasta 2,000 caracteres son gratis.' },
                { n: '4', icon: '⬇️', title: 'Descarga sin marca de agua', desc: 'El pago desbloquea el audio completo y la descarga.' },
              ].map((s) => (
                <div key={s.n} className={styles.stepCard}>
                  <div className={styles.stepNum}>{s.n}</div>
                  <div className={styles.stepIcon}>{s.icon}</div>
                  <div className={styles.stepTitle}>{s.title}</div>
                  <div className={styles.stepDesc}>{s.desc}</div>
                </div>
              ))}
            </div>
            <p className={styles.howUses}>Ideal para <strong>tareas, apuntes, TikTok, audiolibros, manuales y trabajo.</strong></p>
            <button className={styles.btnCta} onClick={scrollToGenerator}>🎧 Probar ahora gratis</button>
            <div className={styles.faqWrap}>
              <h3 className={styles.faqTitle}>Preguntas frecuentes</h3>
              <div className={styles.faqList}>
                {FAQ.map((f, i) => (
                  <div key={i} className={styles.faqItem} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <div className={styles.faqQ}><span>{f.q}</span><span className={`${styles.faqArrow} ${openFaq === i ? styles.faqArrowOpen : ''}`}>▼</span></div>
                    {openFaq === i && <div className={styles.faqA}>{f.a}</div>}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.planesSection} id="planes">
            <div className={styles.sectionBadge}>💎 Sin sorpresas</div>
            <h2 className={styles.sectionTitle}>Planes</h2>
            <p className={styles.sectionSub}>Empieza gratis, paga solo si quieres más.</p>
            <div className={styles.planesGrid}>
              <div className={styles.planCard}>
                <div className={styles.planHeader}><span className={styles.planEmoji}>🟩</span><div><div className={styles.planName}>Gratis</div><div className={styles.planPrice}>$0 <span>/ siempre</span></div></div></div>
                <p className={styles.planDesc}>Perfecto para estudiar y escuchar textos sin pagar.</p>
                <ul className={styles.planList}>
                  {['3 audios por día', 'Hasta 2,000 caracteres por audio', 'Voces estándar de alta calidad', 'Escucha en línea', 'Incluye anuncios', 'Audio con marca de agua'].map((b, i) => (<li key={i}><span className={styles.checkFree}>✓</span>{b}</li>))}
                </ul>
                <button className={styles.btnPlanFree} onClick={scrollToGenerator}>🎧 Probar Gratis</button>
              </div>
              <div className={`${styles.planCard} ${styles.planCardPro}`}>
                <div className={styles.planBestBadge}>⭐ Recomendado</div>
                <div className={styles.planHeader}><span className={styles.planEmoji}>💎</span><div><div className={styles.planName}>PRO</div><div className={`${styles.planPrice} ${styles.planPricePro}`}>$99 MXN <span>/ mes</span></div></div></div>
                <p className={styles.planDesc}>Para quien usa VozEstudio todos los días.</p>
                <ul className={styles.planList}>
                  {['Sin anuncios', 'Descargas ilimitadas', 'Más caracteres diarios', 'Voces premium de IA', 'Sin marca de agua', 'Mejor calidad de audio'].map((b, i) => (<li key={i}><span className={styles.checkPro}>✓</span>{b}</li>))}
                </ul>
                <button className={styles.btnPlanPro}>⭐ Quiero PRO</button>
              </div>
            </div>
            <div className={styles.payPerCard}>
              <div className={styles.payPerHeader}><span style={{ fontSize: '28px', flexShrink: 0 }}>💰</span><div><div className={styles.payPerTitle}>Pago por audio (descarga incluida)</div><div className={styles.payPerSub}>Escucha gratis hasta 2,000 caracteres. Si tu texto es más largo, puedes generar el audio completo pagando según el tamaño. <strong>Incluye descarga MP3 sin marca de agua.</strong></div></div></div>
              <div className={styles.payPerTable}>
                <div className={styles.payPerTableHead}><span>Tamaño del texto</span><span>Precio total</span></div>
                {[['Hasta 1,000 caracteres', '$10 MXN'], ['Hasta 2,000 caracteres', '$20 MXN'], ['Hasta 3,000 caracteres', '$30 MXN'], ['Hasta 4,000 caracteres', '$40 MXN'], ['Hasta 5,000 caracteres', '$50 MXN']].map(([chars, p], i) => (<div key={i} className={`${styles.payPerRow} ${i % 2 === 0 ? styles.payPerRowAlt : ''}`}><span>{chars}</span><span className={styles.payPerPrice}>{p}</span></div>))}
              </div>
              <p className={styles.payPerNote}>$10 MXN por cada 1,000 caracteres · Sin suscripción · Solo pagas cuando quieres</p>
            </div>
          </section>

          <div className={styles.features}>
            {[
              { icon: '🎧', title: 'Escucha gratis', desc: 'Hasta 2,000 caracteres sin registrarte ni pagar.' },
              { icon: '🇲🇽', title: 'Voces en español', desc: 'México, España, USA Latino y más.' },
              { icon: '⚡', title: 'Sin registro', desc: 'Entra, pega y listo.' },
              { icon: '⬇️', title: 'Textos largos con pago', desc: '$10 MXN por cada 1,000 chars. Descarga incluida.' },
            ].map((f, i) => (<div key={i} className={styles.featCard}><span className={styles.featIcon}>{f.icon}</span><div className={styles.featTitle}>{f.title}</div><div className={styles.featDesc}>{f.desc}</div></div>))}
          </div>
        </div>

        <aside className={styles.adSideRight}>
          <div className={styles.adSideBox}>
            <span className={styles.adSideLabel}>Publicidad</span>
            <span className={styles.adSideDim}>300 × 600</span>
            <span className={styles.adSideNote}>AdSense</span>
          </div>
        </aside>
      </div>

      <footer className={styles.footer}>VozEstudio © 2025 · Hecho para estudiantes hispanohablantes 🫶</footer>
    </div>
  )
}