'use client'

import Link from 'next/link'
import styles from './dashboardLayout.module.css'

type HeaderProps = {
  displayName: string
  onLogout: () => void
  onToggleMobileMenu: () => void
}

export default function Header({ displayName, onLogout, onToggleMobileMenu }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <button
          type="button"
          className={styles.mobileMenuButton}
          onClick={onToggleMobileMenu}
          aria-label="Abrir menú"
        >
          <span className={styles.hamburgerLine} />
          <span className={styles.hamburgerLine} />
          <span className={styles.hamburgerLine} />
        </button>

        <Link href="/dashboard" className={styles.headerLogo}>
          <span className={styles.headerLogoDot} />
          VozEstudio
        </Link>
      </div>

      <div className={styles.headerRight}>
        <span className={styles.headerUser}>{displayName}</span>
        <button type="button" className={styles.headerLogoutButton} onClick={onLogout}>
          Cerrar sesión
        </button>
      </div>
    </header>
  )
}
