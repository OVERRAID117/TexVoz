'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import Sidebar from './sidebar'
import Header from './header'
import { DashboardSessionProvider } from './dashboard-session-context'
import styles from './dashboardLayout.module.css'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const router = useRouter()

  // Única fuente de verdad de la sesión para todo /dashboard.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push('/'); return }
      setSession(data.session)
      setCheckingSession(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession) router.push('/')
      else setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (checkingSession || !session) {
    return <div className={styles.loadingShell}>Cargando…</div>
  }

  const displayName =
    session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    session.user.email ||
    'Usuario'

  return (
    <div className={styles.shell}>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(v => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {mobileOpen && (
        <div className={styles.mobileOverlay} onClick={() => setMobileOpen(false)} />
      )}

      <div className={`${styles.contentArea} ${collapsed ? styles.contentAreaCollapsed : ''}`}>
        <Header
          displayName={displayName}
          onLogout={handleLogout}
          onToggleMobileMenu={() => setMobileOpen(v => !v)}
        />
        <main className={styles.main}>
          <DashboardSessionProvider session={session}>
            {children}
          </DashboardSessionProvider>
        </main>
      </div>
    </div>
  )
}
