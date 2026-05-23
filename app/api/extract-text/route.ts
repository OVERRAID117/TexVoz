export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData   = await req.formData()
    const file       = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Archivo demasiado grande. Máximo 50 MB.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)
    const name        = file.name.toLowerCase()
    let   text        = ''

    // ── TXT ────────────────────────────────────────────────────────────────
    if (name.endsWith('.txt')) {
      text = buffer.toString('utf-8')

    // ── PDF ────────────────────────────────────────────────────────────────
    } else if (name.endsWith('.pdf')) {
      /*
       *  unpdf es la alternativa correcta a pdf-parse para Next.js App Router.
       *  pdf-parse carga pdfjs-dist internamente → rompe con DOMMatrix en Node.
       *  unpdf fue diseñada para funcionar en Node, Edge y Vercel sin APIs del browser.
       *  npm install unpdf
       */
      const { getDocumentProxy, extractText } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer))
      const { text: extracted } = await extractText(pdf, { mergePages: true })
      text = extracted

    // ── DOCX / DOC ─────────────────────────────────────────────────────────
    } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
      /*
       *  mammoth funciona perfecto en Node sin problemas de browser.
       *  npm install mammoth
       */
      const mammoth = await import('mammoth')
      const result  = await mammoth.extractRawText({ buffer })
      text = result.value

    } else {
      return NextResponse.json(
        { error: 'Formato no soportado. Usa PDF, DOCX o TXT.' },
        { status: 400 }
      )
    }

    // Limpiar espacios
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

    return NextResponse.json({
      text,
      chars: text.length,
      name:  file.name,
      size:  file.size,
    })

  } catch (err: unknown) {
    console.error('[extract-text ERROR]', err)
    return NextResponse.json(
      { error: 'Error procesando el archivo. Intenta de nuevo.' },
      { status: 500 }
    )
  }
}
