'use client'

import type { Dispatch, SetStateAction } from 'react'
import styles from '../FileWizard.module.css'

type Props = {
  extension: number
  setExtension: Dispatch<SetStateAction<number>>
}

// Valores internos temporales — el backend actual todavía los espera así.
// No se muestran porcentajes al usuario, solo las etiquetas.
const EXTENSIONES = [
  { label: 'Corto', desc: 'Solo lo más importante.', value: 0.25 },
  { label: 'Medio', desc: 'Más contexto sin hacerlo extenso.', value: 0.5 },
  { label: 'Largo', desc: 'La versión más completa del resumen.', value: 0.75 },
]

export default function SummaryOptions({ extension, setExtension }: Props) {
  return (
    <>
      <p className={styles.configBlockTitle}>Extensión del resumen</p>

      <div className={styles.radioGroupV}>
        {EXTENSIONES.map(e => (
          <label
            key={e.value}
            className={`${styles.radioItem} ${extension === e.value ? styles.radioActive : ''}`}
          >
            <input
              type="radio"
              name="ext"
              checked={extension === e.value}
              onChange={() => setExtension(e.value)}
            />
            <div>
              <strong>{e.label}</strong>
              <p>{e.desc}</p>
            </div>
          </label>
        ))}
      </div>
    </>
  )
}
