import { supabase } from '@/lib/supabase'

export type DocumentHistorySummary = {
  id: string
  user_id: string
  file_name: string
  mode: string
  result_length: string
  page_count: number | null
  output_format: string | null
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
      'id, user_id, file_name, mode, result_length, page_count, output_format, output_filename, created_at',
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
    builder = builder.is('output_format', null)
  } else if (query.outputFormat) {
    builder = builder.eq('output_format', query.outputFormat)
  }

  if (query.downloadableOnly) {
    builder = builder.not('output_format', 'is', null).not('output_filename', 'is', null)
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
      'id, user_id, file_name, mode, result_length, page_count, output_format, output_filename, created_at, original_text, result_text'
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
