'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

// El Context vive en null hasta que el layout resuelve la sesión.
// Ningún consumidor debería ver ese null — el hook de abajo lo garantiza.
const DashboardSessionContext = createContext<Session | null>(null)

type DashboardSessionProviderProps = {
  session: Session
  children: ReactNode
}

export function DashboardSessionProvider({ session, children }: DashboardSessionProviderProps) {
  return (
    <DashboardSessionContext.Provider value={session}>
      {children}
    </DashboardSessionContext.Provider>
  )
}

// Hook de acceso a la sesión dentro de cualquier página o componente que viva
// bajo app/dashboard/layout.tsx. La sesión llega siempre resuelta y no-nula,
// porque el layout nunca renderiza <DashboardSessionProvider> sin ella.
export function useDashboardSession(): Session {
  const session = useContext(DashboardSessionContext)

  if (!session) {
    throw new Error(
      'useDashboardSession() se usó fuera de DashboardSessionProvider. ' +
      'Este hook solo funciona dentro de páginas montadas por app/dashboard/layout.tsx.'
    )
  }

  return session
}
