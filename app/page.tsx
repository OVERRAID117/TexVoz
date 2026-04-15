'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './page.module.css'

const VOICES = [
  { id: 'es-MX-DaliaNeural',  label: 'Dalia — México (Mujer)'   },
  { id: 'es-MX-JorgeNeural',  label: 'Jorge — México (Hombre)'  },
  { id: 'es-ES-ElviraNeural', label: 'Elvira — España (Mujer)'  },
  { id: 'es-ES-AlvaroNeural', label: 'Álvaro — España (Hombre)' },
  { id: 'es-AR-ElenaNeural',  label: 'Elena — Argentina (Mujer)'},
  { id: 'es-US-PalomaNeural', label: 'Paloma — Latino (Mujer)'  },
]

const FREE_CHAR_LIMIT = 2000

// $10 MXN por cada 1000 caracteres, redondeado hacia arriba
function calcPrice(chars: number): number {
  return Math.ceil(chars / 1000) * 10
}

const FAQ = [
  { q:'¿Es gratis?', a:'Sí. Puedes generar y escuchar audios de hasta 2,000 caracteres sin pagar nada ni registrarte.' },
  { q:'¿Por qué hay anuncios?', a:'Los anuncios nos permiten mantener el servicio gratuito. El plan Pro los elimina.' },
  { q:'¿Qué es la marca de agua?', a:'Un audio corto al inicio que dice "Generado con VozEstudio.com". Desaparece si pagas por el audio.' },
  { q:'¿Puedo generar textos más largos?', a:'Sí. Si tu texto supera los 2,000 caracteres, puedes generar el audio completo pagando $10 MXN por cada 1,000 caracteres. El pago incluye descarga MP3 sin marca de agua.' },
  { q:'¿Qué incluye el Plan Pro?', a:'Sin anuncios, sin marca de agua, descargas ilimitadas, voces premium ElevenLabs y mayor calidad de audio por $99 MXN al mes.' },
  { q:'¿Qué formatos puedo descargar?', a:'Por ahora MP3. En versiones futuras agregaremos WAV y otros formatos.' },
]

