import { NextRequest, NextResponse } from 'next/server'
import { Document, Packer, Paragraph, TextRun } from 'docx'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { text, format, fileName } = await req.json()

    if (!text || !format) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    // TXT
    if (format === 'txt') {
      return new NextResponse(text, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="${fileName || 'documento'}.txt"`,
        },
      })
    }

    // DOCX
    if (format === 'docx') {
      const lines: string[] = text.split('\n')
      const doc = new Document({
        sections: [{
          properties: {},
          children: lines.map((line: string) => 
            new Paragraph({
              children: [new TextRun(line)],
            })
          ),
        }],
      })

      const buffer = await Packer.toBuffer(doc)
      
      // Convertir Buffer a Uint8Array para NextResponse
      const uint8Array = new Uint8Array(buffer)
      
      return new NextResponse(uint8Array, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${fileName || 'documento'}.docx"`,
        },
      })
    }

    // PDF - por ahora devolvemos como TXT (más estable)
    if (format === 'pdf') {
      return new NextResponse(text, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="${fileName || 'documento'}.txt"`,
        },
      })
    }

    return NextResponse.json({ error: 'Formato no soportado' }, { status: 400 })

  } catch (error) {
    console.error('Error generando documento:', error)
    return NextResponse.json({ error: 'Error al generar el documento' }, { status: 500 })
  }
}