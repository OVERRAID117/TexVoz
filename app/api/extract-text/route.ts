export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Archivo demasiado grande. Máximo 50 MB.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const name = file.name.toLowerCase()
    let text = ''
    let isScanned = false
    let totalPages = 0
    let textPages = 0
    let scannedPages = 0

    // ── TXT ────────────────────────────────────────────────────────────────
    if (name.endsWith('.txt')) {
      text = buffer.toString('utf-8')
    }
    // ── PDF ────────────────────────────────────────────────────────────────
    else if (name.endsWith('.pdf')) {
      const { getDocumentProxy, extractText } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer))
      const { text: pages } = await extractText(pdf, { mergePages: false })

      totalPages = pages.length
      // Detectar cuántas páginas tienen menos de 50 caracteres no-blancos
      scannedPages = pages.filter((p: string) => p.replace(/\s/g, '').length < 50).length
      textPages = totalPages - scannedPages
      isScanned = scannedPages === totalPages  // todas las páginas son escaneadas

      text = pages
        .map((pageText: string, pageIndex: number) => {
          const lines = pageText
            .split('\n')
            .map((line, lineIndex) => {
              const clean = line.trim()
              if (!clean) return ''
              return `[P${pageIndex + 1}-L${lineIndex + 1}] ${clean}`
            })
            .filter(Boolean)
            .join('\n')
          return `\n--- PAGINA ${pageIndex + 1} ---\n${lines}`
        })
        .join('\n\n')
    }
    // ── DOCX / DOC ─────────────────────────────────────────────────────────
    else if (name.endsWith('.docx') || name.endsWith('.doc')) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else {
      return NextResponse.json(
        { error: 'Formato no soportado. Usa PDF, DOCX o TXT.' },
        { status: 400 }
      )
    }

    // Limpiar espacios
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

    console.log('PDF escaneado:', isScanned)

    return NextResponse.json({
      text,
      chars: text.length,
      name: file.name,
      size: file.size,
      isScanned,
      totalPages,
      textPages,
      scannedPages,
    })
  } catch (err: unknown) {
    console.error('[extract-text ERROR]', err)
    return NextResponse.json(
      { error: 'Error procesando el archivo. Intenta de nuevo.' },
      { status: 500 }
    )
  }
}