import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente Supabase para uso server-side (verificación de tokens únicamente).
// Sin persistencia de sesión — cada llamada verifica el token recibido, no
// mantiene estado de auth en el proceso del servidor.
let cachedClient: SupabaseClient | null = null

function getSupabaseServerClient(): SupabaseClient {
  if (cachedClient) return cachedClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY — no se puede verificar la sesión.'
    )
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cachedClient
}

export type AuthCheck =
  | { status: 'ok'; userId: string }
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'error'; message: string }

// Verifica el Bearer token de la request contra Supabase Auth.
// Modo log-only: el llamador decide si bloquear o solo registrar.
export async function checkAuth(req: Request): Promise<AuthCheck> {
  const header = req.headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { status: 'missing' }

  let client: SupabaseClient
  try {
    client = getSupabaseServerClient()
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Error desconocido' }
  }

  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return { status: 'invalid' }

  return { status: 'ok', userId: data.user.id }
}
