import { supabase } from '@/lib/supabase'

export type DocumentHistorySummary = {
  id: string
  user_id: string
  file_name: string
  mode: string
  result_length: string
  page_count: number | null
  output_format: string | null
  // false en filas legacy (creadas antes de este campo, default de columna) —
  // en esas filas output_format=NULL no dice nada y effectiveFormat() infiere
  // del nombre de archivo. true en filas nuevas — ahí NULL es una decisión
  // real ("Sin formato"), nunca se infiere. Ver effectiveFormat() abajo.
  output_format_known: boolean
  output_filename: string | null
  created_at: string
}

export type DocumentHistoryDetail = DocumentHistorySummary & {
  original_text: string
  result_text: string
}

export type PaginatedResult<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export const HISTORY_PAGE_SIZE = 20

export type SortOption =
  | 'created_desc'
  | 'created_asc'
  | 'name_asc'
  | 'name_desc'
  | 'pages_desc'
  | 'pages_asc'

export type OutputFormatFilter = 'txt' | 'docx' | 'pdf' | 'none'

export type DocumentHistoryQuery = {
  search?: string
  mode?: string
  resultLength?: string
  outputFormat?: OutputFormatFilter
  downloadableOnly?: boolean
  sort?: SortOption
}

// ── Formato efectivo de un documento (clasificación visual + filtro) ───────
//
// Fuente única de verdad: qué valores de output_format son válidos, y qué
// extensiones de nombre de archivo corresponden a cada bucket. La usan tanto
// las cláusulas SQL de fetchDocumentHistoryPage como effectiveFormat() (usado
// por el dashboard para el ícono/badge de cada fila del historial).
export const RECOGNIZED_OUTPUT_FORMATS = ['txt', 'docx', 'pdf'] as const
const ALL_RECOGNIZED_SUFFIXES = ['txt', 'docx', 'doc', 'pdf'] as const
const FORMAT_SUFFIXES: Record<'txt' | 'docx' | 'pdf', readonly string[]> = {
  txt: ['txt'],
  docx: ['docx', 'doc'], // .doc legacy se agrupa visualmente con DOCX
  pdf: ['pdf'],
}

export type EffectiveFormat = 'txt' | 'docx' | 'pdf' | null

function extensionBucket(name: string | null): EffectiveFormat {
  if (!name) return null
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'txt') return 'txt'
  if (ext === 'docx' || ext === 'doc') return 'docx'
  if (ext === 'pdf') return 'pdf'
  return null
}

// Precedencia: 1) output_format si es un valor reconocido -> ese formato,
// siempre, sin importar output_format_known. 2) si no, y la fila es
// "moderna" (output_format_known=true) -> null ("Sin formato") de forma
// definitiva, SIN mirar output_filename/file_name — file_name es el archivo
// ORIGINAL subido, nunca el resultado generado, así que nunca debe usarse
// para inferir el formato de SALIDA de una fila que ya sabe distinguir esto.
// 3) si la fila es legacy (output_format_known=false, default de columna en
// filas anteriores a este campo) -> mismo fallback histórico sin cambios:
// output_filename, si no, file_name, si no, null.
export function effectiveFormat(item: {
  output_format: string | null
  output_format_known: boolean
  output_filename: string | null
  file_name: string
}): EffectiveFormat {
  if (
    item.output_format &&
    (RECOGNIZED_OUTPUT_FORMATS as readonly string[]).includes(item.output_format)
  ) {
    return item.output_format as EffectiveFormat
  }
  if (item.output_format_known) return null
  return extensionBucket(item.output_filename) ?? extensionBucket(item.file_name)
}

function suffixHitClause(column: 'output_filename' | 'file_name', suffixes: readonly string[]): string {
  const parts = suffixes.map(s => `${column}.ilike.%.${s}`)
  return parts.length === 1 ? parts[0] : `or(${parts.join(',')})`
}

// "columna NULL, o no-NULL pero sin ninguna extensión reconocida" — null-safe:
// NOT ILIKE sobre NULL da NULL/desconocido en SQL, no TRUE, por eso la rama
// IS NULL se declara aparte en vez de confiar solo en el NOT ILIKE.
function columnUnrecognizedOr(column: 'output_filename' | 'file_name'): string {
  const notIlikeChain = ALL_RECOGNIZED_SUFFIXES.map(s => `${column}.not.ilike.%.${s}`).join(',')
  return `${column}.is.null,and(${column}.not.is.null,${notIlikeChain})`
}

// "output_format NULL, o no-NULL pero no es txt/docx/pdf" — null-safe, mismo
// motivo que arriba (NOT IN sobre NULL da NULL/desconocido, no TRUE).
function outputFormatUnrecognizedOr(): string {
  return `output_format.is.null,and(output_format.not.is.null,output_format.not.in.(${RECOGNIZED_OUTPUT_FORMATS.join(',')}))`
}

// Fila legacy = output_format_known.eq.false (default de columna en filas
// anteriores a este campo) — únicas filas donde tier 2/3 (inferir de
// output_filename/file_name) aplican. Ver effectiveFormat() arriba: una fila
// "moderna" (known=true) nunca cae a estos niveles.
const LEGACY_ROW = 'output_format_known.eq.false'

