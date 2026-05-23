'use client'
 
import { useState, useEffect } from 'react'
import styles from './FileWizard.module.css'
 
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
  { label: '🧠  Explicar fácil',     desc: 'Explicaciones claras y paso a paso.' },
  { label: '📌  Resumir',            desc: 'Resumen directo, corto y claro del contenido.'         },
  { label: '✍️  Corregir y mejorar texto',desc: 'Para borradores, cuentos o tareas.' },
  { label: '📚  Extraer puntos clave',desc: 'Convierte a un lenguaje más simple.' },
]
 
const EXTENSIONES = [
  { label: 'Corto', desc: 'Aprox. 25% del original', value: 0.25 },
  { label: 'Medio', desc: 'Aprox. 50% del original', value: 0.50 },
  { label: 'Largo', desc: 'Aprox. 75% del original', value: 0.75 },
]
 
// ── Constantes de precio ──────────────────────────────────────────────────
const PRICE_PER_1K_CHARS_AUDIO    = 10
const PRICE_PER_1K_CHARS_IA_INPUT = 5
const PRICE_PER_1K_CHARS_IA_OUTPUT = 5
 
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
 
const fileTypeIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf')  return '📄'
  if (ext === 'docx' || ext === 'doc') return '📝'
  return '🗒️'
}
 
