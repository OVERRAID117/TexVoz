'use client'

import Link from 'next/link'
import { useState } from 'react'
import styles from '../../page.module.css'

export default function CheckoutProPage() {
  const [clicked, setClicked] = useState(false)

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '4rem 1.5rem', minHeight: '100vh' }}>
      <Link href="/" style={{ color: '#0BB89A', fontSize: 14, textDecoration: 'none', fontWeight: 600 }}>
        ← Volver a VozEstudio
      </Link>

      <div className={`${styles.planCard} ${styles.planCardPro}`} style={{ width: '100%', marginTop: '2rem' }}>
        <div className={styles.planBestBadge}>Estás eligiendo este plan</div>
        <div className={styles.planHeader}>
          <span className={styles.planEmoji}>🚀</span>
          <div>
            <div className={styles.planName}>Pro</div>
            <div className={`${styles.planPrice} ${styles.planPricePro}`}>$399 MXN <span>/ mes</span></div>
          </div>
        </div>

        <ul className={styles.planList}>
          <li><span className={styles.checkPro}>✓</span>100 documentos por mes</li>
          <li><span className={styles.checkPro}>✓</span>Hasta 100 páginas por documento</li>
          <li><span className={styles.checkPro}>✓</span>1 usuario</li>
          <li><span className={styles.checkPro}>✓</span>Historial de 30 días</li>
          <li><span className={styles.checkPro}>✓</span>Los 4 modos de IA: explicar, resumir, ordenar, simplificar</li>
        </ul>

        {clicked ? (
          <p style={{ textAlign: 'center', color: '#89bdb5', fontSize: 13, marginTop: 8 }}>
            💳 La integración con el pago llega pronto. ¡Gracias por tu paciencia!
          </p>
        ) : (
          <button className={styles.btnPlanPro} onClick={() => setClicked(true)}>
            Continuar al pago
          </button>
        )}
      </div>
    </main>
  )
}
