// ── Tipos compartidos para las opciones de cada herramienta de IA ──────────

export type ExplainLevel = 'beginner' | 'student' | 'professional'

export type GuideType = 'quick' | 'complete' | 'study-plan'

export type QuestionTypes = {
  open: boolean
  multipleChoice: boolean
  trueFalse: boolean
}

export type AnalysisOptions = {
  keyPoints: boolean
  risks: boolean
  inconsistencies: boolean
  obligations: boolean
  recommendations: boolean
}

// ── Bloque "¿Qué incluye?" por herramienta ──────────────────────────────────
// Índice = iaMode (0 Explícamelo, 1 Resúmelo, 2 Preguntas, 3 Guía, 4 Analizar)
export const INCLUDES_BY_MODE: string[][] = [
  [
    'Explicación clara y fácil de entender',
    'Ejemplos cuando sean necesarios',
    'Descarga en PDF, Word o TXT',
    'Entrega rápida y segura',
  ],
  [
    'Resumen del documento',
    'Información realmente importante',
    'Descarga en PDF, Word o TXT',
    'Entrega rápida y segura',
  ],
  [
    'Preguntas creadas por IA',
    'Basadas en el contenido del documento',
    'Descarga en PDF, Word o TXT',
    'Entrega rápida y segura',
  ],
  [
    'Guía organizada para estudiar',
    'Contenido estructurado',
    'Descarga en PDF, Word o TXT',
    'Entrega rápida y segura',
  ],
  [
    'Análisis inteligente del documento',
    'Hallazgos y puntos importantes',
    'Descarga en PDF, Word o TXT',
    'Entrega rápida y segura',
  ],
]
