// app/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Tipo compartido para la tabla plans
export type Plan = {
  id:                 string
  name:               string
  display_name:       string
  price_mxn:          number
  max_docs_monthly:   number | null   // null = ilimitado
  max_pages_per_doc:  number | null
  ocr_enabled:        boolean
  elevenlabs_enabled: boolean
  is_active:          boolean
  sort_order:         number
}
