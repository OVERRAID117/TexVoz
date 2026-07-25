// PASO 3 — Registro de uso en Supabase
// Tabla: usage_logs (ip, chars, voice, provider, created_at)

export async function logUsage(_params: {
  ip: string
  chars: number
  voice: string
  provider: string
}): Promise<void> {
  // TODO: conectar con Supabase en Paso 3
}

export async function getDailyUsage(_ip: string): Promise<{ moves: number; chars: number }> {
  // TODO: conectar con Supabase en Paso 3
  return { moves: 0, chars: 0 }
}
