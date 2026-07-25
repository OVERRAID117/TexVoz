// PASO 3 — Control de uso por IP/usuario
// Límites del plan gratuito:
//   - 3 movimientos por día
//   - máx 2000 caracteres por movimiento
//   - máx 5000 caracteres diarios

export async function checkRateLimit(_ip: string): Promise<{ allowed: boolean; remaining: number }> {
  // TODO: conectar con Supabase en Paso 3
  return { allowed: true, remaining: 3 }
}

export async function incrementUsage(_ip: string, _chars: number): Promise<void> {
  // TODO: conectar con Supabase en Paso 3
}