// ── Componente ─────────────────────────────────────────────────────────────
export default function FileWizard() {
  const [step,      setStep]      = useState<Step>(1)
  const [file,      setFile]      = useState<File | null>(null)
  const [fileSize,  setFileSize]  = useState(0)
  const [charCount, setCharCount] = useState<number | null>(null)
  const [action,    setAction]    = useState<Action>('audio')
  const [iaMode,    setIaMode]    = useState(0)
  const [extension, setExtension] = useState(0.5)
  const [voice,     setVoice]     = useState(VOICES[0].id)
  const [speed,     setSpeed]     = useState(1)
  const [loading, setLoading] = useState(false)
 
  // Ajustar extensión según el modo seleccionado
  useEffect(() => {
    if (iaMode === 2) {
      setExtension(1.0)
    } else if (iaMode === 3) {
      setExtension(0.25)
    } else if (iaMode === 1 && extension === 0.75) {
      setExtension(0.5)
    }
  }, [iaMode])
  
  // ── Cálculos ──────────────────────────────────────────────────────────
  const baseChars     = charCount || 0
  const iaOutputChars = Math.floor(baseChars * (extension === 1.0 ? 1.0 : extension))
 
  const audioCost   = baseChars     > 0 ? Math.ceil(baseChars     / 1000) * PRICE_PER_1K_CHARS_AUDIO    : 0
  const iaInputCost = baseChars     > 0 ? Math.ceil(baseChars     / 1000) * PRICE_PER_1K_CHARS_IA_INPUT : 0
  const iaOutputCost= iaOutputChars > 0 ? Math.ceil(iaOutputChars / 1000) * PRICE_PER_1K_CHARS_IA_OUTPUT: 0
 
  let totalCost = 0
  if      (action === 'audio') totalCost = audioCost
  else if (action === 'ia')    totalCost = iaInputCost + iaOutputCost
  else                         totalCost = audioCost + iaInputCost + iaOutputCost
 
  const audioDuration  = formatDuration(baseChars,     speed)
 
  // ── Colores por acción ────────────────────────────────────────────────
  const actionColor = action === 'audio' ? '#7C3AED' : action === 'ia' ? '#059669' : '#F97316'
  const actionLabel = action === 'audio' ? 'Audio completo' : action === 'ia' ? 'Explicación' : 'Combo'
 
  // ── Cost card label en step 1 ─────────────────────────────────────────
  const costLabel =
    action === 'audio' ? '($10 MXN por cada 1,000 caracteres)' :
    action === 'ia'    ? '($5 MXN por cada 1,000 caracteres de texto de salida)' :
                         `(Explicación ${formatPrice(iaInputCost + iaOutputCost)} + Audio ${formatPrice(audioCost)})`
 
  // ── Handlers ──────────────────────────────────────────────────────────
  const handleUpload = async (selectedFile: File) => {
    setFile(selectedFile)
    const form = new FormData()
    form.append('file', selectedFile)
    const res  = await fetch('/api/extract-text', { method: 'POST', body: form })
    const data = await res.json()
    if (data.error) { alert(data.error); return }
    setCharCount(data.chars)
    setFileSize(data.size || selectedFile.size)
    setStep(2)
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

      if (extractData.error) {
        alert(extractData.error)
        setLoading(false)
        return
      }

      const originalText = extractData.text

      if (action === 'audio') {
        alert(`🎧 Audio generado con ${charCount} caracteres`)
        setLoading(false)
        return
      }

      let finalExtension = extension
      if (iaMode === 2) finalExtension = 1.0
      if (iaMode === 3) finalExtension = 0.25

      const iaRes = await fetch('/api/ia-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: originalText,
          mode: iaMode,
          extension: finalExtension,
        }),
      })

      const iaData = await iaRes.json()

      if (iaData.error) {
        alert(iaData.error)
        setLoading(false)
        return
      }

      // ============================================
      // SOLO IA - Preguntar formato y descargar
      // ============================================
      if (action === 'ia') {
        const format = window.prompt('¿En qué formato quieres descargar el resultado? (txt, docx, pdf)', 'txt')
        
        if (format === 'docx' || format === 'pdf' || format === 'txt') {
          const docRes = await fetch('/api/generate-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: iaData.result,
              format: format,
              fileName: `explicacion_${file.name.replace(/\.[^/.]+$/, '')}`,
            }),
          })
          
          const blob = await docRes.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `explicacion.${format}`
          a.click()
          URL.revokeObjectURL(url)
          
          alert(`✅ Texto explicado generado (${iaData.resultChars} caracteres) y descargado como ${format.toUpperCase()}`)
        } else {
          alert(`✅ Texto explicado generado (${iaData.resultChars} caracteres)\n\n${iaData.result.substring(0, 500)}...`)
        }
      } 
      // ============================================
      // AMBOS - Mostrar resumen
      // ============================================
      else {
        alert(`✅ Explicación generada (${iaData.resultChars} caracteres)\n🎧 Audio generado con ${charCount} caracteres`)
      }

    } catch (error) {
      console.error('Error:', error)
      alert('Error al procesar tu solicitud')
    } finally {
      setLoading(false)
    }
  }
 
  // ── Render ────────────────────────────────────────────────────────────
  return (
    <section className={styles.wizard}>
 
      {/* ── CABECERA ── */}
      <div className={styles.wizardHeader}>
        <span className={styles.badge}>⭐ Función Plus</span>
        <h2 className={styles.title}>
          Archivo <small className={styles.titleSub}>(PDF, Word o TXT)</small>
        </h2>
        <p className={styles.subtitle}>Elige qué quieres hacer con tu documento.</p>
      </div>
 
      {/* ── PASO 1: ARCHIVO ── */}
      <div className={styles.stepSection}>
        <div className={styles.stepHeader}>
          <div className={`${styles.stepCircle} ${step >= 1 ? styles.stepCircleActive : ''}`}>
            {step > 1 ? '✓' : '1'}
          </div>
          <h3 className={styles.stepTitle}>{step > 1 ? 'Tu archivo' : 'Sube tu documento'}</h3>
        </div>
 
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
            <div className={styles.fileCard}>
              <span className={styles.fileIcon}>{fileTypeIcon(file.name)}</span>
              <div>
                <p className={styles.fileName} title={file.name}>
                  {file.name.length > 30 ? file.name.substring(0, 27) + '...' : file.name}
                </p>
                <p className={styles.fileMeta}>
                  {fmtBytes(fileSize)} &nbsp;•&nbsp; {charCount?.toLocaleString('es-MX')} caracteres aprox.
                </p>
                <p className={styles.fileOk}>✅ Archivo cargado correctamente</p>
              </div>
            </div>
 
            <div className={styles.costCard}>
              <div className={styles.costCardIcon}>🏷️</div>
              <div>
                <p className={styles.costCardLabel}>Costo estimado</p>
                <p className={styles.costCardPrice} style={{ color: actionColor }}>
                  {formatPrice(totalCost)}
                </p>
                <p className={styles.costCardNote}>{costLabel}</p>
              </div>
            </div>
          </div>
        )}
 
        {step > 1 && (
          <p className={styles.secureNote}>🔒 Tu archivo está seguro. No almacenamos tu información.</p>
        )}
      </div>
 
      {/* ── PASO 2: ELEGIR SERVICIO ── */}
      {step >= 2 && (
        <div className={styles.stepSection}>
          <div className={styles.stepHeader}>
            <div className={`${styles.stepCircle} ${step >= 2 ? styles.stepCircleActive : ''}`}>
              {step > 2 ? '✓' : '2'}
            </div>
            <h3 className={styles.stepTitle}>¿Qué quieres hacer?</h3>
          </div>
          <p className={styles.stepSub}>Elige el servicio que necesitas. Tú decides.</p>
 
          <div className={styles.optionsGrid}>
            <div
              className={`${styles.optionCard} ${action === 'audio' ? styles.optionAudio : ''}`}
              onClick={() => setAction('audio')}
            >
              {action === 'audio' && <span className={styles.checkBadge}>✓</span>}
              <div className={`${styles.optionIcon} ${styles.iconAudio}`}>🎧</div>
              <strong>Escucha tu documento</strong>
              <p>Convertimos todo el documento en audio completo.</p>
              <span className={`${styles.optionPill} ${styles.pillAudio}`}>Audio completo</span>
            </div>
 
            <div
              className={`${styles.optionCard} ${action === 'ia' ? styles.optionIa : ''}`}
              onClick={() => setAction('ia')}
            >
              {action === 'ia' && <span className={styles.checkBadge}>✓</span>}
              <div className={`${styles.optionIcon} ${styles.iconIa}`}>🧠</div>
              <strong>Te lo explicamos fácil</strong>
              <p>Nuestra IA explica, resume y simplifica el contenido.</p>
              <span className={`${styles.optionPill} ${styles.pillIa}`}>Texto explicado</span>
            </div>
 
            <div
              className={`${styles.optionCard} ${action === 'ambos' ? styles.optionAmbos : ''}`}
              onClick={() => setAction('ambos')}
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
 
          <button className={styles.continueBtn} onClick={() => setStep(3)}>Continuar →</button>
        </div>
      )}
 
      {/* ── PASO 3: CONFIGURAR ── */}
      {step >= 3 && (
        <div className={styles.stepSection}>
          <div className={styles.stepHeader}>
            <div className={`${styles.stepCircle} ${styles.stepCircleActive}`}>3</div>
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
 
          {/* ── IA solo ── */}
          {action === 'ia' && (
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
                <div className={styles.includesBox}>
                  <p className={styles.includesTitle}>¿Qué incluye?</p>
                  {['Texto explicado por IA', 'Descarga en PDF o TXT (opcional)', 'Formato claro y listo para estudiar', 'Entrega rápida y segura'].map(t => (
                    <p key={t} className={styles.includesItem}>✓ {t}</p>
                  ))}
                </div>
              </div>
 
              <div className={styles.configBlock}>
                <p className={styles.configBlockTitle}>Extensión del resultado</p>
                
                {iaMode === 0 && (
                  <div className={styles.radioGroupV}>
                    {EXTENSIONES.map(e => (
                      <label key={e.value} className={`${styles.radioItem} ${extension === e.value ? styles.radioActive : ''}`}>
                        <input type="radio" name="ext" checked={extension === e.value} onChange={() => setExtension(e.value)} />
                        <div>
                          <strong>{e.label}</strong>
                          <p>{e.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {iaMode === 1 && (
                  <div className={styles.radioGroupV}>
                    {EXTENSIONES.filter(e => e.value !== 0.75).map(e => (
                      <label key={e.value} className={`${styles.radioItem} ${extension === e.value ? styles.radioActive : ''}`}>
                        <input type="radio" name="ext" checked={extension === e.value} onChange={() => setExtension(e.value)} />
                        <div>
                          <strong>{e.label}</strong>
                          <p>{e.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {iaMode === 2 && (
                  <div className={styles.correctionInfo}>
                    <div className={`${styles.radioItem} ${styles.radioActive}`}>
                      <input type="radio" checked={true} readOnly />
                      <div>
                        <strong>📝 Conservar tamaño original</strong>
                        <p>El texto será corregido y mejorado, manteniendo aproximadamente la misma extensión.</p>
                      </div>
                    </div>
                  </div>
                )}

                {iaMode === 3 && (
                  <div className={styles.radioGroupV}>
                    {EXTENSIONES.filter(e => e.value === 0.25).map(e => (
                      <label key={e.value} className={`${styles.radioItem} ${styles.radioActive}`}>
                        <input type="radio" checked={true} readOnly />
                        <div>
                          <strong>{e.label}</strong>
                          <p>{e.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                <div className={styles.charEstimate}>
                  <p className={styles.charEstLabel}>Aprox. cuántos caracteres quedarán:</p>
                  <p className={styles.charEstVal}>{iaOutputChars.toLocaleString('es-MX')} caracteres aprox.</p>
                  <p className={styles.charEstNote}>(Puede variar según el modo de explicación elegido)</p>
                </div>

                <div className={styles.costBlock}>
                  <p className={styles.costBlockLabel}>Costo del texto explicado</p>
                  <p className={styles.costBlockVal} style={{ color: '#059669' }}>{formatPrice(iaInputCost + iaOutputCost)}</p>
                  <p className={styles.costBlockNote}>($5 MXN por cada 1,000 caracteres de texto de salida)</p>
                </div>
              </div>
            </div>
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
                  <select className={styles.select} value={extension} onChange={e => setExtension(+e.target.value)}>
                    {iaMode === 0 && (
                      <>
                        <option value={0.25}>Corto (Aprox. 25% del original)</option>
                        <option value={0.5}>Medio (Aprox. 50% del original)</option>
                        <option value={0.75}>Largo (Aprox. 75% del original)</option>
                      </>
                    )}
                    {iaMode === 1 && (
                      <>
                        <option value={0.25}>Corto (Aprox. 25% del original)</option>
                        <option value={0.5}>Medio (Aprox. 50% del original)</option>
                      </>
                    )}
                    {iaMode === 2 && (
                      <option value={1.0} selected>📝 Conservar tamaño original</option>
                    )}
                    {iaMode === 3 && (
                      <option value={0.25} selected>Corto (Aprox. 25% del original) </option>
                    )}
                  </select>
                  
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
 
          <div className={styles.payNote}>
            🔒 Para generar {action === 'ia' ? 'la explicación' : action === 'audio' ? 'el audio' : 'la explicación y el audio'} necesitas pagar primero.<br />
            Así protegemos tu información y tu pedido.
          </div>
 
          <button
            className={styles.payBtn}
            style={{ background: actionColor }}
            onClick={handlePayAndGenerate}
            disabled={loading}
          >
            {loading ? (
              <>⏳ Procesando... </>
            ) : (
              <>🔒 Pagar y generar {action === 'audio' ? 'audio' : action === 'ia' ? 'explicación' : 'explicación + audio'}</>
            )}
            <span className={styles.payBtnSub}>Pago 100% seguro</span>
          </button>
 
          <div className={styles.trustRow}>
            {[
              { icon:'🛡️', title:'Seguro y privado',  desc:'Tus archivos no se guardan ni se comparten.' },
              { icon:'⚡', title:'Rápido y potente',   desc:'IA avanzada + vocablos naturales de alta calidad.' },
              { icon:'🔓', title:'Tú tienes el control',desc:'Eliges qué hacer y cuánto quieres pagar.' },
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
 
          <div className={styles.disclaimer}>
            ⚠️ <strong>Aviso importante:</strong> Las explicaciones generadas por nuestra IA son orientativas.{' '}
            <strong>No constituyen asesoramiento legal, médico ni profesional.</strong>
          </div>
        </div>
      )}
    </section>
  )
}