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
    let docxManualBreakCount = 0

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

      // .doc (binario OLE2 legado) no es un ZIP — no se intenta abrir. Solo
      // .docx tiene la estructura ZIP/XML de la que se pueden leer señales
      // de paginación. Se abre el ZIP una sola vez y se reutiliza para las
      // tres búsquedas (Pages, lastRenderedPageBreak, saltos manuales).
      if (name.endsWith('.docx')) {
        try {
          const JSZip = (await import('jszip')).default
          const zip = await JSZip.loadAsync(buffer)
          const appXml = await zip.file('docProps/app.xml')?.async('string')
          const docXml = await zip.file('word/document.xml')?.async('string')

          const pagesMatch = appXml?.match(/<Pages>(\d+)<\/Pages>/)
          const declaredPages = pagesMatch ? parseInt(pagesMatch[1], 10) : 0

          if (declaredPages > 0) {
            // <Pages> es un dato cacheado por Word/LibreOffice la última vez
            // que guardó el archivo (no un recálculo en vivo) — cuando existe
            // es la fuente preferida de paginación para esta etapa.
            totalPages = declaredPages
          } else {
            const rendered = docXml?.match(/<w:lastRenderedPageBreak\s*\/?>/g)
            if (rendered && rendered.length > 0) {
              // Mismo tipo de dato cacheado que <Pages>, del último render de
              // Word — fuente preferida cuando existe, por encima del
              // estimado por caracteres.
              totalPages = rendered.length + 1
            } else if (docXml) {
              // Saltos manuales: nunca sustituyen el total por sí solos (un
              // documento puede tener muchas páginas de flujo normal y solo
              // 1-2 saltos manuales) — se guardan para usarse únicamente
              // como piso mínimo del fallback por caracteres, más abajo.
              const manualBreaks = docXml.match(/<w:br[^>]*w:type="page"[^>]*\/?>/g)
              docxManualBreakCount = manualBreaks ? manualBreaks.length : 0
            }
          }
        } catch {
          // ZIP/XML inesperado (docx corrupto o atípico) -> totalPages queda
          // en 0, cae al fallback por caracteres más abajo, sin romper la
          // extracción del texto en sí (ya se obtuvo arriba con mammoth).
        }
      }
    } else {
      return NextResponse.json(
        { error: 'Formato no soportado. Usa PDF, DOCX o TXT.' },
        { status: 400 }
      )
    }

    // Limpiar espacios
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

    // Fallback por caracteres — para DOCX sin señales internas, DOC legado y
    // TXT (PDF ya tiene totalPages real de unpdf, nunca entra aquí). Los
    // saltos manuales de DOCX (si se detectaron arriba) solo actúan como piso
    // mínimo, nunca reemplazan este cálculo por sí solos.
    if (totalPages === 0 && !name.endsWith('.pdf')) {
      const charFallback = Math.max(1, Math.ceil(text.length / 2000))
      const manualMinimum = docxManualBreakCount > 0 ? docxManualBreakCount + 1 : 0
      totalPages = Math.max(charFallback, manualMinimum)
    }

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