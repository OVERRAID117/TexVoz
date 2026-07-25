'use client'

import type { Dispatch, SetStateAction } from 'react'
import styles from '../FileWizard.module.css'
import type { ExplainLevel } from './types'

type Props = {
  explainLevel: ExplainLevel
  setExplainLevel: Dispatch<SetStateAction<ExplainLevel>>
}

const LEVELS: { value: ExplainLevel; icon: string; label: string; desc: string }[] = [
  {
    value: 'beginner',
    icon: '👶',
    label: 'Principiante',
    desc: 'Explica desde cero con lenguaje sencillo.',
  },
  {
    value: 'student',
    icon: '🎓',
    label: 'Estudiante',
    desc: 'Explica con más detalle y conceptos importantes.',
  },
  {
    value: 'professional',
    icon: '👨‍💼',
    label: 'Profesional',
    desc: 'Usa lenguaje técnico y análisis más profundo.',
  },
]

export default function ExplainOptions({ explainLevel, setExplainLevel }: Props) {
  return (
    <>
      <p className={styles.configBlockTitle}>Nivel de explicación</p>

      <div className={styles.radioGroupV}>
        {LEVELS.map(l => (
          <label
            key={l.value}
            className={`${styles.radioItem} ${explainLevel === l.value ? styles.radioActive : ''}`}
          >
            <input
              type="radio"
              name="explainLevel"
              checked={explainLevel === l.value}
              onChange={() => setExplainLevel(l.value)}
            />
            <div>
              <strong>{l.icon} {l.label}</strong>
              <p>{l.desc}</p>
            </div>
          </label>
        ))}
      </div>
    </>
  )
}