export default function Home() {
  const [text, setText]             = useState('')
  const [voice, setVoice]           = useState(VOICES[0].id)
  const [speed, setSpeed]           = useState(1)
  const [loading, setLoading]       = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [audioUrl, setAudioUrl]     = useState<string | null>(null)
  const [status, setStatus]         = useState<{type:string; msg:string}>({type:'', msg:''})
  const [generated, setGenerated]   = useState(false)
  const [openFaq, setOpenFaq]       = useState<number|null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const charCount  = text.length
  const isPaid     = charCount > FREE_CHAR_LIMIT
  const price      = calcPrice(charCount)

  useEffect(() => {
    if (status.type === 'error') {
      const t = setTimeout(() => setStatus({type:'', msg:''}), 4000)
      return () => clearTimeout(t)
    }
  }, [status])

  function scrollToGenerator() {
    document.getElementById('generador')?.scrollIntoView({behavior:'smooth'})
  }

  function previewVoice() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (previewing) { window.speechSynthesis.cancel(); setPreviewing(false); return }
    const allVoices = window.speechSynthesis.getVoices()
    const esVoice = allVoices.find(v => v.lang.startsWith('es')) || allVoices[0] || null
    const u = new SpeechSynthesisUtterance('Hola, así suena esta voz. ¿Te gusta para tus estudios?')
    u.lang = 'es-MX'
    if (esVoice) u.voice = esVoice
    u.rate = speed
    setPreviewing(true)
    u.onend  = () => setPreviewing(false)
    u.onerror = () => setPreviewing(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }

  async function handleGenerate() {
    if (!text.trim()) { setStatus({type:'error', msg:'Escribe o pega algo de texto primero'}); return }

    setLoading(true)
    setStatus({type:'loading', msg:'Generando tu audio...'})
    setAudioUrl(null)
    setGenerated(false)

    try {
      const res = await fetch('/api/tts', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({text, voice, speed, paid: isPaid}),
      })
      if (!res.ok) {
        const data = await res.json().catch(()=>({}))
        throw new Error(data?.error || 'Error generando audio')
      }
      const blob = await res.blob()
      setAudioUrl(URL.createObjectURL(blob))
      setGenerated(true)
      setStatus({type:'success', msg: isPaid ? '✅ ¡Audio listo! Descárgalo abajo' : '✅ ¡Audio listo! Escúchalo abajo'})
    } catch (e:unknown) {
      setStatus({type:'error', msg: e instanceof Error ? e.message : 'Error desconocido'})
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>

      {/* ── NAV ── */}
      <nav className={styles.nav}>
        <div className={styles.logo}>
          <span className={styles.logoDot} />
          VozEstudio
        </div>
        <div className={styles.navPills}>
          <button className={`${styles.navPill} ${styles.navPillActive}`}
            onClick={() => window.scrollTo({top:0, behavior:'smooth'})}>Inicio</button>
          <button className={styles.navPill}
            onClick={() => document.getElementById('planes')?.scrollIntoView({behavior:'smooth'})}>Planes</button>
          <button className={styles.navPill}
            onClick={() => document.getElementById('como-funciona')?.scrollIntoView({behavior:'smooth'})}>Cómo funciona</button>
        </div>
      </nav>

      {/* ── LAYOUT CON ADS LATERALES (solo desktop >1100px) ── */}
      <div className={styles.pageLayout}>

        {/* AD IZQUIERDO sticky */}
        <aside className={styles.adSideLeft}>
          <div className={styles.adSideBox}>
            <span className={styles.adSideLabel}>Publicidad</span>
            <span className={styles.adSideDim}>300 × 600</span>
            <span className={styles.adSideNote}>AdSense</span>
          </div>
        </aside>

        {/* CONTENIDO CENTRAL */}
        <div className={styles.pageCenter}>

      {/* ── HERO ── */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>🎧 Para estudiantes hispanohablantes</div>
        <h1 className={styles.heroTitle}>
          Convierte cualquier texto<br />
          <em>en audio en segundos</em> 🎧
        </h1>
        <p className={styles.heroSub}>
          Pega tu tarea, apuntes o ese librote de actividades y escúchalo
          mientras haces otra cosa. Sin registro. Sin complicaciones.
        </p>
      </section>

      {/* ── GENERADOR ── */}
      <main className={styles.mainCard} id="generador">

        <div className={styles.controlsGrid}>
          <div className={styles.ctrlGroup}>
            <label className={styles.ctrlLabel}>🗣️ Elige una voz</label>
            <div className={styles.voiceRow}>
              <select className={styles.select} value={voice} onChange={e => setVoice(e.target.value)}>
                {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              <button className={`${styles.btnPreview} ${previewing ? styles.btnPreviewOn : ''}`} onClick={previewVoice}>
                {previewing ? '⏹ Detener' : '🔊 Probar'}
              </button>
            </div>
          </div>
          <div className={styles.ctrlGroup}>
            <label className={styles.ctrlLabel}>
              ⚡ Velocidad — <span className={styles.speedVal}>{speed.toFixed(1)}×</span>
            </label>
            <input type="range" min={0.5} max={2} step={0.1} value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))} className={styles.range} />
          </div>
        </div>

        {/* TEXTAREA — sin límite de escritura */}
        <div className={styles.textareaWrap}>
          <textarea
            className={`${styles.textarea} ${isPaid ? styles.textareaPaid : ''}`}
            placeholder="Pega aquí tu texto, tarea, apuntes o lo que quieras escuchar... (sin límite de escritura)"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className={styles.charRow}>
            <span className={`${styles.charCount} ${isPaid ? styles.charPaid : ''}`}>
              {charCount.toLocaleString('es')} caracteres
            </span>
            {/* TEXTO DINÁMICO SEGÚN CARACTERES */}
            {charCount === 0 ? (
              <span className={styles.charTag}>Gratis hasta 2,000 · 3 usos/día</span>
            ) : !isPaid ? (
              <span className={styles.charTagFree}>✅ Gratis: puedes escucharlo sin pagar (con anuncios)</span>
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

        {/* BOTÓN DINÁMICO */}
        <div className={styles.actionRow}>
          <button
            className={isPaid ? styles.btnGeneratePaid : styles.btnGenerate}
            onClick={handleGenerate}
            disabled={loading || charCount === 0}
          >
            {loading
              ? <><span className={styles.btnSpinner} /> Generando audio...</>
              : isPaid
                ? `💳 Generar + Descargar por $${price} MXN`
                : '🎧 Generar audio gratis'
            }
          </button>
        </div>

        {/* AD DEBAJO DEL BOTÓN — aparece al generar */}
        {(loading || generated) && (
          <div className={styles.adBelowBtn}>
            <span className={styles.adInlineLabel}>Publicidad mostrada después de generar audio</span>
          </div>
        )}

        {generated && audioUrl && (
          <div className={styles.resultBox}>
            <div className={styles.resultHeader}>
              <div className={styles.waveBars}><span/><span/><span/><span/><span/></div>
              <span className={styles.resultLabel}>Audio generado con VozEstudio.com</span>
            </div>
            <div className={styles.audioWrap}>
              <audio ref={audioRef} src={audioUrl} controls className={styles.audioPlayer} />
            </div>
            {!isPaid && (
              <>
                <div className={styles.adBox}>
                  <span className={styles.adLabel}>Publicidad</span>
                  <div className={styles.adSlot}>
                    <div className={styles.adSlotInner}>
                      <span className={styles.adSlotTitle}>Publicidad</span>
                      <span className={styles.adSlotDim}>728×90 · 300×250</span>
                      <span className={styles.adSlotNote}>Banner AdSense</span>
                    </div>
                  </div>
                </div>
                <div className={styles.upsellBox}>
                  <div className={styles.upsellText}>
                    <strong>¿Quieres descargarlo sin marca de agua?</strong>
                    <span>Descarga este audio en MP3 limpio por solo <strong>${calcPrice(charCount)} MXN</strong></span>
                  </div>
                  <button className={styles.btnBuy}>⬇️ Descargar ${calcPrice(charCount)} MXN</button>
                </div>
              </>
            )}
            {isPaid && (
              <div className={styles.downloadBox}>
                <p className={styles.downloadMsg}>✅ Pago incluido · Sin marca de agua</p>
                <button className={styles.btnDownloadFull}>⬇️ Descargar MP3 — ${price} MXN</button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── PLUS SECTION ── */}
      <section className={styles.plusSection}>
        <div className={styles.plusBadge}>✨ Función Plus</div>
        <h2 className={styles.plusTitle}>
          Archivo{' '}
          <span style={{fontWeight:400, fontSize:'0.82em', color:'#9090aa'}}>(PDF, Word y TXT)</span>
        </h2>
        <div className={styles.plusCards}>
          <div className={styles.plusCard}>
            <div className={styles.plusCardIcon}>🧠</div>
            <div className={styles.plusCardTitle}>Te lo explicamos fácil</div>
            <div className={styles.plusCardDesc}>
              Sube un contrato, una demanda, un reglamento o cualquier documento difícil.
              Nuestra IA lo traduce a un lenguaje que todos entienden — sin tecnicismos,
              sin burocracia, sin rodeos.
            </div>
            <div className={styles.plusCardExamples}>
              <span>📄 Contratos</span>
              <span>⚖️ Demandas</span>
              <span>🏢 Reglamentos</span>
              <span>🏥 Recetas médicas</span>
            </div>
            <button className={styles.btnPlus} disabled>🔜 Próximamente</button>
          </div>
          <div className={styles.plusCard}>
            <div className={styles.plusCardIcon}>🎧</div>
            <div className={styles.plusCardTitle}>Escucha tu documento</div>
            <div className={styles.plusCardDesc}>
              Después de que la IA lo explique, conviértelo en audio con un clic.
              El precio es el mismo: $10 MXN por cada 1,000 caracteres. Incluye descarga MP3.
            </div>
            <div className={styles.plusCardExamples}>
              <span>📃 PDF</span>
              <span>📝 Word</span>
              <span>🗒️ TXT</span>
            </div>
            <button className={styles.btnPlus} disabled>🔜 Próximamente</button>
          </div>
        </div>
        <div className={styles.plusDisclaimer}>
          ⚠️ <strong>Aviso importante:</strong> Las explicaciones generadas por nuestra IA
          son orientativas y están pensadas para facilitar la comprensión de documentos.{' '}
          <strong>No constituyen asesoramiento legal, médico ni profesional de ningún tipo.</strong>{' '}
          Si necesitas orientación oficial, consulta a un profesional calificado.
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section className={styles.howSection} id="como-funciona">
        <div className={styles.sectionBadge}>⚡ Simple y rápido</div>
        <h2 className={styles.sectionTitle}>Cómo funciona</h2>
        <div className={styles.stepsGrid}>
          {[
            { n:'1', icon:'📋', title:'Pega tu texto',              desc:'Copia y pega cualquier texto, apunte, tarea o documento. Sin límite de escritura.' },
            { n:'2', icon:'🗣️', title:'Elige voz y velocidad',      desc:'Selecciona la voz en español que más te guste y ajusta la velocidad.' },
            { n:'3', icon:'🎧', title:'Genera tu audio gratis',     desc:'Textos de hasta 2,000 caracteres son gratis. El sitio te indica el precio si es más largo.' },
            { n:'4', icon:'⬇️', title:'Descarga sin marca de agua', desc:'¿Lo quieres en MP3 limpio? El pago desbloquea el audio completo y la descarga.' },
          ].map(s => (
            <div key={s.n} className={styles.stepCard}>
              <div className={styles.stepNum}>{s.n}</div>
              <div className={styles.stepIcon}>{s.icon}</div>
              <div className={styles.stepTitle}>{s.title}</div>
              <div className={styles.stepDesc}>{s.desc}</div>
            </div>
          ))}
        </div>
        <p className={styles.howUses}>
          Ideal para <strong>tareas, apuntes, TikTok, audiolibros, manuales y trabajo.</strong>
        </p>
        <button className={styles.btnCta} onClick={scrollToGenerator}>🎧 Probar ahora gratis</button>

        {/* FAQ */}
        <div className={styles.faqWrap}>
          <h3 className={styles.faqTitle}>Preguntas frecuentes</h3>
          <div className={styles.faqList}>
            {FAQ.map((f, i) => (
              <div key={i} className={styles.faqItem} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                <div className={styles.faqQ}>
                  <span>{f.q}</span>
                  <span className={`${styles.faqArrow} ${openFaq === i ? styles.faqArrowOpen : ''}`}>▼</span>
                </div>
                {openFaq === i && <div className={styles.faqA}>{f.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANES ── */}
      <section className={styles.planesSection} id="planes">
        <div className={styles.sectionBadge}>💎 Sin sorpresas</div>
        <h2 className={styles.sectionTitle}>Planes</h2>
        <p className={styles.sectionSub}>Empieza gratis, paga solo si quieres más.</p>

        <div className={styles.planesGrid}>
          {/* GRATIS */}
          <div className={styles.planCard}>
            <div className={styles.planHeader}>
              <span className={styles.planEmoji}>🟩</span>
              <div>
                <div className={styles.planName}>Gratis</div>
                <div className={styles.planPrice}>$0 <span>/ siempre</span></div>
              </div>
            </div>
            <p className={styles.planDesc}>Perfecto para estudiar y escuchar textos sin pagar.</p>
            <ul className={styles.planList}>
              {['3 audios por día','Hasta 2,000 caracteres por audio','Voces estándar de alta calidad','Escucha en línea','Incluye anuncios','Audio con marca de agua'].map((b,i) =>
                <li key={i}><span className={styles.checkFree}>✓</span>{b}</li>)}
            </ul>
            <button className={styles.btnPlanFree} onClick={scrollToGenerator}>🎧 Probar Gratis</button>
          </div>

          {/* PRO */}
          <div className={`${styles.planCard} ${styles.planCardPro}`}>
            <div className={styles.planBestBadge}>⭐ Recomendado</div>
            <div className={styles.planHeader}>
              <span className={styles.planEmoji}>💎</span>
              <div>
                <div className={styles.planName}>PRO</div>
                <div className={`${styles.planPrice} ${styles.planPricePro}`}>$99 MXN <span>/ mes</span></div>
              </div>
            </div>
            <p className={styles.planDesc}>Para quien usa VozEstudio todos los días.</p>
            <ul className={styles.planList}>
              {['Sin anuncios','Descargas ilimitadas','Más caracteres diarios','Voces premium de IA','Sin marca de agua','Mejor calidad de audio'].map((b,i) =>
                <li key={i}><span className={styles.checkPro}>✓</span>{b}</li>)}
            </ul>
            <button className={styles.btnPlanPro}>⭐ Quiero PRO</button>
          </div>
        </div>

        {/* PAGO POR AUDIO */}
        <div className={styles.payPerCard}>
          <div className={styles.payPerHeader}>
            <span style={{fontSize:'28px', flexShrink:0}}>💰</span>
            <div>
              <div className={styles.payPerTitle}>Pago por audio (descarga incluida)</div>
              <div className={styles.payPerSub}>
                Escucha gratis hasta 2,000 caracteres. Si tu texto es más largo, puedes
                generar el audio completo pagando según el tamaño.{' '}
                <strong>Incluye descarga MP3 sin marca de agua.</strong>
              </div>
            </div>
          </div>
          <div className={styles.payPerTable}>
            <div className={styles.payPerTableHead}>
              <span>Tamaño del texto</span>
              <span>Precio total</span>
            </div>
            {[
              ['Hasta 1,000 caracteres','$10 MXN'],
              ['Hasta 2,000 caracteres','$20 MXN'],
              ['Hasta 3,000 caracteres','$30 MXN'],
              ['Hasta 4,000 caracteres','$40 MXN'],
              ['Hasta 5,000 caracteres','$50 MXN'],
            ].map(([chars, price], i) => (
              <div key={i} className={`${styles.payPerRow} ${i%2===0 ? styles.payPerRowAlt : ''}`}>
                <span>{chars}</span>
                <span className={styles.payPerPrice}>{price}</span>
              </div>
            ))}
          </div>
          <p className={styles.payPerNote}>$10 MXN por cada 1,000 caracteres · Sin suscripción · Solo pagas cuando quieres</p>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <div className={styles.features}>
        {[
          { icon:'🎧', title:'Escucha gratis',          desc:'Hasta 2,000 caracteres sin registrarte ni pagar.' },
          { icon:'🇲🇽', title:'Voces en español',       desc:'México, España, Argentina y más.' },
          { icon:'⚡',  title:'Sin registro',            desc:'Entra, pega y listo.' },
          { icon:'⬇️', title:'Textos largos con pago',  desc:'$10 MXN por cada 1,000 chars. Descarga incluida.' },
        ].map((f,i) => (
          <div key={i} className={styles.featCard}>
            <span className={styles.featIcon}>{f.icon}</span>
            <div className={styles.featTitle}>{f.title}</div>
            <div className={styles.featDesc}>{f.desc}</div>
          </div>
        ))}
      </div>

        </div>{/* fin pageCenter */}

        {/* AD DERECHO sticky */}
        <aside className={styles.adSideRight}>
          <div className={styles.adSideBox}>
            <span className={styles.adSideLabel}>Publicidad</span>
            <span className={styles.adSideDim}>300 × 600</span>
            <span className={styles.adSideNote}>AdSense</span>
          </div>
        </aside>

      </div>{/* fin pageLayout */}

      <footer className={styles.footer}>
        VozEstudio © 2025 · Hecho para estudiantes hispanohablantes 🫶
      </footer>
    </div>
  )
}
