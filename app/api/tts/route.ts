import { NextRequest, NextResponse } from 'next/server'

// PASO 1 — Placeholder. Responde OK.
// En el Paso 2 conectaremos los proveedores reales (Azure, Google, Amazon).

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { text, voice, speed } = body

  // Validaciones básicas
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Texto requerido' }, { status: 400 })
  }

  // Sin límite duro aquí — la lógica de pago se maneja en el frontend
  // En Paso 2 validaremos según plan (gratis vs pagado)

  // TODO Paso 2: conectar proveedores reales
  console.log('[TTS] Recibido:', { chars: text.length, voice, speed })

  return NextResponse.json({ ok: true, message: 'Endpoint listo — Paso 1 completo' })
}