function effectiveFormatOrClause(target: 'txt' | 'docx' | 'pdf'): string {
  const suffixes = FORMAT_SUFFIXES[target]
  const tier1Miss = `or(${outputFormatUnrecognizedOr()})`
  const tier2Hit = suffixHitClause('output_filename', suffixes)
  const tier2Miss = `or(${columnUnrecognizedOr('output_filename')})`
  const tier3Hit = suffixHitClause('file_name', suffixes)
  return [
    `output_format.eq.${target}`,
    `and(${tier1Miss},${LEGACY_ROW},${tier2Hit})`,
    `and(${tier1Miss},${LEGACY_ROW},${tier2Miss},${tier3Hit})`,
  ].join(',')
}

// effectiveFormat() === null ("Sin formato"): dos casos disjuntos —
// A) fila moderna sin output_format reconocido (known=true, nunca infiere), o
// B) fila legacy donde ni output_filename ni file_name reconocen nada.
function noneFormatOrClause(): string {
  const tier1Miss = `or(${outputFormatUnrecognizedOr()})`
  const caseModernNone = `and(${tier1Miss},output_format_known.eq.true)`
  const caseLegacyUnrecognized = `and(${tier1Miss},${LEGACY_ROW},or(${columnUnrecognizedOr('output_filename')}),or(${columnUnrecognizedOr('file_name')}))`
  return [caseModernNone, caseLegacyUnrecognized].join(',')
}

// Sanea un término de búsqueda para usarlo en un patrón ILIKE dentro de un
// filtro .or() de PostgREST. Se elimina únicamente la comilla doble (rompería
// el envoltorio de comillas que protege , y ) como texto literal). % y _ se
// escapan porque son comodines de ILIKE, no separadores de PostgREST — así se
// preservan como caracteres literales en vez de perder su significado.
export function sanitizeSearchTerm(term: string): string {
  const withoutQuotes = term.replace(/"/g, '')
  return withoutQuotes
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

export async function fetchDocumentHistoryPage(
  userId: string,
  page: number = 1,
  pageSize: number = HISTORY_PAGE_SIZE,
  query: DocumentHistoryQuery = {}
): Promise<PaginatedResult<DocumentHistorySummary>> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))

  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1

  let builder = supabase
    .from('document_history')
    .select(
      'id, user_id, file_name, mode, result_length, page_count, output_format, output_format_known, output_filename, created_at',
      { count: 'exact' }
    )
    .eq('user_id', userId)

  const search = query.search?.trim()
  if (search) {
    const safeTerm = sanitizeSearchTerm(search)
    if (safeTerm) {
      builder = builder.or(`file_name.ilike."%${safeTerm}%",output_filename.ilike."%${safeTerm}%"`)
    }
  }

  if (query.mode) {
    builder = builder.eq('mode', query.mode)
  }

  if (query.resultLength) {
    builder = builder.eq('result_length', query.resultLength)
  }

  if (query.outputFormat === 'none') {
    // Mismo resultado que effectiveFormat() === null — ver noneFormatOrClause().
    builder = builder.or(noneFormatOrClause())
  } else if (query.outputFormat) {
    builder = builder.or(effectiveFormatOrClause(query.outputFormat))
  }

  if (query.downloadableOnly) {
    // "Descargable" = downloadFromHistory() puede producir un archivo real,
    // lo cual depende únicamente de result_text (ver downloadTxt() y la rama
    // de regenerar en app/dashboard/page.tsx) — no de output_format/
    // output_filename, que solo deciden EN QUÉ formato se descarga.
    builder = builder.not('result_text', 'is', null).neq('result_text', '')
  }

  switch (query.sort ?? 'created_desc') {
    case 'created_asc':
      builder = builder.order('created_at', { ascending: true })
      break
    case 'name_asc':
      builder = builder.order('file_name', { ascending: true })
      break
    case 'name_desc':
      builder = builder.order('file_name', { ascending: false })
      break
    case 'pages_desc':
      builder = builder.order('page_count', { ascending: false, nullsFirst: false })
      break
    case 'pages_asc':
      builder = builder.order('page_count', { ascending: true, nullsFirst: false })
      break
    default:
      builder = builder.order('created_at', { ascending: false })
      break
  }

  const { data, error, count } = await builder.range(from, to)

  if (error) throw error

  const total = count ?? 0
  const totalPages = total === 0 ? 0 : Math.ceil(total / safePageSize)

  return {
    items: (data ?? []) as DocumentHistorySummary[],
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  }
}

export type DocumentHistoryDetailResult =
  | { status: 'ok'; detail: DocumentHistoryDetail }
  | { status: 'not_found' }
  | { status: 'error' }

export async function fetchDocumentHistoryDetail(
  id: string,
  userId: string
): Promise<DocumentHistoryDetailResult> {
  const { data, error } = await supabase
    .from('document_history')
    .select(
      'id, user_id, file_name, mode, result_length, page_count, output_format, output_format_known, output_filename, created_at, original_text, result_text'
    )
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[fetchDocumentHistoryDetail error]', error)
    return { status: 'error' }
  }
  if (!data) {
    return { status: 'not_found' }
  }
  return { status: 'ok', detail: data as DocumentHistoryDetail }
}
