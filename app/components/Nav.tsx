'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import styles from '../page.module.css'

export default function Nav() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [accountOpen, setAccountOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const isHome = pathname === '/'


  // Detectar sesión actual + escuchar cambios (login/logout) en tiempo real
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    
    return () => listener.subscription.unsubscribe()
  }, [])

  // Cerrar el dropdown de "Mi cuenta" si haces click fuera de él
  useEffect(() => {
    if (!accountOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [accountOpen])

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/' },
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setAccountOpen(false)
  }

  return (
    <nav className={styles.nav}>
      <div className={styles.logo}>
        <span className={styles.logoDot} />
        VozEstudio
      </div>

      <div className={styles.navCenterGroup}>
        <button className={styles.navLink} onClick={() => {
          if (pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' })
          else window.location.href = '/'
        }}>
          Inicio
        </button>
        <button className={styles.navLink} onClick={() => {
          if (pathname === '/') document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })
          else window.location.href = '/#como-funciona'
        }}>
          Cómo funciona
        </button>
        <button className={styles.navLink} onClick={() => {
          if (pathname === '/') document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' })
          else window.location.href = '/#planes'
        }}>
          Planes
        </button>
        <button className={styles.navLink} onClick={() => {
          if (pathname === '/') document.getElementById('nosotros')?.scrollIntoView({ behavior: 'smooth' })
          else window.location.href = '/#nosotros'
        }}>
          Nosotros
        </button>
        <button className={styles.navLink} onClick={() => {
          if (pathname === '/') document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })
          else window.location.href = '/#faq'
        }}>
          Preguntas frecuentes
        </button>
      </div>

      <div className={styles.navActions}>
        {!loadingSession && session && (
          <Link href="/dashboard" className={`${styles.navBtnGhost} ${isHome ? styles.navBtnGhostActive : ''}`}>
            Dashboard
          </Link>
        )}

        {!loadingSession && (
          session ? (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button className={styles.navBtnSolid} onClick={() => setAccountOpen(v => !v)}>
                Mi cuenta
              </button>
              {accountOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: '120%', marginTop: 8,
                  background: '#fff', border: '1px solid #e8e4dc', borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 12, minWidth: 220, zIndex: 200,
                }}>
                  <p style={{ fontSize: 12, color: '#4a4a6a', margin: '0 0 10px', wordBreak: 'break-all' }}>
                    {session.user.email}
                  </p>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none',
                      background: '#f5f3ee', color: '#1a1a2e', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className={styles.navBtnSolid} onClick={handleGoogleLogin}>
              Iniciar sesión
            </button>
          )
        )}
      </div>
    </nav>
  )
}