'use client'

import type { Dispatch, SetStateAction } from 'react'
import styles from '../FileWizard.module.css'
import type { GuideType } from './types'

type Props = {
  guideType: GuideType
  setGuideType: Dispatch<SetStateAction<GuideType>>
}

const GUIDE_TYPES: { value: GuideType; icon: string; label: string; desc: string }[] = [
  {
    value: 'quick',
    icon: '⚡',
    label: 'Guía rápida',
    desc: 'Conceptos esenciales para repasar.',
  },
  {
    value: 'complete',
    icon: '📘',
    label: 'Guía completa',
    desc: 'Explicaciones, puntos clave y preguntas de repaso.',
  },
  {
    value: 'study-plan',
    icon: '🗓️',
    label: 'Plan de estudio',
    desc: 'Organiza el contenido en sesiones de estudio.',
  },
]

export default function StudyGuideOptions({ guideType, setGuideType }: Props) {
  return (
    <>
      <p className={styles.configBlockTitle}>Tipo de guía</p>

      <div className={styles.radioGroupV}>
        {GUIDE_TYPES.map(g => (
          <label
            key={g.value}
            className={`${styles.radioItem} ${guideType === g.value ? styles.radioActive : ''}`}
          >
            <input
              type="radio"
              name="guideType"
              checked={guideType === g.value}
              onChange={() => setGuideType(g.value)}
            />
            <div>
              <strong>{g.icon} {g.label}</strong>
              <p>{g.desc}</p>
            </div>
          </label>
        ))}
      </div>
    </>
  )
}
