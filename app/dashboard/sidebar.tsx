'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './dashboardLayout.module.css'

type SidebarProps = {
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

type NavItem = {
  label: string
  icon: string
  href?: string
  anchor?: string
  disabled?: boolean
}

// "Herramientas", "Historial" y "Consumo y plan" apuntan a secciones que ya
// existen dentro de /dashboard (todavía no son rutas propias — Fase 3).
// "Configuración" y "Equipo" no tienen destino real todavía: bloqueadas.
const NAV_ITEMS: NavItem[] = [
  { label: 'Inicio',          icon: '🏠', href: '/dashboard' },
  { label: 'Herramientas',    icon: '🧠', anchor: 'herramientas' },
  { label: 'Historial',       icon: '📚', anchor: 'historial' },
  { label: 'Consumo y plan',  icon: '📊', anchor: 'consumo' },
  { label: 'Configuración',   icon: '⚙️', disabled: true },
  { label: 'Equipo',          icon: '👥', disabled: true },
]

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname()

  const handleAnchorClick = (anchor: string) => {
    onCloseMobile()
    if (pathname === '/dashboard') {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' })
    } else {
      window.location.href = `/dashboard#${anchor}`
    }
  }

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''} ${mobileOpen ? styles.sidebarMobileOpen : ''}`}
    >
      <nav className={styles.sidebarNav}>
        {NAV_ITEMS.map(item => {
          if (item.disabled) {
            return (
              <div key={item.label} className={styles.sidebarLinkDisabled} title={collapsed ? item.label : undefined}>
                <span className={styles.sidebarIcon}>{item.icon}</span>
                {!collapsed && (
                  <span className={styles.sidebarLabelRow}>
                    <span className={styles.sidebarLabel}>{item.label}</span>
                    <span className={styles.sidebarBadge}>Próximamente</span>
                  </span>
                )}
              </div>
            )
          }

          if (item.href) {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onCloseMobile}
                title={collapsed ? item.label : undefined}
                className={`${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ''}`}
              >
                <span className={styles.sidebarIcon}>{item.icon}</span>
                {!collapsed && <span className={styles.sidebarLabel}>{item.label}</span>}
              </Link>
            )
          }

          return (
            <button
              key={item.label}
              type="button"
              title={collapsed ? item.label : undefined}
              onClick={() => item.anchor && handleAnchorClick(item.anchor)}
              className={styles.sidebarLink}
            >
              <span className={styles.sidebarIcon}>{item.icon}</span>
              {!collapsed && <span className={styles.sidebarLabel}>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      <button type="button" className={styles.collapseButton} onClick={onToggleCollapse}>
        {collapsed ? '»' : '«  Colapsar'}
      </button>
    </aside>
  )
}
