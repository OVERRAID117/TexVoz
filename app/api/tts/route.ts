
import { NextRequest, NextResponse } from 'next/server'
import TextToSpeech from '@google-cloud/text-to-speech'
import { Redis } from '@upstash/redis'

// ── Upstash Redis ──────────────────────────────────────────────────────────
const redis = Redis.fromEnv()

const DAILY_LIMIT = 3
const COOLDOWN_SECONDS = 20

function getClient() {
  const raw = process.env.GCP_CREDENTIALS
  if (!raw) throw new Error('GCP_CREDENTIALS no está definida')

  const credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
  return new TextToSpeech.TextToSpeechClient({ credentials })
}

// ── Voces permitidas ────────────────────────────────────────────────────────
const ALLOWED_VOICES = [
  'es-US-Neural2-A',
  'es-US-Neural2-B',
  'es-ES-Neural2-A',
  'es-ES-Neural2-F',
  'es-US-News-F',
  'es-US-News-D',
  'es-ES-Standard-A',
  'es-ES-Standard-B',
]
const DEFAULT_VOICE = 'es-US-Neural2-A'

// ── Obtener IP real ─────────────────────────────────────────────────────────
function getIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

// ── POST /api/tts ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { text?: string; voice?: string; speed?: number; paid?: boolean }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }

  const { text, voice, speed = 1.0, paid = false } = body

  // ── Validaciones ─────────────────────────────────────────────────────────
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'El texto es obligatorio' }, { status: 400 })
  }

  const MAX_CHARS = paid ? 5000 : 2000
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Texto demasiado largo. Máximo ${MAX_CHARS} caracteres.` },
      { status: 400 }
    )
  }

  if (typeof speed !== 'number' || speed < 0.5 || speed > 2.0) {
    return NextResponse.json(
      { error: 'La velocidad debe estar entre 0.5 y 2.0' },
      { status: 400 }
    )
  }

  // ── Selección de voz ─────────────────────────────────────────────────────
  const selectedVoice = voice && ALLOWED_VOICES.includes(voice) ? voice : DEFAULT_VOICE
  const languageCode = selectedVoice.slice(0, 5)

  // ── LÍMITE POR IP (solo gratis) ──────────────────────────────────────────
  const ip = getIp(req)
  const today = new Date().toISOString().slice(0, 10)

  const keyDaily = `vozestudio:daily:${ip}:${today}`
  const keyCooldown = `vozestudio:cooldown:${ip}`

  if (!paid) {
    // cooldown
    const cooldown = await redis.get<number>(keyCooldown)
    if (cooldown) {
      return NextResponse.json(
        {
          error: `⏳ Espera ${COOLDOWN_SECONDS} segundos antes de generar otro audio.`,
        },
        { status: 429 }
      )
    }

    // daily uses
    const used = (await redis.get<number>(keyDaily)) || 0
    if (used >= DAILY_LIMIT) {
      return NextResponse.json(
        {
          error:
            '🚫 Ya usaste tus 3 audios gratis hoy. Vuelve mañana o desbloquea PRO 💎',
        },
        { status: 429 }
      )
    }

    // activar cooldown (NO incrementamos todavía)
    await redis.set(keyCooldown, 1, { ex: COOLDOWN_SECONDS })
  }

  // ── Generar audio con Google ─────────────────────────────────────────────
  try {
    const client = getClient()

    const [response] = await client.synthesizeSpeech({
      input: { text: text.trim() },
      voice: { languageCode, name: selectedVoice },
      audioConfig: { audioEncoding: 'MP3', speakingRate: speed },
    })

    if (!response.audioContent) {
      return NextResponse.json(
        { error: 'No se pudo generar el audio. Intenta de nuevo.' },
        { status: 502 }
      )
    }

    const audioBuffer = Buffer.from(response.audioContent as Uint8Array)

    // ── SI ES GRATIS Y SALIÓ BIEN → sumar uso diario ───────────────────────
    if (!paid) {
      await redis.incr(keyDaily)
      await redis.expire(keyDaily, 60 * 60 * 24 * 2) // 2 días
    }

    // PAGADO = descarga
    if (paid) {
      return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': 'attachment; filename="vozestudio.mp3"',
          'Content-Length': audioBuffer.length.toString(),
          'Cache-Control': 'no-store',
        },
      })
    }

    // GRATIS = solo reproducir
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: unknown) {
    console.error('[TTS Error]', err)
    return NextResponse.json(
      { error: '⚠️ Error generando audio. Intenta otra vez en unos segundos.' },
      { status: 500 }
    )
  }
}
