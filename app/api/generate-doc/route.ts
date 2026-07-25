// app/api/generate-doc/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import { PDFDocument, StandardFonts } from 'pdf-lib'

export const runtime = 'nodejs'

// Solo deja caracteres que Helvetica puede renderizar
function sanitizeText(text: string): string {
  return text.split('').filter(c => {
    const code = c.charCodeAt(0)
    return (code >= 0x20 && code <= 0xFF) || code === 0x0A || code === 0x0D
  }).join('')
}

// Solo deja ASCII para nombres de archivo en headers HTTP
function sanitizeFileName(name: string): string {
  return (name || 'documento')
    .split('').filter(c => c.charCodeAt(0) < 128)
    .join('')
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
    .trim() || 'documento'
}

function toArrayBuffer(buf: Buffer | Uint8Array): ArrayBuffer {
  return (buf.buffer as ArrayBuffer).slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

export async function POST(req: NextRequest) {
  try {
    const { text, format, fileName } = await req.json()

    if (!text || !format) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const safeName = sanitizeFileName(fileName)

    // ── TXT ────────────────────────────────────────────────
    if (format === 'txt') {
      return new Response(
        new Blob([text], { type: 'text/plain; charset=utf-8' }),
        {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${safeName}.txt"`,
          },
        }
      )
    }

    // ── DOCX ───────────────────────────────────────────────
    if (format === 'docx') {
      const paragraphs = text.split('\n').map(
        (line: string) =>
          new Paragraph({ children: [new TextRun({ text: line, size: 24 })] })
      )
      const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] })
      const docxBuffer = await Packer.toBuffer(doc)

      return new Response(
        new Blob([toArrayBuffer(docxBuffer)], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
        {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${safeName}.docx"`,
          },
        }
      )
    }

    // ── PDF ────────────────────────────────────────────────
    if (format === 'pdf') {
      const cleanText = sanitizeText(text)

      const pdfDoc = await PDFDocument.create()
      const font   = await pdfDoc.embedFont(StandardFonts.Helvetica)

      const fontSize   = 12
      const margin     = 50
      const lineHeight = 20

      let page = pdfDoc.addPage()
      let { width, height } = page.getSize()
      let y = height - margin

      for (const paragraph of cleanText.split('\n')) {
        const words = paragraph.split(' ')
        let currentLine = ''

        for (const word of words) {
          const testLine  = currentLine ? `${currentLine} ${word}` : word
          const lineWidth = font.widthOfTextAtSize(testLine, fontSize)

          if (lineWidth > width - margin * 2 && currentLine) {
            if (y < margin + lineHeight) {
              page = pdfDoc.addPage()
              y = page.getSize().height - margin
            }
            page.drawText(currentLine, { x: margin, y, size: fontSize, font })
            y -= lineHeight
            currentLine = word
          } else {
            currentLine = testLine
          }
        }

        if (currentLine) {
          if (y < margin + lineHeight) {
            page = pdfDoc.addPage()
            y = page.getSize().height - margin
          }
          page.drawText(currentLine, { x: margin, y, size: fontSize, font })
          y -= lineHeight
        }

        y -= 6
      }

      const pdfBytes = await pdfDoc.save()

      return new Response(
        new Blob([toArrayBuffer(pdfBytes)], { type: 'application/pdf' }),
        {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
          },
        }
      )
    }

    return NextResponse.json({ error: 'Formato no soportado' }, { status: 400 })

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('❌ generate-doc error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}