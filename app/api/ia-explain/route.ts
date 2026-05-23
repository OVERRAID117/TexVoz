import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { text, mode, extension } = await req.json()

    console.log('📥 Datos recibidos:', { 
      mode, 
      extension, 
      textLength: text?.length,
      hasApiKey: !!process.env.DEEPSEEK_API_KEY 
    })

    if (!text || typeof mode !== 'number') {
      return NextResponse.json(
        { error: 'Faltan datos: texto y modo son obligatorios' },
        { status: 400 }
      )
    }

    // Verificar que la API key existe
    if (!process.env.DEEPSEEK_API_KEY) {
      console.error('❌ FALTA DEEPSEEK_API_KEY en .env.local')
      return NextResponse.json(
        { error: 'Error de configuración: falta API key' },
        { status: 500 }
      )
    }

    const modeTexts = [
      'Explica el texto de forma sencilla:',
      'Resume el texto de forma corta:',
      'Ordena y estructura el texto en puntos clave:',
      'Extrae los puntos más importantes:'
    ]

    const prompt = `${modeTexts[mode] || modeTexts[0]}

${extension === 0.25 ? 'RESPUESTA CORTA (25% del original)' : extension === 0.5 ? 'RESPUESTA MEDIANA (50% del original)' : extension === 0.75 ? 'RESPUESTA LARGA (75% del original)' : 'RESPUESTA NORMAL'}

TEXTO:
${text.substring(0, 3000)}`

    console.log('🤖 Enviando a DeepSeek...')

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    })

    console.log('📡 Respuesta de DeepSeek:', response.status)

    if (!response.ok) {
      const errorData = await response.text()
      console.error('❌ DeepSeek error:', response.status, errorData)
      return NextResponse.json(
        { error: `Error de DeepSeek: ${response.status}` },
        { status: 500 }
      )
    }

    const data = await response.json()
    const result = data.choices[0]?.message?.content || ''

    console.log('✅ Éxito! Resultado:', result.length, 'caracteres')

    return NextResponse.json({
      result: result,
      resultChars: result.length,
    })

  } catch (error) {
    console.error('❌ Error general:', error)
    return NextResponse.json(
      { error: 'Error al procesar la solicitud con la IA' },
      { status: 500 }
    )
  }
}