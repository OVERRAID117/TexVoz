import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente Supabase con service role — bypassa RLS.
// Uso exclusivo server-side (nunca importar desde app/components).
let cachedAdminClient: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdminClient) return cachedAdminClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY — no se puede crear el cliente admin.'
    )
  }

  cachedAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cachedAdminClient
}
